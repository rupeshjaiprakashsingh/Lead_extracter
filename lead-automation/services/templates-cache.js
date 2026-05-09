// ============================================================
//  services/templates-cache.js
//  Shared in-memory store for user-defined message templates
// ============================================================

let _cache = {
    wa_template:          '',   // User's WA body template
    email_subject:        '',   // User's email subject template
    email_body:           '',   // User's email body template
};

function setTemplates(obj) {
    if (obj.wa_template    !== undefined) _cache.wa_template    = String(obj.wa_template    || '');
    if (obj.email_subject  !== undefined) _cache.email_subject  = String(obj.email_subject  || '');
    if (obj.email_body     !== undefined) _cache.email_body     = String(obj.email_body     || '');
}

function getTemplates() {
    return { ..._cache };
}

module.exports = { setTemplates, getTemplates };
