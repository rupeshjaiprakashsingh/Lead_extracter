// ============================================================
//  ultramsg-sender.js — WhatsApp sender via UltraMsg REST API
//  No browser. No Playwright. Just HTTP calls.
//  Multi-Tenant ready. Reads credentials from MongoDB per-user.
// ============================================================
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const mongoose = require('mongoose');
const { buildInitialWA, buildFollowupWA } = require('./services/ai-messages');

const CONFIG_FILE = path.join(__dirname, 'ultramsg-config.json');
const DELAY_MS    = 5000;   // 5 seconds between messages (UltraMsg safe limit)
const MAX_PER_RUN = 500;

function isPotentialLandlineOrInvalid(phone) {
    if (!phone) return { invalid: true, reason: 'Empty phone number' };
    const cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length < 10) {
        return { invalid: true, reason: 'Too short (less than 10 digits)' };
    }
    // Indian numbers logic
    if (cleaned.startsWith('91')) {
        if (cleaned.length !== 12) {
            return { invalid: true, reason: 'Indian number must be 12 digits (with 91 prefix)' };
        }
        const firstNationalDigit = cleaned.charAt(2);
        if (!['6', '7', '8', '9'].includes(firstNationalDigit)) {
            return { invalid: true, reason: 'Indian landline or invalid mobile prefix' };
        }
    } else {
        // If 10 digits without prefix (assuming Indian national number)
        if (cleaned.length === 10) {
            const firstDigit = cleaned.charAt(0);
            if (!['6', '7', '8', '9'].includes(firstDigit)) {
                return { invalid: true, reason: 'Indian landline or invalid mobile prefix (10 digits)' };
            }
        }
    }
    return { invalid: false };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// SSE broadcast
let sseClients = [];
function registerSSE(res)  { sseClients.push(res); }
function removeSSE(res)    { sseClients = sseClients.filter(c => c !== res); }
function emit(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(c => { try { c.write(msg); } catch(e) {} });
}

// ── Load/Save config (Legacy fallback) ───────────────────────
function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
        catch(e) {}
    }
    return { instanceId: '', token: '' };
}

function saveConfig(cfg) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

// ── Make HTTP POST request (no external dependencies) ──────
function httpPost(url, body) {
    return new Promise((resolve, reject) => {
        const data    = new URLSearchParams(body).toString();
        const urlObj  = new URL(url);
        const lib     = urlObj.protocol === 'https:' ? https : http;
        const options = {
            hostname: urlObj.hostname,
            path:     urlObj.pathname + urlObj.search,
            method:   'POST',
            headers:  {
                'Content-Type':   'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        const req = lib.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
                catch(e) { resolve({ status: res.statusCode, data: body }); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.write(data);
        req.end();
    });
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const urlObj  = new URL(url);
        const lib     = urlObj.protocol === 'https:' ? https : http;
        const options = {
            hostname: urlObj.hostname,
            path:     urlObj.pathname + urlObj.search,
            method:   'GET'
        };
        const req = lib.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
                catch(e) { resolve({ status: res.statusCode, data: body }); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.end();
    });
}

// ── Test connection ─────────────────────────────────────────
async function testConnection(instanceId, token) {
    try {
        const url = `https://api.ultramsg.com/${instanceId}/instance/status?token=${token}`;
        const res = await httpGet(url);
        
        if (res.status === 200 && res.data) {
            if (res.data.error) {
                return { success: false, error: res.data.error };
            }
            const status = res.data.status?.accountStatus?.status || res.data.accountStatus?.status || res.data.status || '';
            const connected = status === 'authenticated' || status === 'connected';
            return { success: true, connected, status, raw: res.data };
        }
        return { success: false, error: `HTTP ${res.status}: ${JSON.stringify(res.data)}` };
    } catch(e) {
        return { success: false, error: e.message };
    }
}

// ── Send single WhatsApp message ────────────────────────────
async function sendMessage(instanceId, token, phone, message) {
    const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
    // UltraMsg expects phone with country code, no +
    const to = phone.startsWith('+') ? phone.slice(1) : phone;
    const res = await httpPost(url, { token, to, body: message, priority: '1' });
    if (res.status === 200 && (res.data?.sent === 'true' || res.data?.sent === true)) {
        return { success: true, id: res.data.id };
    }
    throw new Error(res.data?.error || res.data?.message || `HTTP ${res.status}`);
}

// ── Send WhatsApp Campaign (MongoDB Multi-Tenant) ──────────
async function sendWhatsAppMessages(leadIds = null, isFollowup = false, options = {}) {
    const userId = options.companyId;
    if (!userId) {
        emit({ type: 'error', message: '❌ Internal Error: No companyId (userId) provided for UltraMsg sender.' });
        emit({ type: 'done', sent: 0, failed: 0, total: 0 });
        return { sent: 0, failed: 0 };
    }

    const Settings = mongoose.model('Settings');
    const instRow = await Settings.findOne({ userId, key: 'ultramsg_instance_id' });
    const tokRow = await Settings.findOne({ userId, key: 'ultramsg_token' });

    const instanceId = instRow ? instRow.value : '';
    const token = tokRow ? tokRow.value : '';

    if (!instanceId || !token) {
        emit({ type: 'error', message: '❌ UltraMsg not configured. Enter Instance ID & Token in Settings.' });
        emit({ type: 'done', sent: 0, failed: 0, total: 0 });
        return { sent: 0, failed: 0 };
    }

    // Test connection first
    emit({ type: 'status', message: '🔌 Checking UltraMsg connection...' });
    const test = await testConnection(instanceId, token);
    if (!test.success) {
        emit({ type: 'error', message: `❌ Connection failed: ${test.error}` });
        emit({ type: 'done', sent: 0, failed: 0, total: 0 });
        return { sent: 0, failed: 0 };
    }
    if (!test.connected) {
        emit({ type: 'error', message: `❌ WhatsApp not connected in UltraMsg. Please scan QR at ultramsg.com (Status: ${test.status})` });
        emit({ type: 'done', sent: 0, failed: 0, total: 0 });
        return { sent: 0, failed: 0 };
    }

    const Lead = mongoose.model('Lead');
    const leads = await Lead.find({ _id: { $in: leadIds }, phone: { $exists: true, $ne: '' } });

    if (!leads.length) {
        emit({ type: 'done', sent: 0, failed: 0, total: 0, message: 'No pending leads.' });
        return { sent: 0, failed: 0 };
    }

    const total = leads.length;
    emit({ type: 'start', total });
    emit({ type: 'status', message: `✅ UltraMsg connected! Sending to ${total} leads...` });
    console.log(`\n📤 Sending to ${total} leads via UltraMsg API for user ${userId}...\n`);

    let sent = 0, failed = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];

        // Skip already-sent leads if toggle is ON (only for initial campaign send)
        if (!isFollowup && options.skipWaSent && lead.wa_sent) {
            emit({ type: 'skipped', name: lead.name, reason: 'WA already sent (Skip ON)' });
            continue;
        }

        // Skip if known invalid
        if (lead.wa_invalid) {
            emit({ type: 'skipped', name: lead.name, reason: 'Known invalid WhatsApp number' });
            continue;
        }

        // Run pre-validation (landlines/formatting)
        const preCheck = isPotentialLandlineOrInvalid(lead.phone);
        if (preCheck.invalid) {
            await Lead.findByIdAndUpdate(lead._id, {
                $set: { wa_invalid: true },
                $push: { activity: { type: 'wa_invalid', message: `Pre-check failed: ${preCheck.reason}`, date: new Date() } }
            }).catch(() => {});

            emit({ type: 'failed', name: lead.name, reason: `Skipped: ${preCheck.reason}`, sent, failed });
            failed++;
            continue;
        }

        let msg = '';
        let followupNum = (lead.followup_count || 0) + 1;

        try {
            if (isFollowup) {
                msg = await buildFollowupWA(lead, followupNum, userId);
            } else {
                msg = await buildInitialWA(lead, userId);
            }
        } catch (err) {
            console.error(`Gemini build message error for lead ${lead.name}:`, err.message);
            failed++;
            emit({ type: 'failed', name: lead.name, reason: 'AI personalization failed', sent, failed });
            continue;
        }

        const phone = lead.phone;
        emit({ type: 'sending', current: i + 1, total, name: lead.name, phone: lead.raw_phone || phone, sent, failed });
        console.log(`  [${i+1}/${total}] → ${lead.name} (${lead.raw_phone || phone})`);

        try {
            await sendMessage(instanceId, token, phone, msg);

            // Update Mongoose Lead Document
            if (isFollowup) {
                await Lead.findByIdAndUpdate(lead._id, {
                    $inc:  { wa_count: 1, followup_count: 1 },
                    $set:  { wa_last_date: today, next_followup: new Date(Date.now() + 7*24*60*60*1000), status: 'followup' },
                    $push: { activity: { type: 'wa_sent', message: `Followup #${followupNum} WA sent via UltraMsg`, date: new Date() } }
                });
            } else {
                await Lead.findByIdAndUpdate(lead._id, {
                    $set:  { wa_sent: true, wa_sent_at: new Date(), wa_last_date: today, status: 'contacted' },
                    $inc:  { wa_count: 1 },
                    $push: { activity: { type: 'wa_sent', message: options.isScheduled ? 'WA sent via Auto-Scheduler (UltraMsg)' : 'Initial WA sent via UltraMsg', date: new Date() } }
                });
            }

            sent++;
            emit({ type: 'sent', name: lead.name, sent, failed, total });
            console.log(`  ✅ Sent! (${sent}/${total})`);

            if (i < leads.length - 1) {
                emit({ type: 'waiting', seconds: Math.round(DELAY_MS / 1000), next: leads[i + 1]?.name });
                await sleep(DELAY_MS);
            }

        } catch(err) {
            const reason = err.message || 'Send failed';
            console.log(`  ❌ ${lead.name}: ${reason}`);
            failed++;

            // Mark as invalid if the UltraMsg error indicates unregistered number or invalid format
            const isUnregistered = reason.toLowerCase().includes('register') || 
                                   reason.toLowerCase().includes('invalid') || 
                                   reason.toLowerCase().includes('not exist') ||
                                   reason.toLowerCase().includes('not exist on whatsapp');
            if (isUnregistered) {
                await Lead.findByIdAndUpdate(lead._id, {
                    $set: { wa_invalid: true },
                    $push: { activity: { type: 'wa_invalid', message: `UltraMsg reported invalid: ${reason}`, date: new Date() } }
                }).catch(() => {});
            }

            emit({ type: 'failed', name: lead.name, reason, sent, failed });
            await sleep(1000); // Short pause on error before next
        }
    }

    emit({ type: 'done', sent, failed, total });
    console.log(`\n🎉 Done! Sent: ${sent} | Failed: ${failed}\n`);
    if (options.onComplete) options.onComplete(sent, failed);
    return { sent, failed };
}

async function sendSingleMessage(cfg, phone, message) {
    const url = `https://api.ultramsg.com/${cfg.instanceId}/messages/chat`;
    const to  = phone.startsWith('+') ? phone.slice(1) : phone;
    const res = await httpPost(url, { token: cfg.token, to, body: message, priority: '1' });
    if (res.status === 200 && (res.data?.sent === 'true' || res.data?.sent === true)) return true;
    throw new Error(res.data?.error || `HTTP ${res.status}`);
}

module.exports = { sendWhatsAppMessages, sendSingleMessage, testConnection, loadConfig, saveConfig, registerSSE, removeSSE };
