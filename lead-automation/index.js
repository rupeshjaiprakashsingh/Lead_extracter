// ============================================================
//  index.js — Lead Automation CRM (MongoDB + UltraMsg + Email)
// ============================================================
const express    = require('express');
const path       = require('path');
const fs         = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dashboard')));

// ── Services & Models ─────────────────────────────────────────
const { connectDB, isConnected }  = require('./services/mongodb');
const { categorize, ALL_CATEGORIES } = require('./services/categories');
const { exportLeads }             = require('./services/excel');
const { sendEmail, testSmtp }     = require('./services/email-sender');
const { buildInitialWA, buildFollowupWA, buildInitialEmail, buildFollowupEmail, daysSince } = require('./services/ai-messages');
const ultraMsg = require('./ultramsg-sender');

// Models (require early — mongoose buffers commands until connected)
const Lead     = require('./models/Lead');
const Settings = require('./models/Settings');

// ── SSE Progress ──────────────────────────────────────────────
let sseClients = [];
function registerSSE(res) { sseClients.push(res); }
function removeSSE(res)   { sseClients = sseClients.filter(c => c !== res); }
function emit(data)       { const m = `data: ${JSON.stringify(data)}\n\n`; sseClients.forEach(c => { try { c.write(m); } catch(e){} }); }

app.get('/api/progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    registerSSE(res);
    require('./playwright-sender').registerSSE(res);
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    req.on('close', () => { removeSSE(res); require('./playwright-sender').removeSSE(res); });
});

// ── Helpers ───────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0,10); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function canSendToday(lead, type, maxPerDay = 2) {
    const dateField = type === 'wa' ? 'wa_last_date' : 'email_last_date';
    const countField = type === 'wa' ? 'wa_count' : 'email_count';
    if (lead[dateField] === todayStr()) {
        // Count messages sent today (stored in daily count via activity)
        const todayActivity = (lead.activity || []).filter(a =>
            a.type === `${type}_sent` &&
            new Date(a.date).toISOString().slice(0,10) === todayStr()
        ).length;
        if (todayActivity >= maxPerDay) return false;
    }
    return true;
}

// ── DB Status ─────────────────────────────────────────────────
app.get('/api/db-status', (req, res) => res.json({ connected: isConnected() }));

// ── Stats ─────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
    try {
        const total    = await Lead.countDocuments();
        const pending  = await Lead.countDocuments({ wa_sent: false });
        const waSent   = await Lead.countDocuments({ wa_sent: true });
        const noSite   = await Lead.countDocuments({ $or: [{ website: { $exists: false } }, { website: '' }, { website: null }] });
        const followup = await Lead.countDocuments({ next_followup: { $lte: new Date() } });
        res.json({ total, pending, waSent, noSite, followup });
    } catch(e) { res.json({ total:0, pending:0, waSent:0, noSite:0, followup:0 }); }
});

// ── GET Leads (paginated, filtered, searched) ─────────────────
app.get('/api/leads', async (req, res) => {
    try {
        const page     = parseInt(req.query.page)  || 1;
        const limit    = parseInt(req.query.limit) || 25;
        const search   = req.query.search   || '';
        const category = req.query.category || '';
        const status   = req.query.status   || '';
        const city     = req.query.city     || '';
        const sort     = req.query.sort     || '-createdAt';

        const filter = {};
        if (search) {
            const re = new RegExp(search, 'i');
            filter.$or = [{ name: re }, { phone: re }, { raw_phone: re }, { city: re }, { email: re }, { keyword: re }];
        }
        if (category) filter.category = category;
        if (status)   filter.status   = status;
        if (city)     filter.city     = new RegExp(city, 'i');

        const total = await Lead.countDocuments(filter);
        const leads = await Lead.find(filter)
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.json({ leads, total, page, pages: Math.ceil(total / limit), limit });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET Categories list ───────────────────────────────────────
app.get('/api/categories', async (req, res) => {
    try {
        const cats = await Lead.distinct('category');
        res.json(cats.sort());
    } catch(e) { res.json(ALL_CATEGORIES); }
});

// ── GET Cities list ───────────────────────────────────────────
app.get('/api/cities', async (req, res) => {
    try {
        const cities = await Lead.distinct('city');
        res.json(cities.filter(Boolean).sort());
    } catch(e) { res.json([]); }
});

// ── POST Scrape ───────────────────────────────────────────────
app.post('/api/scrape', async (req, res) => {
    const { keyword, city, max } = req.body;
    if (!keyword || !city) return res.status(400).json({ error: 'keyword and city required' });

    res.json({ success: true, message: 'Scraping started...' });

    setImmediate(async () => {
        try {
            emit({ type: 'status', message: `🔍 Scraping "${keyword}" in ${city}...` });
            const { scrapeGoogleMaps } = require('./scraper');
            const raw = await scrapeGoogleMaps(keyword, city, max || 9999);

            let added = 0, dupes = 0;
            const cat = categorize(keyword);

            for (const lead of raw) {
                try {
                    const doc = {
                        ...lead,
                        keyword,
                        category: categorize(keyword, lead.category || ''),
                        source: 'google_maps'
                    };
                    await Lead.findOneAndUpdate(
                        { $or: [
                            lead.phone ? { phone: lead.phone } : { _id: null },
                            { name: lead.name, city: lead.city || city }
                        ]},
                        { $setOnInsert: doc },
                        { upsert: true, new: false }
                    );
                    added++;
                } catch(e) {
                    if (e.code === 11000) dupes++;
                    else console.error('Lead insert error:', e.message);
                }
            }
            emit({ type: 'scrape_done', added, dupes, total: raw.length,
                message: `✅ Scrape done: ${added} new leads, ${dupes} duplicates skipped` });
        } catch(e) {
            emit({ type: 'error', message: '❌ Scrape failed: ' + e.message });
        }
    });
});

// ── DELETE one lead ───────────────────────────────────────────
app.delete('/api/leads/:id', async (req, res) => {
    try { await Lead.findByIdAndDelete(req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE all leads ──────────────────────────────────────────
app.delete('/api/leads', async (req, res) => {
    try { await Lead.deleteMany({}); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PUT Update lead ───────────────────────────────────────────
app.put('/api/leads/:id', async (req, res) => {
    try {
        const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(lead);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Import leads manually ────────────────────────────────
app.post('/api/leads/import', async (req, res) => {
    try {
        const { leads: rows } = req.body;
        if (!Array.isArray(rows)) return res.status(400).json({ error: 'leads must be array' });
        let added = 0, dupes = 0;
        for (const row of rows) {
            if (!row.name) continue;
            try {
                const doc = { ...row, source: 'manual', category: categorize(row.keyword || '', row.category || '') };
                await Lead.findOneAndUpdate(
                    row.phone ? { phone: row.phone } : { name: row.name, city: row.city },
                    { $setOnInsert: doc }, { upsert: true, new: false }
                );
                added++;
            } catch(e) { if (e.code === 11000) dupes++; }
        }
        res.json({ success: true, added, dupes });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET Export Excel ──────────────────────────────────────────
app.get('/api/leads/export', async (req, res) => {
    try {
        const leads = await Lead.find({}).lean();
        const buffer = exportLeads(leads);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="leads_${todayStr()}.xlsx"`);
        res.send(buffer);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET lead message (for manual WA sending) ──────────────────
app.get('/api/leads/:id/message', async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if(!lead) return res.status(404).json({error: 'Not found'});
        const type = req.query.type;
        let text = '';
        if(type === 'wa') text = await buildInitialWA(lead);
        else if(type === 'email') text = buildInitialEmail(lead).html;
        else if(type === 'followup_wa') text = await buildFollowupWA(lead, (lead.followup_count||0)+1);
        
        res.json({ phone: lead.phone, text });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// ── POST mark WA sent (manual) ────────────────────────────────
app.post('/api/leads/:id/mark-wa', async (req, res) => {
    try {
        const type = req.query.type || 'wa';
        const today = todayStr();
        if (type === 'wa') {
            await Lead.findByIdAndUpdate(req.params.id, {
                $set:  { wa_sent: true, wa_sent_at: new Date(), wa_last_date: today, status: 'contacted' },
                $inc:  { wa_count: 1 },
                $push: { activity: { type: 'wa_sent', message: 'Initial WA sent manually', date: new Date() } }
            });
        } else if (type === 'followup_wa') {
            const lead = await Lead.findById(req.params.id).lean();
            const followupNum = (lead.followup_count || 0) + 1;
            await Lead.findByIdAndUpdate(req.params.id, {
                $inc:  { wa_count: 1, followup_count: 1 },
                $set:  { wa_last_date: today, next_followup: new Date(Date.now() + 7*24*60*60*1000), status: 'followup' },
                $push: { activity: { type: 'wa_sent', message: `Followup #${followupNum} WA sent manually`, date: new Date() } }
            });
        }
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Send WhatsApp (Local Automation via Playwright) ──────
app.post('/api/send/wa', async (req, res) => {
    const { ids } = req.body;
    res.json({ success: true, message: 'Local WA Auto-send started!' });
    setImmediate(async () => {
        const { sendLocalWA } = require('./playwright-sender');
        await sendLocalWA(ids, false);
    });
});

// ── POST Send Follow-up (Email API + WA Local) ──────────────────────
app.post('/api/send/followup', async (req, res) => {
    const { ids, channel } = req.body; 
    res.json({ success: true, message: 'Follow-up started!' });

    setImmediate(async () => {
        if (channel === 'wa' || channel === 'both') {
            const { sendLocalWA } = require('./playwright-sender');
            await sendLocalWA(ids, true);
        }

        if (channel === 'email' || channel === 'both') {
            const today = todayStr();
            const filter = ids?.length
                ? { _id: { $in: ids } }
                : { wa_sent: true, next_followup: { $lte: new Date() } };

            const leads = await Lead.find(filter).lean();
            let sent = 0, failed = 0;

            emit({ type: 'start', total: leads.length });

            for (let i = 0; i < leads.length; i++) {
                const lead = leads[i];
                const followupNum = (lead.followup_count || 0) + 1;

                emit({ type: 'sending', current: i+1, total: leads.length, name: lead.name, sent, failed });

                let emailDone = false;

                if (lead.email) {
                    try {
                        const { subject, html } = buildFollowupEmail(lead, followupNum);
                        await sendEmail(lead.email, subject, html);
                        await Lead.findByIdAndUpdate(lead._id, {
                            $inc:  { email_count: 1 },
                            $set:  { email_sent: true, email_last_date: today },
                            $push: { activity: { type: 'email_sent', message: `Followup #${followupNum} email sent`, date: new Date() } }
                        });
                        emailDone = true;
                    } catch(e) { console.error('Followup email error:', e.message); }
                }

                if (emailDone) { sent++; emit({ type: 'sent', name: lead.name, sent, failed, total: leads.length }); }
                else { failed++; emit({ type: 'failed', name: lead.name, reason: 'No email address', sent, failed }); }
            }
            emit({ type: 'done', sent, failed, total: leads.length });
        }
    });
});

// ── Settings: GET ─────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
    try {
        const rows = await Settings.find({});
        const cfg  = {};
        rows.forEach(r => { cfg[r.key] = r.value; });
        // Mask password
        if (cfg.smtp_pass) cfg.smtp_pass = '••••••••';
        res.json({ ...cfg, ultramsg: ultraMsg.loadConfig() });
    } catch(e) { res.json({ ultramsg: ultraMsg.loadConfig() }); }
});

// ── Settings: POST ────────────────────────────────────────────
app.post('/api/settings', async (req, res) => {
    try {
        const { ultramsg: um, ...smtpFields } = req.body;
        for (const [key, value] of Object.entries(smtpFields)) {
            if (value !== undefined && value !== '••••••••') {
                await Settings.findOneAndUpdate({ key }, { value }, { upsert: true });
            }
        }
        if (um?.instanceId) ultraMsg.saveConfig(um);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Test UltraMsg ─────────────────────────────────────────────
app.post('/api/test-ultramsg', async (req, res) => {
    const cfg = ultraMsg.loadConfig();
    if (!cfg.instanceId || !cfg.token) return res.json({ success: false, error: 'Not configured' });
    const result = await ultraMsg.testConnection(cfg.instanceId, cfg.token);
    res.json(result);
});

// ── Test SMTP ─────────────────────────────────────────────────
app.post('/api/test-smtp', async (req, res) => {
    const result = await testSmtp();
    res.json(result);
});

// ── Get Follow-ups due ────────────────────────────────────────
app.get('/api/followups', async (req, res) => {
    try {
        const due = await Lead.find({
            wa_sent: true,
            $or: [
                { next_followup: { $lte: new Date() } },
                { next_followup: { $exists: false } }
            ]
        }).sort({ next_followup: 1 }).limit(100).lean();
        res.json(due);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Migrate leads.json → MongoDB ──────────────────────────────
async function migrateJson() {
    const LEADS_FILE = path.join(__dirname, 'leads.json');
    if (!fs.existsSync(LEADS_FILE)) return;
    try {
        const raw = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
        if (!raw.length) return;
        console.log(`📦 Migrating ${raw.length} leads from leads.json → MongoDB...`);
        let ok = 0;
        for (const lead of raw) {
            try {
                const doc = {
                    name: lead.name, phone: lead.phone, raw_phone: lead.raw_phone,
                    website: lead.website, rating: lead.rating ? parseFloat(lead.rating) : undefined,
                    reviews: lead.reviews ? parseInt(lead.reviews) : undefined,
                    city: lead.city, keyword: lead.keyword,
                    category: categorize(lead.keyword || '', lead.category || ''),
                    wa_sent: !!lead.wa_sent, email_sent: !!lead.email_sent,
                    source: 'google_maps'
                };
                await Lead.findOneAndUpdate(
                    lead.phone ? { phone: lead.phone } : { name: lead.name, city: lead.city },
                    { $setOnInsert: doc }, { upsert: true, new: false }
                );
                ok++;
            } catch(e) { /* skip dupes */ }
        }
        console.log(`✅ Migrated ${ok} leads. Renaming leads.json → leads.json.bak`);
        fs.renameSync(LEADS_FILE, LEADS_FILE + '.bak');
    } catch(e) { console.error('Migration error:', e.message); }
}

// ── Start ─────────────────────────────────────────────────────
const PORT = 3000;

async function start() {
    console.log('\n' + '='.repeat(52));
    console.log('  🤖  LEAD AUTOMATION CRM');
    console.log('='.repeat(52));

    const ok = await connectDB();
    if (!ok) console.log('  ⚠️  Running without MongoDB — check connection string');

    app.listen(PORT, async () => {
        console.log(`\n  ✅ http://localhost:${PORT}\n`);
        if (ok) await migrateJson();
        require('child_process').exec(`start http://localhost:${PORT}`);
    });
}

start();
