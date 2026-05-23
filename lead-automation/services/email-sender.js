const nodemailer = require('nodemailer');
const Settings   = require('../models/Settings');
const logger     = require('./logger');

async function getSmtpConfig() {
    const settings = await Settings.find({ key: { $in: ['smtp_host','smtp_port','smtp_secure','smtp_user','smtp_pass','smtp_from'] } });
    const cfg = {};
    settings.forEach(s => { cfg[s.key.replace('smtp_','')] = s.value; });
    return cfg;
}

function createTransport(cfg) {
    const port   = parseInt(cfg.port) || 587;
    // port 465 = implicit SSL (secure:true)
    // port 587 / 25 = STARTTLS (secure:false, requireTLS:true)
    const secure = (cfg.secure === true || cfg.secure === 'true') && port === 465;
    const transportOpts = {
        host:   cfg.host   || 'smtp.gmail.com',
        port,
        secure,
        auth:   { user: cfg.user, pass: cfg.pass },
        tls:    { rejectUnauthorized: false }   // allow self-signed certs
    };
    // For port 587: force upgrade via STARTTLS
    if (!secure && port !== 25) transportOpts.requireTLS = true;
    return nodemailer.createTransport(transportOpts);
}

async function sendEmail(to, subject, html) {
    const cfg = await getSmtpConfig();
    logger.log(`Attempting to send email to: ${to} (Subject: "${subject}")`, 'EMAIL');
    if (!cfg.user || !cfg.pass) {
        const err = new Error('SMTP not configured. Go to Settings tab.');
        logger.error(`Failed to send email to ${to}`, err);
        throw err;
    }
    try {
        const transporter = createTransport(cfg);
        const info = await transporter.sendMail({
            from:    `"${cfg.from || 'Lead Automation'}" <${cfg.user}>`,
            to, subject, html
        });
        logger.log(`Email successfully sent to ${to}. MessageId: ${info.messageId}`, 'EMAIL');
        return info;
    } catch (e) {
        logger.error(`Failed to send email to ${to}`, e);
        throw e;
    }
}

async function testSmtp() {
    const cfg = await getSmtpConfig();
    logger.log(`Testing SMTP connection for user: ${cfg.user || 'none'}`, 'SMTP_TEST');
    if (!cfg.user || !cfg.pass) {
        logger.log(`SMTP test failed: host or credentials missing`, 'SMTP_TEST');
        return { success: false, error: 'SMTP not configured — add Email and App Password in Settings first.' };
    }
    try {
        const t = createTransport(cfg);
        await t.verify();
        logger.log(`SMTP connection verified successfully for ${cfg.user}`, 'SMTP_TEST');
        return { success: true, message: '✅ SMTP connection verified!' };
    } catch(e) {
        logger.error(`SMTP verification failed for ${cfg.user}`, e);
        // Give a friendlier hint for common Gmail errors
        let msg = e.message;
        if (msg.includes('535') || msg.includes('Username and Password')) {
            msg = 'Gmail rejected the password. Make sure you are using an App Password (not your Gmail login password). Enable 2FA at myaccount.google.com, then create an App Password.';
        } else if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
            msg = 'Cannot connect to SMTP server. Check Host/Port settings.';
        } else if (msg.includes('SSL') || msg.includes('wrong version')) {
            msg = 'SSL/TLS mismatch. For port 587 use "No (TLS/STARTTLS)"; for port 465 use "Yes (SSL)".';
        }
        return { success: false, error: msg };
    }
}

module.exports = { sendEmail, testSmtp, getSmtpConfig, createTransportDirect: createTransport };

