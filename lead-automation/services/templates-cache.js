// ============================================================
//  services/templates-cache.js
//  Per-user/company template retrieval from MongoDB
//  Supports both multi-tenant (companyId) and legacy (userId) modes
// ============================================================

// Use the appropriate Settings model dynamically from the active mongoose connection
async function getTemplates(idValue) {
    const templates = {
        wa_template:   '',
        email_subject: '',
        email_body:    '',
    };

    try {
        const activeMongoose = global.activeMongoose || require('mongoose');
        const Settings = activeMongoose.models.Settings;
        if (!Settings) {
            console.warn('  ⚠️  Settings model not registered on mongoose instance yet');
            return templates;
        }

        let rows = [];
        if (idValue) {
            const paths = Settings.schema ? Settings.schema.paths : {};
            const query = { key: { $in: ['wa_template', 'email_subject', 'email_body'] } };

            if (paths.hasOwnProperty('companyId') && paths.hasOwnProperty('userId')) {
                let castedId = idValue;
                if (activeMongoose.Types.ObjectId.isValid(idValue)) {
                    castedId = new activeMongoose.Types.ObjectId(idValue.toString());
                }
                query.$or = [ { companyId: castedId }, { userId: castedId } ];
            } else if (paths.hasOwnProperty('companyId')) {
                let castedId = idValue;
                if (activeMongoose.Types.ObjectId.isValid(idValue)) {
                    castedId = new activeMongoose.Types.ObjectId(idValue.toString());
                }
                query.companyId = castedId;
            } else if (paths.hasOwnProperty('userId')) {
                let castedId = idValue;
                if (activeMongoose.Types.ObjectId.isValid(idValue)) {
                    castedId = new activeMongoose.Types.ObjectId(idValue.toString());
                }
                query.userId = castedId;
            }

            rows = await Settings.find(query).catch(() => []);
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
