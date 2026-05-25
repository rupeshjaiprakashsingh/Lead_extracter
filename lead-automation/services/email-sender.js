// ============================================================
//  services/email-sender.js — Multi-Account SMTP Load Balancer
//  Distributes email sending across multiple Gmail accounts to
//  prevent rate-limiting and Gmail blocking.
// ============================================================
const nodemailer  = require('nodemailer');
const Settings    = require('../models/Settings');
const SmtpAccount = require('../models/SmtpAccount');
const logger      = require('./logger');

// ── Helpers ──────────────────────────────────────────────────

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

/** Random delay between min and max ms — avoids detectable patterns */
function randomDelay(minMs = 3000, maxMs = 8000) {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(r => setTimeout(r, ms));
}

/** Mask email for safe logging: info***@gmail.com */
function maskEmail(email) {
    if (!email || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    return local.slice(0, 4) + '***@' + domain;
}

// ── Transport factory ────────────────────────────────────────

function createTransport(cfg) {
    const port   = parseInt(cfg.port || cfg.smtp_port) || 587;
    const secure = (cfg.secure === true || cfg.secure === 'true' ||
                    cfg.smtp_secure === true) && port === 465;
    const transportOpts = {
        host:   cfg.host   || cfg.smtp_host || 'smtp.gmail.com',
        port,
        secure,
        auth:   {
            user: cfg.user || cfg.smtp_user,
            pass: cfg.pass || cfg.smtp_pass
        },
        tls: { rejectUnauthorized: false }
    };
    if (!secure && port !== 25) transportOpts.requireTLS = true;
    return nodemailer.createTransport(transportOpts);
}

// ── Legacy single-account fallback ──────────────────────────

async function getLegacySmtpConfig(userId) {
    if (!userId) return null;
    const settings = await Settings.find({
        userId,
        key: { $in: ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from'] }
    });
    const cfg = {};
    settings.forEach(s => { cfg[s.key.replace('smtp_', '')] = s.value; });
    if (!cfg.user || !cfg.pass) return null;
    return cfg;
}

// ── Load Balancer: pick the best account ────────────────────
//
//  Strategy: Round-robin weighted by available capacity.
//  - Reset daily counter if it's a new day.
//  - Skip accounts at daily limit.
//  - Pick the account with the LOWEST daily_sent (most capacity left).
//  - If tied, pick the one least recently used.

async function pickSmtpAccount(userId) {
    const today = todayStr();
    const accounts = await SmtpAccount.find({ userId, isActive: true });

    if (!accounts.length) {
        // Fall back to legacy single-account settings
        const legacy = await getLegacySmtpConfig(userId);
        if (legacy) {
            logger.log(`📧 Load Balancer: no multi-accounts found — using legacy SMTP config`, 'EMAIL_LB');
            return { isLegacy: true, cfg: legacy };
        }
        return null;
    }

    // Reset daily counters for accounts where the date has changed
    const resetPromises = accounts
        .filter(a => a.daily_date !== today)
        .map(a => SmtpAccount.findByIdAndUpdate(a._id, {
            $set: { daily_sent: 0, daily_date: today }
        }));
    await Promise.all(resetPromises);

    // Reload after reset
    const fresh = await SmtpAccount.find({ userId, isActive: true });

    // Filter: only accounts under their daily limit
    const available = fresh.filter(a => {
        const sentToday = a.daily_date === today ? a.daily_sent : 0;
        return sentToday < a.daily_limit;
    });

    if (!available.length) {
        // All accounts at daily limit — check legacy fallback
        const legacy = await getLegacySmtpConfig(userId);
        if (legacy) {
            logger.log(`📧 Load Balancer: all accounts at daily limit — falling back to legacy SMTP`, 'EMAIL_LB');
            return { isLegacy: true, cfg: legacy };
        }
        throw new Error(
            `All ${fresh.length} email account(s) have reached their daily sending limit. ` +
            `They will automatically reset tomorrow. ` +
            `Add more accounts in Settings → Email Accounts to increase capacity.`
        );
    }

    // Pick account with LOWEST sent count (most capacity remaining)
    available.sort((a, b) => {
        const sentA = a.daily_date === today ? a.daily_sent : 0;
        const sentB = b.daily_date === today ? b.daily_sent : 0;
        if (sentA !== sentB) return sentA - sentB;
        // Tie-break: least recently used
        const usedA = a.last_used_at ? a.last_used_at.getTime() : 0;
        const usedB = b.last_used_at ? b.last_used_at.getTime() : 0;
        return usedA - usedB;
    });

    const chosen = available[0];
    const sentToday = chosen.daily_date === today ? chosen.daily_sent : 0;
    logger.log(
        `📧 Load Balancer: selected account ${maskEmail(chosen.smtp_user)} ` +
        `(${sentToday}/${chosen.daily_limit} sent today, ${available.length} accounts available)`,
        'EMAIL_LB'
    );
    return { isLegacy: false, account: chosen };
}

/** Increment sent counter after a successful send */
async function recordSent(accountId) {
    const today = todayStr();
    await SmtpAccount.findByIdAndUpdate(accountId, {
        $inc: { daily_sent: 1, total_sent: 1 },
        $set: { daily_date: today, last_used_at: new Date() }
    });
}

// ── Main sendEmail (load-balancer aware) ─────────────────────

async function sendEmail(to, subject, html, userId) {
    logger.log(`Attempting to send email to: ${to} (Subject: "${subject}") for user: ${userId}`, 'EMAIL');

    const selection = await pickSmtpAccount(userId);

    if (!selection) {
        const err = new Error('SMTP not configured. Go to Settings → Email Accounts and add a Gmail account.');
        logger.error(`Failed to send email to ${to}`, err);
        throw err;
    }

    let cfg, accountId;
    if (selection.isLegacy) {
        cfg = selection.cfg;
        accountId = null;
    } else {
        const acct = selection.account;
        accountId = acct._id;
        cfg = {
            host:   acct.smtp_host,
            port:   acct.smtp_port,
            secure: acct.smtp_secure,
            user:   acct.smtp_user,
            pass:   acct.smtp_pass,
            from:   acct.smtp_from,
        };
    }

    try {
        const transporter = createTransport(cfg);
        const fromName = cfg.from || cfg.smtp_from || 'Lead Automation';
        const fromUser = cfg.user || cfg.smtp_user;
        const info = await transporter.sendMail({
            from:    `"${fromName}" <${fromUser}>`,
            to, subject, html
        });
        logger.log(
            `✅ Email sent to ${to} via ${maskEmail(fromUser)}. MessageId: ${info.messageId}`,
            'EMAIL'
        );
        if (accountId) await recordSent(accountId);

        // Gmail-safe delay between sends (3–8 seconds random)
        await randomDelay(3000, 8000);

        return info;
    } catch (e) {
        logger.error(`Failed to send email to ${to} via ${maskEmail(cfg.user || cfg.smtp_user)}`, e);
        throw e;
    }
}

// ── Test single SMTP account by ID ───────────────────────────

async function testSmtpAccountById(accountId, userId) {
    const acct = await SmtpAccount.findOne({ _id: accountId, userId });
    if (!acct) return { success: false, error: 'Account not found.' };

    logger.log(`Testing SMTP account: ${maskEmail(acct.smtp_user)}`, 'SMTP_TEST');
    try {
        const t = createTransport({
            host: acct.smtp_host, port: acct.smtp_port, secure: acct.smtp_secure,
            user: acct.smtp_user, pass: acct.smtp_pass
        });
        await t.verify();
        logger.log(`✅ SMTP verified for ${maskEmail(acct.smtp_user)}`, 'SMTP_TEST');
        return { success: true, message: `✅ Connected! ${maskEmail(acct.smtp_user)} is ready to send.` };
    } catch (e) {
        logger.error(`SMTP test failed for ${maskEmail(acct.smtp_user)}`, e);
        let msg = e.message;
        if (msg.includes('535') || msg.includes('Username and Password') || msg.includes('Invalid login')) {
            msg = 'Wrong App Password. Go to myaccount.google.com/apppasswords to create a 16-char App Password.';
        } else if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
            msg = 'Cannot connect — check Host and Port.';
        } else if (msg.includes('SSL') || msg.includes('wrong version')) {
            msg = 'SSL mismatch. Port 587 → use STARTTLS (secure=false). Port 465 → use SSL (secure=true).';
        }
        return { success: false, error: msg };
    }
}

// ── Legacy testSmtp (backward compat) ────────────────────────

async function testSmtp(userId) {
    const cfg = await getLegacySmtpConfig(userId);
    logger.log(`Testing legacy SMTP for user: ${cfg?.user || 'none'}`, 'SMTP_TEST');
    if (!cfg) {
        return { success: false, error: 'SMTP not configured — add a Gmail account in Settings → Email Accounts.' };
    }
    try {
        const t = createTransport(cfg);
        await t.verify();
        logger.log(`✅ Legacy SMTP verified for ${maskEmail(cfg.user)}`, 'SMTP_TEST');
        return { success: true, message: '✅ SMTP connection verified!' };
    } catch (e) {
        logger.error(`Legacy SMTP test failed`, e);
        let msg = e.message;
        if (msg.includes('535') || msg.includes('Username and Password')) {
            msg = 'Gmail rejected the password. Use a 16-char App Password (not your Gmail login password).';
        } else if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
            msg = 'Cannot connect to SMTP server. Check Host/Port settings.';
        } else if (msg.includes('SSL') || msg.includes('wrong version')) {
            msg = 'SSL/TLS mismatch. Port 587 → No (STARTTLS); Port 465 → Yes (SSL).';
        }
        return { success: false, error: msg };
    }
}

// ── One-time migration: old Settings → first SmtpAccount ─────

async function migrateOldSettingsIfNeeded(userId) {
    if (!userId) return;
    const existing = await SmtpAccount.countDocuments({ userId });
    if (existing > 0) return; // already migrated or has accounts

    const legacy = await getLegacySmtpConfig(userId);
    if (!legacy || !legacy.user || !legacy.pass) return;

    logger.log(`Migrating legacy SMTP config for user ${userId} → SmtpAccount`, 'SMTP_MIGRATE');
    await SmtpAccount.create({
        userId,
        label:       'Main Account (migrated)',
        smtp_host:   legacy.host   || 'smtp.gmail.com',
        smtp_port:   parseInt(legacy.port) || 587,
        smtp_secure: legacy.secure === true || legacy.secure === 'true',
        smtp_user:   legacy.user,
        smtp_pass:   legacy.pass,
        smtp_from:   legacy.from   || 'Digital Growth Team',
        isActive:    true,
        daily_limit: 450,
    });
    logger.log(`✅ Legacy SMTP migrated to SmtpAccount for user ${userId}`, 'SMTP_MIGRATE');
}

module.exports = {
    sendEmail,
    testSmtp,
    testSmtpAccountById,
    migrateOldSettingsIfNeeded,
    getSmtpConfig: getLegacySmtpConfig,           // kept for compat
    createTransportDirect: createTransport,        // kept for compat
};
