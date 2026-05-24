// ============================================================
//  services/templates-cache.js
//  Per-user template retrieval from MongoDB
// ============================================================
const Settings = require('../models/Settings');

async function getTemplates(userId) {
    const templates = {
        wa_template:          '',
        email_subject:        '',
        email_body:           '',
    };
    if (!userId) return templates;
    try {
        const rows = await Settings.find({
            userId,
            key: { $in: ['wa_template', 'email_subject', 'email_body'] }
        });
        rows.forEach(r => {
            if (r.key === 'wa_template') templates.wa_template = String(r.value || '');
            if (r.key === 'email_subject') templates.email_subject = String(r.value || '');
            if (r.key === 'email_body') templates.email_body = String(r.value || '');
        });
    } catch (e) {
        console.error('Error fetching templates from DB:', e.message);
    }
    return templates;
}

// Kept for backward compatibility but no-op since Settings.findOneAndUpdate handles it in index.js
function setTemplates(obj) {}

module.exports = { setTemplates, getTemplates };
