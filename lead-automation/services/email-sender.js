const nodemailer = require('nodemailer');
const Settings   = require('../models/Settings');

async function getSmtpConfig() {
    const settings = await Settings.find({ key: { $in: ['smtp_host','smtp_port','smtp_secure','smtp_user','smtp_pass','smtp_from'] } });
    const cfg = {};
    settings.forEach(s => { cfg[s.key.replace('smtp_','')] = s.value; });
    return cfg;
}

function createTransport(cfg) {
    return nodemailer.createTransport({
        host:   cfg.host || 'smtp.gmail.com',
        port:   parseInt(cfg.port) || 587,
        secure: cfg.secure === true || cfg.secure === 'true',
        auth:   { user: cfg.user, pass: cfg.pass }
    });
}

async function sendEmail(to, subject, html) {
    const cfg = await getSmtpConfig();
    if (!cfg.user || !cfg.pass) throw new Error('SMTP not configured. Go to Settings tab.');
    const transporter = createTransport(cfg);
    const info = await transporter.sendMail({
        from:    `"${cfg.from || 'Lead Automation'}" <${cfg.user}>`,
        to, subject, html
    });
    return info;
}

async function testSmtp() {
    const cfg = await getSmtpConfig();
    if (!cfg.user || !cfg.pass) return { success: false, error: 'SMTP not configured' };
    try {
        const t = createTransport(cfg);
        await t.verify();
        return { success: true, message: '✅ SMTP connection verified!' };
    } catch(e) {
        return { success: false, error: e.message };
    }
}

module.exports = { sendEmail, testSmtp, getSmtpConfig };
