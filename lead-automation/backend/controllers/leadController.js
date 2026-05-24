// ============================================================
//  controllers/leadController.js — Multi-tenant lead management
//  All existing features ported with companyId isolation
// ============================================================
const path     = require('path');
const XLSX     = require('xlsx');
const Lead     = require('../models/Lead');
const Company  = require('../models/Company');
const Settings = require('../models/Settings');
const { categorize, ALL_CATEGORIES } = require('../../services/categories');
const { exportLeads }      = require('../../services/excel');
const { buildInitialWA, buildFollowupWA, buildInitialEmail, buildFollowupEmail } = require('../../services/ai-messages');
const { setTemplates }     = require('../../services/templates-cache');

function todayStr() { return new Date().toISOString().slice(0, 10); }

// ── GET /api/leads/stats ─────────────────────────────────────
exports.getStats = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const total    = await Lead.countDocuments({ companyId });
    const pending  = await Lead.countDocuments({ companyId, wa_sent: false });
    const waSent   = await Lead.countDocuments({ companyId, wa_sent: true });
    const emailSent = await Lead.countDocuments({ companyId, email_sent: true });
    const socialPats = ['facebook','instagram','whatsapp','wa.me','youtube','twitter'];
    const noSite   = await Lead.countDocuments({
      companyId,
      $or: [
        { website: { $exists: false } }, { website: null }, { website: '' },
        { website: 'No Site' },
        { website: { $regex: socialPats.join('|'), $options: 'i' } }
      ]
    });
    const followup = await Lead.countDocuments({ companyId, next_followup: { $lte: new Date() } });

    const catAgg = await Lead.aggregate([
      { $match: { companyId: require('mongoose').Types.ObjectId.createFromHexString(companyId.toString()) } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 }
    ]);
    const categoryBreakdown = catAgg.map(c => ({ name: c._id || 'Uncategorized', count: c.count }));

    res.json({ success: true, data: { total, pending, waSent, emailSent, noSite, followup, categoryBreakdown } });
  } catch (err) { next(err); }
};

// ── GET /api/leads ───────────────────────────────────────────
exports.getLeads = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
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
    const followupOnly  = req.query.followupOnly  === '1';

    const filter = { companyId };
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { phone: re }, { raw_phone: re }, { city: re }, { email: re }, { keyword: re }];
    }
    if (category)   filter.category = category;
    if (status)     filter.status   = status;
    if (city)       filter.city     = new RegExp(city, 'i');
    if (skipWaSent)     filter.wa_sent    = { $ne: true };
    if (skipEmailSent)  filter.email_sent = { $ne: true };
    if (followupOnly)   filter.followup_queued = true;
    if (noWebsite) {
      const sp = ['facebook','instagram','whatsapp','wa.me','youtube','twitter'];
      filter.$or = [
        { website: { $exists: false } }, { website: null }, { website: '' },
        { website: 'No Site' }, { website: { $regex: sp.join('|'), $options: 'i' } }
      ];
    }

    const total = await Lead.countDocuments(filter);
    const leads = await Lead.find(filter).sort(sort).skip((page-1)*limit).limit(limit).lean();

    res.json({ success: true, data: { leads, total, page, pages: Math.ceil(total/limit), limit } });
  } catch (err) { next(err); }
};

// ── GET /api/leads/categories ────────────────────────────────
exports.getCategories = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const cats = await Lead.distinct('category', { companyId });
    res.json({ success: true, data: cats.filter(Boolean).sort() });
  } catch (err) { res.json({ success: true, data: ALL_CATEGORIES }); }
};

// ── GET /api/leads/cities ────────────────────────────────────
exports.getCities = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const cities = await Lead.distinct('city', { companyId });
    res.json({ success: true, data: cities.filter(Boolean).sort() });
  } catch (err) { res.json({ success: true, data: [] }); }
};

// ── POST /api/leads (create single) ─────────────────────────
exports.createLead = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const userId    = req.user._id;
    const lead = await Lead.create({ ...req.body, companyId, userId, source: req.body.source || 'manual' });
    await Company.findByIdAndUpdate(companyId, { $inc: { 'usage.leadCount': 1 } });
    res.status(201).json({ success: true, data: lead });
  } catch (err) { next(err); }
};

// ── PUT /api/leads/:id ───────────────────────────────────────
exports.updateLead = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const lead = await Lead.findOneAndUpdate({ _id: req.params.id, companyId }, req.body, { new: true });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) { next(err); }
};

// ── DELETE /api/leads/:id ────────────────────────────────────
exports.deleteLead = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const lead = await Lead.findOneAndDelete({ _id: req.params.id, companyId });
    if (lead) await Company.findByIdAndUpdate(companyId, { $inc: { 'usage.leadCount': -1 } });
    res.json({ success: true });
  } catch (err) { next(err); }
};

// ── DELETE /api/leads (all) ──────────────────────────────────
exports.deleteAllLeads = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const result = await Lead.deleteMany({ companyId });
    await Company.findByIdAndUpdate(companyId, { 'usage.leadCount': 0 });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) { next(err); }
};

// ── POST /api/leads/bulk-delete ──────────────────────────────
exports.bulkDelete = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ success: false, error: 'No IDs provided' });
    const result = await Lead.deleteMany({ _id: { $in: ids }, companyId });
    await Company.findByIdAndUpdate(companyId, { $inc: { 'usage.leadCount': -result.deletedCount } });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) { next(err); }
};

// ── POST /api/leads/import ───────────────────────────────────
exports.importLeads = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const userId    = req.user._id;
    const { leads: rows } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ success: false, error: 'leads must be array' });
    let added = 0, dupes = 0;
    for (const row of rows) {
      if (!row.name) continue;
      try {
        const doc = { ...row, companyId, userId, source: 'manual', category: categorize(row.keyword || '', row.category || '') };
        await Lead.findOneAndUpdate(
          { companyId, $or: [ row.phone ? { phone: row.phone } : { _id: null }, { name: row.name, city: row.city } ] },
          { $setOnInsert: doc }, { upsert: true, new: false }
        );
        added++;
      } catch (e) { if (e.code === 11000) dupes++; }
    }
    await Company.findByIdAndUpdate(companyId, { $inc: { 'usage.leadCount': added } });
    res.json({ success: true, data: { added, dupes } });
  } catch (err) { next(err); }
};

// ── Helper: parse Excel buffer ───────────────────────────────
function parseExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const NAME_KEYS    = ['party name','name','business name','company','customer name','party'];
  const ADDRESS_KEYS = ['address','location','area'];
  const PHONE_KEYS   = ['phone no','phone','mobile','contact','phone number','mobile no','ph no','ph'];
  const EMAIL_KEYS   = ['email','email id','e-mail','mail'];
  let headerRow = -1, colName = -1, colAddr = -1, colPhone = -1, colEmail = -1;
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
  if (headerRow === -1) { headerRow = range.s.r; colName = range.s.c; colAddr = range.s.c+1; colPhone = range.s.c+2; colEmail = range.s.c+3; }
  const leads = [];
  let lastName = '', lastAddr = '', lastEmail = '';
  const getVal = (R, C) => {
    if (C < 0) return '';
    const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
    if (!cell) return '';
    if (cell.t === 'n') return String(Math.round(cell.v));
    return String(cell.v || '').trim();
  };
  for (let R = headerRow + 1; R <= range.e.r; R++) {
    const nameVal  = getVal(R, colName).trim();
    const addrVal  = getVal(R, colAddr).trim();
    const phoneVal = getVal(R, colPhone).trim();
    const emailVal = getVal(R, colEmail).trim();
    if (nameVal)  lastName  = nameVal;
    if (addrVal)  lastAddr  = addrVal;
    if (emailVal) lastEmail = emailVal;
    if (!phoneVal) continue;
    const phoneParts = phoneVal.split(/[/,]/).map(p => p.replace(/\D/g, '').trim()).filter(p => p.length >= 7);
    if (!phoneParts.length) continue;
    for (const raw_phone of phoneParts) {
      const phone = raw_phone.length === 10 ? '91' + raw_phone : raw_phone;
      let city = '';
      if (lastAddr) { const parts = lastAddr.split(/[,()]/); city = (parts[parts.length - 1] || parts[0] || '').trim(); }
      leads.push({ name: lastName || 'Unknown', address: lastAddr, city, raw_phone, phone, email: lastEmail || '', source: 'excel_import' });
    }
  }
  return leads;
}

// ── POST /api/leads/import-excel/preview ─────────────────────
exports.importExcelPreview = (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const rows = parseExcelBuffer(req.file.buffer);
    res.json({ success: true, data: { rows, total: rows.length } });
  } catch (err) { next(err); }
};

// ── POST /api/leads/import-excel ─────────────────────────────
exports.importExcel = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const companyId = req.user.companyId;
    const userId    = req.user._id;
    const rows      = parseExcelBuffer(req.file.buffer);
    const category  = req.body.category || 'Excel Import';
    let added = 0, dupes = 0, skipped = 0;
    for (const row of rows) {
      if (!row.name && !row.phone) { skipped++; continue; }
      try {
        const doc = { ...row, companyId, userId, keyword: category, category };
        await Lead.findOneAndUpdate(
          { companyId, $or: [ row.phone ? { phone: row.phone } : { _id: null }, { name: row.name, city: row.city } ] },
          { $setOnInsert: doc }, { upsert: true, new: false }
        );
        added++;
      } catch (e) { if (e.code === 11000) dupes++; else console.error(e.message); }
    }
    await Company.findByIdAndUpdate(companyId, { $inc: { 'usage.leadCount': added } });
    res.json({ success: true, data: { added, dupes, skipped, total: rows.length } });
  } catch (err) { next(err); }
};

// ── GET /api/leads/export ─────────────────────────────────────
exports.exportExcel = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { category } = req.query;
    const filter = { companyId };
    if (category) filter.category = category;
    const leads  = await Lead.find(filter).lean();
    const buffer = exportLeads(leads);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="leads_${category || 'all'}_${todayStr()}.xlsx"`);
    res.send(buffer);
  } catch (err) { next(err); }
};

// ── VCF helpers ───────────────────────────────────────────────
function buildVcf(leads) {
  return leads.map(lead => {
    const name  = (lead.name || 'Unknown').replace(/[\n\r;]/g, ' ').trim();
    const phone = lead.phone || lead.raw_phone || '';
    const e164  = phone.startsWith('+') ? phone : '+' + phone;
    let card = `BEGIN:VCARD\r\nVERSION:3.0\r\n`;
    card += `FN:${name}\r\nN:${name};;;;\r\n`;
    if (e164) card += `TEL;TYPE=CELL:${e164}\r\n`;
    if (lead.email)   card += `EMAIL;TYPE=WORK:${lead.email}\r\n`;
    if (lead.address || lead.city) { const adr = [lead.address, lead.city, 'India'].filter(Boolean).join(', '); card += `ADR;TYPE=WORK:;;${adr};;;;\r\n`; }
    if (lead.category) card += `ORG:${name};${lead.category}\r\n`;
    card += `NOTE:Lead from Lead CRM\r\nEND:VCARD\r\n`;
    return card;
  }).join('\r\n');
}

// ── GET /api/leads/export-vcf ─────────────────────────────────
exports.exportVCF = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { category } = req.query;
    const filter = { companyId, phone: { $exists: true, $ne: '' } };
    if (category) filter.category = category;
    const leads = await Lead.find(filter).lean();
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contacts_${todayStr()}.vcf"`);
    res.send(buildVcf(leads));
  } catch (err) { next(err); }
};

// ── POST /api/leads/export-vcf ───────────────────────────────
exports.exportVCFSmart = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { ids, newOnly, category } = req.body;
    let filter = { companyId };
    if (ids?.length) { filter._id = { $in: ids }; filter.phone = { $exists: true, $ne: '' }; }
    else { filter.phone = { $exists: true, $ne: '' }; if (newOnly) filter.contact_saved = { $ne: true }; if (category) filter.category = category; }
    const leads = await Lead.find(filter).lean();
    if (!leads.length) { return res.status(200).setHeader('Content-Type','text/vcard; charset=utf-8').send('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:No New Contacts\r\nEND:VCARD\r\n'); }
    if (newOnly) { const ids2 = leads.map(l => l._id); await Lead.updateMany({ _id: { $in: ids2 }, companyId }, { $set: { contact_saved: true, contact_saved_at: new Date() } }); }
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="new_contacts_${todayStr()}.vcf"`);
    res.setHeader('X-Exported-Count', leads.length);
    res.setHeader('Access-Control-Expose-Headers', 'X-Exported-Count');
    res.send(buildVcf(leads));
  } catch (err) { next(err); }
};

// ── POST /api/leads/contacts/mark-saved ─────────────────────
exports.markContactSaved = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { ids } = req.body;
    const filter = { companyId };
    if (ids?.length) filter._id = { $in: ids };
    else { filter.contact_saved = { $ne: true }; filter.phone = { $exists: true, $ne: '' }; }
    const result = await Lead.updateMany(filter, { $set: { contact_saved: true, contact_saved_at: new Date() } });
    res.json({ success: true, data: { marked: result.modifiedCount } });
  } catch (err) { next(err); }
};

// ── POST /api/leads/scrape ───────────────────────────────────
exports.scrape = async (req, res, next) => {
  const { keyword, city, max, category } = req.body;
  if (!keyword || !city) return res.status(400).json({ success: false, error: 'keyword and city required' });
  const companyId = req.user.companyId;
  const userId    = req.user._id;

  res.json({ success: true, message: 'Scraping started...' });

  setImmediate(async () => {
    try {
      emitToCompany(companyId, { type: 'status', message: `🔍 Scraping "${keyword}" in ${city}...` });
      const { scrapeGoogleMaps } = require('../../scraper');
      const raw = await scrapeGoogleMaps(keyword, city, max || 9999);
      let added = 0, dupes = 0;
      for (const lead of raw) {
        try {
          const doc = { ...lead, companyId, userId, keyword, category: category?.trim() || categorize(keyword, lead.category || ''), source: 'google_maps' };
          await Lead.findOneAndUpdate(
            { companyId, $or: [ lead.phone ? { phone: lead.phone } : { _id: null }, { name: lead.name, city: lead.city || city } ] },
            { $setOnInsert: doc }, { upsert: true, new: false }
          );
          added++;
        } catch (e) { if (e.code === 11000) dupes++; }
      }
      await Company.findByIdAndUpdate(companyId, { $inc: { 'usage.leadCount': added } });
      emitToCompany(companyId, { type: 'scrape_done', added, dupes, total: raw.length, message: `✅ Scrape done: ${added} new leads, ${dupes} duplicates` });
    } catch (e) {
      emitToCompany(companyId, { type: 'error', message: '❌ Scrape failed: ' + e.message });
    }
  });
};

// ── GET /api/leads/:id/message ───────────────────────────────
exports.getLeadMessage = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const lead = await Lead.findOne({ _id: req.params.id, companyId });
    if (!lead) return res.status(404).json({ success: false, error: 'Not found' });
    const type = req.query.type;
    let text = '';
    if (type === 'wa')           text = await buildInitialWA(lead);
    else if (type === 'email')   text = (await buildInitialEmail(lead)).html;
    else if (type === 'followup_wa') text = await buildFollowupWA(lead, (lead.followup_count||0)+1);
    res.json({ success: true, data: { phone: lead.phone, text } });
  } catch (err) { next(err); }
};

// ── POST /api/leads/:id/mark-wa ──────────────────────────────
exports.markWASent = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const type  = req.query.type || 'wa';
    const today = todayStr();
    if (type === 'wa') {
      await Lead.findOneAndUpdate({ _id: req.params.id, companyId }, {
        $set:  { wa_sent: true, wa_sent_at: new Date(), wa_last_date: today, status: 'contacted' },
        $inc:  { wa_count: 1 },
        $push: { activity: { type: 'wa_sent', message: 'WA sent manually', date: new Date() } }
      });
    } else if (type === 'followup_wa') {
      const lead = await Lead.findOne({ _id: req.params.id, companyId }).lean();
      if (!lead) return res.status(404).json({ success: false, error: 'Not found' });
      const followupNum = (lead.followup_count || 0) + 1;
      await Lead.findOneAndUpdate({ _id: req.params.id, companyId }, {
        $inc:  { wa_count: 1, followup_count: 1 },
        $set:  { wa_last_date: today, next_followup: new Date(Date.now() + 7*24*60*60*1000), status: 'followup' },
        $push: { activity: { type: 'wa_sent', message: `Followup #${followupNum} WA sent manually`, date: new Date() } }
      });
    }
    res.json({ success: true });
  } catch (err) { next(err); }
};

// ── POST /api/leads/send/wa ──────────────────────────────────
exports.sendWA = async (req, res, next) => {
  const companyId = req.user.companyId;
  const { ids, skipWaSent } = req.body;
  let allowedIds = ids;
  if (ids?.length) {
    const matching = await Lead.find({ _id: { $in: ids }, companyId }).select('_id');
    allowedIds = matching.map(l => l._id.toString());
    if (!allowedIds.length) return res.status(400).json({ success: false, error: 'No authorized leads selected' });
  }
  res.json({ success: true, message: 'WA Auto-send started!' });
  setImmediate(async () => {
    const { sendLocalWA } = require('../../playwright-sender');
    await sendLocalWA(allowedIds, false, { skipWaSent: !!skipWaSent, companyId });
  });
};

// ── POST /api/leads/send/wa-draft ────────────────────────────
exports.sendWADraft = async (req, res, next) => {
  const companyId = req.user.companyId;
  const { ids, skipWaSent } = req.body;
  if (!ids?.length) return res.status(400).json({ success: false, error: 'No leads selected' });
  const matching = await Lead.find({ _id: { $in: ids }, companyId }).select('_id');
  const allowedIds = matching.map(l => l._id.toString());
  if (!allowedIds.length) return res.status(400).json({ success: false, error: 'No authorized leads selected' });
  res.json({ success: true, message: '📝 Draft mode started!' });
  setImmediate(async () => {
    const { sendLocalWA_Draft } = require('../../playwright-sender');
    await sendLocalWA_Draft(allowedIds, false, { skipWaSent: !!skipWaSent, companyId });
  });
};

// ── POST /api/leads/send/wa-manual ───────────────────────────
exports.sendWAManual = async (req, res, next) => {
  const companyId = req.user.companyId;
  const { ids, skipWaSent } = req.body;
  if (!ids?.length) return res.status(400).json({ success: false, error: 'No leads selected' });
  const matching = await Lead.find({ _id: { $in: ids }, companyId }).select('_id');
  const allowedIds = matching.map(l => l._id.toString());
  if (!allowedIds.length) return res.status(400).json({ success: false, error: 'No authorized leads selected' });
  res.json({ success: true, message: '👆 Manual WA mode started!' });
  setImmediate(async () => {
    const { sendLocalWA_Manual } = require('../../playwright-sender');
    await sendLocalWA_Manual(allowedIds, false, { skipWaSent: !!skipWaSent, companyId });
  });
};

// ── POST /api/leads/send/email ───────────────────────────────
exports.sendEmail = async (req, res, next) => {
  const companyId = req.user.companyId;
  const { ids } = req.body;
  if (!ids?.length) return res.status(400).json({ success: false, error: 'No IDs provided' });
  res.json({ success: true, message: 'Email sending started!' });
  setImmediate(async () => {
    try {
      const leads = await Lead.find({ _id: { $in: ids }, companyId }).lean();
      let sent = 0, failed = 0, skipped = 0;
      emitToCompany(companyId, { type: 'start', total: leads.length });
      const { sendEmail: sendEmailSvc } = require('../../services/email-sender');
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        emitToCompany(companyId, { type: 'sending', current: i+1, total: leads.length, name: lead.name, sent, failed });
        if (!lead.email?.trim()) {
          skipped++; failed++;
          emitToCompany(companyId, { type: 'failed', name: lead.name, reason: '⚠️ No email — use Extract Emails first', sent, failed });
          continue;
        }
        try {
          const { subject, html } = await buildInitialEmail(lead);
          await sendEmailSvc(lead.email, subject, html, req.user._id.toString(), companyId);
          await Lead.findOneAndUpdate({ _id: lead._id, companyId }, {
            $inc: { email_count: 1 }, $set: { email_sent: true, email_last_date: todayStr() },
            $push: { activity: { type: 'email_sent', message: 'Initial email sent', date: new Date() } }
          });
          sent++;
          emitToCompany(companyId, { type: 'sent', name: lead.name, sent, failed, total: leads.length });
        } catch (e) {
          failed++;
          emitToCompany(companyId, { type: 'failed', name: lead.name, reason: e.message, sent, failed });
        }
      }
      emitToCompany(companyId, { type: 'done', sent, failed, total: leads.length });
    } catch (e) { emitToCompany(companyId, { type: 'error', message: 'Failed: ' + e.message }); }
  });
};

// ── POST /api/leads/extract-emails ───────────────────────────
exports.extractEmails = async (req, res, next) => {
  const companyId = req.user.companyId;
  const { ids } = req.body;
  let allowedIds = ids;
  if (ids?.length) {
    const matching = await Lead.find({ _id: { $in: ids }, companyId }).select('_id');
    allowedIds = matching.map(l => l._id.toString());
    if (!allowedIds.length) return res.status(400).json({ success: false, error: 'No authorized leads' });
  }
  res.json({ success: true, message: 'Email extraction started...' });
  setImmediate(async () => {
    try {
      const { extractEmailsForLeads } = require('../../services/email-extractor');
      await extractEmailsForLeads(allowedIds, req.user._id.toString(), (progress) => {
        emitToCompany(companyId, progress);
      });
    } catch (e) { emitToCompany(companyId, { type: 'error', message: '❌ Extraction failed: ' + e.message }); }
  });
};

// ── POST /api/leads/:id/add-followup ─────────────────────────
exports.addFollowup = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { note, scheduled_at } = req.body;
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, companyId },
      { $set: { followup_queued: true, followup_note: note || '', followup_scheduled_at: scheduled_at ? new Date(scheduled_at) : new Date(), status: 'followup' },
        $push: { activity: { type: 'followup', message: note || 'Added to follow-up queue', date: new Date() } } },
      { new: true }
    );
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) { next(err); }
};

// ── DELETE /api/leads/:id/remove-followup ────────────────────
exports.removeFollowup = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, companyId },
      { $set: { followup_queued: false, followup_note: '', followup_scheduled_at: null },
        $push: { activity: { type: 'followup', message: 'Removed from follow-up queue', date: new Date() } } }
    );
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
};

// ── GET /api/leads/contacts/stats ────────────────────────────
exports.getContactStats = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { category } = req.query;
    const baseFilter = { companyId, phone: { $exists: true, $ne: '' } };
    if (category) baseFilter.category = category;
    const total   = await Lead.countDocuments(baseFilter);
    const saved   = await Lead.countDocuments({ ...baseFilter, contact_saved: true });
    res.json({ success: true, data: { total, saved, pending: total - saved } });
  } catch (err) { next(err); }
};
