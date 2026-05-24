// controllers/scheduleController.js — Schedule controller (multi-tenant)
const Schedule = require('../models/Schedule');
const { ALL_CATEGORIES } = require('../../services/categories');
const scheduler = require('../../services/scheduler');

// ── GET /api/schedule ─────────────────────────────────────────────
async function getSchedule(req, res) {
    try {
        const companyId = req.user.companyId;
        const userId    = req.user._id;

        let s = await Schedule.findOne({ companyId, userId });
        if (!s) {
            s = await Schedule.create({ companyId, userId });
        }

        return res.json({
            success: true,
            data: { ...s.toObject(), categories_list: ALL_CATEGORIES },
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── POST /api/schedule ────────────────────────────────────────────
async function saveSchedule(req, res) {
    try {
        const companyId = req.user.companyId;
        const userId    = req.user._id;

        const {
            enabled, categories, daily_limit, skip_sent, allow_resend,
            morning_hour, evening_hour, report_email,
        } = req.body;

        const s = await Schedule.findOneAndUpdate(
            { companyId, userId },
            {
                companyId,
                userId,
                enabled,
                categories,
                daily_limit:  parseInt(daily_limit)  || 60,
                skip_sent,
                allow_resend,
                morning_hour: parseInt(morning_hour) || 10,
                evening_hour: parseInt(evening_hour) || 16,
                report_email: report_email || '',
            },
            { upsert: true, new: true }
        );

        // Restart cron with new settings
        scheduler.startScheduler(s);

        return res.json({ success: true, data: s });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── POST /api/schedule/run-now ────────────────────────────────────
async function runNow(req, res) {
    try {
        const userId = req.user._id;

        if (scheduler.isRunning(userId)) {
            return res.json({
                success: false,
                error: 'Already sending — please wait for current batch to finish',
            });
        }

        res.json({ success: true, message: 'Scheduled batch started! WhatsApp window will open shortly.' });

        setImmediate(() => {
            scheduler.runScheduledSend('manual', userId).catch((e) =>
                console.error('Run-now error:', e.message)
            );
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── POST /api/schedule/test-report ───────────────────────────────
async function testReport(req, res) {
    try {
        const userId = req.user._id;
        await scheduler.sendDailyReport(userId);
        return res.json({ success: true, message: 'Test report sent!' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── GET /api/schedule/status ──────────────────────────────────────
async function getStatus(req, res) {
    try {
        const companyId = req.user.companyId;
        const userId    = req.user._id;
        const s = await Schedule.findOne({ companyId, userId });

        return res.json({
            success: true,
            data: {
                enabled:      s?.enabled      || false,
                today_sent:   s?.today_sent   || 0,
                today_failed: s?.today_failed || 0,
                daily_limit:  s?.daily_limit  || 60,
                last_run:     s?.last_run,
                is_running:   scheduler.isRunning(userId),
            },
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

module.exports = {
    getSchedule,
    saveSchedule,
    runNow,
    testReport,
    getStatus,
};
