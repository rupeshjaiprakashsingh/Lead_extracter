// ============================================================
//  services/scheduler.js
//  Unified WA + Email Auto-Scheduler — per-rule cron logic
//  • Hot/Warm/Cold temperature filtering
//  • Advanced filters (no_website, min_rating, etc.)
//  • Smart counting: WA only if phone exists, Email only if email exists
//  • Daily email reports at 8 PM IST
// ============================================================
const cron     = require('node-cron');
const mongoose = require('mongoose');

let _minuteJob = null;
let _reportJob  = null;
let _socialJob  = null;
const _isSendingCompanies = new Set();  // prevent overlapping sends per company

// ── Lazy model getters ────────────────────────────────────────
const getSchedule = () => {
    try { return mongoose.model('Schedule'); }
    catch(e) { return require('../models/Schedule'); }
};
const getLead = () => {
    try { return mongoose.model('Lead'); }
    catch(e) { return require('../models/Lead'); }
};
const getSocialSettings = () => {
    try { return mongoose.model('SocialSettings'); }
    catch(e) {
        try   { return require('../models/SocialSettings'); }
        catch  { return require('../backend/models/SocialSettings'); }
    }
};
const getSocialPost = () => {
    try { return mongoose.model('SocialPost'); }
    catch(e) {
        try   { return require('../models/SocialPost'); }
        catch  { return require('../backend/models/SocialPost'); }
    }
};

// ── Build Lead filter from schedule settings ──────────────────
function buildLeadFilter(companyId, schedule) {
    const filter = { companyId };

    // Exclude invalid WhatsApp numbers
    filter.wa_invalid = { $ne: true };

    if (schedule.filter_has_phone !== false) {
        filter.phone = { $exists: true, $ne: '' };
    }
    if (schedule.filter_has_email) {
        filter.email = { $exists: true, $ne: '' };
    }
    if (schedule.categories && schedule.categories.length) {
        filter.category = { $in: schedule.categories };
    }
    if (schedule.temperatures && schedule.temperatures.length) {
        filter.temperature = { $in: schedule.temperatures };
    }
    if (schedule.cities && schedule.cities.length) {
        const cityRegexes = schedule.cities.map(c => new RegExp(`^${c.trim()}$`, 'i'));
        filter.city = { $in: cityRegexes };
    }
    if (schedule.filter_no_website) {
        filter.$or = [
            { website: { $exists: false } },
            { website: '' },
            { website: null }
        ];
    }
    if (schedule.filter_min_rating && schedule.filter_min_rating > 0) {
        filter.rating = { $gte: schedule.filter_min_rating };
    }

    return filter;
}

// ── Migrate old schema fields ─────────────────────────────────
async function migrateSchedules() {
    try {
        const Schedule = getSchedule();
        // Migrate records with old field names
        const old = await Schedule.find({
            $or: [
                { send_hours: { $exists: false } },
                { today_wa_sent: { $exists: false } }
            ]
        });
        for (const s of old) {
            const obj = s.toObject();
            await Schedule.updateOne({ _id: s._id }, {
                $set: {
                    name:          obj.name || 'Default Schedule',
                    send_hours:    obj.send_hours || [obj.morning_hour || 10, obj.evening_hour || 16],
                    send_whatsapp: true,
                    send_email:    false,
                    temperatures:  obj.temperatures || [],
                    filter_has_phone:       true,
                    filter_has_email:       false,
                    filter_no_website:      false,
                    filter_min_rating:      0,
                    filter_skip_wa_sent:    obj.skip_sent !== false,
                    filter_skip_email_sent: false,
                    today_wa_sent:    obj.today_sent   || 0,
                    today_wa_failed:  obj.today_failed || 0,
                    today_email_sent:   0,
                    today_email_failed: 0,
                    total_wa_sent:    obj.total_sent || 0,
                    total_email_sent: 0,
                }
            });
        }
        if (old.length) {
            console.log(`✅ Migrated ${old.length} schedule(s) to v2 schema`);
        }
    } catch(e) {
        console.error('⏰ Scheduler migration error:', e.message);
    }
}

// Ensure migration runs on DB connection
if (mongoose.connection.readyState === 1) {
    migrateSchedules();
} else {
    mongoose.connection.once('open', migrateSchedules);
}

// ── Core: Run a specific schedule rule (WA + Email) ───────────
async function runScheduledSendForRule(schedule) {
    const companyId = schedule.companyId || schedule.userId;
    const companyKey = companyId.toString();

    if (_isSendingCompanies.has(companyKey)) {
        console.log(`⏰ Scheduler: already sending for company ${companyKey}, skipping rule "${schedule.name}"`);
        return { wa_sent: 0, wa_failed: 0, email_sent: 0, email_failed: 0 };
    }

    const Lead     = getLead();
    const Schedule = getSchedule();

    // Reset daily counters if new day
    const today = new Date().toISOString().slice(0, 10);
    if (schedule.today_date !== today) {
        await Schedule.updateOne({ _id: schedule._id }, {
            $set: {
                today_wa_sent:    0,
                today_wa_failed:  0,
                today_email_sent: 0,
                today_email_failed: 0,
                today_date: today
            }
        });
        schedule.today_wa_sent    = 0;
        schedule.today_wa_failed  = 0;
        schedule.today_email_sent = 0;
        schedule.today_email_failed = 0;
    }

    const waRemaining = schedule.daily_limit - (schedule.today_wa_sent || 0);
    if (waRemaining <= 0 && schedule.send_whatsapp) {
        console.log(`⏰ Scheduler: WA daily limit reached for rule "${schedule.name}"`);
    }

    // Build base filter
    const baseFilter = buildLeadFilter(companyId, schedule);

    // Split batch by hour count
    const hourCount    = schedule.send_hours?.length || 1;
    const batchSize    = Math.ceil(schedule.daily_limit / hourCount);

    _isSendingCompanies.add(companyKey);

    let waResult    = { sent: 0, failed: 0 };
    let emailResult = { sent: 0, failed: 0 };

    try {
        // ── WhatsApp send ──────────────────────────────────────
        if (schedule.send_whatsapp && waRemaining > 0) {
            const waFilter = { ...baseFilter, phone: { $exists: true, $ne: '' } };

            // Skip already WA sent unless resend allowed
            if (schedule.filter_skip_wa_sent && !schedule.allow_resend) {
                waFilter.wa_sent = { $ne: true };
            }

            const toSend = Math.min(batchSize, waRemaining);
            const leads = await Lead.find(waFilter)
                .sort({ createdAt: 1 })
                .limit(toSend)
                .lean();

            if (leads.length) {
                console.log(`\n📱 WA Schedule "${schedule.name}": sending ${leads.length} messages for company ${companyKey}`);
                try {
                    const { sendWA } = require('./whatsapp-dispatcher');
                    const res = await sendWA(
                        leads.map(l => l._id.toString()),
                        false,
                        {
                            skipWaSent:  schedule.filter_skip_wa_sent && !schedule.allow_resend,
                            isScheduled: true,
                            companyId:   companyKey,
                        }
                    );
                    waResult.sent   = res?.sent   || 0;
                    waResult.failed = res?.failed || 0;
                } catch(e) {
                    console.error(`⏰ WA send error for rule "${schedule.name}":`, e.message);
                    waResult.failed = leads.length;
                }
            } else {
                console.log(`⏰ Scheduler: no WA leads match filter for rule "${schedule.name}"`);
            }
        }

        // ── Email send ─────────────────────────────────────────
        if (schedule.send_email) {
            const emailRemaining = schedule.daily_limit - (schedule.today_email_sent || 0);

            if (emailRemaining > 0) {
                const emailFilter = {
                    ...baseFilter,
                    email: { $exists: true, $ne: '' }  // SMART: only count if email exists
                };

                // Skip already email sent unless resend allowed
                if (schedule.filter_skip_email_sent && !schedule.allow_resend) {
                    emailFilter.email_sent = { $ne: true };
                }

                const toSend = Math.min(batchSize, emailRemaining);
                const leads  = await Lead.find(emailFilter)
                    .sort({ createdAt: 1 })
                    .limit(toSend)
                    .lean();

                if (leads.length) {
                    console.log(`\n📧 Email Schedule "${schedule.name}": sending ${leads.length} emails for company ${companyKey}`);
                    const { sendEmail } = require('./email-sender');
                    const { buildInitialEmail } = require('./ai-messages');

                    for (let i = 0; i < leads.length; i++) {
                        const lead = leads[i];
                        // Random delay 2–5s between emails
                        if (i > 0) {
                            await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
                        }
                        try {
                            const { subject, html } = await buildInitialEmail(lead);
                            await sendEmail(lead.email, subject, html, companyKey);

                            await Lead.findByIdAndUpdate(lead._id, {
                                $inc:  { email_count: 1 },
                                $set:  { email_sent: true, email_sent_at: new Date(), email_last_date: today },
                                $push: { activity: { type: 'email_sent', message: `Email sent (auto-schedule: "${schedule.name}")`, date: new Date() } }
                            });
                            emailResult.sent++;
                        } catch(err) {
                            emailResult.failed++;
                            console.error(`⏰ Email fail for ${lead.email}:`, err.message);
                        }
                    }
                } else {
                    console.log(`⏰ Scheduler: no email leads match filter for rule "${schedule.name}"`);
                }
            }
        }
    } catch(e) {
        console.error(`⏰ Scheduled send error for rule "${schedule.name}":`, e.message);
    } finally {
        _isSendingCompanies.delete(companyKey);
    }

    // Update stats
    await Schedule.updateOne({ _id: schedule._id }, {
        $inc: {
            today_wa_sent:      waResult.sent,
            today_wa_failed:    waResult.failed,
            today_email_sent:   emailResult.sent,
            today_email_failed: emailResult.failed,
            total_wa_sent:      waResult.sent,
            total_email_sent:   emailResult.sent,
        },
        $set: { last_run: new Date() }
    });

    console.log(`⏰ Batch done for rule "${schedule.name}": WA=${waResult.sent}✅/${waResult.failed}❌ | Email=${emailResult.sent}✅/${emailResult.failed}❌`);
    return {
        wa_sent:    waResult.sent,
        wa_failed:  waResult.failed,
        email_sent: emailResult.sent,
        email_failed: emailResult.failed
    };
}

// ── Entry points ──────────────────────────────────────────────
async function runScheduledSend(session = 'manual', companyId = null, scheduleId = null) {
    const Schedule = getSchedule();

    if (scheduleId) {
        const schedule = await Schedule.findOne({ _id: scheduleId });
        if (schedule) return await runScheduledSendForRule(schedule);
        return { wa_sent: 0, wa_failed: 0, email_sent: 0, email_failed: 0 };
    }

    if (companyId) {
        const schedules = await Schedule.find({ companyId, enabled: true });
        let res = { wa_sent: 0, wa_failed: 0, email_sent: 0, email_failed: 0 };
        for (const sched of schedules) {
            const r = await runScheduledSendForRule(sched);
            res.wa_sent    += r.wa_sent;
            res.wa_failed  += r.wa_failed;
            res.email_sent += r.email_sent;
        }
        return res;
    }
}

// ── Daily Email Reports ───────────────────────────────────────
async function sendDailyReportsAll() {
    const Schedule = getSchedule();
    const schedules = await Schedule.find({ enabled: true, report_email: { $exists: true, $ne: '' } });
    for (const s of schedules) {
        await sendDailyReportForRule(s);
    }
}

async function sendDailyReport(companyId = null) {
    const Schedule = getSchedule();
    const query = companyId
        ? { companyId, enabled: true, report_email: { $exists: true, $ne: '' } }
        : { enabled: true, report_email: { $exists: true, $ne: '' } };
    const schedules = await Schedule.find(query);
    for (const s of schedules) {
        await sendDailyReportForRule(s);
    }
}

async function sendDailyReportForRule(schedule) {
    if (!schedule.report_email) return;
    const companyId = schedule.companyId || schedule.userId;
    const { sendEmail } = require('./email-sender');

    const today = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: 'Asia/Kolkata'
    });

    const waSent    = schedule.today_wa_sent    || 0;
    const waFailed  = schedule.today_wa_failed  || 0;
    const emSent    = schedule.today_email_sent  || 0;
    const emFailed  = schedule.today_email_failed|| 0;

    const waRate = (waSent + waFailed) > 0
        ? Math.round((waSent / (waSent + waFailed)) * 100) : 100;
    const emRate = (emSent + emFailed) > 0
        ? Math.round((emSent / (emSent + emFailed)) * 100) : 100;

    const categories   = schedule.categories?.length   ? schedule.categories.join(', ')   : 'All Categories';
    const temperatures = schedule.temperatures?.length ? schedule.temperatures.map(t => `🌡️ ${t}`).join(', ') : 'All';
    const cities       = schedule.cities?.length       ? schedule.cities.join(', ')       : 'All Cities';

    const html = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:linear-gradient(135deg,#1e3a5f,#4f8ef7);padding:32px;text-align:center">
    <div style="font-size:36px">📊</div>
    <h1 style="color:#fff;margin:8px 0 4px;font-size:22px">Daily Campaign Report</h1>
    <p style="color:rgba(255,255,255,.7);margin:0;font-size:13px">${today}</p>
    <p style="color:#fff;margin:8px 0 0;font-size:14px;font-weight:600">Rule: ${schedule.name}</p>
  </div>
  <div style="padding:28px">

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:24px">
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;text-align:center">
        <div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:8px">📱 WhatsApp</div>
        <div style="font-size:32px;font-weight:700;color:#166534">${waSent}</div>
        <div style="font-size:11px;color:#166534">SENT ✅</div>
        <div style="font-size:11px;color:#dc2626;margin-top:4px">${waFailed} failed | ${waRate}% success</div>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;text-align:center">
        <div style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:8px">📧 Email</div>
        <div style="font-size:32px;font-weight:700;color:#1d4ed8">${emSent}</div>
        <div style="font-size:11px;color:#1d4ed8">SENT ✅</div>
        <div style="font-size:11px;color:#dc2626;margin-top:4px">${emFailed} failed | ${emRate}% success</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#374151">
      <tr style="background:#f9fafb">
        <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600">Daily Limit</td>
        <td style="padding:10px 12px;border:1px solid #e5e7eb">${schedule.daily_limit} per channel</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600">Lead Temperature</td>
        <td style="padding:10px 12px;border:1px solid #e5e7eb">${temperatures}</td>
      </tr>
      <tr style="background:#f9fafb">
        <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600">Categories</td>
        <td style="padding:10px 12px;border:1px solid #e5e7eb">${categories}</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600">Cities</td>
        <td style="padding:10px 12px;border:1px solid #e5e7eb">${cities}</td>
      </tr>
      <tr style="background:#f9fafb">
        <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600">All-Time WA Sent</td>
        <td style="padding:10px 12px;border:1px solid #e5e7eb"><strong>${schedule.total_wa_sent || 0}</strong> messages</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600">All-Time Email Sent</td>
        <td style="padding:10px 12px;border:1px solid #e5e7eb"><strong>${schedule.total_email_sent || 0}</strong> emails</td>
      </tr>
    </table>

    <p style="font-size:11px;color:#9ca3af;margin-top:24px;text-align:center">
      Automated report from Innvoque Lead CRM &bull;
      <a href="http://localhost:3000" style="color:#6b7280">Open Dashboard</a>
    </p>
  </div>
</div>`;

    try {
        await sendEmail(schedule.report_email, `📊 Daily Report [${schedule.name}]: ${waSent} WA + ${emSent} Email sent`, html, companyId);
        const ScheduleModel = getSchedule();
        await ScheduleModel.updateOne({ _id: schedule._id }, { $set: { last_report_at: new Date() } });
        console.log(`📧 Daily report sent to ${schedule.report_email} for rule "${schedule.name}"`);
    } catch(e) {
        console.error(`📧 Report email failed for rule "${schedule.name}":`, e.message);
    }
}

// ── Start / Stop Scheduler ────────────────────────────────────
function startScheduler() {
    stopScheduler();

    // Check every minute for any schedule matching current hour
    _minuteJob = cron.schedule('* * * * *', async () => {
        try {
            const now       = new Date();
            const hourStr   = now.toLocaleTimeString('en-US', { hour12: false, hour: 'numeric', timeZone: 'Asia/Kolkata' });
            const currentHour = parseInt(hourStr);
            const todayStr  = now.toISOString().slice(0, 10);

            const Schedule = getSchedule();
            const activeSchedules = await Schedule.find({ enabled: true, send_hours: currentHour });

            for (const sched of activeSchedules) {
                if (sched.last_run) {
                    const lastRunHour = parseInt(new Date(sched.last_run).toLocaleTimeString('en-US', { hour12: false, hour: 'numeric', timeZone: 'Asia/Kolkata' }));
                    const lastRunDate = new Date(sched.last_run).toISOString().slice(0, 10);
                    if (lastRunHour === currentHour && lastRunDate === todayStr) continue;
                }

                console.log(`⏰ Auto-Scheduler: triggering rule "${sched.name}" for company ${sched.companyId} (Hour: ${currentHour})`);
                runScheduledSendForRule(sched).catch(err => console.error(`Error in schedule ${sched._id}:`, err.message));
            }
        } catch(e) {
            console.error('⏰ Scheduler cron check error:', e.message);
        }
    }, { timezone: 'Asia/Kolkata' });

    // Daily reports at 8 PM IST
    _reportJob = cron.schedule('0 20 * * *', () => {
        console.log('\n📊 Sending daily campaign reports...');
        sendDailyReportsAll().catch(e => console.error('Report error:', e.message));
    }, { timezone: 'Asia/Kolkata' });

    console.log('  ⏰ Unified Scheduler ACTIVE (WA + Email, checks every minute)');
}

function stopScheduler() {
    if (_minuteJob) { _minuteJob.stop(); _minuteJob = null; }
    if (_reportJob) { _reportJob.stop(); _reportJob = null; }
}

async function generateMonthlySchedule(settings) {
    const categories = ['Business Tips', 'Customer Success Stories', 'Industry Insights', 'Service Promotion', 'Educational Content'];
    let catIndex = Math.floor(Math.random() * categories.length);
    const schedule = [];
    const today = new Date();
    
    for (let d = 0; d < 30; d++) {
        const date = new Date(today);
        date.setDate(today.getDate() + d);
        
        const windows = [
            { minHour: 8, maxHour: 9 }, // 8-10 AM
            { minHour: 12, maxHour: 13 }, // 12-2 PM
            { minHour: 16, maxHour: 17 }, // 4-6 PM
            { minHour: 20, maxHour: 21 } // 8-10 PM
        ];
        
        let lastTime = 0;
        for (let i = 0; i < 4; i++) {
            const w = windows[i];
            const baseHour = w.minHour + Math.floor(Math.random() * (w.maxHour - w.minHour + 1));
            // +/- 15 to 30 mins logic via random minutes 15-45
            const minuteOffset = 15 + Math.floor(Math.random() * 30);
            
            const postTime = new Date(date);
            postTime.setHours(baseHour, minuteOffset, 0, 0);
            
            if (lastTime) {
                const gapHrs = (postTime.getTime() - lastTime.getTime()) / (1000 * 60 * 60);
                if (gapHrs < 4) {
                    postTime.setTime(lastTime.getTime() + (4 * 60 * 60 * 1000) + Math.random() * (2 * 60 * 60 * 1000));
                } else if (gapHrs > 6) {
                    postTime.setTime(lastTime.getTime() + (5.5 * 60 * 60 * 1000));
                }
            }
            
            lastTime = postTime;
            const categoryName = categories[catIndex % categories.length];
            catIndex++;
            
            schedule.push({
                post_time: postTime,
                category_name: categoryName,
                status: 'pending'
            });
        }
    }
    settings.monthly_schedule = schedule;
    settings.last_schedule_generated = new Date();
    await settings.save();
    console.log(`📅 Generated 30-day posting schedule for company ${settings.companyId || settings.userId}`);
}

// ── Social Poster Scheduler ───────────────────────────────────
async function runScheduledSocialPost() {
    try {
        const SocialSettings = getSocialSettings();
        const SocialPost     = getSocialPost();
        const settingsList = await SocialSettings.find({ enabled: true });
        
        for (const settings of settingsList) {
            try {
                const now = new Date();
                const logIdentifier = settings.companyId ? `company ${settings.companyId}` : `user ${settings.userId}`;
                
                // Generate schedule if missing or old (> 25 days)
                if (!settings.monthly_schedule || settings.monthly_schedule.length === 0 || 
                   (now.getTime() - new Date(settings.last_schedule_generated).getTime() > 25 * 24 * 60 * 60 * 1000)) {
                    await generateMonthlySchedule(settings);
                }

                // Check for pending posts whose time has passed (within last 1 hour to avoid double-posting old ones)
                const pendingIdx = settings.monthly_schedule.findIndex(s => 
                    s.status === 'pending' && 
                    new Date(s.post_time) <= now && 
                    (now.getTime() - new Date(s.post_time).getTime()) < 60 * 60 * 1000
                );
                
                let targetCategory = null;
                let scheduleToUpdate = -1;
                let isRetry = false;
                let retryPostId = null;

                // Also check for retries
                const query = {};
                if (settings.companyId) query.companyId = settings.companyId;
                else if (settings.userId) query.userId  = settings.userId;
                
                const retryPost = await SocialPost.findOne({
                    ...query,
                    status: 'Failed',
                    retry_count: { $lt: 3 },
                    next_retry_at: { $lte: now }
                });

                if (retryPost) {
                    console.log(`⏰ Retrying failed post ID ${retryPost._id}...`);
                    targetCategory = retryPost.topic || 'Business Tips';
                    isRetry = true;
                    retryPostId = retryPost._id;
                } else if (pendingIdx !== -1) {
                    // Check if we haven't exceeded 4 posts today
                    const startOfDay = new Date(now);
                    startOfDay.setHours(0,0,0,0);
                    const postsToday = await SocialPost.countDocuments({
                        ...query,
                        createdAt: { $gte: startOfDay }
                    });
                    if (postsToday >= 4) {
                        console.log(`⚠️ 4 post limit reached for today. Skipping schedule.`);
                        settings.monthly_schedule[pendingIdx].status = 'skipped_limit';
                        await settings.save();
                        continue;
                    }
                    targetCategory = settings.monthly_schedule[pendingIdx].category_name;
                    scheduleToUpdate = pendingIdx;
                    
                    // Mark as in progress to prevent duplicate runs
                    settings.monthly_schedule[pendingIdx].status = 'processing';
                    await settings.save();
                } else {
                    continue; // Nothing to do right now
                }

                console.log(`⏰ Social Scheduler: Running auto-post for ${logIdentifier}. Category: ${targetCategory}`);
                const { scrapeWebsite, generateSocialPosts, postToSocial } = require('./social-poster');
                const webData = await scrapeWebsite(settings.website_url);

                let custom_content = `Focus strictly on this content category: ${targetCategory}. Maintain a professional business tone. `;
                
                if (settings.business_category) {
                    let inst = `Business Category: ${settings.business_category}. `;
                    if (settings.business_desc)    inst += `Business Description: ${settings.business_desc}. `;
                    if (settings.target_audience)  inst += `Target Audience: ${settings.target_audience}. `;
                    if (settings.primary_services) inst += `Primary Services: ${settings.primary_services}. `;
                    inst += `Language: ${settings.language || 'English'}. Goal: ${settings.content_goal || 'Brand Awareness'}. `;
                    inst += `Type: ${settings.content_type || 'Promotional'}. Tone: Professional and corporate. `;
                    inst += `Length: ${settings.post_length || 'Medium'}. `;
                    if (settings.gen_hashtags === false) inst += 'No hashtags. ';
                    else inst += 'Generate relevant hashtags, avoid identical repeating hashtags. ';
                    custom_content += inst;
                }

                const generated = await generateSocialPosts(webData, targetCategory, settings.business_name || settings.title || 'Our Company', custom_content, {
                    companyId: settings.companyId,
                    userId:    settings.userId,
                    websiteUrl: settings.website_url
                });
                
                const settingsForDoc = settings.toObject ? settings.toObject() : { ...settings };
                settingsForDoc.topic = targetCategory;
                
                try {
                    const postDoc = await postToSocial(generated, settingsForDoc, isRetry ? retryPostId : null);
                    console.log(`✅ Social Scheduler: Post completed for ${logIdentifier}. ID: ${postDoc._id}`);
                    
                    if (scheduleToUpdate !== -1) {
                        settings.monthly_schedule[scheduleToUpdate].status = 'posted';
                        settings.monthly_schedule[scheduleToUpdate].post_id = postDoc._id;
                        await settings.save();
                    }
                } catch (postErr) {
                    console.error(`❌ Social Post execution error: ${postErr.message}`);
                    if (scheduleToUpdate !== -1) {
                        settings.monthly_schedule[scheduleToUpdate].status = 'failed';
                        await settings.save();
                    }
                }
            } catch(innerErr) {
                const logId = settings.companyId || settings.userId || 'unknown';
                console.error(`❌ Social Scheduler Error for ${logId}: ${innerErr.message}`);
            }
        }
    } catch(err) {
        console.error(`❌ Social Scheduler Main Error: ${err.message}`);
    }
}

function startSocialScheduler() {
    stopSocialScheduler();
    _socialJob = cron.schedule('*/5 * * * *', () => {
        runScheduledSocialPost().catch(e => console.error('Social scheduler cron error:', e.message));
    }, { timezone: 'Asia/Kolkata' });
    console.log('  ⏰ Social Auto-Poster Scheduler ACTIVE (Checks every 5 mins)');
}

function stopSocialScheduler() {
    if (_socialJob) { _socialJob.stop(); _socialJob = null; }
}

function isRunning(companyId = null) {
    if (companyId) return _isSendingCompanies.has(companyId.toString());
    return _isSendingCompanies.size > 0;
}

module.exports = {
    startScheduler,
    stopScheduler,
    runScheduledSend,
    runScheduledSendForRule,
    sendDailyReport,
    sendDailyReportForRule,
    isRunning,
    startSocialScheduler,
    stopSocialScheduler,
    runScheduledSocialPost
};
