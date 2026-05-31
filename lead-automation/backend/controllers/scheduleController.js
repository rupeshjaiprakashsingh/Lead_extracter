// controllers/scheduleController.js — Schedule controller (multi-tenant, full CRUD)
const Schedule   = require('../models/Schedule');
const Lead       = require('../models/Lead');
const { ALL_CATEGORIES } = require('../../services/categories');
const scheduler  = require('../../services/scheduler');

function buildLeadFilter(companyId, s) {
    const filter = { companyId };

    // Exclude invalid WhatsApp numbers
    filter.wa_invalid = { $ne: true };

    // Phone / Email presence
    if (s.filter_has_phone !== false) {
        filter.phone = { $exists: true, $ne: '' };
    }
    if (s.filter_has_email) {
        filter.email = { $exists: true, $ne: '' };
    }

    // Business categories
    if (s.categories && s.categories.length) {
        filter.category = { $in: s.categories };
    }

    // Lead temperature (Hot / Warm / Cold)
    if (s.temperatures && s.temperatures.length) {
        filter.temperature = { $in: s.temperatures };
    }

    // Cities
    if (s.cities && s.cities.length) {
        const cityRegexes = s.cities.map(c => new RegExp(`^${c.trim()}$`, 'i'));
        filter.city = { $in: cityRegexes };
    }

    // No website filter
    if (s.filter_no_website) {
        filter.$or = [
            { website: { $exists: false } },
            { website: '' },
            { website: null }
        ];
    }

    // Minimum rating
    if (s.filter_min_rating && s.filter_min_rating > 0) {
        filter.rating = { $gte: s.filter_min_rating };
    }

    // Skip already WA sent
    if (s.filter_skip_wa_sent && !s.allow_resend) {
        filter.wa_sent = { $ne: true };
    }

    // Skip already email sent
    if (s.filter_skip_email_sent && !s.allow_resend) {
        filter.email_sent = { $ne: true };
    }

    return filter;
}

// ── GET /api/schedule — list all rules for company ────────────────
async function getSchedule(req, res) {
    try {
        const companyId = req.user.companyId;
        const userId    = req.user._id;

        let list = await Schedule.find({ companyId }).sort({ createdAt: 1 }).lean();

        // Ensure at least a default record exists for first-time users
        if (!list.length) {
            const def = await Schedule.create({
                companyId,
                userId,
                name: 'Default Schedule',
                send_hours: [10, 16]
            });
            list = [def.toObject()];
        }

        return res.json({
            success: true,
            list,
            categories_list:    ALL_CATEGORIES,
            temperatures_list:  ['hot', 'warm', 'cold'],
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── POST /api/schedule — create new rule ─────────────────────────
async function createSchedule(req, res) {
    try {
        const companyId = req.user.companyId;
        const userId    = req.user._id;

        const s = await Schedule.create({
            companyId,
            userId,
            ...sanitizeBody(req.body)
        });

        scheduler.startScheduler();

        return res.json({ success: true, data: s });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── PUT /api/schedule/:id — update rule ──────────────────────────
async function updateSchedule(req, res) {
    try {
        const companyId = req.user.companyId;
        const { id } = req.params;

        const s = await Schedule.findOneAndUpdate(
            { _id: id, companyId },
            { $set: sanitizeBody(req.body) },
            { new: true }
        );

        if (!s) return res.status(404).json({ success: false, error: 'Schedule rule not found' });

        scheduler.startScheduler();

        return res.json({ success: true, data: s });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── DELETE /api/schedule/:id — delete rule ────────────────────────
async function deleteSchedule(req, res) {
    try {
        const companyId = req.user.companyId;
        const { id } = req.params;

        const s = await Schedule.findOneAndDelete({ _id: id, companyId });
        if (!s) return res.status(404).json({ success: false, error: 'Schedule rule not found' });

        return res.json({ success: true, message: 'Schedule rule deleted' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── POST /api/schedule/:id/run-now ────────────────────────────────
async function runNow(req, res) {
    try {
        const companyId = req.user.companyId;
        const userId    = req.user._id;
        const { id }    = req.params;

        if (scheduler.isRunning(companyId)) {
            return res.json({
                success: false,
                error: 'Already sending — please wait for current batch to finish',
            });
        }

        const s = await Schedule.findOne({ _id: id, companyId });
        if (!s) return res.status(404).json({ success: false, error: 'Rule not found' });

        res.json({ success: true, message: 'Batch started! WhatsApp/Email window will open shortly.' });

        setImmediate(() => {
            scheduler.runScheduledSendForRule(s).catch((e) =>
                console.error('Run-now error:', e.message)
            );
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── POST /api/schedule/preview ───────────────────────────────────
async function previewSchedule(req, res) {
    try {
        const companyId = req.user.companyId;
        const s         = req.body;

        // ── 1. Total leads for this company ──────────────────
        const totalLeads = await Lead.countDocuments({ companyId });

        // ── 2. Leads matching ALL filters (ignore skip-sent) ─
        const baseFilter = buildLeadFilter(companyId, s);
        // Clone and remove skip-sent predicates to see ALL matched
        const matchFilter = { ...baseFilter };
        delete matchFilter.wa_sent;
        delete matchFilter.email_sent;
        const matchedCount = await Lead.countDocuments(matchFilter);

        // ── 3. Already sent counts (within matched set) ───────
        const alreadyWaSent    = await Lead.countDocuments({ ...matchFilter, wa_sent:    true });
        const alreadyEmailSent = await Lead.countDocuments({ ...matchFilter, email_sent: true });

        // ── 4. Pending WA queue (phone + not yet sent) ────────
        const waFilter = { ...baseFilter, phone: { $exists: true, $ne: '' } };
        if (s.filter_skip_wa_sent && !s.allow_resend) {
            waFilter.wa_sent = { $ne: true };
        }
        const pendingWa = await Lead.countDocuments(waFilter);

        // ── 5. Pending Email queue (email + not yet sent) ─────
        const emailFilter = { ...baseFilter, email: { $exists: true, $ne: '' } };
        if (s.filter_skip_email_sent && !s.allow_resend) {
            emailFilter.email_sent = { $ne: true };
        }
        const pendingEmail = s.send_email
            ? await Lead.countDocuments(emailFilter)
            : 0;

        // ── 6. Preview list (up to 50 leads) ──────────────────
        const previewFilter = (s.send_whatsapp === false && s.send_email) ? emailFilter : waFilter;
        const leads = await Lead.find(previewFilter)
            .select('name phone email city category temperature website rating wa_sent email_sent')
            .sort({ createdAt: 1 })
            .limit(50)
            .lean();

        return res.json({
            success: true,
            totalLeads,
            matchedCount,
            alreadyWaSent,
            alreadyEmailSent,
            pendingWa,
            pendingEmail,
            count: pendingWa,   // backward compat
            leads,
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}


// ── POST /api/schedule/test-report ───────────────────────────────
async function testReport(req, res) {
    try {
        const companyId = req.user.companyId;
        const schedules = await Schedule.find({ companyId }).lean();
        if (schedules.length) {
            await scheduler.sendDailyReportForRule(schedules[0]);
        }
        return res.json({ success: true, message: 'Test report sent!' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── GET /api/schedule/status ──────────────────────────────────────
async function getStatus(req, res) {
    try {
        const companyId = req.user.companyId;
        const schedules = await Schedule.find({ companyId }).lean();

        const total = schedules.reduce((acc, s) => ({
            enabled:          acc.enabled || s.enabled,
            today_wa_sent:    acc.today_wa_sent    + (s.today_wa_sent    || 0),
            today_email_sent: acc.today_email_sent + (s.today_email_sent || 0),
            today_wa_failed:  acc.today_wa_failed  + (s.today_wa_failed  || 0),
            daily_limit:      acc.daily_limit      + (s.daily_limit      || 0),
        }), { enabled: false, today_wa_sent: 0, today_email_sent: 0, today_wa_failed: 0, daily_limit: 0 });

        return res.json({
            success: true,
            data: {
                ...total,
                is_running: scheduler.isRunning(companyId),
            },
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── Helper: sanitize & type-cast body fields ──────────────────────
function sanitizeBody(body) {
    const {
        name, enabled,
        send_whatsapp, send_email,
        categories, temperatures, cities,
        filter_has_phone, filter_has_email, filter_no_website,
        filter_min_rating, filter_skip_wa_sent, filter_skip_email_sent,
        allow_resend,
        daily_limit, send_hours,
        report_email
    } = body;

    return {
        name:                  name || 'New Schedule',
        enabled:               !!enabled,
        send_whatsapp:         send_whatsapp !== false,
        send_email:            !!send_email,
        categories:            Array.isArray(categories)    ? categories    : [],
        temperatures:          Array.isArray(temperatures)  ? temperatures  : [],
        cities:                Array.isArray(cities)        ? cities        : [],
        filter_has_phone:      filter_has_phone !== false,
        filter_has_email:      !!filter_has_email,
        filter_no_website:     !!filter_no_website,
        filter_min_rating:     parseFloat(filter_min_rating) || 0,
        filter_skip_wa_sent:   filter_skip_wa_sent !== false,
        filter_skip_email_sent:!!filter_skip_email_sent,
        allow_resend:          !!allow_resend,
        daily_limit:           parseInt(daily_limit) || 60,
        send_hours:            Array.isArray(send_hours) ? send_hours.map(Number) : [10, 16],
        report_email:          report_email || '',
    };
}

module.exports = {
    getSchedule,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    runNow,
    previewSchedule,
    testReport,
    getStatus,
};
