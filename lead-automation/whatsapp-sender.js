// ============================================================
//  whatsapp-sender.js — Auto Sender with proper QR login wait
// ============================================================
const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');
const { loadLeads, saveLeads } = require('./scraper');
const { buildWhatsAppMessage }  = require('./message-builder');

const SESSION_DIR = path.join(__dirname, '.wa_session_data');
const DELAY_MS    = 8000;
const MAX_PER_RUN = 500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// SSE broadcast
let sseClients = [];
function registerSSE(res) { sseClients.push(res); }
function removeSSE(res)   { sseClients = sseClients.filter(c => c !== res); }
function emit(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(c => { try { c.write(msg); } catch(e) {} });
}

// ── Check if already logged in ─────────────────────────────
async function isWALoggedIn(page) {
    return await page.locator(
        '[aria-label="Search input textbox"], [title="Search input textbox"], [data-testid="default-user"]'
    ).isVisible({ timeout: 6000 }).catch(() => false);
}

// ── One-time login setup (scan QR, saves session) ──────────
async function setupWhatsAppLogin() {
    emit({ type: 'status', message: '🔑 Opening WhatsApp Web for login...' });
    console.log('\n🔑 Opening WhatsApp Web for QR scan...\n');

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    const browser = await chromium.launchPersistentContext(SESSION_DIR, {
        headless: false,
        args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
        viewport: null
    });

    const page = await browser.newPage();
    try {
        await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch(e) {}

    await sleep(3000);

    // Already logged in?
    if (await isWALoggedIn(page)) {
        emit({ type: 'login_done', message: '✅ Already logged in! Session is active.' });
        console.log('✅ Already logged in!');
        await sleep(2000);
        await browser.close();
        return true;
    }

    // Show QR — wait up to 5 minutes for user to scan
    emit({ type: 'qr', message: '📱 QR Code shown in browser. Scan it with WhatsApp on your phone. Waiting up to 5 minutes...' });
    console.log('📱 QR Code is shown. Please scan it with your phone WhatsApp.\n');
    console.log('   Waiting up to 5 minutes...\n');

    try {
        // Wait until the main chat UI appears (means login done)
        await page.waitForSelector(
            '[aria-label="Search input textbox"], [title="Search input textbox"], [data-testid="default-user"]',
            { timeout: 300000 } // 5 minutes
        );
        emit({ type: 'login_done', message: '✅ Logged in! Session saved. You can now auto-send!' });
        console.log('\n✅ QR Scanned! Logged in successfully. Session saved.\n');
        await sleep(3000);
        await browser.close();
        return true;
    } catch(e) {
        emit({ type: 'error', message: '❌ Login timeout (5 min). Please try again.' });
        console.log('❌ Login timeout.');
        await browser.close();
        return false;
    }
}

// ── Auto-send to all leads ──────────────────────────────────
async function sendWhatsAppMessages(leadIds = null) {
    const leads = loadLeads();

    let toSend = leads.filter(b =>
        b.phone && !b.wa_sent &&
        (!leadIds || leadIds.map(String).includes(String(b.id)))
    ).slice(0, MAX_PER_RUN);

    if (!toSend.length) {
        emit({ type: 'done', sent: 0, failed: 0, total: 0 });
        return { sent: 0, failed: 0, message: 'No pending leads.' };
    }

    const total = toSend.length;
    emit({ type: 'start', total });
    console.log(`\n📱 Auto-sending to ${total} leads...\n`);

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    const browser = await chromium.launchPersistentContext(SESSION_DIR, {
        headless: false,
        args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
        viewport: null,
        slowMo: 50
    });

    const page = await browser.newPage();
    emit({ type: 'status', message: 'Opening WhatsApp Web...' });

    try {
        await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch(e) {}
    await sleep(4000);

    await sleep(4000);

    // Check login status
    if (!await isWALoggedIn(page)) {
        // Check if QR is visible
        const hasQR = await page.locator('canvas').isVisible({ timeout: 3000 }).catch(() => false);
        if (hasQR) {
            emit({ type: 'qr', message: '❗ Not logged in. Click "Setup WhatsApp Login" button first to scan QR code, then try Auto-Send again.' });
            console.log('\n❗ Not logged in! Use the "Setup WhatsApp Login" button first.\n');
            await sleep(5000);
            await browser.close();
            emit({ type: 'done', sent: 0, failed: 0, total });
            return { sent: 0, failed: 0 };
        }
        // Try waiting a bit more
        emit({ type: 'status', message: 'Waiting for WhatsApp Web to load...' });
        await sleep(5000);
        if (!await isWALoggedIn(page)) {
            emit({ type: 'error', message: '❌ Not logged in. Click "Setup WhatsApp Login" first!' });
            await browser.close();
            emit({ type: 'done', sent: 0, failed: 0, total });
            return { sent: 0, failed: 0 };
        }
    }

    emit({ type: 'status', message: '✅ WhatsApp ready! Starting auto-send...' });
    console.log('✅ WhatsApp ready!\n');

    let sent = 0, failed = 0;

    for (let i = 0; i < toSend.length; i++) {
        const biz   = toSend[i];
        const msg   = buildWhatsAppMessage(biz);
        const phone = biz.phone;

        emit({ type: 'sending', current: i + 1, total, name: biz.name, phone: biz.raw_phone || phone, sent, failed });
        console.log(`  [${i+1}/${total}] → ${biz.name}`);

        try {
            // KEY FIX: use 'commit' — fires immediately when navigation starts (WA is SPA, 'load' never fires again)
            const waUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
            await page.goto(waUrl, { waitUntil: 'commit', timeout: 15000 }).catch(() => {});

            // Wait for chat to open — look for the message input box
            await page.waitForSelector(
                '[data-testid="conversation-compose-box-input"], [aria-label="Type a message"], [title="Type a message"], footer',
                { timeout: 15000 }
            ).catch(() => {});
            await sleep(1500);

            // Check for invalid number popup
            const invalid = await page.locator('div[data-animate-modal-body="true"]').isVisible({ timeout: 1500 }).catch(() => false);
            if (invalid) {
                // Close popup
                await page.keyboard.press('Escape').catch(() => {});
                emit({ type: 'skipped', name: biz.name, reason: 'Number not on WhatsApp', sent, failed });
                failed++;
                continue;
            }

            // Find and click Send button — try multiple selectors + Enter key fallback
            let sent_ok = false;
            const sendSelectors = [
                '[data-testid="send"]',
                'button[aria-label="Send"]',
                'span[data-icon="send"]',
                '[data-icon="send"]'
            ];
            for (const sel of sendSelectors) {
                const el = page.locator(sel).first();
                if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
                    await el.click();
                    sent_ok = true;
                    break;
                }
            }
            // Fallback: press Enter in the message box
            if (!sent_ok) {
                const inputBox = page.locator('[data-testid="conversation-compose-box-input"], [aria-label="Type a message"]').first();
                if (await inputBox.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await inputBox.press('Enter');
                    sent_ok = true;
                }
            }
            if (!sent_ok) {
                emit({ type: 'failed', name: biz.name, reason: 'Send button not found', sent, failed });
                failed++;
                continue;
            }
            await sleep(1500);

            // Save sent status
            const idx = leads.findIndex(b => String(b.id) === String(biz.id));
            if (idx !== -1) { leads[idx].wa_sent = true; leads[idx].wa_sent_at = new Date().toISOString(); }
            saveLeads(leads);

            sent++;
            emit({ type: 'sent', name: biz.name, sent, failed, total });
            console.log(`  ✅ Sent (${sent})`);

            if (i < toSend.length - 1) {
                emit({ type: 'waiting', seconds: Math.round(DELAY_MS / 1000), next: toSend[i+1]?.name });
                await sleep(DELAY_MS);
            }

        } catch(err) {
            console.log(`  ❌ ${biz.name}: ${err.message.split('\n')[0]}`);
            failed++;
            emit({ type: 'failed', name: biz.name, reason: err.message.split('\n')[0], sent, failed });
        }
    }

    await browser.close();
    emit({ type: 'done', sent, failed, total });
    console.log(`\n🎉 Done! Sent: ${sent} | Failed: ${failed}\n`);
    return { sent, failed };
}

if (require.main === module) {
    sendWhatsAppMessages().catch(console.error);
}

module.exports = { sendWhatsAppMessages, setupWhatsAppLogin, registerSSE, removeSSE };
