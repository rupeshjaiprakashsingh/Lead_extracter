// ============================================================
//  services/templates-cache.js
//  Per-user/company template retrieval from MongoDB
//  Supports both multi-tenant (companyId) and legacy (userId) modes
// ============================================================

// Use the appropriate Settings model based on which is available
let Settings;
try {
    // Try the multi-tenant backend model first (has companyId)
    Settings = require('../backend/models/Settings');
} catch (e) {
    // Fall back to legacy root model (has userId)
    Settings = require('../models/Settings');
}

async function getTemplates(idValue) {
    const templates = {
        wa_template:   '',
        email_subject: '',
        email_body:    '',
    };

    try {
        let rows = [];
        if (idValue) {
            const hasCompanyId = Settings.schema && Settings.schema.paths && Settings.schema.paths.hasOwnProperty('companyId');
            if (hasCompanyId) {
                // Query by companyId (multi-tenant backend)
                rows = await Settings.find({
                    companyId: idValue,
                    key: { $in: ['wa_template', 'email_subject', 'email_body'] }
                }).catch(() => []);
            } else {
                // Query by userId (legacy single-tenant path)
                rows = await Settings.find({
                    userId: idValue,
                    key: { $in: ['wa_template', 'email_subject', 'email_body'] }
                }).catch(() => []);
            }
        }

        // If still nothing found (or idValue is empty), fetch the first available settings (global/any fallback)
        if (!rows || rows.length === 0) {
            rows = await Settings.find({
                key: { $in: ['wa_template', 'email_subject', 'email_body'] }
            }).catch(() => []);
        }

        if (rows && rows.length > 0) {
            rows.forEach(r => {
                if (r.key === 'wa_template')   templates.wa_template   = String(r.value || '');
                if (r.key === 'email_subject') templates.email_subject = String(r.value || '');
                if (r.key === 'email_body')    templates.email_body    = String(r.value || '');
            });
        }
    } catch (e) {
        console.error('Error fetching templates from DB:', e.message);
    }
    return templates;
}

// Kept for backward compatibility but no-op since Settings.findOneAndUpdate handles it
function setTemplates(obj) {}

module.exports = { setTemplates, getTemplates };
