// ============================================================
//  services/email-scheduler.js
//  Email Auto-Scheduler — dynamic hourly cron rules
//  Sends daily email reports per schedule rule at 8 PM IST
// ============================================================
const cron     = require('node-cron');
const mongoose = require('mongoose');
const { sendEmail } = require('./email-sender');
const { buildInitialEmail } = require('./ai-messages');

let _hourlyJob = null;
let _reportJob  = null;
const _isSendingUsers = new Set();  // prevent overlapping sends per user

const getEmailSchedule = () => mongoose.model('EmailSchedule');
const getLead          = () => mongoose.model('Lead');

// ── Core: Run a specific schedule rule ────────────────────────
async function runScheduledSendForRule(schedule) {
    const userId = schedule.userId;
    if (_isSendingUsers.has(userId)) {
        console.log(`⏰ Email Scheduler: already sending for user ${userId}, skipping rule "${schedule.name}"`);
        return { sent: 0, failed: 0, skipped: 0 };
    }

    const Lead     = getLead();
    const EmailSchedule = getEmailSchedule();

    // Reset daily counter if new day
    const today = new Date().toISOString().slice(0, 10);
    if (schedule.today_date !== today) {
        await EmailSchedule.updateOne({ _id: schedule._id }, {
            $set: { today_sent: 0, today_failed: 0, today_date: today }
        });
        schedule.today_sent   = 0;
        schedule.today_failed = 0;
    }

    const remaining = schedule.daily_limit - schedule.today_sent;
    if (remaining <= 0) {
        console.log(`⏰ Email Scheduler: daily limit already reached for rule "${schedule.name}"`);
        return { sent: 0, failed: 0, skipped: 0 };
    }

    // Split target limit by the number of scheduled hours per day
    const hourCount = schedule.send_hours?.length || 1;
    const targetBatchSize = Math.ceil(schedule.daily_limit / hourCount);
    const toSend = Math.min(targetBatchSize, remaining);

    // Build lead filters
    const filter = { userId, email: { $exists: true, $ne: '' } };

    if (schedule.categories?.length) {
        filter.category = { $in: schedule.categories };
    }

    if (schedule.cities?.length) {
        const cityRegexes = schedule.cities.map(c => new RegExp(`^${c.trim()}$`, 'i'));
        filter.city = { $in: cityRegexes };
    }

    // Skip already sent
    if (schedule.skip_sent && !schedule.allow_resend) {
        filter.email_sent = { $ne: true };
    }

    const leads = await Lead.find(filter)
        .sort({ createdAt: 1 })   // FIFO
        .limit(toSend)
        .lean();

    if (!leads.length) {
        console.log(`⏰ Email Scheduler: no leads match filter for rule "${schedule.name}"`);
        return { sent: 0, failed: 0, skipped: 0 };
    }

    console.log(`\n⏰ Running email schedule "${schedule.name}": sending ${leads.length} leads for user ${userId}`);
    _isSendingUsers.add(userId);

    let sent = 0, failed = 0;

    try {
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            
            // Random delay to avoid spam/rate-limiting (2 to 5 seconds)
            if (i > 0) {
                const delay = 2000 + Math.random() * 3000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            try {
                const { subject, html } = await buildInitialEmail(lead);
                await sendEmail(lead.email, subject, html, userId);
                
                await Lead.findOneAndUpdate({ _id: lead._id, userId }, {
                    $inc:  { email_count: 1 },
                    $set:  { email_sent: true, email_last_date: today },
                    $push: { activity: { type: 'email_sent', message: `Initial email sent (automated schedule: "${schedule.name}")`, date: new Date() } }
                });
                sent++;
            } catch (err) {
                failed++;
                console.error(`⏰ Email Scheduler: Failed to send to ${lead.email}:`, err.message);
            }
        }
    } catch(e) {
        console.error(`⏰ Scheduled email send error for rule "${schedule.name}":`, e.message);
        failed += (leads.length - sent - failed);
    } finally {
        _isSendingUsers.delete(userId);
    }

    // Update stats
    await EmailSchedule.updateOne({ _id: schedule._id }, {
        $inc: { today_sent: sent, today_failed: failed, total_sent: sent },
        $set: { last_run: new Date() }
    });

    console.log(`⏰ Email Batch done for rule "${schedule.name}": ${sent} sent, ${failed} failed`);
    return { sent, failed, skipped: leads.length - sent - failed };
}

// ── Entry points ──────────────────────────────────────────────
async function runScheduledSend(session = 'manual', userId = null, scheduleId = null) {
    const EmailSchedule = getEmailSchedule();
    if (scheduleId) {
        const schedule = await EmailSchedule.findOne({ _id: scheduleId, userId });
        if (schedule) {
            return await runScheduledSendForRule(schedule);
        }
        return { sent: 0, failed: 0, skipped: 0 };
    }

    if (userId) {
        const schedules = await EmailSchedule.find({ userId, enabled: true });
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
    const EmailSchedule = getEmailSchedule();
    const schedules = await EmailSchedule.find({ enabled: true, report_email: { $exists: true, $ne: '' } });
    for (const schedule of schedules) {
        await sendDailyReportForRule(schedule);
    }
}

async function sendDailyReport(userId = null) {
    const EmailSchedule = getEmailSchedule();
    const query = userId 
        ? { userId, enabled: true, report_email: { $exists: true, $ne: '' } } 
        : { enabled: true, report_email: { $exists: true, $ne: '' } };
    const schedules = await EmailSchedule.find(query);
    for (const s of schedules) {
        await sendDailyReportForRule(s);
    }
}

async function sendDailyReportForRule(schedule) {
    if (!schedule.report_email) return;
    const uId = schedule.userId;

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
  <div style="background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:32px;text-align:center">
    <div style="font-size:36px">📧</div>
    <h1 style="color:#fff;margin:8px 0 4px;font-size:22px">Daily Email Scheduler Report</h1>
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
        <td style="padding:10px 12px;border:1px solid #e5e7eb">${schedule.daily_limit} emails</td>
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
        <td style="padding:10px 12px;border:1px solid #e5e7eb"><strong>${schedule.total_sent}</strong> emails</td>
      </tr>
    </table>

    ${schedule.today_sent === 0 ? `
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:14px;margin-top:16px;font-size:13px;color:#713f12">
      ⚠️ <strong>0 emails sent today.</strong> Make sure the CRM server is running and SMTP settings are correct.
    </div>` : `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;margin-top:16px;font-size:13px;color:#166534">
      ✅ <strong>Great job!</strong> ${schedule.today_sent} emails were sent today by the auto-scheduler.
    </div>`}

    <p style="font-size:11px;color:#9ca3af;margin-top:24px;text-align:center">
      Automated report from Innvoque Lead CRM &bull;
      <a href="http://localhost:3000" style="color:#6b7280">Open Dashboard</a>
    </p>
  </div>
</div>`;

    try {
        await sendEmail(schedule.report_email, `📊 Daily Email Report [${schedule.name}]: ${schedule.today_sent} sent`, html, uId);
        const EmailScheduleModel = getEmailSchedule();
        await EmailScheduleModel.updateOne({ _id: schedule._id }, { $set: { last_report_at: new Date() } });
        console.log(`📧 Daily report sent to ${schedule.report_email} for email rule "${schedule.name}" (${schedule._id})`);
    } catch(e) {
        console.error(`📧 Report email failed for email rule "${schedule.name}":`, e.message);
    }
}

// ── Start / Stop Scheduler ────────────────────────────────────
function startScheduler() {
    stopScheduler();
    
    // Check every minute to see if any email schedule for the current hour needs to run
    _hourlyJob = cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const hourStr = now.toLocaleTimeString('en-US', { hour12: false, hour: 'numeric', timeZone: 'Asia/Kolkata' });
            const currentHour = parseInt(hourStr);
            const todayStr = now.toISOString().slice(0, 10);

            const EmailSchedule = getEmailSchedule();
            // Find all enabled rules scheduled for this hour
            const activeSchedules = await EmailSchedule.find({ enabled: true, send_hours: currentHour });

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

                console.log(`⏰ Auto-Scheduler: triggering Email rule "${sched.name}" for user ${sched.userId} (Hour: ${currentHour})`);
                runScheduledSendForRule(sched).catch(err => console.error(`Error running email schedule ${sched._id}:`, err.message));
            }
        } catch(e) {
            console.error('⏰ Email Scheduler cron check error:', e.message);
        }
    }, { timezone: 'Asia/Kolkata' });

    // Daily report job at 8 PM IST
    _reportJob = cron.schedule('0 20 * * *', () => {
        console.log('\n📊 Sending daily email reports...');
        sendDailyReportsAll().catch(e => console.error('Report error:', e.message));
    }, { timezone: 'Asia/Kolkata' });

    console.log('  ⏰ Email Scheduler ACTIVE: Minute-by-minute check for custom schedule times');
}

function stopScheduler() {
    if (_hourlyJob) { _hourlyJob.stop(); _hourlyJob = null; }
    if (_reportJob)  { _reportJob.stop();  _reportJob  = null; }
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
    isRunning
};
