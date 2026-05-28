const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// We don't require the model file because index.js defines it. We can just get it from mongoose.
const getLeadModel = () => mongoose.model('Lead');
const { buildInitialWA, buildFollowupWA } = require('./services/ai-messages');
const { saveContactQuiet, isAuthorized } = require('./services/google-contacts');

// ── WhatsApp Safety Limits ────────────────────────────────────
// These limits protect your WhatsApp account from being banned.
// Per WhatsApp's known tolerance:
//   • NEW accounts  : 30-50 msgs/day max
//   • ESTABLISHED accounts : 80-150 msgs/day max
//   • Per phone number: never send more than 1 msg/day (default)
const WA_LIMITS = {
    PER_PHONE_PER_DAY: 1,        // Max messages to a single phone number per day
    GLOBAL_DAILY_CAP: 90,        // Max total WA messages per day across ALL batches
    WARN_AT_PERCENT: 80,         // Warn when reaching 80% of daily cap
};

// ── Daily count tracker (persisted to file across restarts) ───
const DAILY_COUNT_FILE = path.join(__dirname, '.wa_daily_count.json');

function loadDailyCount() {
    try {
        const today = new Date().toISOString().slice(0, 10);
        if (fs.existsSync(DAILY_COUNT_FILE)) {
            const data = JSON.parse(fs.readFileSync(DAILY_COUNT_FILE, 'utf8'));
            if (data.date === today) return data;
        }
    } catch (e) {}
    // New day or fresh start — reset counter
    return { date: new Date().toISOString().slice(0, 10), count: 0, phones: {} };
}

function saveDailyCount(data) {
    try {
        fs.writeFileSync(DAILY_COUNT_FILE, JSON.stringify(data), 'utf8');
    } catch (e) {}
}

function recordSent(phone) {
    const data = loadDailyCount();
    data.count = (data.count || 0) + 1;
    data.phones = data.phones || {};
    const p = String(phone).replace(/\D/g, '');
    data.phones[p] = (data.phones[p] || 0) + 1;
    saveDailyCount(data);
    return data;
}

function canSendToPhone(phone) {
    const data = loadDailyCount();
    const today = new Date().toISOString().slice(0, 10);
    if (data.date !== today) return { ok: true, globalSent: 0, phoneSent: 0 };
    const p = String(phone).replace(/\D/g, '');
    const phoneSent = (data.phones || {})[p] || 0;
    const globalSent = data.count || 0;
    // Block if phone already got its daily limit
    if (phoneSent >= WA_LIMITS.PER_PHONE_PER_DAY) {
        return { ok: false, reason: `Already sent ${phoneSent} msg(s) to this number today (limit: ${WA_LIMITS.PER_PHONE_PER_DAY}/day per number)`, globalSent, phoneSent };
    }
    // Block if global daily cap reached
    if (globalSent >= WA_LIMITS.GLOBAL_DAILY_CAP) {
        return { ok: false, reason: `Daily limit reached: ${globalSent}/${WA_LIMITS.GLOBAL_DAILY_CAP} messages sent today. Resuming tomorrow.`, globalSent, phoneSent };
    }
    return { ok: true, globalSent, phoneSent };
}

function getDailyStats() {
    const data = loadDailyCount();
    const today = new Date().toISOString().slice(0, 10);
    if (data.date !== today) return { sent: 0, remaining: WA_LIMITS.GLOBAL_DAILY_CAP, cap: WA_LIMITS.GLOBAL_DAILY_CAP, percent: 0 };
    const sent = data.count || 0;
    const remaining = Math.max(0, WA_LIMITS.GLOBAL_DAILY_CAP - sent);
    return { sent, remaining, cap: WA_LIMITS.GLOBAL_DAILY_CAP, percent: Math.round((sent / WA_LIMITS.GLOBAL_DAILY_CAP) * 100) };
}

function getSessionDir(companyId) {
    if (companyId) {
        return path.join(__dirname, 'wa_sessions', companyId.toString());
    }
    return path.join(__dirname, '.wa_session_data');
}

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
        
        const sessionDir = getSessionDir(options.companyId);
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

        let browser;
        try {
            browser = await chromium.launchPersistentContext(sessionDir, {
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

        // ── Daily limit check before starting ──────────────────
        const statsBeforeStart = getDailyStats();
        if (statsBeforeStart.remaining <= 0) {
            emit({ type: 'error', message: `🛡️ Daily WhatsApp limit reached (${statsBeforeStart.sent}/${statsBeforeStart.cap} sent today). Will resume tomorrow automatically. This protects your account from being banned.` });
            await browser.close();
            return { sent: 0, failed: 0, total: leads.length };
        }
        if (statsBeforeStart.percent >= WA_LIMITS.WARN_AT_PERCENT) {
            emit({ type: 'status', message: `⚠️ Warning: You've used ${statsBeforeStart.percent}% of today's WhatsApp limit (${statsBeforeStart.sent}/${statsBeforeStart.cap})` });
        }
        emit({ type: 'status', message: `📊 Daily WA budget: ${statsBeforeStart.remaining} messages remaining today (limit: ${statsBeforeStart.cap}/day)` });

        let sent = 0, failed = 0;
        const today = new Date().toISOString().slice(0,10);

        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];

            // ── Global daily cap check ──────────────────────────
            const globalStats = getDailyStats();
            if (globalStats.remaining <= 0) {
                emit({ type: 'status', message: `🛡️ Daily limit of ${globalStats.cap} messages reached. Stopping to protect your WhatsApp account. Remaining ${leads.length - i} lead(s) queued for tomorrow.` });
                break;
            }

            // ── Per-phone-number daily limit check ──────────────
            const phoneCheck = canSendToPhone(lead.phone);
            if (!phoneCheck.ok) {
                emit({ type: 'skipped', name: lead.name, reason: `🛡️ Skipped: ${phoneCheck.reason}` });
                continue;
            }

            // Skip already-sent leads if toggle is ON
            if (!isFollowup && skipWaSent && lead.wa_sent) {
                emit({ type: 'skipped', name: lead.name, reason: 'WA already sent (Skip ON)' });
                continue;
            }
            
            let msg = '';
            let followupNum = (lead.followup_count || 0) + 1;
            
            if (isFollowup) {
                msg = await buildFollowupWA(lead, followupNum, options.companyId);
            } else {
                msg = await buildInitialWA(lead, options.companyId);
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
                const sendSelectors = ['[data-testid="send"]', 'button[aria-label="Send"]', 'span[data-icon="send"]', 'button:has(span[data-icon="send"])'];
                for (const sel of sendSelectors) {
                    const el = page.locator(sel).first();
                    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
                        await el.click();
                        sent_ok = true;
                        break;
                    }
                }
                
                if (!sent_ok) {
                    const inputBox = page.locator('[data-testid="conversation-compose-box-input"], [contenteditable="true"], [aria-label="Type a message"]').first();
                    if (await inputBox.isVisible({ timeout: 2000 }).catch(() => false)) {
                        await inputBox.focus();
                        await sleep(500);
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
                // ── Record in daily counter (persisted to disk) ───
                const dailyData = recordSent(lead.phone);
                const remaining = Math.max(0, WA_LIMITS.GLOBAL_DAILY_CAP - dailyData.count);
                emit({ type: 'sent', name: lead.name, sent, failed, total,
                    dailyStats: { sent: dailyData.count, cap: WA_LIMITS.GLOBAL_DAILY_CAP, remaining }
                });
                // Warn when approaching daily limit
                if (remaining > 0 && remaining <= 10) {
                    emit({ type: 'status', message: `⚠️ Only ${remaining} messages left in today's daily limit (${dailyData.count}/${WA_LIMITS.GLOBAL_DAILY_CAP})` });
                }

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

// ── MANUAL SEND MODE ─────────────────────────────────────────
// Opens WhatsApp Web with message pre-filled.
// Waits for the USER to click Send, then automatically moves to next lead.
async function sendLocalWA_Manual(ids, isFollowup = false, options = {}) {
    const { skipWaSent = false } = options;
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

        const sessionDir = getSessionDir(options.companyId);
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

        let browser;
        try {
            browser = await chromium.launchPersistentContext(sessionDir, {
                headless: false,
                args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
                viewport: null,
                slowMo: 80
            });
        } catch (err) {
            if (err.message.includes('existing browser session') || err.message.includes('has been closed')) {
                emit({ type: 'error', message: '❌ WhatsApp sender is already running in another window.' });
                return { sent: 0, failed: 0, total: 0 };
            }
            throw err;
        }

        const page = await browser.newPage();
        emit({ type: 'status', message: '🖥️ Opening WhatsApp Web in MANUAL mode — YOU click Send each time...' });

        try {
            await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch(e) {}
        await sleep(5000);

        if (!await isWALoggedIn(page)) {
            emit({ type: 'status', message: '📱 Please scan the QR code in the new window. Waiting up to 2 minutes...' });
            try {
                await page.waitForSelector('#pane-side, [aria-label="Search or start a new chat"], header', { timeout: 120000 });
                emit({ type: 'status', message: '✅ QR Scanned! Starting manual send mode...' });
                await sleep(4000);
            } catch(e) {
                emit({ type: 'error', message: '❌ Login timeout. Please try again.' });
                await browser.close();
                return;
            }
        }

        emit({ type: 'status', message: '✅ WhatsApp ready! Opening messages for manual sending...' });

        let sent = 0, failed = 0;
        const today = new Date().toISOString().slice(0,10);

        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];

            if (!isFollowup && skipWaSent && lead.wa_sent) {
                emit({ type: 'skipped', name: lead.name, reason: 'WA already sent (Skip ON)' });
                continue;
            }

            let msg = '';
            let followupNum = (lead.followup_count || 0) + 1;
            if (isFollowup) {
                msg = await buildFollowupWA(lead, followupNum, options.companyId);
            } else {
                msg = await buildInitialWA(lead, options.companyId);
            }

            emit({ type: 'sending', current: i + 1, total, name: lead.name, phone: lead.phone, sent, failed });
            emit({ type: 'status', message: `⏳ [${i+1}/${total}] Opening chat for ${lead.name}... Please click SEND in WhatsApp.` });

            try {
                // Open WhatsApp with message pre-filled
                const waUrl = `https://web.whatsapp.com/send?phone=${lead.phone}&text=${encodeURIComponent(msg)}`;
                await page.goto(waUrl, { waitUntil: 'commit', timeout: 15000 }).catch(() => {});

                // Wait for the input box to confirm chat opened
                await page.waitForSelector(
                    '[data-testid="conversation-compose-box-input"], [aria-label="Type a message"], footer',
                    { timeout: 15000 }
                ).catch(() => {});
                await sleep(1500);

                // Check invalid number popup
                const invalid = await page.locator('div[data-animate-modal-body="true"]').isVisible({ timeout: 2000 }).catch(() => false);
                if (invalid) {
                    await page.keyboard.press('Escape').catch(() => {});
                    emit({ type: 'failed', name: lead.name, reason: 'Invalid WhatsApp Number', sent, failed: ++failed });
                    finalFailed = failed;
                    continue;
                }

                // 👆 Wait for USER to click send — we watch for the input box to become empty
                // (WhatsApp clears the compose box immediately after sending)
                emit({ type: 'status', message: `👆 [${i+1}/${total}] Click SEND for: ${lead.name} | ${lead.raw_phone || lead.phone}` });

                let userSent = false;
                // Poll for up to 5 minutes — waiting for user to send
                const maxWait = 300000; // 5 minutes
                const pollInterval = 1000; // check every 1s
                const startTime = Date.now();

                while (Date.now() - startTime < maxWait) {
                    // If user navigated away or window closed, break
                    try { await page.evaluate(() => true); } catch(e) { break; }

                    // Check if the compose box is now empty (message was sent) or a new message appeared in chat
                    const inputEmpty = await page.evaluate(() => {
                        const el = document.querySelector('[data-testid="conversation-compose-box-input"], [contenteditable="true"][aria-label]');
                        return el ? (el.textContent || '').trim() === '' : false;
                    }).catch(() => false);

                    if (inputEmpty) {
                        userSent = true;
                        break;
                    }
                    await sleep(pollInterval);
                }

                if (!userSent) {
                    emit({ type: 'failed', name: lead.name, reason: 'Timeout — user did not send', sent, failed: ++failed });
                    finalFailed = failed;
                    continue;
                }

                // Mark as sent in MongoDB
                const Lead2 = getLeadModel();
                if (isFollowup) {
                    await Lead2.findByIdAndUpdate(lead._id, {
                        $inc:  { wa_count: 1, followup_count: 1 },
                        $set:  { wa_last_date: today, next_followup: new Date(Date.now() + 7*24*60*60*1000), status: 'followup' },
                        $push: { activity: { type: 'wa_sent', message: `Followup #${followupNum} WA sent manually`, date: new Date() } }
                    });
                } else {
                    await Lead2.findByIdAndUpdate(lead._id, {
                        $set:  { wa_sent: true, wa_sent_at: new Date(), wa_last_date: today, status: 'contacted' },
                        $inc:  { wa_count: 1 },
                        $push: { activity: { type: 'wa_sent', message: 'Initial WA sent manually (safe mode)', date: new Date() } }
                    });
                }

                sent++;
                finalSent = sent;
                emit({ type: 'sent', name: lead.name, sent, failed, total });

                // Small pause before next lead
                await sleep(2000);

            } catch(err) {
                failed++;
                finalFailed = failed;
                emit({ type: 'failed', name: lead.name, reason: err.message.split('\n')[0], sent, failed });
            }
        }

        await browser.close();
        emit({ type: 'done', sent, failed, total });
        return { sent, failed, total };

    } catch(e) {
        emit({ type: 'error', message: 'Internal error: ' + e.message });
        return { sent: finalSent, failed: finalFailed, total: 0 };
    }
}

// ── DRAFT MODE ────────────────────────────────────────────────
// Opens each WhatsApp chat with message pre-filled, then moves on
// WITHOUT clicking Send. WhatsApp saves the draft automatically.
// When all are done, user goes through each chat and clicks Send.
async function sendLocalWA_Draft(ids, isFollowup = false, options = {}) {
    const { skipWaSent = false } = options;
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

        const sessionDir = getSessionDir(options.companyId);
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

        let browser;
        try {
            browser = await chromium.launchPersistentContext(sessionDir, {
                headless: false,
                args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
                viewport: null,
                slowMo: 60
            });
        } catch (err) {
            if (err.message.includes('existing browser session') || err.message.includes('has been closed')) {
                emit({ type: 'error', message: '❌ WhatsApp sender is already running in another window.' });
                return { sent: 0, failed: 0, total: 0 };
            }
            throw err;
        }

        const page = await browser.newPage();
        emit({ type: 'status', message: '📝 DRAFT MODE — Pre-filling messages. Do NOT close the browser!' });

        try {
            await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch(e) {}
        await sleep(5000);

        if (!await isWALoggedIn(page)) {
            emit({ type: 'status', message: '📱 Please scan the QR code in the new window...' });
            try {
                await page.waitForSelector('#pane-side, [aria-label="Search or start a new chat"], header', { timeout: 120000 });
                emit({ type: 'status', message: '✅ QR Scanned! Starting draft mode...' });
                await sleep(4000);
            } catch(e) {
                emit({ type: 'error', message: '❌ Login timeout. Please try again.' });
                await browser.close();
                return;
            }
        }

        emit({ type: 'status', message: `✅ WhatsApp ready! Drafting ${total} messages — browser will stay open when done.` });

        let drafted = 0, failed = 0;
        const today = new Date().toISOString().slice(0,10);

        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];

            if (!isFollowup && skipWaSent && lead.wa_sent) {
                emit({ type: 'skipped', name: lead.name, reason: 'WA already sent (Skip ON)' });
                continue;
            }

            let msg = '';
            let followupNum = (lead.followup_count || 0) + 1;
            if (isFollowup) {
                msg = await buildFollowupWA(lead, followupNum, options.companyId);
            } else {
                msg = await buildInitialWA(lead, options.companyId);
            }

            emit({ type: 'sending', current: i + 1, total, name: lead.name, phone: lead.phone, sent: drafted, failed });
            emit({ type: 'status', message: `📝 [${i+1}/${total}] Drafting for: ${lead.name}` });

            try {
                // Navigate to chat — WhatsApp URL auto-fills the text in compose box
                const waUrl = `https://web.whatsapp.com/send?phone=${lead.phone}&text=${encodeURIComponent(msg)}`;
                await page.goto(waUrl, { waitUntil: 'commit', timeout: 15000 }).catch(() => {});

                // Wait for compose box to load (ensures message is filled before moving on)
                await page.waitForSelector(
                    '[data-testid="conversation-compose-box-input"], [aria-label="Type a message"], footer',
                    { timeout: 12000 }
                ).catch(() => {});

                // Small pause so WhatsApp has time to register the draft
                await sleep(1800);

                // Check for invalid number popup
                const invalid = await page.locator('div[data-animate-modal-body="true"]').isVisible({ timeout: 1500 }).catch(() => false);
                if (invalid) {
                    await page.keyboard.press('Escape').catch(() => {});
                    emit({ type: 'failed', name: lead.name, reason: 'Invalid WhatsApp Number', sent: drafted, failed: ++failed });
                    finalFailed = failed;
                    continue;
                }

                // Navigate away immediately — WhatsApp saves text as draft automatically
                
                const LeadDB = getLeadModel();
                if (isFollowup) {
                    await LeadDB.findByIdAndUpdate(lead._id, {
                        $inc:  { wa_count: 1, followup_count: 1 },
                        $set:  { wa_last_date: today, next_followup: new Date(Date.now() + 7*24*60*60*1000), status: 'followup' },
                        $push: { activity: { type: 'wa_sent', message: `Followup #${followupNum} WA drafted`, date: new Date() } }
                    });
                } else {
                    await LeadDB.findByIdAndUpdate(lead._id, {
                        $set:  { wa_sent: true, wa_sent_at: new Date(), wa_last_date: today, status: 'contacted' },
                        $inc:  { wa_count: 1 },
                        $push: { activity: { type: 'wa_sent', message: 'Initial WA drafted', date: new Date() } }
                    });
                }

                drafted++;
                finalSent = drafted;
                emit({ type: 'sent', name: `📝 ${lead.name} (drafted)`, sent: drafted, failed, total });

            } catch(err) {
                failed++;
                finalFailed = failed;
                emit({ type: 'failed', name: lead.name, reason: err.message.split('\n')[0], sent: drafted, failed });
            }
        }

        // All drafted — stay on last chat, show completion
        emit({ 
            type: 'done', 
            sent: drafted, 
            failed, 
            total,
            message: `✅ ${drafted} messages drafted! Now go through each chat in WhatsApp and click Send.`
        });
        emit({ type: 'status', message: `🎉 All ${drafted} messages are ready as drafts. Click Send in each chat whenever you're ready!` });

        // Keep browser open so user can send drafts
        // (We do NOT call browser.close() in draft mode)

        return { sent: drafted, failed, total };

    } catch(e) {
        emit({ type: 'error', message: 'Internal error: ' + e.message });
        return { sent: finalSent, failed: finalFailed, total: 0 };
    }
}

module.exports = { sendLocalWA, sendLocalWA_Manual, sendLocalWA_Draft, registerSSE, removeSSE, getDailyStats, WA_LIMITS };

