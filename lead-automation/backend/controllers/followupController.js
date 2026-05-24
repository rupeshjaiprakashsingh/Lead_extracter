const Lead = require('../models/Lead');
const { buildFollowupEmail } = require('../../services/ai-messages');
const { sendEmail } = require('../services/email-sender');

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function emit(companyId, data) {
    if (global.emitToCompany) {
        global.emitToCompany(companyId, data);
    }
}

// ── GET /api/followups ────────────────────────────────────────
exports.getFollowups = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const search    = req.query.search || '';
        const status    = req.query.status || '';
        
        const filter = { companyId, followup_queued: true };
        if (search) {
            const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [{ name: re }, { phone: re }, { raw_phone: re }, { email: re }, { city: re }];
        }
        if (status) {
            filter.status = status;
        }

        const leads = await Lead.find(filter)
            .sort({ followup_scheduled_at: 1, createdAt: -1 })
            .limit(200)
            .lean();

        res.json({ success: true, data: leads });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/followups/stats ──────────────────────────────────
exports.getStats = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const total = await Lead.countDocuments({ companyId, followup_queued: true });
        const due = await Lead.countDocuments({
            companyId,
            followup_queued: true,
            followup_scheduled_at: { $lte: new Date() }
        });
        res.json({ success: true, data: { total, due } });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/followups/remove ────────────────────────────────
exports.removeFollowups = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const { ids } = req.body;
        if (!ids || !ids.length) {
            return res.status(400).json({ success: false, error: 'No IDs provided' });
        }

        await Lead.updateMany(
            { _id: { $in: ids }, companyId },
            {
                $set: { followup_queued: false, followup_note: '', followup_scheduled_at: null },
                $push: { activity: { type: 'followup', message: 'Removed from follow-up queue', date: new Date() } }
            }
        );

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/followups/:id/send-wa ───────────────────────────
exports.sendWA = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const lead = await Lead.findOne({ _id: req.params.id, companyId }).lean();
        if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

        res.json({ success: true, message: 'Follow-up WA draft started!' });

        setImmediate(async () => {
            const { sendLocalWA_Draft } = require('../../playwright-sender');
            await sendLocalWA_Draft([req.params.id], true, { skipWaSent: false, companyId });
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/followups/:id/send-email ────────────────────────
exports.sendEmail = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const lead = await Lead.findOne({ _id: req.params.id, companyId }).lean();
        if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
        if (!lead.email) return res.status(400).json({ success: false, error: 'No email address for this lead' });

        const followupNum = (lead.followup_count || 0) + 1;
        const { subject, html } = buildFollowupEmail(lead, followupNum);
        
        await sendEmail(lead.email, subject, html, companyId);

        await Lead.findOneAndUpdate(
            { _id: lead._id, companyId },
            {
                $inc: { email_count: 1, followup_count: 1 },
                $set: { email_sent: true, email_last_date: todayStr() },
                $push: { activity: { type: 'email_sent', message: `Follow-up #${followupNum} email sent`, date: new Date() } }
            }
        );

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/followups/send-wa-bulk ──────────────────────────
exports.sendWABulk = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const { ids } = req.body;
        if (!ids || !ids.length) {
            return res.status(400).json({ success: false, error: 'No IDs provided' });
        }

        const matchingLeads = await Lead.find({ _id: { $in: ids }, companyId }).select('_id');
        const allowedIds = matchingLeads.map(l => l._id.toString());
        if (!allowedIds.length) {
            return res.status(400).json({ success: false, error: 'No authorized leads selected' });
        }

        res.json({ success: true, message: 'Follow-up WA draft started for selected leads!' });

        setImmediate(async () => {
            const { sendLocalWA_Draft } = require('../../playwright-sender');
            await sendLocalWA_Draft(allowedIds, true, { skipWaSent: false, companyId });
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/followups/send-email-bulk ───────────────────────
exports.sendEmailBulk = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const { ids } = req.body;
        if (!ids || !ids.length) {
            return res.status(400).json({ success: false, error: 'No IDs provided' });
        }

        res.json({ success: true, message: 'Follow-up emails started!' });

        setImmediate(async () => {
            try {
                const leads = await Lead.find({ _id: { $in: ids }, companyId }).lean();
                let sent = 0, failed = 0;
                emit(companyId, { type: 'start', total: leads.length });

                for (let i = 0; i < leads.length; i++) {
                    const lead = leads[i];
                    emit(companyId, { type: 'sending', current: i + 1, total: leads.length, name: lead.name, sent, failed });
                    
                    if (!lead.email) {
                        failed++;
                        emit(companyId, { type: 'failed', name: lead.name, reason: 'No email', sent, failed });
                        continue;
                    }

                    try {
                        const followupNum = (lead.followup_count || 0) + 1;
                        const { subject, html } = buildFollowupEmail(lead, followupNum);
                        
                        await sendEmail(lead.email, subject, html, companyId);
                        
                        await Lead.findOneAndUpdate(
                            { _id: lead._id, companyId },
                            {
                                $inc: { email_count: 1, followup_count: 1 },
                                $set: { email_sent: true, email_last_date: todayStr() },
                                $push: { activity: { type: 'email_sent', message: `Follow-up #${followupNum} email sent`, date: new Date() } }
                            }
                        );
                        sent++;
                        emit(companyId, { type: 'sent', name: lead.name, sent, failed, total: leads.length });
                    } catch (e) {
                        failed++;
                        emit(companyId, { type: 'failed', name: lead.name, reason: e.message, sent, failed });
                    }
                }
                emit(companyId, { type: 'done', sent, failed, total: leads.length });
            } catch (e) {
                emit(companyId, { type: 'error', message: 'Failed: ' + e.message });
            }
        });
    } catch (err) {
        next(err);
    }
};
