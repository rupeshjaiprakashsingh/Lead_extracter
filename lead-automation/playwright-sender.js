const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// We don't require the model file because index.js defines it. We can just get it from mongoose.
const getLeadModel = () => mongoose.model('Lead');
const { buildInitialWA, buildFollowupWA } = require('./services/ai-messages');

const SESSION_DIR = path.join(__dirname, '.wa_session_data');
const DELAY_MS = 12000; // 12 seconds between messages to prevent bans

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let sseClients = [];
function registerSSE(res) { sseClients.push(res); }
function removeSSE(res) { sseClients = sseClients.filter(c => c !== res); }
function emit(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(c => { try { c.write(msg); } catch(e) {} });
}

async function isWALoggedIn(page) {
    // #pane-side is the main chat list container on the left, present only when logged in
    return await page.locator('#pane-side, [aria-label="Search or start a new chat"], header').first().isVisible({ timeout: 6000 }).catch(() => false);
}

async function sendLocalWA(ids, isFollowup = false) {
    try {
        const Lead = getLeadModel();
        const leads = await Lead.find({ _id: { $in: ids }, phone: { $exists: true, $ne: '' } });
        if (!leads.length) {
            emit({ type: 'done', sent: 0, failed: 0, total: 0 });
            return;
        }

        const total = leads.length;
        emit({ type: 'start', total });
        
        if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

        const browser = await chromium.launchPersistentContext(SESSION_DIR, {
            headless: false, // Must be visible for safety
            args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
            viewport: null,
            slowMo: 100 // Slow down actions to simulate human
        });

        const page = await browser.newPage();
        emit({ type: 'status', message: 'Opening WhatsApp Web locally...' });

        try {
            await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch(e) {}
        await sleep(5000);

        if (!await isWALoggedIn(page)) {
            emit({ type: 'status', message: '📱 Please scan the QR code in the new window. Waiting up to 2 minutes...' });
            try {
                // Wait for the chat list to appear (means login success)
                await page.waitForSelector('#pane-side, [aria-label="Search or start a new chat"], header', { timeout: 120000 });
                emit({ type: 'status', message: '✅ QR Scanned successfully! Loading WhatsApp...' });
                await sleep(4000);
            } catch(e) {
                emit({ type: 'error', message: '❌ Login timeout. You did not scan the QR code in time. Please try again.' });
                await browser.close();
                return;
            }
        }

        emit({ type: 'status', message: '✅ WhatsApp ready! Automating safe human-like sending...' });

        let sent = 0, failed = 0;
        const today = new Date().toISOString().slice(0,10);

        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            
            let msg = '';
            let followupNum = (lead.followup_count || 0) + 1;
            
            if (isFollowup) {
                msg = await buildFollowupWA(lead, followupNum);
            } else {
                msg = await buildInitialWA(lead);
            }

            emit({ type: 'sending', current: i + 1, total, name: lead.name, phone: lead.phone, sent, failed });

            try {
                const waUrl = `https://web.whatsapp.com/send?phone=${lead.phone}&text=${encodeURIComponent(msg)}`;
                await page.goto(waUrl, { waitUntil: 'commit', timeout: 15000 }).catch(() => {});

                // Wait for message input box
                await page.waitForSelector('[data-testid="conversation-compose-box-input"], [aria-label="Type a message"], footer', { timeout: 15000 }).catch(() => {});
                await sleep(2000);

                // Check for invalid number
                const invalid = await page.locator('div[data-animate-modal-body="true"]').isVisible({ timeout: 2000 }).catch(() => false);
                if (invalid) {
                    await page.keyboard.press('Escape').catch(() => {});
                    emit({ type: 'failed', name: lead.name, reason: 'Invalid WhatsApp Number', sent, failed });
                    failed++;
                    continue;
                }

                // Click Send Button
                let sent_ok = false;
                const sendSelectors = ['[data-testid="send"]', 'button[aria-label="Send"]', 'span[data-icon="send"]'];
                for (const sel of sendSelectors) {
                    const el = page.locator(sel).first();
                    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
                        await el.click();
                        sent_ok = true;
                        break;
                    }
                }
                
                if (!sent_ok) {
                    const inputBox = page.locator('[data-testid="conversation-compose-box-input"], [aria-label="Type a message"]').first();
                    if (await inputBox.isVisible({ timeout: 2000 }).catch(() => false)) {
                        await inputBox.press('Enter');
                        sent_ok = true;
                    }
                }

                if (!sent_ok) {
                    emit({ type: 'failed', name: lead.name, reason: 'Could not find Send button', sent, failed });
                    failed++;
                    continue;
                }
                
                await sleep(2000);

                // Update MongoDB
                const Lead = getLeadModel();
                if (isFollowup) {
                    await Lead.findByIdAndUpdate(lead._id, {
                        $inc:  { wa_count: 1, followup_count: 1 },
                        $set:  { wa_last_date: today, next_followup: new Date(Date.now() + 7*24*60*60*1000), status: 'followup' },
                        $push: { activity: { type: 'wa_sent', message: `Followup #${followupNum} WA sent via Playwright`, date: new Date() } }
                    });
                } else {
                    await Lead.findByIdAndUpdate(lead._id, {
                        $set:  { wa_sent: true, wa_sent_at: new Date(), wa_last_date: today, status: 'contacted' },
                        $inc:  { wa_count: 1 },
                        $push: { activity: { type: 'wa_sent', message: 'Initial WA sent via Playwright', date: new Date() } }
                    });
                }

                sent++;
                emit({ type: 'sent', name: lead.name, sent, failed, total });

                if (i < leads.length - 1) {
                    emit({ type: 'waiting', seconds: Math.round(DELAY_MS / 1000), next: leads[i+1]?.name });
                    await sleep(DELAY_MS); // Crucial delay to avoid ban
                }

            } catch(err) {
                failed++;
                emit({ type: 'failed', name: lead.name, reason: err.message.split('\n')[0], sent, failed });
            }
        }

        await browser.close();
        emit({ type: 'done', sent, failed, total });
        
    } catch(e) {
        emit({ type: 'error', message: 'Internal error: ' + e.message });
    }
}

module.exports = { sendLocalWA, registerSSE, removeSSE };
