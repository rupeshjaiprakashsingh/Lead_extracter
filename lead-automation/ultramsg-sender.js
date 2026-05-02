// ============================================================
//  ultramsg-sender.js — WhatsApp sender via UltraMsg REST API
//  No browser. No Playwright. Just HTTP calls.
//  Sign up free at ultramsg.com to get instanceId + token
// ============================================================
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { loadLeads, saveLeads } = require('./scraper');
const { buildWhatsAppMessage }  = require('./message-builder');

const CONFIG_FILE = path.join(__dirname, 'ultramsg-config.json');
const DELAY_MS    = 5000;   // 5 seconds between messages (UltraMsg safe limit)
const MAX_PER_RUN = 500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// SSE broadcast
let sseClients = [];
function registerSSE(res)  { sseClients.push(res); }
function removeSSE(res)    { sseClients = sseClients.filter(c => c !== res); }
function emit(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(c => { try { c.write(msg); } catch(e) {} });
}

// ── Load/Save config ────────────────────────────────────────
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

// ── Auto-send to all pending leads ─────────────────────────
async function sendWhatsAppMessages(leadIds = null) {
    const cfg = loadConfig();
    if (!cfg.instanceId || !cfg.token) {
        emit({ type: 'error', message: '❌ UltraMsg not configured. Enter Instance ID & Token in Settings.' });
        emit({ type: 'done', sent: 0, failed: 0, total: 0 });
        return { sent: 0, failed: 0 };
    }

    // Test connection first
    emit({ type: 'status', message: '🔌 Checking UltraMsg connection...' });
    const test = await testConnection(cfg.instanceId, cfg.token);
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

    const leads  = loadLeads();
    let toSend   = leads.filter(b =>
        b.phone && !b.wa_sent &&
        (!leadIds || leadIds.map(String).includes(String(b.id)))
    ).slice(0, MAX_PER_RUN);

    if (!toSend.length) {
        emit({ type: 'done', sent: 0, failed: 0, total: 0, message: 'No pending leads.' });
        return { sent: 0, failed: 0 };
    }

    const total = toSend.length;
    emit({ type: 'start', total });
    emit({ type: 'status', message: `✅ UltraMsg connected! Sending to ${total} leads...` });
    console.log(`\n📤 Sending to ${total} leads via UltraMsg API...\n`);

    let sent = 0, failed = 0;

    for (let i = 0; i < toSend.length; i++) {
        const biz     = toSend[i];
        const message = buildWhatsAppMessage(biz);
        const phone   = biz.phone;

        emit({ type: 'sending', current: i + 1, total, name: biz.name, phone: biz.raw_phone || phone, sent, failed });
        console.log(`  [${i+1}/${total}] → ${biz.name} (${biz.raw_phone || phone})`);

        try {
            await sendMessage(cfg.instanceId, cfg.token, phone, message);

            // Mark as sent
            const idx = leads.findIndex(b => String(b.id) === String(biz.id));
            if (idx !== -1) { leads[idx].wa_sent = true; leads[idx].wa_sent_at = new Date().toISOString(); }
            saveLeads(leads);

            sent++;
            emit({ type: 'sent', name: biz.name, sent, failed, total });
            console.log(`  ✅ Sent! (${sent}/${total})`);

            if (i < toSend.length - 1) {
                emit({ type: 'waiting', seconds: Math.round(DELAY_MS / 1000), next: toSend[i + 1]?.name });
                await sleep(DELAY_MS);
            }

        } catch(err) {
            const reason = err.message || 'Send failed';
            console.log(`  ❌ ${biz.name}: ${reason}`);
            failed++;
            emit({ type: 'failed', name: biz.name, reason, sent, failed });
            await sleep(1000); // Short pause on error before next
        }
    }

    emit({ type: 'done', sent, failed, total });
    console.log(`\n🎉 Done! Sent: ${sent} | Failed: ${failed}\n`);
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

