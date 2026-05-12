const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// We don't require the model file because index.js defines it. We can just get it from mongoose.
const getLeadModel = () => mongoose.model('Lead');
const { buildInitialWA, buildFollowupWA } = require('./services/ai-messages');
const { saveContactQuiet, isAuthorized } = require('./services/google-contacts');

const SESSION_DIR = path.join(__dirname, '.wa_session_data');

// ── Human-like random delays ─────────────────────────────────
function getDelay(index) {
    // Every 10 messages: take a 1–2 min human break
    if (index > 0 && index % 10 === 0) {
        const ms = 60000 + Math.random() * 60000;
        console.log(`  ☕ Human break: ${Math.round(ms/1000)}s`);
        return ms;
    }
    // Normal: 25–45 seconds
    return 25000 + Math.random() * 20000;
}

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

async function sendLocalWA(ids, isFollowup = false, options = {}) {
    const { skipWaSent = false, isScheduled = false, onComplete } = options;
    let finalSent = 0, finalFailed = 0;
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

        let browser;
        try {
            browser = await chromium.launchPersistentContext(SESSION_DIR, {
                headless: false, // Must be visible for safety
                args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
                viewport: null,
                slowMo: 100 // Slow down actions to simulate human
            });
        } catch (err) {
            if (err.message.includes('existing browser session') || err.message.includes('has been closed')) {
                emit({ type: 'error', message: '❌ WhatsApp sender is already running in another window. Please wait for it to finish.' });
                return { sent: 0, failed: 0, total: 0 };
            }
            throw err;
        }

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

            // Skip already-sent leads if toggle is ON
            if (!isFollowup && skipWaSent && lead.wa_sent) {
                emit({ type: 'skipped', name: lead.name, reason: 'WA already sent (Skip ON)' });
                continue;
            }
            
            let msg = '';
            let followupNum = (lead.followup_count || 0) + 1;
            
            if (isFollowup) {
                msg = await buildFollowupWA(lead, followupNum);
            } else {
                msg = await buildInitialWA(lead);
            }

            emit({ type: 'sending', current: i + 1, total, name: lead.name, phone: lead.phone, sent, failed });

            // ── Auto-save to Google Contacts BEFORE sending ──────────
            if (isAuthorized() && !lead.contact_saved) {
                emit({ type: 'status', message: `📒 Saving ${lead.name} to Google Contacts...` });
                const saved = await saveContactQuiet(lead);
                if (saved) {
                    const Lead = getLeadModel();
                    await Lead.findByIdAndUpdate(lead._id, {
                        $set: { contact_saved: true, contact_saved_at: new Date() }
                    }).catch(() => {});
                    emit({ type: 'status', message: `✅ Saved to Google Contacts: ${lead.name}` });
                    // Small extra pause after saving contact — gives Google Contacts time to sync to phone
                    await sleep(3000);
                }
            }

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
                        $push: { activity: { type: 'wa_sent', message: isScheduled ? 'WA sent via Auto-Scheduler' : 'Initial WA sent via Playwright', date: new Date() } }
                    });
                }

                sent++;
                finalSent = sent;
                emit({ type: 'sent', name: lead.name, sent, failed, total });

                if (i < leads.length - 1) {
                    const delay = getDelay(i);
                    emit({ type: 'waiting', seconds: Math.round(delay / 1000), next: leads[i+1]?.name });
                    await sleep(delay);
                }

            } catch(err) {
                failed++;
                finalFailed = failed;
                emit({ type: 'failed', name: lead.name, reason: err.message.split('\n')[0], sent, failed });
            }
        }

        await browser.close();
        if (onComplete) onComplete(sent, failed);
        emit({ type: 'done', sent, failed, total });
        return { sent, failed, total };

    } catch(e) {
        emit({ type: 'error', message: 'Internal error: ' + e.message });
        if (onComplete) onComplete(finalSent, finalFailed);
        return { sent: finalSent, failed: finalFailed, total: 0 };
    }
}

module.exports = { sendLocalWA, registerSSE, removeSSE };
