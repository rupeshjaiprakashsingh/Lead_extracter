// ============================================================
//  services/scheduler.js
//  WhatsApp Auto-Scheduler — runs morning + evening batches
//  Sends daily email report at 8 PM IST
// ============================================================
const cron     = require('node-cron');
const mongoose = require('mongoose');

let _morningJob = null;
let _eveningJob = null;
let _reportJob  = null;
let _isSending  = false;  // prevent overlapping sends

// ── Lazy model getters (avoids circular require) ──────────────
const getSchedule = () => mongoose.model('Schedule');
const getLead     = () => mongoose.model('Lead');

// ── Random human-like delay ───────────────────────────────────
//   Base: 25–45 s, every 10 messages take a 1–2 min break
function getDelay(index) {
    if (index > 0 && index % 10 === 0) {
        // Human break: 60–120 seconds
        return Math.floor(60000 + Math.random() * 60000);
    }
    // Normal: 25–45 seconds
    return Math.floor(25000 + Math.random() * 20000);
}

// ── Core: pick leads & send ───────────────────────────────────
async function runScheduledSend(session = 'morning') {
    if (_isSending) {
        console.log('⏰ Scheduler: already sending, skip this trigger');
        return { sent: 0, failed: 0, skipped: 0 };
    }

    const Schedule = getSchedule();
    const Lead     = getLead();

    const schedule = await Schedule.findOne({});
    if (!schedule || !schedule.enabled) {
        console.log('⏰ Scheduler: disabled, skipping');
        return { sent: 0, failed: 0, skipped: 0 };
    }

    // ── Reset daily counter if new day ───────────────────────
    const today = new Date().toISOString().slice(0, 10);
    if (schedule.today_date !== today) {
        await Schedule.updateOne({}, {
            $set: { today_sent: 0, today_failed: 0, today_date: today }
        });
        schedule.today_sent   = 0;
        schedule.today_failed = 0;
    }

    const remaining = schedule.daily_limit - schedule.today_sent;
    if (remaining <= 0) {
        console.log('⏰ Scheduler: daily limit already reached');
        return { sent: 0, failed: 0, skipped: 0 };
    }

    // ── Batch split: 50% morning, rest evening ────────────────
    const batchSize = session === 'morning'
        ? Math.ceil(schedule.daily_limit * 0.5)
        : remaining;
    const toSend = Math.min(batchSize, remaining);

    // ── Build lead filter ─────────────────────────────────────
    const filter = { phone: { $exists: true, $ne: '' } };

    if (schedule.categories?.length) {
        filter.category = { $in: schedule.categories };
    }

    // Skip if: skip_sent=true AND allow_resend=false
    if (schedule.skip_sent && !schedule.allow_resend) {
        filter.wa_sent = { $ne: true };
    }

    const leads = await Lead.find(filter)
        .sort({ createdAt: 1 })   // oldest first (FIFO)
        .limit(toSend)
        .lean();

    if (!leads.length) {
        console.log('⏰ Scheduler: no leads match filter');
        return { sent: 0, failed: 0, skipped: 0 };
    }

    console.log(`\n⏰ Scheduled ${session} batch: ${leads.length} leads`);
    _isSending = true;

    let sent = 0, failed = 0;

    try {
        const { sendLocalWA } = require('../playwright-sender');
        const result = await sendLocalWA(
            leads.map(l => l._id.toString()),
            false,
            {
                skipWaSent: schedule.skip_sent && !schedule.allow_resend,
                isScheduled: true,
                onComplete: (s, f) => { sent = s; failed = f; }
            }
        );
        if (result) { sent = result.sent || sent; failed = result.failed || failed; }
    } catch(e) {
        console.error('⏰ Scheduled send error:', e.message);
        failed = leads.length;
    } finally {
        _isSending = false;
    }

    // ── Update stats ──────────────────────────────────────────
    await Schedule.updateOne({}, {
        $inc: { today_sent: sent, today_failed: failed, total_sent: sent },
        $set: { last_run: new Date() }
    });

    console.log(`⏰ Batch done: ${sent} sent, ${failed} failed`);
    return { sent, failed, skipped: leads.length - sent - failed };
}

// ── Daily Email Report ────────────────────────────────────────
async function sendDailyReport() {
    const Schedule = getSchedule();
    const schedule = await Schedule.findOne({});
    if (!schedule?.report_email) return;

    const { sendEmail } = require('./email-sender');

    const today = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: 'Asia/Kolkata'
    });

    const successRate = schedule.today_sent + schedule.today_failed > 0
        ? Math.round((schedule.today_sent / (schedule.today_sent + schedule.today_failed)) * 100)
        : 100;

    const categories = schedule.categories?.length
        ? schedule.categories.join(', ')
        : 'All Categories';

    const html = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:linear-gradient(135deg,#1e3a5f,#4f8ef7);padding:32px;text-align:center">
    <div style="font-size:36px">📊</div>
    <h1 style="color:#fff;margin:8px 0 4px;font-size:22px">Daily WhatsApp Report</h1>
    <p style="color:rgba(255,255,255,.7);margin:0;font-size:13px">${today}</p>
  </div>
  <div style="padding:28px">

    <!-- Stats grid -->
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

    <!-- Details -->
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
        <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600">Skip Already Sent</td>
        <td style="padding:10px 12px;border:1px solid #e5e7eb">${schedule.skip_sent ? 'Yes ✓' : 'No'}</td>
      </tr>
      <tr>
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
        await sendEmail(schedule.report_email, `📊 Daily WA Report: ${schedule.today_sent} sent — ${today}`, html);
        await Schedule.updateOne({}, { $set: { last_report_at: new Date() } });
        console.log(`📧 Daily report sent to ${schedule.report_email}`);
    } catch(e) {
        console.error('📧 Report email failed:', e.message);
    }
}

// ── Start / Stop Scheduler ────────────────────────────────────
function startScheduler(schedule) {
    stopScheduler();
    if (!schedule?.enabled) {
        console.log('  ⏰ Scheduler: disabled');
        return;
    }

    const mH = schedule.morning_hour ?? 10;
    const eH = schedule.evening_hour ?? 16;

    _morningJob = cron.schedule(`0 ${mH} * * *`, () => {
        console.log(`\n⏰ Morning batch triggered (${mH}:00 IST)`);
        runScheduledSend('morning').catch(e => console.error('Schedule error:', e.message));
    }, { timezone: 'Asia/Kolkata' });

    _eveningJob = cron.schedule(`0 ${eH} * * *`, () => {
        console.log(`\n⏰ Evening batch triggered (${eH}:00 IST)`);
        runScheduledSend('evening').catch(e => console.error('Schedule error:', e.message));
    }, { timezone: 'Asia/Kolkata' });

    _reportJob = cron.schedule('0 20 * * *', () => {
        console.log('\n📊 Sending daily email report...');
        sendDailyReport().catch(e => console.error('Report error:', e.message));
    }, { timezone: 'Asia/Kolkata' });

    console.log(`  ⏰ Scheduler ACTIVE: ${mH}:00 AM + ${eH}:00 PM IST | Report: 8:00 PM`);
}

function stopScheduler() {
    if (_morningJob) { _morningJob.stop(); _morningJob = null; }
    if (_eveningJob) { _eveningJob.stop(); _eveningJob = null; }
    if (_reportJob)  { _reportJob.stop();  _reportJob  = null; }
}

function isRunning() { return _isSending; }

module.exports = { startScheduler, stopScheduler, runScheduledSend, sendDailyReport, isRunning };
