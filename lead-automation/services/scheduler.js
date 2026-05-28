// ============================================================
//  services/scheduler.js
//  WhatsApp Auto-Scheduler — dynamic hourly cron rules
//  Sends daily email reports per schedule rule at 8 PM IST
// ============================================================
const cron     = require('node-cron');
const mongoose = require('mongoose');

let _hourlyJob = null;
let _reportJob  = null;
let _socialJob  = null;
const _isSendingUsers = new Set();  // prevent overlapping sends per user

// ── Lazy model getters ────────────────────────────────────────
const getSchedule = () => {
    try {
        return mongoose.model('Schedule');
    } catch(e) {
        return require('../models/Schedule');
    }
};
const getLead = () => {
    try {
        return mongoose.model('Lead');
    } catch(e) {
        return require('../models/Lead');
    }
};
const getSocialSettings = () => {
    try {
        return mongoose.model('SocialSettings');
    } catch(e) {
        try {
            return require('../models/SocialSettings');
        } catch(err) {
            return require('../backend/models/SocialSettings');
        }
    }
};
const getSocialPost = () => {
    try {
        return mongoose.model('SocialPost');
    } catch(e) {
        try {
            return require('../models/SocialPost');
        } catch(err) {
            return require('../backend/models/SocialPost');
        }
    }
};

// ── Drop unique index and migrate existing records ───────────
async function dropUniqueIndex() {
    try {
        const conn = mongoose.connection;
        const schedulesColl = conn.db.collection('schedules');
        
        // Drop unique index on userId
        try {
            await schedulesColl.dropIndex('userId_1');
            console.log('✅ Dropped unique userId index from schedules');
        } catch(err) {
            // Index might not exist, ignore
        }

        // Migrate old schemas
        const Schedule = getSchedule();
        const unmigrated = await Schedule.find({ send_hours: { $exists: false } });
        for (const s of unmigrated) {
            const morning = s.toObject().morning_hour ?? 10;
            const evening = s.toObject().evening_hour ?? 16;
            await Schedule.updateOne({ _id: s._id }, {
                $set: {
                    name: 'Default Schedule',
                    send_hours: [morning, evening],
                    cities: []
                }
            });
        }
        if (unmigrated.length) {
            console.log(`✅ Migrated ${unmigrated.length} schedules to new multi-schedule schema`);
        }
    } catch (e) {
        console.error('⏰ Scheduler migration error:', e.message);
    }
}

// Ensure unique index drop on DB connection
if (mongoose.connection.readyState === 1) {
    dropUniqueIndex();
} else {
    mongoose.connection.once('open', dropUniqueIndex);
}

// ── Core: Run a specific schedule rule ────────────────────────
async function runScheduledSendForRule(schedule) {
    const userId = schedule.userId;
    if (_isSendingUsers.has(userId)) {
        console.log(`⏰ Scheduler: already sending for user ${userId}, skipping rule "${schedule.name}"`);
        return { sent: 0, failed: 0, skipped: 0 };
    }

    const Lead     = getLead();
    const Schedule = getSchedule();

    // Reset daily counter if new day
    const today = new Date().toISOString().slice(0, 10);
    if (schedule.today_date !== today) {
        await Schedule.updateOne({ _id: schedule._id }, {
            $set: { today_sent: 0, today_failed: 0, today_date: today }
        });
        schedule.today_sent   = 0;
        schedule.today_failed = 0;
    }

    const remaining = schedule.daily_limit - schedule.today_sent;
    if (remaining <= 0) {
        console.log(`⏰ Scheduler: daily limit already reached for rule "${schedule.name}"`);
        return { sent: 0, failed: 0, skipped: 0 };
    }

    // Split target limit by the number of scheduled hours per day
    const hourCount = schedule.send_hours?.length || 1;
    const targetBatchSize = Math.ceil(schedule.daily_limit / hourCount);
    const toSend = Math.min(targetBatchSize, remaining);

    // Build lead filters
    const filter = { userId, phone: { $exists: true, $ne: '' } };

    if (schedule.categories?.length) {
        filter.category = { $in: schedule.categories };
    }

    if (schedule.cities?.length) {
        const cityRegexes = schedule.cities.map(c => new RegExp(`^${c.trim()}$`, 'i'));
        filter.city = { $in: cityRegexes };
    }

    // Skip already sent
    if (schedule.skip_sent && !schedule.allow_resend) {
        filter.wa_sent = { $ne: true };
    }

    const leads = await Lead.find(filter)
        .sort({ createdAt: 1 })   // FIFO
        .limit(toSend)
        .lean();

    if (!leads.length) {
        console.log(`⏰ Scheduler: no leads match filter for rule "${schedule.name}"`);
        return { sent: 0, failed: 0, skipped: 0 };
    }

    console.log(`\n⏰ Running schedule "${schedule.name}": sending ${leads.length} leads for user ${userId}`);
    _isSendingUsers.add(userId);

    let sent = 0, failed = 0;

    try {
        const { sendLocalWA } = require('../playwright-sender');
        const result = await sendLocalWA(
            leads.map(l => l._id.toString()),
            false,
            {
                skipWaSent: schedule.skip_sent && !schedule.allow_resend,
                isScheduled: true,
                companyId: userId,
                onComplete: (s, f) => { sent = s; failed = f; }
            }
        );
        if (result) { sent = result.sent || sent; failed = result.failed || failed; }
    } catch(e) {
        console.error(`⏰ Scheduled send error for rule "${schedule.name}":`, e.message);
        failed = leads.length;
    } finally {
        _isSendingUsers.delete(userId);
    }

    // Update stats
    await Schedule.updateOne({ _id: schedule._id }, {
        $inc: { today_sent: sent, today_failed: failed, total_sent: sent },
        $set: { last_run: new Date() }
    });

    console.log(`⏰ Batch done for rule "${schedule.name}": ${sent} sent, ${failed} failed`);
    return { sent, failed, skipped: leads.length - sent - failed };
}

// ── Entry points ──────────────────────────────────────────────
async function runScheduledSend(session = 'manual', userId = null, scheduleId = null) {
    const Schedule = getSchedule();
    if (scheduleId) {
        const schedule = await Schedule.findOne({ _id: scheduleId, userId });
        if (schedule) {
            return await runScheduledSendForRule(schedule);
        }
        return { sent: 0, failed: 0, skipped: 0 };
    }

    if (userId) {
        const schedules = await Schedule.find({ userId, enabled: true });
        let s = 0, f = 0;
        for (const sched of schedules) {
            const res = await runScheduledSendForRule(sched);
            s += res.sent; f += res.failed;
        }
        return { sent: s, failed: f };
    }
}

// ── Daily Email Reports ───────────────────────────────────────
async function sendDailyReportsAll() {
    const Schedule = getSchedule();
    const schedules = await Schedule.find({ enabled: true, report_email: { $exists: true, $ne: '' } });
    for (const schedule of schedules) {
        await sendDailyReportForRule(schedule);
    }
}

async function sendDailyReport(userId = null) {
    const Schedule = getSchedule();
    const query = userId 
        ? { userId, enabled: true, report_email: { $exists: true, $ne: '' } } 
        : { enabled: true, report_email: { $exists: true, $ne: '' } };
    const schedules = await Schedule.find(query);
    for (const s of schedules) {
        await sendDailyReportForRule(s);
    }
}

async function sendDailyReportForRule(schedule) {
    if (!schedule.report_email) return;
    const uId = schedule.userId;
    const { sendEmail } = require('./email-sender');

    const today = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: 'Asia/Kolkata'
    });

    const successRate = schedule.today_sent + schedule.today_failed > 0
        ? Math.round((schedule.today_sent / (schedule.today_sent + schedule.today_failed)) * 100)
        : 100;

    const categories = schedule.categories?.length ? schedule.categories.join(', ') : 'All Categories';
    const cities = schedule.cities?.length ? schedule.cities.join(', ') : 'All Cities';

    const html = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:linear-gradient(135deg,#1e3a5f,#4f8ef7);padding:32px;text-align:center">
    <div style="font-size:36px">📊</div>
    <h1 style="color:#fff;margin:8px 0 4px;font-size:22px">Daily WhatsApp Report</h1>
    <p style="color:rgba(255,255,255,.7);margin:0;font-size:13px">${today}</p>
    <p style="color:#fff;margin:8px 0 0;font-size:14px;font-weight:600">Rule: ${schedule.name}</p>
  </div>
  <div style="padding:28px">

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px">
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;text-align:center">
        <div style="font-size:36px;font-weight:700;color:#166534">${schedule.today_sent}</div>
        <div style="font-size:11px;color:#166534;font-weight:600">SENT ✅</div>
      </div>
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;text-align:center">
        <div style="font-size:36px;font-weight:700;color:#dc2626">${schedule.today_failed}</div>
        <div style="font-size:11px;color:#dc2626;font-weight:600">FAILED ❌</div>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;text-align:center">
        <div style="font-size:36px;font-weight:700;color:#1d4ed8">${successRate}%</div>
        <div style="font-size:11px;color:#1d4ed8;font-weight:600">SUCCESS RATE</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#374151">
      <tr style="background:#f9fafb">
        <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600">Daily Limit</td>
        <td style="padding:10px 12px;border:1px solid #e5e7eb">${schedule.daily_limit} messages</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600">Categories Targeted</td>
        <td style="padding:10px 12px;border:1px solid #e5e7eb">${categories}</td>
      </tr>
      <tr style="background:#f9fafb">
        <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600">Cities Targeted</td>
        <td style="padding:10px 12px;border:1px solid #e5e7eb">${cities}</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600">Skip Already Sent</td>
        <td style="padding:10px 12px;border:1px solid #e5e7eb">${schedule.skip_sent ? 'Yes ✓' : 'No'}</td>
      </tr>
      <tr style="background:#f9fafb">
        <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600">All-Time Total Sent</td>
        <td style="padding:10px 12px;border:1px solid #e5e7eb"><strong>${schedule.total_sent}</strong> messages</td>
      </tr>
    </table>

    ${schedule.today_sent === 0 ? `
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:14px;margin-top:16px;font-size:13px;color:#713f12">
      ⚠️ <strong>0 messages sent today.</strong> Make sure the CRM server is running and WhatsApp Web is logged in.
    </div>` : `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;margin-top:16px;font-size:13px;color:#166534">
      ✅ <strong>Great job!</strong> ${schedule.today_sent} WhatsApp messages were sent today by the auto-scheduler.
    </div>`}

    <p style="font-size:11px;color:#9ca3af;margin-top:24px;text-align:center">
      Automated report from Innvoque Lead CRM &bull;
      <a href="http://localhost:3000" style="color:#6b7280">Open Dashboard</a>
    </p>
  </div>
</div>`;

    try {
        await sendEmail(schedule.report_email, `📊 Daily WA Report [${schedule.name}]: ${schedule.today_sent} sent`, html, uId);
        const ScheduleModel = getSchedule();
        await ScheduleModel.updateOne({ _id: schedule._id }, { $set: { last_report_at: new Date() } });
        console.log(`📧 Daily report sent to ${schedule.report_email} for rule "${schedule.name}" (${schedule._id})`);
    } catch(e) {
        console.error(`📧 Report email failed for rule "${schedule.name}":`, e.message);
    }
}

// ── Start / Stop Scheduler ────────────────────────────────────
function startScheduler() {
    stopScheduler();
    
    // Check every minute to see if any schedule for the current hour needs to run
    _hourlyJob = cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const hourStr = now.toLocaleTimeString('en-US', { hour12: false, hour: 'numeric', timeZone: 'Asia/Kolkata' });
            const currentHour = parseInt(hourStr);
            const todayStr = now.toISOString().slice(0, 10);

            const Schedule = getSchedule();
            // Find all enabled rules scheduled for this hour
            const activeSchedules = await Schedule.find({ enabled: true, send_hours: currentHour });

            for (const sched of activeSchedules) {
                // Check if already run in the current hour of today
                if (sched.last_run) {
                    const lastRunHour = new Date(sched.last_run).toLocaleTimeString('en-US', { hour12: false, hour: 'numeric', timeZone: 'Asia/Kolkata' });
                    const lastRunDate = new Date(sched.last_run).toISOString().slice(0, 10);
                    if (parseInt(lastRunHour) === currentHour && lastRunDate === todayStr) {
                        // Already ran this hour
                        continue;
                    }
                }

                console.log(`⏰ Auto-Scheduler: triggering WhatsApp rule "${sched.name}" for user ${sched.userId} (Hour: ${currentHour})`);
                runScheduledSendForRule(sched).catch(err => console.error(`Error running schedule ${sched._id}:`, err.message));
            }
        } catch(e) {
            console.error('⏰ Scheduler cron check error:', e.message);
        }
    }, { timezone: 'Asia/Kolkata' });

    // Daily report job at 8 PM IST
    _reportJob = cron.schedule('0 20 * * *', () => {
        console.log('\n📊 Sending daily email reports...');
        sendDailyReportsAll().catch(e => console.error('Report error:', e.message));
    }, { timezone: 'Asia/Kolkata' });

    console.log('  ⏰ Scheduler ACTIVE: Minute-by-minute check for custom schedule times');
}

function stopScheduler() {
    if (_hourlyJob) { _hourlyJob.stop(); _hourlyJob = null; }
    if (_reportJob)  { _reportJob.stop();  _reportJob  = null; }
}

// ── Social Poster Scheduler ───────────────────────────────────
async function runScheduledSocialPost() {
    try {
        const SocialSettings = getSocialSettings();
        const SocialPost = getSocialPost();
        
        const settingsList = await SocialSettings.find({ enabled: true });
        for (const settings of settingsList) {
            try {
                const now = new Date();
                const currentHour = parseInt(now.toLocaleTimeString('en-US', { hour12: false, hour: 'numeric', timeZone: 'Asia/Kolkata' }));
                const todayStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });

                const logIdentifier = settings.companyId ? `company ${settings.companyId}` : `user ${settings.userId}`;

                const query = {};
                if (settings.companyId) {
                    query.companyId = settings.companyId;
                } else if (settings.userId) {
                    query.userId = settings.userId;
                }

                if (settings.frequency === 'daily') {
                    if (currentHour !== settings.time_hour) {
                        continue;
                    }
                    const lastPost = await SocialPost.findOne(query).sort({ createdAt: -1 });
                    if (lastPost && new Date(lastPost.createdAt).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' }) === todayStr) {
                        continue;
                    }
                } else if (settings.frequency === 'thirty_minutes') {
                    const lastPost = await SocialPost.findOne(query).sort({ createdAt: -1 });
                    if (lastPost) {
                        const diffMs = now - new Date(lastPost.createdAt);
                        const diffMins = diffMs / (1000 * 60);
                        if (diffMins < 25) {
                            continue;
                        }
                    }
                } else if (settings.frequency === 'hourly') {
                    const lastPost = await SocialPost.findOne(query).sort({ createdAt: -1 });
                    if (lastPost) {
                        const diffMs = now - new Date(lastPost.createdAt);
                        const diffMins = diffMs / (1000 * 60);
                        if (diffMins < 50) {
                            continue;
                        }
                    }
                }

                console.log(`⏰ Social Scheduler: Running scheduled social posting (${settings.frequency}) for ${logIdentifier}...`);
                const { scrapeWebsite, generateSocialPosts, postToSocial } = require('./social-poster');
                const webData = await scrapeWebsite(settings.website_url);

                let topic = settings.topic;
                let title = settings.title;
                let custom_content = settings.custom_content;

                if (settings.categories && settings.categories.length > 0) {
                    const idx = settings.current_category_index || 0;
                    const cat = settings.categories[idx % settings.categories.length];
                    topic = cat.topic || settings.topic;
                    title = cat.name || settings.title;
                    custom_content = `[Category: ${cat.name}] ${cat.custom_content || ''} (Focus keywords: ${cat.keywords || ''}). ${settings.custom_content || ''}`;
                    
                    settings.current_category_index = (idx + 1) % settings.categories.length;
                    await settings.save();
                    console.log(`⏰ Social Scheduler: Selected category "${cat.name}" (Index ${idx})`);
                }

                const generated = await generateSocialPosts(webData, topic, title, custom_content, {
                    companyId: settings.companyId,
                    userId: settings.userId,
                    websiteUrl: settings.website_url
                });
                
                // Construct a temporary settings object to pass category topic/title info to post document
                const settingsForDoc = settings.toObject ? settings.toObject() : { ...settings };
                settingsForDoc.topic = topic;
                settingsForDoc.title = title;
                settingsForDoc.custom_content = custom_content;
                
                const postDoc = await postToSocial(generated, settingsForDoc);
                console.log(`✅ Social Scheduler: Posting completed for ${logIdentifier}. Post ID: ${postDoc._id}`);
            } catch (innerErr) {
                const logId = settings.companyId || settings.userId || 'unknown';
                console.error(`❌ Social Scheduler Error for ${logId}: ${innerErr.message}`);
            }
        }
    } catch (err) {
        console.error(`❌ Social Scheduler Main Error: ${err.message}`);
    }
}

function startSocialScheduler() {
    stopSocialScheduler();
    _socialJob = cron.schedule('*/5 * * * *', () => {
        console.log('\n⏰ Social scheduler check triggered...');
        runScheduledSocialPost().catch(e => console.error('Social scheduler cron error:', e.message));
    }, { timezone: 'Asia/Kolkata' });
    console.log('  ⏰ Social Auto-Poster Scheduler ACTIVE (Checks every 5 mins)');
}

function stopSocialScheduler() {
    if (_socialJob) { _socialJob.stop(); _socialJob = null; }
}

function isRunning(userId = null) { 
    if (userId) return _isSendingUsers.has(userId);
    return _isSendingUsers.size > 0; 
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
