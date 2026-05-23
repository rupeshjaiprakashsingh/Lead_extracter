// ============================================================
//  index.js — Lead Automation CRM (MongoDB + UltraMsg + Email)
// ============================================================
const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const multer     = require('multer');
const XLSX       = require('xlsx');

// multer — keep file in memory (no disk write needed)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dashboard')));

// ── Services & Models ─────────────────────────────────────────
const logger = require('./services/logger');
const { connectDB, isConnected }  = require('./services/mongodb');
const { categorize, ALL_CATEGORIES } = require('./services/categories');
const { exportLeads }             = require('./services/excel');
const { sendEmail, testSmtp }     = require('./services/email-sender');
const { buildInitialWA, buildFollowupWA, buildInitialEmail, buildFollowupEmail, daysSince } = require('./services/ai-messages');
const { setTemplates } = require('./services/templates-cache');
const googleContacts = require('./services/google-contacts');
const ultraMsg = require('./ultramsg-sender');

// Models (require early — mongoose buffers commands until connected)
const Lead           = require('./models/Lead');
const Settings       = require('./models/Settings');
const Schedule       = require('./models/Schedule');
const SocialSettings = require('./models/SocialSettings');
const SocialPost     = require('./models/SocialPost');
const scheduler      = require('./services/scheduler');

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
        // Fix: include 'No Site' string AND social links AND empty
        const socialPatterns = ['facebook','instagram','whatsapp','wa.me','youtube','twitter'];
        const noSite = await Lead.countDocuments({ $or: [
            { website: { $exists: false } },
            { website: null },
            { website: '' },
            { website: 'No Site' },
            { website: { $regex: socialPatterns.join('|'), $options: 'i' } }
        ]});
        const followup = await Lead.countDocuments({ next_followup: { $lte: new Date() } });
        // Per-category breakdown
        const catAgg = await Lead.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const categoryBreakdown = catAgg.map(c => ({ name: c._id || 'Uncategorized', count: c.count }));
        res.json({ total, pending, waSent, noSite, followup, categoryBreakdown });
    } catch(e) { res.json({ total:0, pending:0, waSent:0, noSite:0, followup:0, categoryBreakdown:[] }); }
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
        const skipWaSent    = req.query.skipWaSent    === '1';
        const skipEmailSent = req.query.skipEmailSent === '1';
        const noWebsite     = req.query.noWebsite     === '1';

        const filter = {};
        if (search) {
            const re = new RegExp(search, 'i');
            filter.$or = [{ name: re }, { phone: re }, { raw_phone: re }, { city: re }, { email: re }, { keyword: re }];
        }
        if (category) filter.category = category;
        if (status)   filter.status   = status;
        if (city)     filter.city     = new RegExp(city, 'i');
        if (skipWaSent)    filter.wa_sent    = { $ne: true };
        if (skipEmailSent) filter.email_sent = { $ne: true };
        if (noWebsite) {
            // No website = empty/null OR social media links (not real business sites)
            const socialPatterns = ['facebook', 'instagram', 'whatsapp', 'wa.me', 'youtube', 'twitter'];
            filter.$or = [
                { website: { $exists: false } },
                { website: null },
                { website: '' },
                { website: 'No Site' },
                { website: { $regex: socialPatterns.join('|'), $options: 'i' } }
            ];
        }

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
    const { keyword, city, max, category } = req.body;
    if (!keyword || !city) return res.status(400).json({ error: 'keyword and city required' });

    res.json({ success: true, message: 'Scraping started...' });

    setImmediate(async () => {
        try {
            emit({ type: 'status', message: `🔍 Scraping "${keyword}" in ${city}...` });
            const { scrapeGoogleMaps } = require('./scraper');
            const raw = await scrapeGoogleMaps(keyword, city, max || 9999);

            let added = 0, dupes = 0;

            for (const lead of raw) {
                try {
                    const doc = {
                        ...lead,
                        keyword,
                        category: category && category.trim() ? category.trim() : categorize(keyword, lead.category || ''),
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

// ── POST bulk delete leads ────────────────────────────────────
app.post('/api/leads/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
        await Lead.deleteMany({ _id: { $in: ids } });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
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

// ── Helper: parse Excel buffer → lead rows ───────────────────
// Handles merged cells, multi-row records, numeric phone values
function parseExcelBuffer(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws['!ref']) return [];

    const range = XLSX.utils.decode_range(ws['!ref']);

    // Column keyword lists (lowercase)
    const NAME_KEYS    = ['party name','name','business name','company','customer name','party'];
    const ADDRESS_KEYS = ['address','location','area'];
    const PHONE_KEYS   = ['phone no','phone','mobile','contact','phone number','mobile no','ph no','ph'];
    const EMAIL_KEYS   = ['email','email id','e-mail','mail'];

    // ── Find header row & column indices ────────────────────────
    let headerRow = -1;
    let colName = -1, colAddr = -1, colPhone = -1, colEmail = -1;

    for (let R = range.s.r; R <= Math.min(range.e.r, range.s.r + 9); R++) {
        let matchCount = 0;
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
            if (!cell) continue;
            const val = String(cell.v || '').trim().toLowerCase();
            if (NAME_KEYS.some(k => val.includes(k)))    { colName  = C; matchCount++; }
            if (ADDRESS_KEYS.some(k => val.includes(k))) { colAddr  = C; matchCount++; }
            if (PHONE_KEYS.some(k => val.includes(k)))   { colPhone = C; matchCount++; }
            if (EMAIL_KEYS.some(k => val.includes(k)))   { colEmail = C; }
        }
        if (matchCount >= 2) { headerRow = R; break; }
    }

    // Fallback: first row = header
    if (headerRow === -1) {
        headerRow = range.s.r;
        colName  = range.s.c;
        colAddr  = range.s.c + 1;
        colPhone = range.s.c + 2;
        colEmail = range.s.c + 3;
    }

    // ── Walk rows, carry-forward merged-cell values ─────────────
    const leads = [];
    let lastName = '', lastAddr = '', lastEmail = '';

    const getVal = (R, C) => {
        if (C < 0) return '';
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (!cell) return '';
        // Numeric cells (Excel stores phone numbers as numbers — pad to string)
        if (cell.t === 'n') return String(Math.round(cell.v));
        return String(cell.v || '').trim();
    };

    for (let R = headerRow + 1; R <= range.e.r; R++) {
        const nameVal  = getVal(R, colName).trim();
        const addrVal  = getVal(R, colAddr).trim();
        const phoneVal = getVal(R, colPhone).trim();
        const emailVal = getVal(R, colEmail).trim();

        // Carry forward for merged / split rows
        if (nameVal)  lastName  = nameVal;
        if (addrVal)  lastAddr  = addrVal;
        if (emailVal) lastEmail = emailVal;

        // Only emit a lead when a phone number is present on this row
        if (!phoneVal) continue;
        if (!lastName && !phoneVal) continue;

        // Support "7045177925/9930822387" — create one lead per number
        const phoneParts = phoneVal.split(/[/,]/).map(p => p.replace(/\D/g, '').trim()).filter(p => p.length >= 7);
        if (!phoneParts.length) continue;

        for (const raw_phone of phoneParts) {
            const phone = raw_phone.length === 10 ? '91' + raw_phone : raw_phone;

            let city = '';
            if (lastAddr) {
                const parts = lastAddr.split(/[,()]/);
                city = (parts[parts.length - 1] || parts[0] || '').trim();
            }

            leads.push({
                name:     lastName || 'Unknown',
                address:  lastAddr,
                city,
                raw_phone,
                phone,
                email:    lastEmail || '',
                source:   'excel_import'
            });
        }
    }

    return leads;
}

// ── POST Import Excel (preview) ───────────────────────────────
app.post('/api/leads/import-excel/preview', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const rows = parseExcelBuffer(req.file.buffer);
        res.json({ rows, total: rows.length });
    } catch(e) { res.status(500).json({ error: 'Failed to parse file: ' + e.message }); }
});

// ── POST Import Excel (save) ───────────────────────────────────
app.post('/api/leads/import-excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const rows   = parseExcelBuffer(req.file.buffer);
        const category = req.body.category || 'Excel Import';
        let added = 0, dupes = 0, skipped = 0;

        for (const row of rows) {
            if (!row.name && !row.phone) { skipped++; continue; }
            try {
                const doc = { ...row, keyword: category, category };
                const filter = row.phone
                    ? { phone: row.phone }
                    : { name: row.name, city: row.city };
                await Lead.findOneAndUpdate(filter, { $setOnInsert: doc }, { upsert: true, new: false });
                added++;
            } catch(e) { if (e.code === 11000) dupes++; else console.error(e.message); }
        }
        res.json({ success: true, added, dupes, skipped, total: rows.length });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET Export Excel ──────────────────────────────────────────
app.get('/api/leads/export', async (req, res) => {
    try {
        const { category } = req.query;
        const filter = {};
        if (category) filter.category = category;
        const leads = await Lead.find(filter).lean();
        const buffer = exportLeads(leads);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="leads_${category ? category + '_' : ''}${todayStr()}.xlsx"`);
        res.send(buffer);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET Contact Sync Stats ────────────────────────────────────
app.get('/api/contacts/stats', async (req, res) => {
    try {
        const { category } = req.query;
        const totalFilter = { phone: { $exists: true, $ne: '' } };
        const savedFilter = { phone: { $exists: true, $ne: '' }, contact_saved: true };
        if (category) {
            totalFilter.category = category;
            savedFilter.category = category;
        }
        const total   = await Lead.countDocuments(totalFilter);
        const saved   = await Lead.countDocuments(savedFilter);
        const pending = total - saved;
        res.json({ total, saved, pending });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Mark contacts as saved (specific IDs) ───────────────
app.post('/api/contacts/mark-saved', async (req, res) => {
    try {
        const { ids } = req.body;
        const filter = ids?.length
            ? { _id: { $in: ids } }
            : { contact_saved: { $ne: true }, phone: { $exists: true, $ne: '' } };
        const result = await Lead.updateMany(filter, {
            $set: { contact_saved: true, contact_saved_at: new Date() }
        });
        res.json({ success: true, marked: result.modifiedCount });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Mark ALL leads as saved (one-time fix when user already imported) ─
app.post('/api/contacts/mark-all-saved', async (req, res) => {
    try {
        const result = await Lead.updateMany(
            { phone: { $exists: true, $ne: '' } },
            { $set: { contact_saved: true, contact_saved_at: new Date() } }
        );
        console.log(`✅ Marked all ${result.modifiedCount} leads as contact_saved=true`);
        res.json({ success: true, marked: result.modifiedCount });
    } catch(e) { res.status(500).json({ error: e.message }); }
});



// ── GET Export VCard — ALL leads (no dedup) ───────────────────
app.get('/api/leads/export-vcf', async (req, res) => {
    try {
        const { category } = req.query;
        const filter = { phone: { $exists: true, $ne: '' } };
        if (category) filter.category = category;
        const leads = await Lead.find(filter).lean();
        res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="all_contacts_${category ? category + '_' : ''}${todayStr()}.vcf"`);
        res.send(buildVcf(leads));
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Export VCard — SMART (new only, auto-marks as saved server-side) ─
app.post('/api/leads/export-vcf', async (req, res) => {
    try {
        const { ids, newOnly, category } = req.body;

        let filter;
        if (ids?.length) {
            filter = { _id: { $in: ids }, phone: { $exists: true, $ne: '' } };
        } else {
            filter = { phone: { $exists: true, $ne: '' } };
            if (newOnly) filter.contact_saved = { $ne: true };
            if (category) filter.category = category;
        }

        const leads = await Lead.find(filter).lean();

        if (!leads.length) {
            return res.status(200)
                .setHeader('Content-Type', 'text/vcard; charset=utf-8')
                .send('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:No New Contacts\r\nNOTE:All contacts already saved\r\nEND:VCARD\r\n');
        }

        // ✅ Mark as saved SERVER-SIDE immediately (guaranteed, no header size limit)
        if (newOnly) {
            const exportedIds = leads.map(l => l._id);
            await Lead.updateMany(
                { _id: { $in: exportedIds } },
                { $set: { contact_saved: true, contact_saved_at: new Date() } }
            );
        }

        res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="new_contacts_${todayStr()}.vcf"`);
        res.setHeader('X-Exported-Count', leads.length);
        res.setHeader('Access-Control-Expose-Headers', 'X-Exported-Count');
        res.send(buildVcf(leads));
    } catch(e) { res.status(500).json({ error: e.message }); }
});




// ── Helper: build .vcf string ─────────────────────────────────
function buildVcf(leads) {
    return leads.map(lead => {
        const name     = (lead.name || 'Unknown').replace(/[\\n\\r;]/g, ' ').trim();
        const phone    = lead.phone   || lead.raw_phone || '';
        const city     = lead.city    || '';
        const address  = lead.address || '';
        const email    = lead.email   || '';
        const category = lead.category || lead.keyword || '';

        // Phone in E.164 format
        const e164 = phone.startsWith('+') ? phone : '+' + phone;

        let card = `BEGIN:VCARD\r\nVERSION:3.0\r\n`;
        card += `FN:${name}\r\n`;
        card += `N:${name};;;;\r\n`;
        if (e164) card += `TEL;TYPE=CELL:${e164}\r\n`;
        if (email) card += `EMAIL;TYPE=WORK:${email}\r\n`;
        if (address || city) {
            const adr = [address, city, 'India'].filter(Boolean).join(', ');
            card += `ADR;TYPE=WORK:;;${adr};;;;\r\n`;
        }
        if (category) card += `ORG:${name};${category}\r\n`;
        card += `NOTE:Lead from Innvoque CRM\r\n`;
        card += `END:VCARD\r\n`;
        return card;
    }).join('\r\n');
}

// ── GET lead message (for manual WA sending) ──────────────────
app.get('/api/leads/:id/message', async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if(!lead) return res.status(404).json({error: 'Not found'});
        const type = req.query.type;
        let text = '';
        if(type === 'wa') text = await buildInitialWA(lead);
        else if(type === 'email') text = (await buildInitialEmail(lead)).html;
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
    const { ids, skipWaSent } = req.body;
    res.json({ success: true, message: 'Local WA Auto-send started!' });
    setImmediate(async () => {
        const { sendLocalWA } = require('./playwright-sender');
        await sendLocalWA(ids, false, { skipWaSent: !!skipWaSent });
    });
});

// ── POST Send WA — DRAFT mode (pre-fill all, user sends) ────────────────────
app.post('/api/send/wa-draft', async (req, res) => {
    const { ids, skipWaSent } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No leads selected' });
    res.json({ success: true, message: '📝 Draft mode started — WhatsApp will open and pre-fill all messages!' });
    setImmediate(async () => {
        const { sendLocalWA_Draft } = require('./playwright-sender');
        await sendLocalWA_Draft(ids, false, { skipWaSent: !!skipWaSent });
    });
});

// ── POST Send WA — MANUAL mode (user clicks send one by one) ──────────────
app.post('/api/send/wa-manual', async (req, res) => {
    const { ids, skipWaSent } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No leads selected' });
    res.json({ success: true, message: '👆 Manual WA mode started — WhatsApp will open. Click Send for each lead!' });
    setImmediate(async () => {
        const { sendLocalWA_Manual } = require('./playwright-sender');
        await sendLocalWA_Manual(ids, false, { skipWaSent: !!skipWaSent });
    });
});

// ── POST Send Initial Email ─────────────────────────────────────────
app.post('/api/send/email', async (req, res) => {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    res.json({ success: true, message: 'Email sending started!' });

    setImmediate(async () => {
        try {
            const leads = await Lead.find({ _id: { $in: ids } }).lean();
            let sent = 0, failed = 0, skipped = 0;
            emit({ type: 'start', total: leads.length });

            for (let i = 0; i < leads.length; i++) {
                const lead = leads[i];
                emit({ type: 'sending', current: i+1, total: leads.length, name: lead.name, sent, failed });

                // Skip leads with no email — don't count as failure
                if (!lead.email || !lead.email.trim()) {
                    skipped++;
                    failed++;
                    emit({ type: 'failed', name: lead.name,
                        reason: '⚠️ No email address — use "Extract Emails" button first to find emails from their website',
                        sent, failed });
                    continue;
                }

                try {
                    const { subject, html } = await buildInitialEmail(lead);
                    await sendEmail(lead.email, subject, html);
                    await Lead.findByIdAndUpdate(lead._id, {
                        $inc:  { email_count: 1 },
                        $set:  { email_sent: true, email_last_date: todayStr() },
                        $push: { activity: { type: 'email_sent', message: 'Initial email sent', date: new Date() } }
                    });
                    sent++;
                    emit({ type: 'sent', name: lead.name, sent, failed, total: leads.length });
                } catch(e) {
                    failed++;
                    // Friendly error messages
                    let reason = e.message || 'Unknown error';
                    if (reason.includes('535') || reason.includes('Invalid login') || reason.includes('Username and Password')) {
                        reason = '❌ SMTP Auth failed — wrong App Password. Go to Settings → Test SMTP to fix.';
                    } else if (reason.includes('not configured') || reason.includes('SMTP')) {
                        reason = '❌ SMTP not configured — go to Settings tab and save your Gmail + App Password, then click Test SMTP.';
                    } else if (reason.includes('ECONNREFUSED') || reason.includes('ETIMEDOUT')) {
                        reason = '❌ Cannot connect to SMTP server — check Host/Port in Settings.';
                    } else if (reason.includes('ENOTFOUND')) {
                        reason = '❌ SMTP host not found — check the SMTP Host in Settings.';
                    }
                    console.error('Email send error for', lead.name, ':', e.message);
                    emit({ type: 'failed', name: lead.name, reason, sent, failed });
                }
            }

            const summary = skipped > 0
                ? `Sent: ${sent}, Failed: ${failed - skipped} errors, ${skipped} had no email (use Extract Emails first)`
                : `Sent: ${sent}, Failed: ${failed}`;
            emit({ type: 'done', sent, failed, total: leads.length, message: summary });
        } catch(e) {
            emit({ type: 'error', message: 'Failed to send emails: ' + e.message });
        }
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

// ── POST Extract Emails from Websites ──────────────────────────────────
app.post('/api/leads/extract-emails', async (req, res) => {
    const { ids } = req.body;
    res.json({ success: true, message: 'Email extraction started...' });
    setImmediate(async () => {
        const { extractEmailsForLeads } = require('./services/email-extractor');
        try {
            await extractEmailsForLeads(ids, (progress) => {
                if (progress.type === 'start') {
                    emit({ type: 'start', total: progress.total });
                    emit({ type: 'status', message: `🌐 Extracting emails from ${progress.total} websites...` });
                } else if (progress.type === 'status') {
                    emit({ type: 'sending', current: progress.current, total: progress.total, name: progress.name, sent: progress.current - 1, failed: 0 }); 
                } else if (progress.type === 'success') {
                    emit({ type: 'sent', name: progress.name + ` (${progress.email})`, sent: progress.extracted, failed: progress.failed, total: progress.total });
                } else if (progress.type === 'failed') {
                    emit({ type: 'failed', name: progress.name, reason: progress.reason, sent: progress.extracted || 0, failed: progress.failed || 0 });
                } else if (progress.type === 'done') {
                    emit({ type: 'done', sent: progress.extracted, failed: progress.failed, total: progress.total, message: `✅ Extracted ${progress.extracted} emails.` });
                }
            });
        } catch(e) {
            emit({ type: 'error', message: '❌ Extraction failed: ' + e.message });
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
        logger.log(`Received POST settings updates: ${Object.keys(smtpFields).join(', ')}`, 'SETTINGS');
        for (const [key, value] of Object.entries(smtpFields)) {
            if (value !== undefined) {
                // Safeguard against browser autofill or UI mask overwriting valid password
                if (key === 'smtp_pass') {
                    if (value === '••••••••' || value.includes('•') || value.includes('●') || value.includes('*')) {
                        logger.log(`Skipping saving smtp_pass because value looks like a masked placeholder: "${value}"`, 'SETTINGS');
                        continue;
                    }
                    if (!value.trim()) {
                        logger.log(`Skipping saving smtp_pass because value is empty`, 'SETTINGS');
                        continue;
                    }
                }
                
                logger.log(`Saving setting: ${key}`, 'SETTINGS');
                await Settings.findOneAndUpdate({ key }, { value }, { upsert: true });
            }
        }
        if (um?.instanceId) {
            logger.log(`Saving UltraMsg config`, 'SETTINGS');
            ultraMsg.saveConfig(um);
        }
        // ── Refresh message-templates cache ───────────────────────
        await loadTemplatesCache();
        // ── Refresh Google OAuth credentials if provided ─────────────
        await loadGoogleCredentials();
        res.json({ success: true });
    } catch(e) {
        logger.error(`Error saving settings`, e);
        res.status(500).json({ error: e.message });
    }
});

// ── Test UltraMsg ─────────────────────────────────────────────
app.post('/api/test-ultramsg', async (req, res) => {
    const cfg = ultraMsg.loadConfig();
    if (!cfg.instanceId || !cfg.token) return res.json({ success: false, error: 'Not configured' });
    const result = await ultraMsg.testConnection(cfg.instanceId, cfg.token);
    res.json(result);
});

// ── Test SMTP (accepts inline creds OR reads from DB) ─────────
app.post('/api/test-smtp', async (req, res) => {
    const { host, port, secure, user, pass } = req.body || {};
    // If all credentials supplied inline, test them directly (no save needed)
    if (host && user && pass) {
        const { createTransportDirect } = require('./services/email-sender');
        try {
            logger.log(`Testing inline SMTP configuration for user: ${user}`, 'SMTP_TEST');
            const t = createTransportDirect({ host, port, secure, user, pass });
            await t.verify();
            logger.log(`Inline SMTP verification successful for user: ${user}`, 'SMTP_TEST');
            res.json({ success: true, message: '✅ SMTP Connected!' });
        } catch(e) {
            logger.error(`Inline SMTP verification failed for user: ${user}`, e);
            let msg = e.message;
            if (msg.includes('535') || msg.includes('Username and Password') || msg.includes('Invalid login')) {
                msg = 'Wrong App Password. Go to myaccount.google.com/apppasswords and create a new 16-character App Password (NOT your Gmail login password).';
            } else if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
                msg = 'Cannot connect to SMTP server — check Host and Port.';
            } else if (msg.includes('SSL') || msg.includes('wrong version') || msg.includes('WRONG_VERSION')) {
                msg = 'SSL/TLS mismatch. For port 587 use "No (TLS/STARTTLS)"; for port 465 use "Yes (SSL)".';
            }
            res.json({ success: false, error: msg });
        }
    } else {
        const result = await testSmtp();
        res.json(result);
    }
});

// ── GET logs ──────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
    try {
        const logPath = logger.logFilePath;
        if (!fs.existsSync(logPath)) {
            return res.send('No logs recorded yet.');
        }
        const logs = fs.readFileSync(logPath, 'utf8');
        res.send(logs);
    } catch(e) {
        res.status(500).send('Failed to read logs: ' + e.message);
    }
});

// ── DELETE logs ───────────────────────────────────────────────
app.delete('/api/logs', (req, res) => {
    try {
        const logPath = logger.logFilePath;
        if (fs.existsSync(logPath)) {
            fs.writeFileSync(logPath, '', 'utf8'); // clear file
        }
        logger.log('Logs cleared by user request.', 'SYSTEM');
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: 'Failed to clear logs: ' + e.message });
    }
});

// ── Schedule: GET ───────────────────────────────────────────────
app.get('/api/schedule', async (req, res) => {
    try {
        let s = await Schedule.findOne({});
        if (!s) s = await Schedule.create({});
        res.json({ ...s.toObject(), categories_list: ALL_CATEGORIES });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Schedule: POST (save) ────────────────────────────────────
app.post('/api/schedule', async (req, res) => {
    try {
        const { enabled, categories, daily_limit, skip_sent, allow_resend,
                morning_hour, evening_hour, report_email } = req.body;
        const s = await Schedule.findOneAndUpdate(
            {},
            { enabled, categories, daily_limit: parseInt(daily_limit) || 60,
              skip_sent, allow_resend, morning_hour: parseInt(morning_hour) || 10,
              evening_hour: parseInt(evening_hour) || 16, report_email },
            { upsert: true, new: true }
        );
        // Restart cron with new settings
        scheduler.startScheduler(s);
        res.json({ success: true, schedule: s });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Schedule: Run Now (manual trigger) ──────────────────────────
app.post('/api/schedule/run-now', async (req, res) => {
    if (scheduler.isRunning()) {
        return res.json({ success: false, error: 'Already sending — please wait for current batch to finish' });
    }
    res.json({ success: true, message: 'Scheduled batch started! WhatsApp window will open shortly.' });
    setImmediate(() => {
        scheduler.runScheduledSend('manual').catch(e => console.error('Run-now error:', e.message));
    });
});

// ── Schedule: Test Daily Report Email ────────────────────────
app.post('/api/schedule/test-report', async (req, res) => {
    try {
        await scheduler.sendDailyReport();
        res.json({ success: true, message: 'Test report sent!' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Schedule: Status ─────────────────────────────────────────────
app.get('/api/schedule/status', async (req, res) => {
    try {
        const s = await Schedule.findOne({});
        res.json({
            enabled:     s?.enabled || false,
            today_sent:  s?.today_sent || 0,
            today_failed:s?.today_failed || 0,
            daily_limit: s?.daily_limit || 60,
            last_run:    s?.last_run,
            is_running:  scheduler.isRunning()
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Social Poster: GET Settings ──────────────────────────────
app.get('/api/social/settings', async (req, res) => {
    try {
        let s = await SocialSettings.findOne({});
        if (!s) s = await SocialSettings.create({});
        
        const settingsObj = s.toObject();
        // Mask passwords/tokens
        if (settingsObj.channels) {
            for (const ch of Object.keys(settingsObj.channels)) {
                if (settingsObj.channels[ch].token) {
                    settingsObj.channels[ch].token = '••••••••';
                }
                if (settingsObj.channels[ch].apiKey) {
                    settingsObj.channels[ch].apiKey = '••••••••';
                }
            }
        }
        res.json(settingsObj);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Social Poster: SAVE Settings ─────────────────────────────
app.post('/api/social/settings', async (req, res) => {
    try {
        const { enabled, frequency, time_hour, website_url, topic, title, custom_content, channels } = req.body;
        let s = await SocialSettings.findOne({});
        if (!s) s = new SocialSettings({});

        s.enabled = !!enabled;
        s.frequency = frequency || 'daily';
        s.time_hour = parseInt(time_hour) || 10;
        s.website_url = website_url || '';
        s.topic = topic || '';
        s.title = title || '';
        s.custom_content = custom_content || '';

        if (channels) {
            for (const [ch, config] of Object.entries(channels)) {
                if (!s.channels[ch]) s.channels[ch] = {};
                s.channels[ch].enabled = !!config.enabled;
                
                if (config.token !== undefined && config.token !== '••••••••') {
                    s.channels[ch].token = config.token;
                }
                if (config.pageId !== undefined) {
                    s.channels[ch].pageId = config.pageId;
                }
                if (config.accountId !== undefined) {
                    s.channels[ch].accountId = config.accountId;
                }
                if (config.urn !== undefined) {
                    s.channels[ch].urn = config.urn;
                }
                if (config.apiKey !== undefined && config.apiKey !== '••••••••') {
                    s.channels[ch].apiKey = config.apiKey;
                }
                if (config.boardId !== undefined) {
                    s.channels[ch].boardId = config.boardId;
                }
            }
        }

        await s.save();
        scheduler.startSocialScheduler();
        res.json({ success: true, settings: s });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Social Poster: GET Recent Posts ──────────────────────────
app.get('/api/social/posts', async (req, res) => {
    try {
        const posts = await SocialPost.find({}).sort({ createdAt: -1 }).limit(100).lean();
        res.json(posts);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Social Poster: Generate Preview ──────────────────────────
app.post('/api/social/generate-preview', async (req, res) => {
    try {
        const { website_url, topic, title, custom_content } = req.body;
        if (!website_url) return res.status(400).json({ error: 'Website URL is required' });
        
        const { scrapeWebsite, generateSocialPosts } = require('./services/social-poster');
        const webData = await scrapeWebsite(website_url);
        const posts = await generateSocialPosts(webData, topic, title, custom_content);
        res.json({ success: true, posts, webData });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Social Poster: Post Now (Trigger Instant Simulation) ─────
app.post('/api/social/post-now', async (req, res) => {
    try {
        const { website_url, topic, title, custom_content } = req.body;
        const { scrapeWebsite, generateSocialPosts, postToSocial } = require('./services/social-poster');
        
        let settings = await SocialSettings.findOne({});
        if (!settings) {
            return res.status(400).json({ error: 'Please save settings first before running immediate post.' });
        }

        // Use request body inputs as temporary overrides if provided
        const webUrl = website_url || settings.website_url;
        if (!webUrl) return res.status(400).json({ error: 'Website URL is required' });
        
        const tempSettings = {
            website_url: webUrl,
            topic: topic || settings.topic,
            title: title || settings.title,
            custom_content: custom_content || settings.custom_content,
            channels: settings.channels
        };

        const webData = await scrapeWebsite(webUrl);
        const posts = await generateSocialPosts(webData, tempSettings.topic, tempSettings.title, tempSettings.custom_content);
        const postDoc = await postToSocial(posts, tempSettings);
        
        res.json({ success: true, post: postDoc });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Google OAuth Status ─────────────────────────────────────
app.get('/api/google-status', (req, res) => {
    res.json({ authorized: googleContacts.isAuthorized() });
});

// ── Google OAuth — Redirect to consent screen ─────────────────
app.get('/auth/google', (req, res) => {
    const url = googleContacts.getAuthUrl();
    if (!url) return res.status(400).send('Google OAuth not configured. Add Client ID & Secret in Settings first.');
    res.redirect(url);
});

// ── Google OAuth Callback ─────────────────────────────────
app.get('/auth/google/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('No authorization code received.');
    try {
        await googleContacts.exchangeCode(code, Settings);
        res.send(`
            <html><body style="font-family:Arial;text-align:center;padding:60px;background:#0f172a;color:#e2e8f0">
            <div style="font-size:48px">✅</div>
            <h2 style="color:#34d399">Google Contacts Connected!</h2>
            <p>Your account is now linked. Contacts will be saved automatically before each WhatsApp message.</p>
            <p><a href="/" style="color:#60a5fa">← Back to CRM</a></p>
            </body></html>
        `);
    } catch(e) {
        res.status(500).send('OAuth error: ' + e.message);
    }
});

// ── Bulk sync contacts to Google ─────────────────────────────
app.post('/api/contacts/sync', async (req, res) => {
    const { ids } = req.body;
    if (!googleContacts.isAuthorized()) {
        return res.status(401).json({ error: 'Google not connected. Go to Settings → Connect Google.' });
    }
    res.json({ success: true, message: 'Contact sync started...' });

    setImmediate(async () => {
        const filter = ids?.length
            ? { _id: { $in: ids } }
            : { contact_saved: { $ne: true }, phone: { $exists: true, $ne: '' } };

        const leads = await Lead.find(filter).lean();
        emit({ type: 'start', total: leads.length });
        emit({ type: 'status', message: `📒 Syncing ${leads.length} contacts to Google Contacts...` });

        const { saved, skipped, failed } = await googleContacts.saveContactsBatch(leads, (progress) => {
            if (progress.type === 'saved') {
                emit({ type: 'sent', name: progress.name, sent: progress.saved, failed: progress.failed, total: leads.length });
                // Mark in DB
                Lead.findOneAndUpdate(
                    { name: progress.name },
                    { $set: { contact_saved: true, contact_saved_at: new Date() } }
                ).catch(() => {});
            } else if (progress.type === 'fail') {
                emit({ type: 'failed', name: progress.name, reason: progress.reason, sent: progress.saved || 0, failed: progress.failed || 0 });
            } else if (progress.type === 'skip') {
                emit({ type: 'skipped', name: progress.name, reason: progress.reason });
            }
        });

        emit({ type: 'done', sent: saved, failed, total: leads.length,
            message: `✅ Sync complete: ${saved} saved, ${skipped} skipped, ${failed} failed` });
    });
});

// ── Get Follow-up leads (from followup_queue) ────────────────
app.get('/api/followups', async (req, res) => {
    try {
        const search   = req.query.search   || '';
        const status   = req.query.status   || '';
        const filter   = { followup_queued: true };
        if (search) {
            const re = new RegExp(search, 'i');
            filter.$or = [{ name: re }, { phone: re }, { raw_phone: re }, { email: re }, { city: re }];
        }
        if (status) filter.status = status;
        const leads = await Lead.find(filter)
            .sort({ followup_scheduled_at: 1, createdAt: -1 })
            .limit(200).lean();
        res.json(leads);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Add lead to follow-up queue ──────────────────────────
app.post('/api/leads/:id/add-followup', async (req, res) => {
    try {
        const { note, scheduled_at } = req.body;
        const update = {
            followup_queued: true,
            followup_note: note || '',
            followup_scheduled_at: scheduled_at ? new Date(scheduled_at) : new Date(),
            status: 'followup'
        };
        const lead = await Lead.findByIdAndUpdate(req.params.id,
            { $set: update, $push: { activity: { type: 'followup', message: note || 'Added to follow-up queue', date: new Date() } } },
            { new: true }
        );
        if (!lead) return res.status(404).json({ error: 'Lead not found' });
        res.json({ success: true, lead });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE Remove lead from follow-up queue ───────────────────
app.delete('/api/leads/:id/remove-followup', async (req, res) => {
    try {
        await Lead.findByIdAndUpdate(req.params.id, {
            $set: { followup_queued: false, followup_note: '', followup_scheduled_at: null },
            $push: { activity: { type: 'followup', message: 'Removed from follow-up queue', date: new Date() } }
        });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Send follow-up WA (draft) from follow-up queue ───────
app.post('/api/leads/:id/followup-send-wa', async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id).lean();
        if (!lead) return res.status(404).json({ error: 'Lead not found' });
        res.json({ success: true, message: 'Follow-up WA draft started!' });
        setImmediate(async () => {
            const { sendLocalWA_Draft } = require('./playwright-sender');
            await sendLocalWA_Draft([req.params.id], true, { skipWaSent: false });
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Send follow-up Email from follow-up queue ────────────
app.post('/api/leads/:id/followup-send-email', async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id).lean();
        if (!lead) return res.status(404).json({ error: 'Lead not found' });
        if (!lead.email) return res.status(400).json({ error: 'No email address for this lead' });
        const followupNum = (lead.followup_count || 0) + 1;
        const { subject, html } = buildFollowupEmail(lead, followupNum);
        await sendEmail(lead.email, subject, html);
        await Lead.findByIdAndUpdate(lead._id, {
            $inc:  { email_count: 1, followup_count: 1 },
            $set:  { email_sent: true, email_last_date: todayStr() },
            $push: { activity: { type: 'email_sent', message: `Follow-up #${followupNum} email sent`, date: new Date() } }
        });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Bulk send follow-up WA (draft) ───────────────────────
app.post('/api/followups/send-wa', async (req, res) => {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    res.json({ success: true, message: 'Follow-up WA draft started for selected leads!' });
    setImmediate(async () => {
        const { sendLocalWA_Draft } = require('./playwright-sender');
        await sendLocalWA_Draft(ids, true, { skipWaSent: false });
    });
});

// ── POST Bulk send follow-up Emails ───────────────────────────
app.post('/api/followups/send-email', async (req, res) => {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    res.json({ success: true, message: 'Follow-up emails started!' });
    setImmediate(async () => {
        const leads = await Lead.find({ _id: { $in: ids } }).lean();
        let sent = 0, failed = 0;
        emit({ type: 'start', total: leads.length });
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            emit({ type: 'sending', current: i+1, total: leads.length, name: lead.name, sent, failed });
            if (!lead.email) { failed++; emit({ type: 'failed', name: lead.name, reason: 'No email', sent, failed }); continue; }
            try {
                const followupNum = (lead.followup_count || 0) + 1;
                const { subject, html } = buildFollowupEmail(lead, followupNum);
                await sendEmail(lead.email, subject, html);
                await Lead.findByIdAndUpdate(lead._id, {
                    $inc: { email_count: 1, followup_count: 1 },
                    $set: { email_sent: true, email_last_date: todayStr() },
                    $push: { activity: { type: 'email_sent', message: `Follow-up #${followupNum} email sent`, date: new Date() } }
                });
                sent++; emit({ type: 'sent', name: lead.name, sent, failed, total: leads.length });
            } catch(e) { failed++; emit({ type: 'failed', name: lead.name, reason: e.message, sent, failed }); }
        }
        emit({ type: 'done', sent, failed, total: leads.length });
    });
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

// ── Load message templates from DB into memory cache ────────────
async function loadTemplatesCache() {
    try {
        const rows = await Settings.find({ key: { $in: ['wa_template','email_subject','email_body'] } });
        const obj  = {};
        rows.forEach(r => { obj[r.key] = r.value; });
        setTemplates(obj);
        console.log('  📝 Message templates loaded into cache');
    } catch(e) { console.log('  ⚠️  Could not load templates:', e.message); }
}

// ── Load Google OAuth credentials from DB and restore tokens ────
async function loadGoogleCredentials() {
    try {
        const rows = await Settings.find({ key: { $in: ['google_client_id','google_client_secret'] } });
        const cfg  = {};
        rows.forEach(r => { cfg[r.key] = r.value; });
        if (cfg.google_client_id && cfg.google_client_secret) {
            googleContacts.setupCredentials({
                client_id:     cfg.google_client_id,
                client_secret: cfg.google_client_secret,
                redirect_uri:  `http://localhost:3000/auth/google/callback`
            });
            const hasTokens = await googleContacts.loadTokens(Settings);
            console.log('  📲 Google Contacts:', hasTokens ? '✅ Connected' : '⚠️ Not authorized yet');
        } else {
            console.log('  📲 Google Contacts: Not configured (add credentials in Settings)');
        }
    } catch(e) { console.log('  ⚠️  Google credentials load error:', e.message); }
}

// ── Start ────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3000;

async function start() {
    console.log('\n' + '='.repeat(52));
    console.log('  🤖  LEAD AUTOMATION CRM');
    console.log('='.repeat(52));

    const ok = await connectDB();
    if (!ok) console.log('  ⚠️  Running without MongoDB — check connection string');

    app.listen(PORT, async () => {
        console.log(`\n  ✅ http://localhost:${PORT}\n`);
        if (ok) {
            await migrateJson();
            await loadTemplatesCache();
            await loadGoogleCredentials();
            // ── Start scheduler from saved settings ──────────────────────
            const savedSchedule = await Schedule.findOne({});
            if (savedSchedule) scheduler.startScheduler(savedSchedule);

            // ── Start social poster scheduler ───────────────────────────
            scheduler.startSocialScheduler();
        }
        if (PORT === 3000 && !process.env.NO_BROWSER) require('child_process').exec(`start http://localhost:${PORT}`);
    });
}

start();
