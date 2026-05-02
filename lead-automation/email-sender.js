// ============================================================
//  email-sender.js — Auto Email Sender via Nodemailer (Gmail)
// ============================================================
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { loadLeads, saveLeads } = require('./scraper');
const { buildEmailSubject, buildEmailBody } = require('./message-builder');

const CONFIG_FILE = path.join(__dirname, 'email-config.json');

function loadEmailConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        const defaultConfig = {
            gmail_user: "YOUR_GMAIL@gmail.com",
            gmail_app_password: "YOUR_APP_PASSWORD",
            your_name: "Your Name",
            your_phone: "9876543210"
        };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
        console.log('⚠️  Please fill in email-config.json with your Gmail credentials.');
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function extractEmailFromWebsite(website) {
    // Basic heuristic — look for common contact emails
    const domain = website.replace(/^https?:\/\//, '').split('/')[0];
    return `info@${domain}`;
}

async function sendEmails(leadIds = null) {
    const config = loadEmailConfig();

    if (config.gmail_user === 'YOUR_GMAIL@gmail.com') {
        console.error('❌ Please update email-config.json with your Gmail credentials first!');
        console.log('   Guide: https://support.google.com/accounts/answer/185833 (App Password)');
        return;
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: config.gmail_user,
            pass: config.gmail_app_password
        }
    });

    const leads = loadLeads();

    // Only email businesses that HAVE a real website (we can guess email from domain)
    const FAKE_SITES = ['whatsapp.com', 'wa.me', 'youtube.com', 'facebook.com', ''];
    let toEmail = leads.filter(b =>
        b.website &&
        !FAKE_SITES.some(f => b.website.includes(f)) &&
        !b.email_sent &&
        (!leadIds || leadIds.includes(b.id))
    );

    if (toEmail.length === 0) {
        console.log('⚠️  No leads with valid websites to email.');
        return { sent: 0, failed: 0 };
    }

    console.log(`\n📧 Will send emails to ${toEmail.length} businesses...\n`);
    let sent = 0, failed = 0;

    for (let i = 0; i < toEmail.length; i++) {
        const biz = toEmail[i];
        const toEmail_addr = extractEmailFromWebsite(biz.website);
        const subject = buildEmailSubject(biz);
        const htmlBody = buildEmailBody(biz);

        try {
            console.log(`[${i+1}/${toEmail.length}] Emailing ${biz.name} at ${toEmail_addr}...`);
            await transporter.sendMail({
                from: `"${config.your_name}" <${config.gmail_user}>`,
                to: toEmail_addr,
                subject: subject,
                html: htmlBody
            });

            const idx = leads.findIndex(b => b.id === biz.id);
            if (idx !== -1) {
                leads[idx].email_sent = true;
                leads[idx].email_sent_at = new Date().toISOString();
                leads[idx].email_sent_to = toEmail_addr;
            }
            saveLeads(leads);
            sent++;
            console.log(`   ✅ Email sent!`);
            await new Promise(r => setTimeout(r, 3000)); // 3s between emails
        } catch (e) {
            console.log(`   ❌ Failed: ${e.message}`);
            failed++;
        }
    }

    console.log(`\n🎉 Done! Sent: ${sent} | Failed: ${failed}`);
    return { sent, failed };
}

if (require.main === module) {
    sendEmails().catch(console.error);
}

module.exports = { sendEmails };
