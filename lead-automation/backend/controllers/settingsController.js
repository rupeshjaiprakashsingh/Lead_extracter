// controllers/settingsController.js — Settings controller (multi-tenant)
const fs       = require('fs');
const Settings = require('../models/Settings');
const Company  = require('../models/Company');
const logger   = require('../services/logger');
const { setTemplates } = require('../../services/templates-cache');

// ── GET /api/settings ─────────────────────────────────────────────
async function getSettings(req, res) {
    try {
        const companyId = req.user.companyId;
        const rows = await Settings.find({ companyId });
        const cfg  = {};
        rows.forEach((r) => { cfg[r.key] = r.value; });

        // Mask password
        if (cfg.smtp_pass) cfg.smtp_pass = '••••••••';

        // Load ultramsg config from company Settings (stored as key/value)
        const ultramsgCfg = {
            instanceId: cfg.ultramsg_instance_id || '',
            token:      cfg.ultramsg_token ? '••••••••' : '',
        };
        delete cfg.ultramsg_instance_id;
        delete cfg.ultramsg_token;

        return res.json({ success: true, data: { ...cfg, ultramsg: ultramsgCfg } });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── POST /api/settings ────────────────────────────────────────────
async function saveSettings(req, res) {
    try {
        const companyId = req.user.companyId;
        const { ultramsg: um, ...fields } = req.body;

        logger.log(`Saving settings for company ${companyId}: ${Object.keys(fields).join(', ')}`, 'SETTINGS');

        for (const [key, value] of Object.entries(fields)) {
            if (value === undefined) continue;

            // Guard against masked password placeholder
            if (key === 'smtp_pass') {
                if (!value || typeof value !== 'string') continue;
                if (value.includes('•') || value.includes('●') || value.includes('*')) {
                    logger.log(`Skipping smtp_pass — looks like masked placeholder`, 'SETTINGS');
                    continue;
                }
                if (!value.trim()) {
                    logger.log(`Skipping smtp_pass — empty`, 'SETTINGS');
                    continue;
                }
            }

            await Settings.findOneAndUpdate(
                { companyId, key },
                { companyId, key, value, userId: req.user._id },
                { upsert: true }
            );
        }

        // Save UltraMsg config
        if (um) {
            if (um.instanceId) {
                await Settings.findOneAndUpdate(
                    { companyId, key: 'ultramsg_instance_id' },
                    { companyId, key: 'ultramsg_instance_id', value: um.instanceId },
                    { upsert: true }
                );
            }
            if (um.token && !um.token.includes('•')) {
                await Settings.findOneAndUpdate(
                    { companyId, key: 'ultramsg_token' },
                    { companyId, key: 'ultramsg_token', value: um.token },
                    { upsert: true }
                );
            }
        }

        // Refresh templates cache for this company
        await loadTemplatesCacheForCompany(companyId);

        return res.json({ success: true, message: 'Settings saved' });
    } catch (err) {
        logger.error('Error saving settings', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function loadTemplatesCacheForCompany(companyId) {
    try {
        const rows = await Settings.find({ companyId, key: { $in: ['wa_template', 'email_subject', 'email_body'] } });
        const obj  = {};
        rows.forEach((r) => { obj[r.key] = r.value; });
        setTemplates(obj);
    } catch (e) {
        console.warn('Templates cache reload error:', e.message);
    }
}

// ── POST /api/settings/test-smtp ──────────────────────────────────
async function testSMTP(req, res) {
    try {
        const { host, port, secure, user, pass } = req.body || {};
        const { createTransportDirect } = require('../services/email-sender');

        // Inline test (credentials provided directly)
        if (host && user && pass) {
            try {
                logger.log(`Testing inline SMTP for user: ${user}`, 'SMTP_TEST');
                const t = createTransportDirect({ host, port, secure, user, pass });
                await t.verify();
                logger.log(`Inline SMTP OK for: ${user}`, 'SMTP_TEST');
                return res.json({ success: true, message: '✅ SMTP Connected!' });
            } catch (e) {
                let msg = e.message;
                if (msg.includes('535') || msg.includes('Invalid login')) {
                    msg = 'Wrong App Password. Create a new 16-character App Password at myaccount.google.com/apppasswords.';
                } else if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
                    msg = 'Cannot connect to SMTP server — check Host and Port.';
                } else if (msg.includes('SSL') || msg.includes('WRONG_VERSION')) {
                    msg = 'SSL/TLS mismatch. For port 587 use STARTTLS; for port 465 use SSL.';
                }
                return res.json({ success: false, error: msg });
            }
        }

        // Test from DB settings
        const companyId = req.user.companyId;
        const { testSmtp } = require('../services/email-sender');
        const result = await testSmtp(companyId);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── POST /api/settings/test-ultramsg ─────────────────────────────
async function testUltraMsg(req, res) {
    try {
        const companyId = req.user.companyId;
        const instanceSetting = await Settings.findOne({ companyId, key: 'ultramsg_instance_id' });
        const tokenSetting    = await Settings.findOne({ companyId, key: 'ultramsg_token' });

        const instanceId = instanceSetting && instanceSetting.value;
        const token      = tokenSetting    && tokenSetting.value;

        if (!instanceId || !token) {
            return res.json({ success: false, error: 'UltraMsg not configured' });
        }

        // Test connection
        const url = `https://api.ultramsg.com/${instanceId}/instance/status`;
        const fetch = require('node-fetch');
        const r = await fetch(`${url}?token=${token}`);
        const data = await r.json();

        if (data && data.instanceData) {
            return res.json({ success: true, message: '✅ UltraMsg connected!', status: data.instanceData });
        }
        return res.json({ success: false, error: 'UltraMsg connection failed', raw: data });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

// ── GET /api/settings/logs ────────────────────────────────────────
async function getLogs(req, res) {
    try {
        const logPath = logger.logFilePath;
        if (!fs.existsSync(logPath)) {
            return res.send('No logs recorded yet.');
        }
        const logs = fs.readFileSync(logPath, 'utf8');
        return res.send(logs);
    } catch (err) {
        return res.status(500).send('Failed to read logs: ' + err.message);
    }
}

// ── DELETE /api/settings/logs ─────────────────────────────────────
async function clearLogs(req, res) {
    try {
        const logPath = logger.logFilePath;
        if (fs.existsSync(logPath)) {
            fs.writeFileSync(logPath, '', 'utf8');
        }
        logger.log('Logs cleared by user request.', 'SYSTEM');
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to clear logs: ' + err.message });
    }
}

module.exports = {
    getSettings,
    saveSettings,
    testSMTP,
    testUltraMsg,
    getLogs,
    clearLogs,
};
