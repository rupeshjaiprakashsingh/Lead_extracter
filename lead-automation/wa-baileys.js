// ============================================================
//  wa-baileys.js — WhatsApp API sender using Baileys
//  No browser automation. Pure WebSocket API.
//  Scan QR once → session saved → auto-send forever
// ============================================================
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode   = require('qrcode');
const path     = require('path');
const fs       = require('fs');
const { loadLeads, saveLeads } = require('./scraper');
const { buildWhatsAppMessage }  = require('./message-builder');

const AUTH_DIR    = path.join(__dirname, '.baileys_auth');
const DELAY_MS    = 8000;
const MAX_PER_RUN = 500;

let globalSocket = null;
let isConnected  = false;
let isConnecting = false;

// SSE broadcast
let sseClients = [];
function registerSSE(res) { sseClients.push(res); }
function removeSSE(res)   { sseClients = sseClients.filter(c => c !== res); }
function emit(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(c => { try { c.write(msg); } catch(e) {} });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Connect / Reconnect WhatsApp ────────────────────────────
async function connectWhatsApp() {
    if (isConnecting) return;
    isConnecting = true;

    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`\n📱 Baileys v${version.join('.')} connecting to WhatsApp...\n`);

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, require('pino')({ level: 'silent' }))
        },
        printQRInTerminal: true,
        logger: require('pino')({ level: 'silent' }),
        browser: ['Lead Automation', 'Chrome', '124.0'],
        generateHighQualityLinkPreview: false,
        syncFullHistory: false
    });

    // QR code event
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n📱 QR Code received. Check the dashboard!\n');
            try {
                // Save QR as PNG file — more reliable than base64 SSE
                await QRCode.toFile(path.join(__dirname, 'dashboard', 'qr.png'), qr, { width: 300, margin: 2 });
                emit({ type: 'qr', message: 'Scan this QR code with WhatsApp on your phone', hasImage: true });
            } catch(e) {
                console.error('QR save error:', e.message);
                emit({ type: 'qr', message: 'QR ready in terminal', hasImage: false });
            }
        }

        if (connection === 'open') {
            isConnected  = true;
            isConnecting = false;
            globalSocket = sock;
            console.log('\n✅ WhatsApp connected via Baileys API!\n');
            emit({ type: 'connected', message: '✅ WhatsApp connected! Ready to send messages.' });
        }

        if (connection === 'close') {
            isConnected  = false;
            isConnecting = false;
            globalSocket = null;
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`\n⚠️  WhatsApp disconnected. Reason: ${reason}`);

            if (reason === DisconnectReason.loggedOut) {
                // Session expired — delete auth and ask user to scan again
                fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                emit({ type: 'logged_out', message: '❌ WhatsApp logged out. Please scan QR again.' });
                console.log('Session cleared. Please reconnect.');
            } else if (reason !== DisconnectReason.connectionReplaced) {
                // Auto-reconnect
                console.log('Reconnecting in 5s...');
                emit({ type: 'reconnecting', message: 'Reconnecting to WhatsApp...' });
                setTimeout(() => connectWhatsApp(), 5000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
    return sock;
}

// ── Get or create connection ────────────────────────────────
async function getSocket() {
    if (globalSocket && isConnected) return globalSocket;
    if (!isConnecting) await connectWhatsApp();

    // Wait up to 60s for connection
    for (let i = 0; i < 120; i++) {
        if (isConnected && globalSocket) return globalSocket;
        await sleep(500);
    }
    throw new Error('WhatsApp connection timeout. Please scan QR code first.');
}

// ── Send a single message ───────────────────────────────────
async function sendSingleMessage(phone, message) {
    const sock  = await getSocket();
    const jid   = `${phone}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
}

// ── Auto-send to all pending leads ─────────────────────────
async function sendWhatsAppMessages(leadIds = null) {
    const leads = loadLeads();

    let toSend = leads.filter(b =>
        b.phone && !b.wa_sent &&
        (!leadIds || leadIds.map(String).includes(String(b.id)))
    ).slice(0, MAX_PER_RUN);

    if (!toSend.length) {
        emit({ type: 'done', sent: 0, failed: 0, total: 0, message: 'No pending leads.' });
        return { sent: 0, failed: 0 };
    }

    const total = toSend.length;
    emit({ type: 'start', total });
    emit({ type: 'status', message: 'Connecting to WhatsApp API...' });
    console.log(`\n📤 Sending to ${total} leads via Baileys API...\n`);

    let sock;
    try {
        sock = await getSocket();
    } catch(e) {
        emit({ type: 'error', message: '❌ Not connected to WhatsApp. Click "Connect WhatsApp" and scan QR first.' });
        emit({ type: 'done', sent: 0, failed: 0, total });
        return { sent: 0, failed: 0 };
    }

    emit({ type: 'status', message: `✅ Connected! Sending to ${total} businesses...` });

    let sent = 0, failed = 0;

    for (let i = 0; i < toSend.length; i++) {
        const biz     = toSend[i];
        const message = buildWhatsAppMessage(biz);
        const phone   = biz.phone;

        emit({ type: 'sending', current: i + 1, total, name: biz.name, phone: biz.raw_phone || phone, sent, failed });
        console.log(`  [${i+1}/${total}] → ${biz.name} (${biz.raw_phone || phone})`);

        try {
            const jid = `${phone}@s.whatsapp.net`;
            await sock.sendMessage(jid, { text: message });

            // Mark sent in DB
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
            const msg = err.message?.includes('not-authorized') || err.message?.includes('not on whatsapp')
                ? 'Number not on WhatsApp'
                : err.message?.split('\n')[0] || 'Send failed';
            console.log(`  ❌ ${biz.name}: ${msg}`);
            failed++;
            emit({ type: 'failed', name: biz.name, reason: msg, sent, failed });
        }
    }

    emit({ type: 'done', sent, failed, total });
    console.log(`\n🎉 Done! Sent: ${sent} | Failed: ${failed}\n`);
    return { sent, failed };
}

// ── Status check ────────────────────────────────────────────
function getStatus() {
    return { connected: isConnected, connecting: isConnecting };
}

// ── Disconnect / logout ─────────────────────────────────────
async function disconnectWhatsApp() {
    if (globalSocket) {
        await globalSocket.logout().catch(() => {});
        globalSocket = null;
    }
    isConnected  = false;
    isConnecting = false;
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    emit({ type: 'logged_out', message: 'Disconnected from WhatsApp.' });
}

// Auto-connect on startup if session exists
if (fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0) {
    console.log('📱 Existing WhatsApp session found. Auto-connecting...');
    connectWhatsApp().catch(console.error);
}

module.exports = { sendWhatsAppMessages, connectWhatsApp, disconnectWhatsApp, getStatus, registerSSE, removeSSE };
