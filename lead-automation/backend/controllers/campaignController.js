const Lead = require('../models/Lead');
const mongoose = require('mongoose');

// ── GET /api/campaigns ────────────────────────────────────────
exports.getAllCampaigns = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const compObjectId = new mongoose.Types.ObjectId(companyId.toString());

        const campaigns = await Lead.aggregate([
            { $match: { companyId: compObjectId } },
            { $group: {
                _id: '$keyword',
                totalLeads: { $sum: 1 },
                waSentCount: { $sum: { $cond: [{ $eq: ['$wa_sent', true] }, 1, 0] } },
                emailSentCount: { $sum: { $cond: [{ $eq: ['$email_sent', true] }, 1, 0] } },
                category: { $first: '$category' },
                city: { $first: '$city' },
                createdAt: { $min: '$createdAt' }
            }},
            { $sort: { createdAt: -1 } }
        ]);

        const result = campaigns.map(c => ({
            name: c._id || 'Manual Import',
            category: c.category || 'General Business',
            city: c.city || 'Unknown',
            leadsCount: c.totalLeads,
            waSentCount: c.waSentCount,
            emailSentCount: c.emailSentCount
        }));

        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/campaigns/stats ──────────────────────────────────
exports.getStats = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const compObjectId = new mongoose.Types.ObjectId(companyId.toString());

        const totalCampaigns = await Lead.distinct('keyword', { companyId });
        const leadsCount = await Lead.countDocuments({ companyId });
        const waSentCount = await Lead.countDocuments({ companyId, wa_sent: true });
        
        res.json({
            success: true,
            data: {
                totalCampaigns: totalCampaigns.filter(Boolean).length,
                leadsCount,
                waSentCount
            }
        });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/campaigns/keyword/:keyword ───────────────────────
exports.getByKeyword = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const keyword = req.params.keyword === 'null' ? null : req.params.keyword;

        const leads = await Lead.find({ companyId, keyword }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, data: leads });
    } catch (err) {
        next(err);
    }
};
