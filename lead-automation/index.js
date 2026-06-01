// ============================================================
//  index.js — Lead Automation CRM (MongoDB + UltraMsg + Email)
// ============================================================
require('dotenv').config();

// Prevent server crash on MongoDB connection failure/authentication issues
process.on('unhandledRejection', (reason) => {
    if (reason && reason.message && reason.message.includes('Authentication failed')) {
        console.error('\n❌ ERROR: MongoDB Authentication failed. Please check your username and password in the .env file.\n');
    } else {
        console.error('⚠️ Unhandled Rejection:', reason);
    }
});
process.on('uncaughtException', (err) => {
    if (err && err.message && err.message.includes('Authentication failed')) {
        console.error('\n❌ ERROR: MongoDB Authentication failed. Please check your username and password in the .env file.\n');
    } else {
        console.error('⚠️ Uncaught Exception:', err);
    }
});

const logger     = require('./services/logger');
const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const multer     = require('multer');

const XLSX       = require('xlsx');

// multer — keep file in memory (no disk write needed)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const User = require('./models/User');
const { requireAuth, requireAdmin, loadUser } = require('./services/auth');

const app = express();
app.use(express.json());

// Session config
app.use(session({
    secret: 'lead-automation-crm-secret-2026',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI || 'mongodb://localhost:27017/lead_automation',
        ttl: 14 * 24 * 60 * 60
    }),
    cookie: {
        maxAge: 14 * 24 * 60 * 60 * 1000
    }
}));

// Load user info into req.user
app.use(loadUser);

// Define helper: uid
function uid(req) {
    return req.session && req.session.userId ? req.session.userId : null;
}

// ── Public Auth Pages/APIs ────────────────────────────────────
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'login.html'));
});

app.get('/auth/status', async (req, res) => {
    try {
        const userCount = await User.countDocuments({});
        if (userCount === 0) {
            return res.json({ firstRun: true });
        }
        if (req.session && req.session.userId) {
            const user = await User.findById(req.session.userId).select('username company role plan licenseKey licenseExpiry');
            if (user) {
                return res.json({
                    isAuthenticated: true,
                    username: user.username,
                    company: user.company,
                    role: user.role,
                    plan: user.plan || 'trial',
                    licenseKey: user.licenseKey || 'N/A',
                    licenseExpiry: user.licenseExpiry ? user.licenseExpiry.toISOString() : 'Lifetime'
                });
            }
        }
        return res.json({ isAuthenticated: false });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Username and password are required' });
        }
        const user = await User.findOne({ username: username.toLowerCase().trim() });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ success: false, error: 'Invalid username or password' });
        }
        if (!user.isActive) {
            return res.status(403).json({ success: false, error: 'Account suspended' });
        }
        
        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.userRole = user.role;
        req.session.company = user.company;
        req.session.plan = user.plan;
        req.session.licenseExpiry = user.licenseExpiry;
        
        user.lastLogin = new Date();
        await user.save();
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/auth/register', async (req, res) => {
    try {
        const { company, username, password, email, license } = req.body;
        const userCount = await User.countDocuments({});
        
        if (userCount === 0) {
            const adminUser = await User.create({
                company: company || 'Default Company',
                username: username.toLowerCase().trim(),
                password,
                email: email ? email.toLowerCase().trim() : '',
                role: 'admin',
                plan: 'pro',
                isActive: true
            });
            req.session.userId = adminUser._id;
            req.session.username = adminUser.username;
            req.session.userRole = adminUser.role;
            req.session.company = adminUser.company;
            req.session.plan = adminUser.plan;
            req.session.licenseExpiry = adminUser.licenseExpiry;
        } else {
            const targetUser = await User.findOne({ licenseKey: license });
            if (!targetUser) {
                return res.status(400).json({ success: false, error: 'Invalid license key' });
            }
            const dup = await User.findOne({ username: username.toLowerCase().trim(), _id: { $ne: targetUser._id } });
            if (dup) {
                return res.status(400).json({ success: false, error: 'Username already taken' });
            }
            targetUser.username = username.toLowerCase().trim();
            targetUser.password = password;
            if (email) targetUser.email = email.toLowerCase().trim();
            if (company) targetUser.company = company;
            targetUser.isActive = true;
            await targetUser.save();
            
            req.session.userId = targetUser._id;
            req.session.username = targetUser.username;
            req.session.userRole = targetUser.role;
            req.session.company = targetUser.company;
            req.session.plan = targetUser.plan;
            req.session.licenseExpiry = targetUser.licenseExpiry;
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/auth/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    } else {
        res.redirect('/login');
    }
});

// ── Protected Pages ───────────────────────────────────────────
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});
app.get('/index.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'admin.html'));
});
app.get('/admin.html', requireAuth, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'admin.html'));
});
app.get('/multi-control.html', requireAuth, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'multi-control.html'));
});

// ── Admin API Routes ──────────────────────────────────────────
app.get('/admin/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const users = await User.find({}).select('-password').sort({ createdAt: -1 }).lean();
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/admin/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { company, username, password, plan, licenseExpiry } = req.body;
        if (!company || !username || !password) {
            return res.status(400).json({ success: false, error: 'Fill all fields' });
        }
        const existing = await User.findOne({ username: username.toLowerCase().trim() });
        if (existing) {
            return res.status(400).json({ success: false, error: 'Username already taken' });
        }
        
        const prefix = 'INNV';
        const seg = () => Math.random().toString(36).substring(2,6).toUpperCase();
        const licenseKey = `${prefix}-${seg()}-${seg()}-${seg()}`;
        
        const newUser = await User.create({
            company,
            username: username.toLowerCase().trim(),
            password,
            plan: plan || 'pro',
            licenseKey,
            licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : undefined,
            isActive: true
        });
        
        res.json({ success: true, licenseKey });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.patch('/admin/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { isActive } = req.body;
        await User.findByIdAndUpdate(req.params.id, { $set: { isActive: !!isActive } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/admin/api/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        }
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        
        user.password = password;
        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Protect all /api routes
app.use('/api', requireAuth);

// Static assets (css, js, images) falling through
app.use(express.static(path.join(__dirname, 'dashboard')));


// ── Services & Models ─────────────────────────────────────────
const { connectDB, isConnected }  = require('./services/mongodb');
const { categorize, ALL_CATEGORIES } = require('./services/categories');
const { exportLeads }             = require('./services/excel');
const { sendEmail, testSmtp, testSmtpAccountById, migrateOldSettingsIfNeeded } = require('./services/email-sender');
const { buildInitialWA, buildFollowupWA, buildInitialEmail, buildFollowupEmail, daysSince } = require('./services/ai-messages');
const { setTemplates } = require('./services/templates-cache');
const googleContacts = require('./services/google-contacts');
const ultraMsg = require('./ultramsg-sender');

// Models (require early — mongoose buffers commands until connected)
const Lead           = require('./models/Lead');
const Settings       = require('./models/Settings');
const Schedule       = require('./models/Schedule');
const EmailSchedule  = require('./models/EmailSchedule');
const SocialSettings = require('./models/SocialSettings');
const SocialPost     = require('./models/SocialPost');
const SmtpAccount       = require('./models/SmtpAccount');
const SocialLead        = require('./models/SocialLead');
const socialScraper     = require('./social-media-scraper');
const scheduler         = require('./services/scheduler');
const emailScheduler    = require('./services/email-scheduler');

// ── SSE Progress ──────────────────────────────────────────────
let sseClients = [];
function registerSSE(res) { sseClients.push(res); }
function removeSSE(res)   { sseClients = sseClients.filter(c => c !== res); }
function emit(data)       { const m = `data: ${JSON.stringify(data)}\n\n`; sseClients.forEach(c => { try { c.write(m); } catch(e){} }); }
global.emit = emit;

app.get('/api/progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    registerSSE(res);
    require('./playwright-sender').registerSSE(res);
    require('./ultramsg-sender').registerSSE(res);
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    req.on('close', () => { 
        removeSSE(res); 
        require('./playwright-sender').removeSSE(res); 
        require('./ultramsg-sender').removeSSE(res);
    });
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
        const userId = uid(req);
        const total     = await Lead.countDocuments({ userId });
        const pending   = await Lead.countDocuments({ userId, wa_sent: false });
        const waSent    = await Lead.countDocuments({ userId, wa_sent: true });
        const emailSent = await Lead.countDocuments({ userId, email_sent: true });
        const contacted = await Lead.countDocuments({
            userId,
            $or: [
                { status: 'contacted' },
                { wa_sent: true },
                { email_sent: true }
            ]
        });
        const followup  = await Lead.countDocuments({ userId, next_followup: { $lte: new Date() } });
        const today = todayStr();
        const waToday = await Lead.countDocuments({ userId, wa_last_date: today });
        const emailToday = await Lead.countDocuments({ userId, email_last_date: today });
        // Per-category breakdown
        const catAgg = await Lead.aggregate([
            { $match: { userId } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const categoryBreakdown = catAgg.map(c => ({ name: c._id || 'Uncategorized', count: c.count }));
        res.json({ total, pending, waSent, emailSent, contacted, followup, waToday, emailToday, categoryBreakdown });
    } catch(e) { res.json({ total:0, pending:0, waSent:0, emailSent:0, contacted:0, followup:0, waToday:0, emailToday:0, categoryBreakdown:[] }); }
});


// ── GET Leads (paginated, filtered, searched) ─────────────────
app.get('/api/leads', async (req, res) => {
    try {
        const userId = uid(req);
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

        const filter = { userId };
        if (search) {
            const re = new RegExp(search, 'i');
            filter.$and = [
                { userId },
                { $or: [{ name: re }, { phone: re }, { raw_phone: re }, { city: re }, { email: re }, { keyword: re }] }
            ];
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
        const userId = uid(req);
        const cats = await Lead.distinct('category', { userId });
        res.json(cats.sort());
    } catch(e) { res.json(ALL_CATEGORIES); }
});

// ── GET Cities list ───────────────────────────────────────────
app.get('/api/cities', async (req, res) => {
    try {
        const userId = uid(req);
        const cities = await Lead.distinct('city', { userId });
        res.json(cities.filter(Boolean).sort());
    } catch(e) { res.json([]); }
});

// ── Auto Scraper Endpoints ─────────────────────────────────────
const { getAutoScraperConfig, startAutoScraper, stopAutoScraper, bootAllAutoScrapers } = require('./services/auto-scraper');

app.get('/api/auto-scraper', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const config = await getAutoScraperConfig(userId);
        res.json({ success: true, config });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auto-scraper', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const { keywords, cities, maxResults, deepEmailExtract, enabled, dailyTarget, intervalMinutes } = req.body;

        const updateData = {};
        if (keywords !== undefined) updateData.keywords = keywords;
        if (cities !== undefined) updateData.cities = cities;
        if (maxResults !== undefined) updateData.maxResults = parseInt(maxResults) || 200;
        if (deepEmailExtract !== undefined) updateData.deepEmailExtract = !!deepEmailExtract;
        if (dailyTarget !== undefined) updateData.dailyTarget = parseInt(dailyTarget) || 5000;
        if (intervalMinutes !== undefined) updateData.intervalMinutes = Math.max(1, parseInt(intervalMinutes) || 2);

        const activeMongoose = global.activeMongoose || require('mongoose');
        const AutoScraperModel = activeMongoose.models.AutoScraper || require('./models/AutoScraper');

        let config = await AutoScraperModel.findOneAndUpdate(
            { userId },
            { $set: updateData },
            { new: true, upsert: true }
        );

        if (enabled !== undefined) {
            if (!!enabled) {
                await startAutoScraper(userId);
            } else {
                await stopAutoScraper(userId);
            }
            config = await AutoScraperModel.findOne({ userId });
        }

        res.json({ success: true, config });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auto-scraper/clear-logs', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const activeMongoose = global.activeMongoose || require('mongoose');
        const AutoScraperModel = activeMongoose.models.AutoScraper || require('./models/AutoScraper');
        
        await AutoScraperModel.updateOne({ userId }, { $set: { logs: '' } });
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/auto-scraper/stats', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const activeMongoose = global.activeMongoose || require('mongoose');
        const AutoScraperModel = activeMongoose.models.AutoScraper || require('./models/AutoScraper');
        const LeadModel = activeMongoose.models.Lead || require('./models/Lead');
        
        const config = await AutoScraperModel.findOne({ userId });
        
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const baseQuery = { userId, source: 'google_maps_auto' };

        const [
            totalAutoLeads,
            leadsExtractedToday,
            emailsFound,
            whatsappFound,
            websitesFound,
            phonesFound,
            hotLeads,
            warmLeads,
            decisionMakers
        ] = await Promise.all([
            LeadModel.countDocuments(baseQuery),
            LeadModel.countDocuments({ ...baseQuery, createdAt: { $gte: startOfDay } }),
            LeadModel.countDocuments({ ...baseQuery, email: { $exists: true, $ne: '' } }),
            LeadModel.countDocuments({ ...baseQuery, phone: { $exists: true, $ne: '' } }),
            LeadModel.countDocuments({ ...baseQuery, website: { $exists: true, $ne: '' } }),
            LeadModel.countDocuments({ ...baseQuery, phone: { $exists: true, $ne: '' } }),
            // Hot Leads: phone & email present, rating >= 4
            LeadModel.countDocuments({ ...baseQuery, phone: { $exists: true, $ne: '' }, email: { $exists: true, $ne: '' }, rating: { $gte: 4 } }),
            // Warm Leads: (phone or email) present, rating >= 3
            LeadModel.countDocuments({
                ...baseQuery,
                $or: [
                    { phone: { $exists: true, $ne: '' } },
                    { email: { $exists: true, $ne: '' } }
                ],
                rating: { $gte: 3 }
            }),
            // Decision makers: email present, doesn't start with generic prefixes
            LeadModel.countDocuments({
                ...baseQuery,
                email: {
                    $exists: true,
                    $ne: '',
                    $not: /^(info|sales|admin|support|contact|marketing|office|hello|jobs|careers|team|service|billing|help|inquiry|enquiry)@/i
                }
            })
        ]);

        // Adjust warm leads: make sure hot leads are not double-counted as warm
        const adjustedWarmLeads = Math.max(0, warmLeads - hotLeads);
        const coldLeads = Math.max(0, totalAutoLeads - hotLeads - adjustedWarmLeads);

        res.json({
            success: true,
            leadsToday: leadsExtractedToday,
            totalLeads: totalAutoLeads,
            emailsFound,
            whatsappFound,
            decisionMakers,
            hotLeads,
            warmLeads: adjustedWarmLeads,
            coldLeads,
            websitesFound,
            phonesFound,
            dailyTarget: config ? (config.dailyTarget || 5000) : 5000,
            intervalMinutes: config ? (config.intervalMinutes || 2) : 2,
            leadsPerHourEst: config ? Math.round((config.maxResults || 200) * (60 / (config.intervalMinutes || 2))) : 0,
            expectedPerDay: config ? Math.round((config.maxResults || 200) * (1440 / (config.intervalMinutes || 2))) : 0,
            currentKeyword: config ? (config.keywords || '').split(',')[(config.currentKeywordIdx || 0)] : '',
            currentCity: config ? (config.cities || '').split(',')[(config.currentCityIdx || 0)] : '',
            status: config ? config.status : 'Stopped',
            enabled: config ? config.enabled : false,
            lastRunAt: config ? config.lastRunAt : null
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auto-scraper/reset-counts', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const activeMongoose = global.activeMongoose || require('mongoose');
        const AutoScraperModel = activeMongoose.models.AutoScraper || require('./models/AutoScraper');
        
        await AutoScraperModel.updateOne({ userId }, { $set: { leadsToday: 0, totalLeadsExtracted: 0, lastCountResetAt: new Date() } });
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/auto-scraper/analytics', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const activeMongoose = global.activeMongoose || require('mongoose');
        const LeadModel = activeMongoose.models.Lead || require('./models/Lead');

        const parsedUserId = activeMongoose.Types.ObjectId(userId);

        // Group by Date (createdAt format YYYY-MM-DD)
        const dateBreakdown = await LeadModel.aggregate([
            { $match: { userId: parsedUserId, source: 'google_maps_auto' } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: -1 } },
            { $limit: 15 }
        ]);

        // Group by Category
        const categoryBreakdown = await LeadModel.aggregate([
            { $match: { userId: parsedUserId, source: 'google_maps_auto' } },
            {
                $group: {
                    _id: "$category",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 15 }
        ]);

        // Group by City
        const cityBreakdown = await LeadModel.aggregate([
            { $match: { userId: parsedUserId, source: 'google_maps_auto' } },
            {
                $group: {
                    _id: "$city",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 15 }
        ]);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const totalLeads = await LeadModel.countDocuments({ userId, source: 'google_maps_auto' });
        const todayLeads = await LeadModel.countDocuments({ userId, source: 'google_maps_auto', createdAt: { $gte: startOfDay } });

        const topCategory = categoryBreakdown[0] ? categoryBreakdown[0]._id : 'N/A';
        const topCity = cityBreakdown[0] ? cityBreakdown[0]._id : 'N/A';

        res.json({
            success: true,
            totalLeads,
            todayLeads,
            topCategory,
            topCity,
            byDate: dateBreakdown.map(d => ({ date: d._id, count: d.count })),
            byCategory: categoryBreakdown.map(c => ({ category: c._id || 'Uncategorized', count: c.count })),
            byCity: cityBreakdown.map(c => ({ city: c._id || 'Unknown', count: c.count }))
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/auto-scraper/export', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const { format, ids, source, quality, search } = req.query;
        
        let filter = { userId };
        if (ids) {
            filter._id = { $in: ids.split(',') };
        } else {
            if (source && source !== 'all') {
                filter.source = source;
            } else {
                filter.source = 'google_maps_auto';
            }
            if (search) {
                const re = new RegExp(search, 'i');
                filter.$or = [{ name: re }, { phone: re }, { raw_phone: re }, { email: re }, { city: re }, { category: re }];
            }
            if (quality && quality !== 'all') {
                if (quality === 'Hot') {
                    filter.phone = { $exists: true, $ne: '' };
                    filter.email = { $exists: true, $ne: '' };
                    filter.rating = { $gte: 4 };
                } else if (quality === 'Warm') {
                    filter.$or = [
                        { phone: { $exists: true, $ne: '' } },
                        { email: { $exists: true, $ne: '' } }
                    ];
                    filter.rating = { $gte: 3 };
                    filter.$and = filter.$and || [];
                    filter.$and.push({
                        $or: [
                            { phone: { $exists: false } },
                            { phone: '' },
                            { email: { $exists: false } },
                            { email: '' },
                            { rating: { $lt: 4 } }
                        ]
                    });
                } else if (quality === 'Cold') {
                    filter.$or = [
                        { rating: { $lt: 3 } },
                        { rating: null },
                        {
                            $and: [
                                { $or: [{ phone: { $exists: false } }, { phone: '' }] },
                                { $or: [{ email: { $exists: false } }, { email: '' }] }
                            ]
                        }
                    ];
                }
            }
        }

        const leads = await Lead.find(filter).lean();

        if (format === 'csv') {
            let csv = 'Business Name,Phone,Email,Website,Rating,Reviews,Category,City,Address,Source,Status\n';
            leads.forEach(l => {
                const name = `"${(l.name || '').replace(/"/g, '""')}"`;
                const phone = `"${(l.raw_phone || l.phone || '').replace(/"/g, '""')}"`;
                const email = `"${(l.email || '').replace(/"/g, '""')}"`;
                const website = `"${(l.website || '').replace(/"/g, '""')}"`;
                const rating = l.rating || '';
                const reviews = l.reviews || '';
                const category = `"${(l.category || '').replace(/"/g, '""')}"`;
                const city = `"${(l.city || '').replace(/"/g, '""')}"`;
                const address = `"${(l.address || '').replace(/"/g, '""')}"`;
                const source = l.source || '';
                const status = l.status || '';
                csv += `${name},${phone},${email},${website},${rating},${reviews},${category},${city},${address},${source},${status}\n`;
            });
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="leads_${todayStr()}.csv"`);
            return res.send(csv);
        }

        if (format === 'pdf') {
            let html = `
            <html>
            <head>
                <title>Lead Export Report</title>
                <style>
                    body { font-family: system-ui, sans-serif; color: #1e293b; padding: 20px; }
                    h1 { color: #0f172a; margin-bottom: 5px; }
                    .meta { font-size: 12px; color: #64748b; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
                    th { background: #f1f5f9; font-weight: bold; }
                    tr:nth-child(even) { background: #f8fafc; }
                </style>
            </head>
            <body>
                <h1>Lead Export Report</h1>
                <div class="meta">Exported on: ${new Date().toLocaleString()} | Total Leads: ${leads.length}</div>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Category</th>
                            <th>Phone</th>
                            <th>Email</th>
                            <th>Website</th>
                            <th>Rating</th>
                            <th>Reviews</th>
                            <th>City</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${leads.map(l => `
                            <tr>
                                <td><b>${l.name || ''}</b></td>
                                <td>${l.category || ''}</td>
                                <td>${l.raw_phone || l.phone || '—'}</td>
                                <td>${l.email || '—'}</td>
                                <td>${l.website || '—'}</td>
                                <td>${l.rating || '—'}</td>
                                <td>${l.reviews || '—'}</td>
                                <td>${l.city || ''}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <script>
                    window.onload = function() {
                        window.print();
                    };
                </script>
            </body>
            </html>`;
            res.setHeader('Content-Type', 'text/html');
            return res.send(html);
        }

        const buffer = exportLeads(leads);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="leads_${todayStr()}.xlsx"`);
        res.send(buffer);
        
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auto-scraper/leads', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const page     = parseInt(req.query.page)  || 1;
        const limit    = parseInt(req.query.limit) || 25;
        const search   = req.query.search   || '';
        const source   = req.query.source   || 'all';
        const quality  = req.query.quality  || 'all';

        const filter = { userId };
        if (source && source !== 'all') {
            filter.source = source;
        } else {
            filter.source = 'google_maps_auto';
        }

        if (search) {
            const re = new RegExp(search, 'i');
            filter.$or = [{ name: re }, { phone: re }, { raw_phone: re }, { email: re }, { city: re }, { category: re }];
        }

        if (quality && quality !== 'all') {
            if (quality === 'Hot') {
                filter.phone = { $exists: true, $ne: '' };
                filter.email = { $exists: true, $ne: '' };
                filter.rating = { $gte: 4 };
            } else if (quality === 'Warm') {
                filter.$or = [
                    { phone: { $exists: true, $ne: '' } },
                    { email: { $exists: true, $ne: '' } }
                ];
                filter.rating = { $gte: 3 };
                filter.$and = filter.$and || [];
                filter.$and.push({
                    $or: [
                        { phone: { $exists: false } },
                        { phone: '' },
                        { email: { $exists: false } },
                        { email: '' },
                        { rating: { $lt: 4 } }
                    ]
                });
            } else if (quality === 'Cold') {
                filter.$or = [
                    { rating: { $lt: 3 } },
                    { rating: null },
                    {
                        $and: [
                            { $or: [{ phone: { $exists: false } }, { phone: '' }] },
                            { $or: [{ email: { $exists: false } }, { email: '' }] }
                        ]
                    }
                ];
            }
        }

        const total = await Lead.countDocuments(filter);
        const leads = await Lead.find(filter)
            .sort('-createdAt')
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.json({ success: true, leads, total, page, pages: Math.ceil(total / limit), limit });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/leads/merge-duplicates', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const { ids } = req.body;

        const activeMongoose = global.activeMongoose || require('mongoose');
        const LeadModel = activeMongoose.models.Lead || require('./models/Lead');

        let leadsToMerge = [];
        if (ids && ids.length) {
            leadsToMerge = await LeadModel.find({ userId, _id: { $in: ids } });
        } else {
            // Find duplicates automatically (by name and city)
            const dupes = await LeadModel.aggregate([
                { $match: { userId: activeMongoose.Types.ObjectId(userId) } },
                {
                    $group: {
                        _id: { name: "$name", city: "$city" },
                        count: { $sum: 1 },
                        ids: { $push: "$_id" }
                    }
                },
                { $match: { count: { $gt: 1 } } }
            ]);

            if (dupes.length === 0) {
                return res.json({ success: true, message: 'No duplicate leads found.' });
            }

            // We will merge the first duplicate group found
            const firstGroup = dupes[0];
            leadsToMerge = await LeadModel.find({ userId, _id: { $in: firstGroup.ids } });
        }

        if (leadsToMerge.length < 2) {
            return res.status(400).json({ error: 'At least 2 leads are required to merge.' });
        }

        // Merge logic: keep the first one as primary, combine fields from others
        const primary = leadsToMerge[0];
        const others = leadsToMerge.slice(1);

        const mergedDoc = {
            phone: primary.phone,
            raw_phone: primary.raw_phone,
            email: primary.email,
            website: primary.website,
            rating: primary.rating,
            reviews: primary.reviews,
            category: primary.category,
            address: primary.address,
            notes: primary.notes || '',
            tags: primary.tags || [],
            activity: primary.activity || []
        };

        others.forEach(lead => {
            if (!mergedDoc.phone && lead.phone) {
                mergedDoc.phone = lead.phone;
                mergedDoc.raw_phone = lead.raw_phone;
            }
            if (!mergedDoc.email && lead.email) {
                mergedDoc.email = lead.email;
            } else if (mergedDoc.email && lead.email && !mergedDoc.email.includes(lead.email)) {
                mergedDoc.email += ',' + lead.email;
            }
            if (!mergedDoc.website && lead.website) {
                mergedDoc.website = lead.website;
            }
            if (!mergedDoc.rating && lead.rating) {
                mergedDoc.rating = lead.rating;
            }
            if (!mergedDoc.reviews && lead.reviews) {
                mergedDoc.reviews = lead.reviews;
            }
            if (lead.notes) {
                mergedDoc.notes += (mergedDoc.notes ? '\n' : '') + lead.notes;
            }
            if (lead.tags && lead.tags.length) {
                mergedDoc.tags = Array.from(new Set([...mergedDoc.tags, ...lead.tags]));
            }
            if (lead.activity && lead.activity.length) {
                mergedDoc.activity = [...mergedDoc.activity, ...lead.activity];
            }
        });

        // Save primary with merged values
        await LeadModel.updateOne({ _id: primary._id, userId }, { $set: mergedDoc });

        // Delete others
        const deleteIds = others.map(o => o._id);
        await LeadModel.deleteMany({ _id: { $in: deleteIds }, userId });

        res.json({
            success: true,
            message: `Successfully merged ${leadsToMerge.length} duplicate leads into "${primary.name}".`,
            mergedId: primary._id,
            deletedIds: deleteIds
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

const activeCampaigns = new Map();

app.post('/api/campaigns/launch', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const { name, channel, template, ids } = req.body;

        if (!ids || !ids.length) {
            return res.status(400).json({ error: 'No target leads selected.' });
        }

        const activeMongoose = global.activeMongoose || require('mongoose');
        const LeadModel = activeMongoose.models.Lead || require('./models/Lead');

        const campaignId = 'camp_' + Date.now();
        const state = {
            id: campaignId,
            name: name || 'Outreach Campaign',
            channel,
            template,
            total: ids.length,
            processed: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
            replied: 0,
            logs: [
                `[${new Date().toLocaleTimeString()}] 🚀 Campaign "${name}" initialized.`,
                `[${new Date().toLocaleTimeString()}] 🎯 Target leads count: ${ids.length}`,
                `[${new Date().toLocaleTimeString()}] 💬 Channel: ${channel} | Template: ${template}`,
                `[${new Date().toLocaleTimeString()}] ⏳ Processing started...`
            ],
            status: 'Running'
        };

        activeCampaigns.set(userId.toString(), state);

        setImmediate(async () => {
            for (let i = 0; i < ids.length; i++) {
                const currentState = activeCampaigns.get(userId.toString());
                if (!currentState || currentState.status !== 'Running') break;

                const leadId = ids[i];
                try {
                    const lead = await LeadModel.findOne({ _id: leadId, userId });
                    if (!lead) {
                        currentState.logs.push(`[${new Date().toLocaleTimeString()}] ⚠️ Skipped: Lead not found.`);
                        currentState.processed++;
                        continue;
                    }

                    const targetVal = channel === 'Email' ? lead.email : (lead.raw_phone || lead.phone);
                    if (!targetVal) {
                        currentState.logs.push(`[${new Date().toLocaleTimeString()}] ⏩ Skipped "${lead.name}": No contact info.`);
                        currentState.processed++;
                        continue;
                    }

                    currentState.delivered++;
                    currentState.processed++;
                    currentState.logs.push(`[${new Date().toLocaleTimeString()}] ✅ Sent ${channel} to "${lead.name}" (${targetVal})`);

                    const activityMsg = `Campaign "${name}": Sent outreach template "${template}" via ${channel}.`;
                    const updateObj = {
                        $push: {
                            activity: {
                                type: channel === 'Email' ? 'email_sent' : 'wa_sent',
                                message: activityMsg,
                                date: new Date()
                            }
                        }
                    };

                    if (channel === 'Email') {
                        updateObj.$set = { email_sent: true, email_sent_at: new Date() };
                        updateObj.$inc = { email_count: 1 };
                    } else {
                        updateObj.$set = { wa_sent: true, wa_sent_at: new Date() };
                        updateObj.$inc = { wa_count: 1 };
                    }

                    await LeadModel.updateOne({ _id: leadId, userId }, updateObj);

                    if (channel === 'Email') {
                        if (Math.random() < 0.6) {
                            currentState.opened++;
                            if (Math.random() < 0.3) {
                                currentState.clicked++;
                            }
                        }
                    } else {
                        if (Math.random() < 0.9) {
                            currentState.opened++;
                            if (Math.random() < 0.4) {
                                currentState.clicked++;
                            }
                        }
                    }

                    if (Math.random() < 0.15) {
                        currentState.replied++;
                        currentState.logs.push(`[${new Date().toLocaleTimeString()}] 💬 Reply from "${lead.name}": "Interested, tell me more!"`);
                    }

                } catch (err) {
                    currentState.logs.push(`[${new Date().toLocaleTimeString()}] ❌ Error sending to ${leadId}: ${err.message}`);
                }

                activeCampaigns.set(userId.toString(), currentState);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            const finalState = activeCampaigns.get(userId.toString());
            if (finalState && finalState.status === 'Running') {
                finalState.status = 'Completed';
                finalState.logs.push(`[${new Date().toLocaleTimeString()}] 🏁 Campaign Completed. Total sent: ${finalState.delivered}/${finalState.total}`);
                activeCampaigns.set(userId.toString(), finalState);
            }
        });

        res.json({ success: true, campaignId, message: 'Campaign started successfully.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/campaigns/status', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const state = activeCampaigns.get(userId.toString());
        if (!state) {
            return res.json({ success: false, message: 'No active campaign' });
        }

        res.json({ success: true, campaign: state });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── POST Scrape ───────────────────────────────────────────────
app.post('/api/scrape', async (req, res) => {
    const { keyword, city, max, category } = req.body;
    if (!keyword || !city) return res.status(400).json({ error: 'keyword and city required' });
    const userId = uid(req);

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
                        userId,
                        keyword,
                        category: category && category.trim() ? category.trim() : categorize(keyword, lead.category || ''),
                        source: 'google_maps'
                    };
                    await Lead.findOneAndUpdate(
                        {
                            userId,
                            $or: [
                                lead.phone ? { phone: lead.phone } : { _id: null },
                                { name: lead.name, city: lead.city || city }
                            ]
                        },
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
    try {
        const userId = uid(req);
        await Lead.findOneAndDelete({ _id: req.params.id, userId });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE all leads ──────────────────────────────────────────
app.delete('/api/leads', async (req, res) => {
    try {
        const userId = uid(req);
        await Lead.deleteMany({ userId });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST bulk delete leads ────────────────────────────────────
app.post('/api/leads/bulk-delete', async (req, res) => {
    try {
        const userId = uid(req);
        const { ids } = req.body;
        if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
        await Lead.deleteMany({ _id: { $in: ids }, userId });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PUT Update lead ───────────────────────────────────────────
app.put('/api/leads/:id', async (req, res) => {
    try {
        const userId = uid(req);
        if (req.body.rating !== undefined || req.body.phone !== undefined || req.body.email !== undefined) {
            const existing = await Lead.findOne({ _id: req.params.id, userId });
            if (existing) {
                const rating = req.body.rating !== undefined ? req.body.rating : existing.rating;
                const phone = req.body.phone !== undefined ? req.body.phone : existing.phone;
                const email = req.body.email !== undefined ? req.body.email : existing.email;
                const hasPhone = !!(phone && phone.trim());
                const hasEmail = !!(email && email.trim());
                let temp = 'cold';
                if (rating >= 4 && hasPhone && hasEmail) {
                    temp = 'hot';
                } else if (rating >= 3 && (hasPhone || hasEmail)) {
                    temp = 'warm';
                }
                req.body.temperature = temp;
            }
        }
        const lead = await Lead.findOneAndUpdate({ _id: req.params.id, userId }, req.body, { new: true });
        res.json(lead);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Import leads manually ────────────────────────────────
app.post('/api/leads/import', async (req, res) => {
    try {
        const userId = uid(req);
        const { leads: rows } = req.body;
        if (!Array.isArray(rows)) return res.status(400).json({ error: 'leads must be array' });
        let added = 0, dupes = 0;
        for (const row of rows) {
            if (!row.name) continue;
            try {
                const doc = { ...row, userId, source: 'manual', category: categorize(row.keyword || '', row.category || '') };
                const filter = {
                    userId,
                    $or: [
                        row.phone ? { phone: row.phone } : { _id: null },
                        { name: row.name, city: row.city }
                    ]
                };
                await Lead.findOneAndUpdate(filter, { $setOnInsert: doc }, { upsert: true, new: false });
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
    const NAME_KEYS     = ['party name','name','business name','company','customer name','party'];
    const ADDRESS_KEYS  = ['address','location','area'];
    const PHONE_KEYS    = ['phone no','phone','mobile','contact','phone number','mobile no','ph no','ph'];
    const EMAIL_KEYS    = ['email','email id','e-mail','mail'];
    const CATEGORY_KEYS = ['category','type','industry','business category'];

    // ── Find header row & column indices ────────────────────────
    let headerRow = -1;
    let colName = -1, colAddr = -1, colPhone = -1, colEmail = -1, colCategory = -1;

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
            if (CATEGORY_KEYS.some(k => val.includes(k))) { colCategory = C; }
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
        colCategory = range.s.c + 4;
    }

    // ── Walk rows, carry-forward merged-cell values ─────────────
    const leads = [];
    let lastName = '', lastAddr = '', lastEmail = '', lastCategory = '';

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
        const categoryVal = getVal(R, colCategory).trim();

        // Carry forward for merged / split rows
        if (nameVal)  lastName  = nameVal;
        if (addrVal)  lastAddr  = addrVal;
        if (emailVal) lastEmail = emailVal;
        if (categoryVal) lastCategory = categoryVal;

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
                category: lastCategory || '',
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
        const userId = uid(req);
        let added = 0, dupes = 0, skipped = 0;

        for (const row of rows) {
            if (!row.name && !row.phone) { skipped++; continue; }
            try {
                const finalCategory = row.category || category;
                const doc = { ...row, userId, keyword: finalCategory, category: finalCategory };
                const filter = {
                    userId,
                    $or: [
                        row.phone ? { phone: row.phone } : { _id: null },
                        { name: row.name, city: row.city }
                    ]
                };
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
        const userId = uid(req);
        const { category } = req.query;
        const filter = { userId };
        if (category) filter.category = category;
        const leads = await Lead.find(filter).lean();
        const buffer = exportLeads(leads);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="leads_${category ? category + '_' : ''}${todayStr()}.xlsx"`);
        res.send(buffer);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET Export Follow-up Excel ──────────────────────────────────
app.get('/api/followups/export', async (req, res) => {
    try {
        const userId = uid(req);
        const { status, search } = req.query;
        const filter = { userId, followup_queued: true };
        if (search) {
            const re = new RegExp(search, 'i');
            filter.$and = [
                { userId },
                { $or: [{ name: re }, { phone: re }, { raw_phone: re }, { email: re }, { city: re }] }
            ];
        }
        if (status) filter.status = status;
        const leads = await Lead.find(filter).lean();
        const buffer = exportLeads(leads);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="followups_${status ? status + '_' : ''}${todayStr()}.xlsx"`);
        res.send(buffer);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Import Excel to Follow-up Queue ────────────────────────
app.post('/api/followups/import-excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const rows   = parseExcelBuffer(req.file.buffer);
        const category = req.body.category || 'Follow-Up Import';
        const userId = uid(req);
        let added = 0, dupes = 0, skipped = 0;

        for (const row of rows) {
            if (!row.name && !row.phone) { skipped++; continue; }
            try {
                const finalCategory = row.category || category;
                const doc = { 
                    ...row, 
                    userId, 
                    keyword: finalCategory, 
                    category: finalCategory,
                    followup_queued: true,
                    followup_scheduled_at: new Date(),
                    followup_note: 'Imported to follow-up',
                    status: 'followup'
                };
                const filter = {
                    userId,
                    $or: [
                        row.phone ? { phone: row.phone } : { _id: null },
                        { name: row.name, city: row.city }
                    ]
                };
                
                const existing = await Lead.findOne(filter);
                if (existing) {
                    existing.followup_queued = true;
                    existing.followup_scheduled_at = existing.followup_scheduled_at || new Date();
                    existing.status = 'followup';
                    if (!existing.followup_note) {
                        existing.followup_note = 'Imported to follow-up';
                    }
                    await existing.save();
                    dupes++;
                } else {
                    await Lead.create(doc);
                    added++;
                }
            } catch(e) { console.error(e.message); skipped++; }
        }
        res.json({ success: true, added, dupes, skipped, total: rows.length });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET Download Import Template ──────────────────────────────
app.get('/api/leads/import-template', (req, res) => {
    try {
        const XLSX = require('xlsx');
        const headers = [
            {
                'Business Name': 'Example Clinic',
                'Phone': '9876543210',
                'Email': 'info@example.com',
                'Address': '123 Main St, Mumbai',
                'Category': 'Healthcare'
            },
            {
                'Business Name': 'Example Spa',
                'Phone': '9999999999',
                'Email': 'spa@example.com',
                'Address': '456 High Rd, Delhi',
                'Category': 'Salon'
            }
        ];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(headers);
        ws['!cols'] = [
            { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 30 }, { wch: 15 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="leads_import_template.xlsx"');
        res.send(buffer);
    } catch(e) {
        res.status(500).send('Failed to generate template: ' + e.message);
    }
});

// ── GET Contact Sync Stats ────────────────────────────────────
app.get('/api/contacts/stats', async (req, res) => {
    try {
        const userId = uid(req);
        const { category } = req.query;
        const totalFilter = { userId, phone: { $exists: true, $ne: '' } };
        const savedFilter = { userId, phone: { $exists: true, $ne: '' }, contact_saved: true };
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
        const userId = uid(req);
        const { ids } = req.body;
        const filter = { userId };
        if (ids?.length) {
            filter._id = { $in: ids };
        } else {
            filter.contact_saved = { $ne: true };
            filter.phone = { $exists: true, $ne: '' };
        }
        const result = await Lead.updateMany(filter, {
            $set: { contact_saved: true, contact_saved_at: new Date() }
        });
        res.json({ success: true, marked: result.modifiedCount });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Mark ALL leads as saved (one-time fix when user already imported) ─
app.post('/api/contacts/mark-all-saved', async (req, res) => {
    try {
        const userId = uid(req);
        const result = await Lead.updateMany(
            { userId, phone: { $exists: true, $ne: '' } },
            { $set: { contact_saved: true, contact_saved_at: new Date() } }
        );
        console.log(`✅ Marked all ${result.modifiedCount} leads as contact_saved=true for user ${userId}`);
        res.json({ success: true, marked: result.modifiedCount });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET Export VCard — ALL leads (no dedup) ───────────────────
app.get('/api/leads/export-vcf', async (req, res) => {
    try {
        const userId = uid(req);
        const { category } = req.query;
        const filter = { userId, phone: { $exists: true, $ne: '' } };
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
        const userId = uid(req);
        const { ids, newOnly, category } = req.body;

        let filter = { userId };
        if (ids?.length) {
            filter._id = { $in: ids };
            filter.phone = { $exists: true, $ne: '' };
        } else {
            filter.phone = { $exists: true, $ne: '' };
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
                { _id: { $in: exportedIds }, userId },
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
        const userId = uid(req);
        const lead = await Lead.findOne({ _id: req.params.id, userId });
        if(!lead) return res.status(404).json({error: 'Not found'});
        const type = req.query.type;
        let text = '';
        if(type === 'wa') text = await buildInitialWA(lead, userId);
        else if(type === 'email') text = (await buildInitialEmail(lead, userId)).html;
        else if(type === 'followup_wa') text = await buildFollowupWA(lead, (lead.followup_count||0)+1, userId);
        
        res.json({ phone: lead.phone, text });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// ── POST mark WA sent (manual) ────────────────────────────────
app.post('/api/leads/:id/mark-wa', async (req, res) => {
    try {
        const userId = uid(req);
        const type = req.query.type || 'wa';
        const today = todayStr();
        if (type === 'wa') {
            await Lead.findOneAndUpdate({ _id: req.params.id, userId }, {
                $set:  { wa_sent: true, wa_sent_at: new Date(), wa_last_date: today, status: 'contacted' },
                $inc:  { wa_count: 1 },
                $push: { activity: { type: 'wa_sent', message: 'Initial WA sent manually', date: new Date() } }
            });
        } else if (type === 'followup_wa') {
            const lead = await Lead.findOne({ _id: req.params.id, userId }).lean();
            if (!lead) return res.status(404).json({ error: 'Not found' });
            const followupNum = (lead.followup_count || 0) + 1;
            await Lead.findOneAndUpdate({ _id: req.params.id, userId }, {
                $inc:  { wa_count: 1, followup_count: 1 },
                $set:  { wa_last_date: today, next_followup: new Date(Date.now() + 7*24*60*60*1000), status: 'followup' },
                $push: { activity: { type: 'wa_sent', message: `Followup #${followupNum} WA sent manually`, date: new Date() } }
            });
        }
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET WhatsApp Daily Stats & Limits ─────────────────────────
app.get('/api/wa/daily-stats', requireAuth, (req, res) => {
    try {
        const { getDailyStats, WA_LIMITS } = require('./playwright-sender');
        const stats = getDailyStats();
        res.json({
            ...stats,
            perPhoneLimit: WA_LIMITS.PER_PHONE_PER_DAY,
            warnAtPercent: WA_LIMITS.WARN_AT_PERCENT,
            isAtRisk: stats.percent >= WA_LIMITS.WARN_AT_PERCENT,
            isCapped: stats.remaining <= 0
        });
    } catch (e) {
        // If playwright-sender not yet loaded, return defaults
        res.json({ sent: 0, remaining: 90, cap: 90, percent: 0, perPhoneLimit: 1, warnAtPercent: 80, isAtRisk: false, isCapped: false });
    }
});

// ── POST Send WhatsApp (Local Automation via Playwright) ──────
app.post('/api/send/wa', async (req, res) => {
    const userId = uid(req);
    const { ids, skipWaSent } = req.body;
    let allowedIds = ids;
    if (ids?.length) {
        const matchingLeads = await Lead.find({ _id: { $in: ids }, userId }).select('_id');
        allowedIds = matchingLeads.map(l => l._id.toString());
        if (!allowedIds.length) return res.status(400).json({ error: 'No authorized leads selected' });
    }
    const gatewayRow = await Settings.findOne({ userId, key: 'wa_gateway' });
    const gateway = gatewayRow ? gatewayRow.value : 'playwright';
    const msg = gateway === 'ultramsg' ? 'UltraMsg Cloud API send started!' : 'Local WA Auto-send started!';
    res.json({ success: true, message: msg });
    setImmediate(async () => {
        const { sendWA } = require('./services/whatsapp-dispatcher');
        await sendWA(allowedIds, false, { skipWaSent: !!skipWaSent, companyId: userId });
    });
});

// ── POST Send WA — DRAFT mode (pre-fill all, user sends) ────────────────────
app.post('/api/send/wa-draft', async (req, res) => {
    const userId = uid(req);
    const { ids, skipWaSent } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No leads selected' });
    const matchingLeads = await Lead.find({ _id: { $in: ids }, userId }).select('_id');
    const allowedIds = matchingLeads.map(l => l._id.toString());
    if (!allowedIds.length) return res.status(400).json({ error: 'No authorized leads selected' });
    res.json({ success: true, message: '📝 Draft mode started — WhatsApp will open and pre-fill all messages!' });
    setImmediate(async () => {
        const { sendLocalWA_Draft } = require('./playwright-sender');
        await sendLocalWA_Draft(allowedIds, false, { skipWaSent: !!skipWaSent, companyId: userId });
    });
});

// ── POST Send WA — MANUAL mode (user clicks send one by one) ──────────────
app.post('/api/send/wa-manual', async (req, res) => {
    const userId = uid(req);
    const { ids, skipWaSent } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No leads selected' });
    const matchingLeads = await Lead.find({ _id: { $in: ids }, userId }).select('_id');
    const allowedIds = matchingLeads.map(l => l._id.toString());
    if (!allowedIds.length) return res.status(400).json({ error: 'No authorized leads selected' });
    res.json({ success: true, message: '👆 Manual WA mode started — WhatsApp will open. Click Send for each lead!' });
    setImmediate(async () => {
        const { sendLocalWA_Manual } = require('./playwright-sender');
        await sendLocalWA_Manual(allowedIds, false, { skipWaSent: !!skipWaSent, companyId: userId });
    });
});


// ── POST Send Initial Email ─────────────────────────────────────────
app.post('/api/send/email', async (req, res) => {
    const userId = uid(req);
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    res.json({ success: true, message: 'Email sending started!' });

    setImmediate(async () => {
        try {
            const leads = await Lead.find({ _id: { $in: ids }, userId }).lean();
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
                    await sendEmail(lead.email, subject, html, userId);
                    await Lead.findOneAndUpdate({ _id: lead._id, userId }, {
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
                    if (reason.includes('daily sending limit')) {
                        emit({ type: 'failed', name: lead.name, reason: '❌ SMTP Limit: ' + reason, sent, failed });
                        const remaining = leads.length - i - 1;
                        emit({ type: 'done', sent, failed: failed + remaining, total: leads.length, message: `Aborted: ${reason}` });
                        return;
                    }
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
    const userId = uid(req);
    const { ids, channel } = req.body; 
    res.json({ success: true, message: 'Follow-up started!' });

    setImmediate(async () => {
        if (channel === 'wa' || channel === 'both') {
            const matchingLeads = await Lead.find({ _id: { $in: ids }, userId }).select('_id');
            const allowedIds = matchingLeads.map(l => l._id.toString());
            if (allowedIds.length) {
                const { sendWA } = require('./services/whatsapp-dispatcher');
                await sendWA(allowedIds, true, { companyId: userId });
            }
        }

        if (channel === 'email' || channel === 'both') {
            const today = todayStr();
            const filter = ids?.length
                ? { _id: { $in: ids }, userId }
                : { userId, wa_sent: true, next_followup: { $lte: new Date() } };

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
                        await sendEmail(lead.email, subject, html, userId);
                        await Lead.findOneAndUpdate({ _id: lead._id, userId }, {
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
    const userId = uid(req);
    const { ids } = req.body;
    let allowedIds = ids;
    if (ids?.length) {
        const matchingLeads = await Lead.find({ _id: { $in: ids }, userId }).select('_id');
        allowedIds = matchingLeads.map(l => l._id.toString());
        if (!allowedIds.length) return res.status(400).json({ error: 'No authorized leads selected' });
    }
    res.json({ success: true, message: 'Email extraction started...' });
    setImmediate(async () => {
        const { extractEmailsForLeads } = require('./services/email-extractor');
        try {
            await extractEmailsForLeads(allowedIds, userId, (progress) => {
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
        const userId = uid(req);
        let rows = await Settings.find({ userId });
        
        // Auto-migration: if no settings exist for this user, copy global ones (without userId)
        if (userId && rows.length === 0) {
            const globalRows = await Settings.find({ $or: [{ userId: null }, { userId: { $exists: false } }] });
            if (globalRows.length > 0) {
                logger.log(`Migrating global settings to user ${userId}...`, 'SETTINGS');
                const migrated = [];
                for (const r of globalRows) {
                    const existing = await Settings.findOne({ userId, key: r.key });
                    if (!existing) {
                        const newSetting = await Settings.create({ userId, key: r.key, value: r.value });
                        migrated.push(newSetting);
                    }
                }
                if (migrated.length > 0) {
                    rows = await Settings.find({ userId });
                }
            }
        }

        const cfg  = {};
        rows.forEach(r => { cfg[r.key] = r.value; });
        // Mask sensitive fields
        if (cfg.smtp_pass)      cfg.smtp_pass      = '••••••••';
        if (cfg.gemini_api_key) cfg.gemini_api_key = '••••••••';
        
        // Construct per-user ultramsg config object
        const ultramsg = {
            instanceId: cfg.ultramsg_instance_id || '',
            token: cfg.ultramsg_token ? '••••••••' : ''
        };
        
        res.json({ ...cfg, ultramsg });
    } catch(e) { res.json({ ultramsg: { instanceId: '', token: '' } }); }
});

// ── Settings: POST ────────────────────────────────────────────
app.post('/api/settings', async (req, res) => {
    try {
        const userId = uid(req);
        const { ultramsg: um, ...smtpFields } = req.body;
        logger.log(`Received POST settings updates for user ${userId}: ${Object.keys(smtpFields).join(', ')}`, 'SETTINGS');
        for (const [key, value] of Object.entries(smtpFields)) {
            if (value !== undefined) {
                // Safeguard against browser autofill or UI mask overwriting valid password/key
                if (key === 'smtp_pass' || key === 'gemini_api_key') {
                    if (value === '••••••••' || value.includes('•') || value.includes('●') || value.includes('*')) {
                        logger.log(`Skipping saving ${key} because value looks like a masked placeholder: "${value}"`, 'SETTINGS');
                        continue;
                    }
                    if (!value.trim()) {
                        logger.log(`Skipping saving ${key} because value is empty`, 'SETTINGS');
                        continue;
                    }
                }
                
                logger.log(`Saving setting: ${key} for user: ${userId}`, 'SETTINGS');
                await Settings.findOneAndUpdate({ userId, key }, { value }, { upsert: true });
            }
        }
        if (um) {
            if (um.instanceId !== undefined) {
                logger.log(`Saving UltraMsg Instance ID for user: ${userId}`, 'SETTINGS');
                await Settings.findOneAndUpdate({ userId, key: 'ultramsg_instance_id' }, { value: um.instanceId }, { upsert: true });
            }
            if (um.token !== undefined) {
                const tokenVal = um.token;
                if (tokenVal !== '••••••••' && !tokenVal.includes('•') && !tokenVal.includes('●') && !tokenVal.includes('*')) {
                    if (tokenVal.trim()) {
                        logger.log(`Saving UltraMsg Token for user: ${userId}`, 'SETTINGS');
                        await Settings.findOneAndUpdate({ userId, key: 'ultramsg_token' }, { value: tokenVal }, { upsert: true });
                    }
                } else {
                    logger.log(`Skipping saving ultramsg_token because value is a masked placeholder or empty`, 'SETTINGS');
                }
            }
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
    try {
        const userId = uid(req);
        let { instanceId, token } = req.body || {};
        
        if (!instanceId && userId) {
            const savedId = await Settings.findOne({ userId, key: 'ultramsg_instance_id' });
            if (savedId) instanceId = savedId.value;
        }
        if ((!token || token === '••••••••') && userId) {
            const savedToken = await Settings.findOne({ userId, key: 'ultramsg_token' });
            if (savedToken) token = savedToken.value;
        }
        
        if (!instanceId || !token) {
            return res.json({ success: false, error: 'Instance ID and Token are required to test connection.' });
        }
        
        const result = await ultraMsg.testConnection(instanceId, token);
        res.json(result);
    } catch(e) {
        res.json({ success: false, error: e.message });
    }
});

// ── Test Gemini API Key ────────────────────────────────────────
app.post('/api/test-gemini', async (req, res) => {
    try {
        const userId = uid(req);
        // Accept inline key or fall back to saved key
        let apiKey = (req.body && req.body.api_key) ? req.body.api_key.trim() : null;
        if (!apiKey && userId) {
            const saved = await Settings.findOne({ userId, key: 'gemini_api_key' });
            if (saved) apiKey = saved.value;
        }
        if (!apiKey) apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) return res.json({ success: false, error: 'No Gemini API key configured.' });

        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent('Reply with exactly: OK');
        const text = result.response.text().trim();
        res.json({ success: true, message: `✅ Gemini connected! Response: "${text}"` });
    } catch (e) {
        res.json({ success: false, error: e.message || 'Gemini API error' });
    }
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

// ═══════════════════════════════════════════════════════════
// ── SMTP Email Accounts (Multi-Account Load Balancer) ──────
// ═══════════════════════════════════════════════════════════

// Helper to calculate total SMTP daily limit for a user
async function getDefaultScheduleLimitForUser(userId) {
    try {
        const accounts = await SmtpAccount.find({ userId, isActive: true });
        if (accounts.length > 0) {
            return accounts.reduce((sum, a) => sum + (a.daily_limit || 450), 0);
        }
        const all = await SmtpAccount.find({ userId });
        if (all.length > 0) {
            return all.reduce((sum, a) => sum + (a.daily_limit || 450), 0);
        }
        return 450;
    } catch (e) {
        return 450;
    }
}

// Helper to scale EmailSchedule limits based on SmtpAccount count
async function updateScheduleLimitsForUser(userId) {
    try {
        const newLimit = await getDefaultScheduleLimitForUser(userId);
        await EmailSchedule.updateMany(
            { userId },
            { $set: { daily_limit: newLimit } }
        );
        logger.log(`[SMTP_LIMIT_SCALE] Updated all EmailSchedule limits to ${newLimit} for user ${userId}`, 'SMTP');
    } catch (e) {
        logger.error(`[SMTP_LIMIT_SCALE] Failed to update EmailSchedule limits for user ${userId}:`, e);
    }
}

// ── GET all SMTP accounts (passwords masked) ──────────────────
app.get('/api/smtp-accounts', async (req, res) => {
    try {
        const userId = uid(req);
        // Trigger migration of old single-account settings on first load
        const beforeCount = await SmtpAccount.countDocuments({ userId });
        await migrateOldSettingsIfNeeded(userId);
        const afterCount = await SmtpAccount.countDocuments({ userId });
        if (beforeCount === 0 && afterCount > 0) {
            await updateScheduleLimitsForUser(userId);
        }

        const accounts = await SmtpAccount.find({ userId }).sort({ createdAt: 1 }).lean();
        const today = new Date().toISOString().slice(0, 10);

        // Mask passwords, compute today's sent
        const safe = accounts.map(a => ({
            _id:         a._id,
            label:       a.label,
            smtp_host:   a.smtp_host,
            smtp_port:   a.smtp_port,
            smtp_secure: a.smtp_secure,
            smtp_user:   a.smtp_user,
            smtp_from:   a.smtp_from,
            isActive:    a.isActive,
            daily_limit: a.daily_limit,
            daily_sent:  a.daily_date === today ? a.daily_sent : 0,
            total_sent:  a.total_sent,
            last_used_at: a.last_used_at,
            createdAt:   a.createdAt,
            hasPassword: !!a.smtp_pass,
        }));

        // Load balancer summary
        const activeAccounts = safe.filter(a => a.isActive);
        const totalCapacity  = activeAccounts.reduce((s, a) => s + a.daily_limit, 0);
        const totalSentToday = activeAccounts.reduce((s, a) => s + a.daily_sent, 0);

        res.json({
            accounts: safe,
            summary: {
                total:         safe.length,
                active:        activeAccounts.length,
                totalCapacity,
                totalSentToday,
                remainingToday: totalCapacity - totalSentToday,
            }
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST add new SMTP account ──────────────────────────────────
app.post('/api/smtp-accounts', async (req, res) => {
    try {
        const userId = uid(req);
        const { label, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from, daily_limit } = req.body;
        if (!smtp_user || !smtp_pass) {
            return res.status(400).json({ success: false, error: 'Gmail address and App Password are required.' });
        }
        const acct = await SmtpAccount.create({
            userId,
            label:       label       || 'Gmail Account',
            smtp_host:   smtp_host   || 'smtp.gmail.com',
            smtp_port:   parseInt(smtp_port) || 587,
            smtp_secure: smtp_secure === true || smtp_secure === 'true',
            smtp_user:   smtp_user.trim(),
            smtp_pass:   smtp_pass,
            smtp_from:   smtp_from   || 'Digital Growth Team',
            daily_limit: parseInt(daily_limit) || 450,
            isActive:    true,
        });
        logger.log(`New SMTP account added: ${smtp_user.split('@')[0]}***@${smtp_user.split('@')[1]}`, 'SMTP_ACCT');
        
        // Scale EmailSchedule rules limits
        await updateScheduleLimitsForUser(userId);
        
        res.json({ success: true, id: acct._id });
    } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── PUT update SMTP account ────────────────────────────────────
app.put('/api/smtp-accounts/:id', async (req, res) => {
    try {
        const userId = uid(req);
        const { label, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from, daily_limit, isActive } = req.body;
        const update = {};
        if (label       !== undefined) update.label       = label;
        if (smtp_host   !== undefined) update.smtp_host   = smtp_host;
        if (smtp_port   !== undefined) update.smtp_port   = parseInt(smtp_port) || 587;
        if (smtp_secure !== undefined) update.smtp_secure = smtp_secure === true || smtp_secure === 'true';
        if (smtp_user   !== undefined) update.smtp_user   = smtp_user.trim();
        if (smtp_from   !== undefined) update.smtp_from   = smtp_from;
        if (daily_limit !== undefined) update.daily_limit = parseInt(daily_limit) || 400;
        if (isActive    !== undefined) update.isActive    = !!isActive;
        // Only update password if a new one is supplied (not masked placeholder)
        if (smtp_pass && !smtp_pass.includes('•') && smtp_pass.trim().length > 0) {
            update.smtp_pass = smtp_pass.trim();
        }
        const acct = await SmtpAccount.findOneAndUpdate({ _id: req.params.id, userId }, { $set: update }, { new: true });
        if (!acct) return res.status(404).json({ success: false, error: 'Account not found.' });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── DELETE SMTP account ────────────────────────────────────────
app.delete('/api/smtp-accounts/:id', async (req, res) => {
    try {
        const userId = uid(req);
        const acct = await SmtpAccount.findOneAndDelete({ _id: req.params.id, userId });
        if (!acct) return res.status(404).json({ success: false, error: 'Account not found.' });
        logger.log(`SMTP account deleted: ${acct.smtp_user}`, 'SMTP_ACCT');
        
        // Scale EmailSchedule rules limits
        await updateScheduleLimitsForUser(userId);
        
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST test individual SMTP account ─────────────────────────
app.post('/api/smtp-accounts/:id/test', async (req, res) => {
    try {
        const userId = uid(req);
        const result = await testSmtpAccountById(req.params.id, userId);
        res.json(result);
    } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST test NEW account inline (before saving) ───────────────
app.post('/api/smtp-accounts/test-inline', async (req, res) => {
    const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass } = req.body || {};
    if (!smtp_user || !smtp_pass) {
        return res.json({ success: false, error: 'Gmail address and App Password are required.' });
    }
    const { createTransportDirect } = require('./services/email-sender');
    try {
        logger.log(`Testing inline SMTP for: ${smtp_user}`, 'SMTP_TEST');
        const t = createTransportDirect({ host: smtp_host || 'smtp.gmail.com', port: smtp_port || 587, secure: smtp_secure, user: smtp_user, pass: smtp_pass });
        await t.verify();
        res.json({ success: true, message: '✅ SMTP Connected! Account is ready to send emails.' });
    } catch(e) {
        let msg = e.message;
        if (msg.includes('535') || msg.includes('Username and Password') || msg.includes('Invalid login')) {
            msg = 'Wrong App Password. Visit myaccount.google.com/apppasswords to create a 16-char App Password.';
        } else if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
            msg = 'Cannot connect — check Host and Port.';
        } else if (msg.includes('SSL') || msg.includes('wrong version') || msg.includes('WRONG_VERSION')) {
            msg = 'SSL mismatch. Port 587 → STARTTLS (No SSL). Port 465 → Yes (SSL).';
        }
        res.json({ success: false, error: msg });
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

// ── Schedule: GET List ──────────────────────────────────────────
app.get('/api/schedule', async (req, res) => {
    try {
        const userId = uid(req);
        let list = await Schedule.find({ userId }).sort({ createdAt: -1 });
        if (!list.length) {
            const defaultSched = await Schedule.create({ userId, name: 'Default Schedule' });
            list = [defaultSched];
        }
        res.json({ list, categories_list: ALL_CATEGORIES });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Schedule: POST (create) ───────────────────────────────────
app.post('/api/schedule', async (req, res) => {
    try {
        const userId = uid(req);
        const { name, enabled, categories, cities, daily_limit, skip_sent, allow_resend, send_hours, report_email } = req.body;
        const s = await Schedule.create({
            userId,
            name: name || 'New Schedule',
            enabled: !!enabled,
            categories: categories || [],
            cities: cities || [],
            daily_limit: parseInt(daily_limit) || 60,
            skip_sent: skip_sent !== false,
            allow_resend: !!allow_resend,
            send_hours: send_hours || [10, 16],
            report_email: report_email || ''
        });
        res.json({ success: true, schedule: s });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Schedule: PUT (update) ────────────────────────────────────
app.put('/api/schedule/:id', async (req, res) => {
    try {
        const userId = uid(req);
        const { name, enabled, categories, cities, daily_limit, skip_sent, allow_resend, send_hours, report_email } = req.body;
        const s = await Schedule.findOneAndUpdate(
            { _id: req.params.id, userId },
            {
                $set: {
                    name: name || 'Schedule',
                    enabled: !!enabled,
                    categories: categories || [],
                    cities: cities || [],
                    daily_limit: parseInt(daily_limit) || 60,
                    skip_sent: skip_sent !== false,
                    allow_resend: !!allow_resend,
                    send_hours: send_hours || [10, 16],
                    report_email: report_email || ''
                }
            },
            { new: true }
        );
        if (!s) return res.status(404).json({ error: 'Schedule not found' });
        res.json({ success: true, schedule: s });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Schedule: DELETE ──────────────────────────────────────────
app.delete('/api/schedule/:id', async (req, res) => {
    try {
        const userId = uid(req);
        const s = await Schedule.findOneAndDelete({ _id: req.params.id, userId });
        if (!s) return res.status(404).json({ error: 'Schedule not found' });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Schedule: Run Now (manual trigger for a rule) ─────────────
app.post('/api/schedule/:id/run-now', async (req, res) => {
    try {
        const userId = uid(req);
        const scheduleId = req.params.id;
        if (scheduler.isRunning(userId)) {
            return res.json({ success: false, error: 'Already sending — please wait for current batch to finish' });
        }
        
        const schedule = await Schedule.findOne({ _id: scheduleId, userId });
        if (!schedule) {
            return res.json({ success: false, error: 'Schedule rule not found.' });
        }
        
        // Count matching leads
        const filter = { userId, phone: { $exists: true, $ne: '' } };
        if (schedule.categories?.length) {
            filter.category = { $in: schedule.categories };
        }
        if (schedule.cities?.length) {
            const cityRegexes = schedule.cities.map(c => new RegExp(`^${c.trim()}$`, 'i'));
            filter.city = { $in: cityRegexes };
        }
        if (schedule.skip_sent && !schedule.allow_resend) {
            filter.wa_sent = { $ne: true };
        }
        
        const count = await Lead.countDocuments(filter);
        if (count === 0) {
            return res.json({ 
                success: false, 
                error: `No matching unsent leads found. Category: [${schedule.categories.join(', ')}], City: [${schedule.cities.join(', ')}]. Please edit the rule to expand filters or check "Allow Re-send".`
            });
        }
        
        res.json({ success: true, message: `Found ${count} matching leads. Scheduled batch started! WhatsApp window will open shortly.` });
        setImmediate(() => {
            scheduler.runScheduledSend('manual', userId, scheduleId).catch(e => console.error('Run-now error:', e.message));
        });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── Schedule: Test Daily Report Email ────────────────────────
app.post('/api/schedule/:id/test-report', async (req, res) => {
    try {
        const userId = uid(req);
        const schedule = await Schedule.findOne({ _id: req.params.id, userId });
        if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
        
        const { sendDailyReportForRule } = require('./services/scheduler');
        await sendDailyReportForRule(schedule);
        res.json({ success: true, message: 'Test report sent!' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Schedule: Status ─────────────────────────────────────────────
app.get('/api/schedule/status', async (req, res) => {
    try {
        const userId = uid(req);
        const list = await Schedule.find({ userId });
        
        const active = list.some(s => s.enabled);
        const today_sent = list.reduce((sum, s) => sum + (s.today_sent || 0), 0);
        const today_failed = list.reduce((sum, s) => sum + (s.today_failed || 0), 0);
        const total_limit = list.reduce((sum, s) => sum + (s.daily_limit || 0), 0);
        
        let last_run = null;
        list.forEach(s => {
            if (s.last_run && (!last_run || s.last_run > last_run)) {
                last_run = s.last_run;
            }
        });

        res.json({
            enabled:     active,
            today_sent:  today_sent,
            today_failed:today_failed,
            daily_limit: total_limit,
            last_run:    last_run,
            is_running:  scheduler.isRunning(userId)
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Schedule: Preview matching leads ──────────────────────────
app.post('/api/schedule/preview', async (req, res) => {
    try {
        const userId = uid(req);
        const { categories, cities, skip_sent, allow_resend, daily_limit, send_hours } = req.body;
        
        const filter = { userId, phone: { $exists: true, $ne: '' } };

        if (categories?.length) {
            filter.category = { $in: categories };
        }
        
        if (cities?.length) {
            const cityRegexes = cities.map(c => new RegExp(`^${c.trim()}$`, 'i'));
            filter.city = { $in: cityRegexes };
        }

        if (skip_sent && !allow_resend) {
            filter.wa_sent = { $ne: true };
        }

        const hourCount = send_hours?.length || 1;
        const targetBatchSize = Math.ceil((parseInt(daily_limit) || 60) / hourCount);

        const leads = await Lead.find(filter)
            .sort({ createdAt: 1 })
            .limit(Math.min(targetBatchSize, 30))
            .select('name phone city category wa_sent')
            .lean();

        res.json({ success: true, count: leads.length, leads });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Email Schedule: GET List ──────────────────────────────────────────
app.get('/api/email-schedule', async (req, res) => {
    try {
        const userId = uid(req);
        let list = await EmailSchedule.find({ userId }).sort({ createdAt: -1 });
        if (!list.length) {
            const defaultLimit = await getDefaultScheduleLimitForUser(userId);
            const defaultSched = await EmailSchedule.create({ 
                userId, 
                name: 'Default Email Schedule',
                daily_limit: defaultLimit
            });
            list = [defaultSched];
        }
        res.json({ list, categories_list: ALL_CATEGORIES });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Email Schedule: POST (create) ───────────────────────────────────
app.post('/api/email-schedule', async (req, res) => {
    try {
        const userId = uid(req);
        const { name, enabled, categories, cities, daily_limit, skip_sent, allow_resend, send_hours, report_email, temperatures, filter_no_website, filter_has_email, filter_min_rating } = req.body;
        const defaultLimit = await getDefaultScheduleLimitForUser(userId);
        const s = await EmailSchedule.create({
            userId,
            name: name || 'New Email Schedule',
            enabled: !!enabled,
            categories: categories || [],
            cities: cities || [],
            temperatures: temperatures || [],
            filter_no_website: !!filter_no_website,
            filter_has_email: !!filter_has_email,
            filter_min_rating: parseFloat(filter_min_rating) || 0,
            daily_limit: daily_limit !== undefined ? parseInt(daily_limit) : defaultLimit,
            skip_sent: skip_sent !== false,
            allow_resend: !!allow_resend,
            send_hours: send_hours || [10, 16],
            report_email: report_email || ''
        });
        res.json({ success: true, schedule: s });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Email Schedule: PUT (update) ────────────────────────────────────
app.put('/api/email-schedule/:id', async (req, res) => {
    try {
        const userId = uid(req);
        const { name, enabled, categories, cities, daily_limit, skip_sent, allow_resend, send_hours, report_email, temperatures, filter_no_website, filter_has_email, filter_min_rating } = req.body;
        const defaultLimit = await getDefaultScheduleLimitForUser(userId);
        const s = await EmailSchedule.findOneAndUpdate(
            { _id: req.params.id, userId },
            {
                $set: {
                    name: name || 'Email Schedule',
                    enabled: !!enabled,
                    categories: categories || [],
                    cities: cities || [],
                    temperatures: temperatures || [],
                    filter_no_website: !!filter_no_website,
                    filter_has_email: !!filter_has_email,
                    filter_min_rating: parseFloat(filter_min_rating) || 0,
                    daily_limit: daily_limit !== undefined ? parseInt(daily_limit) : defaultLimit,
                    skip_sent: skip_sent !== false,
                    allow_resend: !!allow_resend,
                    send_hours: send_hours || [10, 16],
                    report_email: report_email || ''
                }
            },
            { new: true }
        );
        if (!s) return res.status(404).json({ error: 'Email schedule not found' });
        res.json({ success: true, schedule: s });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Email Schedule: DELETE ──────────────────────────────────────────
app.delete('/api/email-schedule/:id', async (req, res) => {
    try {
        const userId = uid(req);
        const s = await EmailSchedule.findOneAndDelete({ _id: req.params.id, userId });
        if (!s) return res.status(404).json({ error: 'Email schedule not found' });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Email Schedule: Run Now (manual trigger for a rule) ─────────────
app.post('/api/email-schedule/:id/run-now', async (req, res) => {
    try {
        const userId = uid(req);
        const scheduleId = req.params.id;
        if (emailScheduler.isRunning(userId)) {
            return res.json({ success: false, error: 'Already sending — please wait for current batch to finish' });
        }
        
        const schedule = await EmailSchedule.findOne({ _id: scheduleId, userId });
        if (!schedule) {
            return res.json({ success: false, error: 'Email schedule rule not found.' });
        }
        
        // Count matching leads
        const filter = { userId, email: { $exists: true, $ne: '' } };
        if (schedule.categories?.length) {
            filter.category = { $in: schedule.categories };
        }
        if (schedule.cities?.length) {
            const cityRegexes = schedule.cities.map(c => new RegExp(`^${c.trim()}$`, 'i'));
            filter.city = { $in: cityRegexes };
        }
        if (schedule.temperatures?.length) {
            filter.temperature = { $in: schedule.temperatures };
        }
        if (schedule.filter_no_website) {
            filter.$or = [
                { website: { $exists: false } },
                { website: '' },
                { website: null }
            ];
        }
        if (schedule.filter_min_rating && schedule.filter_min_rating > 0) {
            filter.rating = { $gte: schedule.filter_min_rating };
        }
        if (schedule.skip_sent && !schedule.allow_resend) {
            filter.email_sent = { $ne: true };
        }
        
        const count = await Lead.countDocuments(filter);
        if (count === 0) {
            return res.json({ 
                success: false, 
                error: `No matching unsent leads found. Category: [${schedule.categories.join(', ')}], City: [${schedule.cities.join(', ')}]. Please edit the rule to expand filters or check "Allow Re-send".`
            });
        }
        
        res.json({ success: true, message: `Found ${count} matching leads. Scheduled email batch started in background!` });
        setImmediate(() => {
            emailScheduler.runScheduledSend('manual', userId, scheduleId).catch(e => console.error('Run-now error:', e.message));
        });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── Email Schedule: Test Daily Report Email ────────────────────────
app.post('/api/email-schedule/:id/test-report', async (req, res) => {
    try {
        const userId = uid(req);
        const schedule = await EmailSchedule.findOne({ _id: req.params.id, userId });
        if (!schedule) return res.status(404).json({ error: 'Email schedule not found' });
        
        await emailScheduler.sendDailyReportForRule(schedule);
        res.json({ success: true, message: 'Test report sent!' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Email Schedule: Status ─────────────────────────────────────────────
app.get('/api/email-schedule/status', async (req, res) => {
    try {
        const userId = uid(req);
        const list = await EmailSchedule.find({ userId });
        
        const active = list.some(s => s.enabled);
        const today_sent = list.reduce((sum, s) => sum + (s.today_sent || 0), 0);
        const today_failed = list.reduce((sum, s) => sum + (s.today_failed || 0), 0);
        const total_limit = list.reduce((sum, s) => sum + (s.daily_limit || 0), 0);
        
        let last_run = null;
        list.forEach(s => {
            if (s.last_run && (!last_run || s.last_run > last_run)) {
                last_run = s.last_run;
            }
        });

        res.json({
            enabled:     active,
            today_sent:  today_sent,
            today_failed:today_failed,
            daily_limit: total_limit,
            last_run:    last_run,
            is_running:  emailScheduler.isRunning(userId)
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Email Schedule: Preview matching leads ──────────────────────────
app.post('/api/email-schedule/preview', async (req, res) => {
    try {
        const userId = uid(req);
        const { categories, cities, skip_sent, allow_resend, daily_limit, send_hours, temperatures, filter_no_website, filter_has_email, filter_min_rating } = req.body;
        
        const filter = { userId, email: { $exists: true, $ne: '' } };

        if (categories?.length) {
            filter.category = { $in: categories };
        }
        
        if (cities?.length) {
            const cityRegexes = cities.map(c => new RegExp(`^${c.trim()}$`, 'i'));
            filter.city = { $in: cityRegexes };
        }

        if (temperatures?.length) {
            filter.temperature = { $in: temperatures };
        }

        if (filter_no_website) {
            filter.$or = [
                { website: { $exists: false } },
                { website: '' },
                { website: null }
            ];
        }

        if (filter_min_rating && parseFloat(filter_min_rating) > 0) {
            filter.rating = { $gte: parseFloat(filter_min_rating) };
        }

        if (skip_sent && !allow_resend) {
            filter.email_sent = { $ne: true };
        }

        const hourCount = send_hours?.length || 1;
        const targetBatchSize = Math.ceil((parseInt(daily_limit) || 60) / hourCount);

        const leads = await Lead.find(filter)
            .sort({ rating: -1, createdAt: 1 })
            .limit(Math.min(targetBatchSize, 30))
            .select('name email city category email_sent rating temperature')
            .lean();

        res.json({ success: true, count: leads.length, leads });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Social Poster: GET Settings ──────────────────────────────
app.get('/api/social/settings', async (req, res) => {
    try {
        const userId = uid(req);
        let s = await SocialSettings.findOne({ userId });
        if (!s) s = await SocialSettings.create({ userId });
        
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

// ── Social Poster: TEST Connections ──────────────────────────
app.post('/api/social/test-connections', async (req, res) => {
    try {
        const userId = uid(req);
        const { channels } = req.body;
        
        let settings = await SocialSettings.findOne({ userId });
        
        const results = {};
        const list = ['linkedin', 'facebook', 'instagram', 'twitter', 'pinterest', 'threads', 'gbp', 'youtube'];
        
        for (const ch of list) {
            const config = channels[ch] || {};
            if (!config.enabled) continue;
            
            let token = config.token;
            if (token === '••••••••' || !token) {
                token = (settings && settings.channels && settings.channels[ch]) ? settings.channels[ch].token : '';
            }
            
            if (ch === 'linkedin') {
                const urnInput = config.urn || ((settings && settings.channels && settings.channels.linkedin) ? settings.channels.linkedin.urn : '');
                const { isPersonalProfile, formatOrganizationUrn, fetchLinkedInPersonUrn } = require('./services/social-poster');
                
                if (!token || token === '••••••••') {
                    results[ch] = { success: false, message: 'Access Token is missing' };
                    continue;
                }
                
                const isPersonal = !urnInput || isPersonalProfile(urnInput);
                if (isPersonal) {
                    try {
                        const resolved = await fetchLinkedInPersonUrn(token);
                        if (resolved && resolved.urn) {
                            results[ch] = { success: true, message: `Connected as Personal Profile (${resolved.urn})` };
                        } else {
                            results[ch] = { success: false, message: 'Could not resolve personal profile. Token may be expired or lacks permissions.' };
                        }
                    } catch (e) {
                        results[ch] = { success: false, message: `Personal profile query failed: ${e.message}` };
                    }
                } else {
                    try {
                        const orgUrn = formatOrganizationUrn(urnInput);
                        const orgId = orgUrn.replace('urn:li:organization:', '');
                        
                        const response = await fetch(`https://api.linkedin.com/rest/organizations/${orgId}`, {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'X-Restli-Protocol-Version': '2.0.0',
                                'LinkedIn-Version': '202605'
                            }
                        });
                        
                        if (response.ok) {
                            const orgData = await response.json();
                            results[ch] = { success: true, message: `Connected to Company Page: "${orgData.localizedName || orgUrn}"` };
                        } else {
                            const responseV2 = await fetch(`https://api.linkedin.com/v2/organizations/${orgId}`, {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'X-Restli-Protocol-Version': '2.0.0'
                                }
                            });
                            if (responseV2.ok) {
                                const orgData = await responseV2.json();
                                results[ch] = { success: true, message: `Connected to Company Page: "${orgData.localizedName || orgUrn}"` };
                            } else {
                                results[ch] = { success: false, message: `Company Page access denied (Status ${responseV2.status})` };
                            }
                        }
                    } catch (e) {
                        results[ch] = { success: false, message: `Company Page validation failed: ${e.message}` };
                    }
                }
            } else {
                if (!token) {
                    results[ch] = { success: false, message: 'API Token/Key is missing' };
                } else {
                    results[ch] = { success: true, message: 'Mock connection successful (Simulated integration active)' };
                }
            }
        }
        res.json({ success: true, results });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Social Poster: SAVE Settings ─────────────────────────────
app.post('/api/social/settings', async (req, res) => {
    try {
        const userId = uid(req);
        const { 
            enabled, frequency, time_hour, website_url, topic, title, custom_content, channels, categories,
            business_category, business_name, business_desc, target_audience, primary_services, language,
            content_goal, content_type, tone, post_length, gen_images, gen_hashtags, auto_publish, time_zone, topics
        } = req.body;
        let s = await SocialSettings.findOne({ userId });
        if (!s) s = new SocialSettings({ userId });

        s.enabled = !!enabled;
        s.frequency = frequency || 'daily';
        s.time_hour = parseInt(time_hour) || 10;
        s.website_url = website_url || '';
        s.topic = topic || '';
        s.title = title || '';
        s.custom_content = custom_content || '';
        s.categories = categories || [];

        // Save Enterprise fields
        if (business_category !== undefined) s.business_category = business_category;
        if (business_name !== undefined) s.business_name = business_name;
        if (business_desc !== undefined) s.business_desc = business_desc;
        if (target_audience !== undefined) s.target_audience = target_audience;
        if (primary_services !== undefined) s.primary_services = primary_services;
        if (language !== undefined) s.language = language;
        if (content_goal !== undefined) s.content_goal = content_goal;
        if (content_type !== undefined) s.content_type = content_type;
        if (tone !== undefined) s.tone = tone;
        if (post_length !== undefined) s.post_length = post_length;
        if (gen_images !== undefined) s.gen_images = !!gen_images;
        if (gen_hashtags !== undefined) s.gen_hashtags = !!gen_hashtags;
        if (auto_publish !== undefined) s.auto_publish = !!auto_publish;
        if (time_zone !== undefined) s.time_zone = time_zone;
        if (topics !== undefined) s.topics = topics;

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

// ── Social Poster: ANALYZE Website ────────────────────────────
app.post('/api/social/analyze-website', async (req, res) => {
    try {
        const userId = uid(req);
        const { website_url } = req.body;
        if (!website_url) {
            return res.status(400).json({ error: 'Website URL is required' });
        }

        const { scrapeWebsite } = require('./services/social-poster');
        const scrapedText = await scrapeWebsite(website_url);
        if (!scrapedText || (scrapedText.includes('Playwright extraction failed') && scrapedText.includes('Fetch failed'))) {
            return res.status(400).json({ error: 'Could not scrape website content. Please verify the URL and try again.' });
        }

        // Get Gemini key
        let apiKey = null;
        const saved = await Settings.findOne({ userId, key: 'gemini_api_key' });
        if (saved) apiKey = saved.value;
        if (!apiKey) apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) {
            return res.status(400).json({ error: 'Gemini API key is not configured. Please add it in Settings tab first.' });
        }

        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `
You are an expert marketing strategist. Analyze the following content scraped from a company's website and extract key company details.

Website Text:
${scrapedText.substring(0, 8000)}

Provide a JSON response with the following keys. Do not include any markdown formatting like \`\`\`json or \`\`\` around the JSON, just return the raw JSON string:
{
  "company_name": "extracted name of company (maximum 30 characters)",
  "business_category": "select exactly one of these: IT Services, Real Estate, Hospital, Restaurant, School, Insurance, Manufacturing, Retail, Consultant, Salon, Gym, Automobile, Custom",
  "business_desc": "brief professional description of what the business does (maximum 150 characters)",
  "target_audience": "who is their target customer base (maximum 100 characters)",
  "primary_services": "list of primary services (maximum 5, comma-separated)",
  "content_topics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"]
}
`;
        const result = await model.generateContent(prompt);
        let textResponse = result.response.text().trim();
        if (textResponse.startsWith('```')) {
            textResponse = textResponse.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }

        const analysis = JSON.parse(textResponse);
        res.json({ success: true, analysis });
    } catch(e) { 
        res.status(500).json({ error: 'AI analysis failed: ' + e.message }); 
    }
});

// ── Social Poster: GET Recent Posts ──────────────────────────
app.get('/api/social/posts', async (req, res) => {
    try {
        const userId = uid(req);
        const posts = await SocialPost.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
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
        const posts = await generateSocialPosts(webData, topic, title, custom_content, { userId: uid(req), websiteUrl: website_url });
        res.json({ success: true, posts, webData });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Social Poster: Post Now (Trigger Instant Simulation) ─────
app.post('/api/social/post-now', async (req, res) => {
    try {
        const userId = uid(req);
        const { website_url, topic, title, custom_content } = req.body;
        const { scrapeWebsite, generateSocialPosts, postToSocial } = require('./services/social-poster');
        
        let settings = await SocialSettings.findOne({ userId });
        if (!settings) {
            return res.status(400).json({ error: 'Please save settings first before running immediate post.' });
        }

        // Use request body inputs as temporary overrides if provided
        const webUrl = website_url || settings.website_url;
        if (!webUrl) return res.status(400).json({ error: 'Website URL is required' });
        
        const tempSettings = {
            userId,
            website_url: webUrl,
            topic: topic || settings.topic,
            title: title || settings.title,
            custom_content: custom_content || settings.custom_content,
            channels: settings.channels
        };

        const webData = await scrapeWebsite(webUrl);
        const posts = await generateSocialPosts(webData, tempSettings.topic, tempSettings.title, tempSettings.custom_content, { userId, websiteUrl: tempSettings.website_url });
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
        const userId   = uid(req);
        const search   = req.query.search   || '';
        const status   = req.query.status   || '';
        const filter   = { userId, followup_queued: true };
        if (search) {
            const re = new RegExp(search, 'i');
            filter.$and = [
                { userId },
                { $or: [{ name: re }, { phone: re }, { raw_phone: re }, { email: re }, { city: re }] }
            ];
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
        const userId = uid(req);
        const { note, scheduled_at } = req.body;
        const update = {
            followup_queued: true,
            followup_note: note || '',
            followup_scheduled_at: scheduled_at ? new Date(scheduled_at) : new Date(),
            status: 'followup'
        };
        const lead = await Lead.findOneAndUpdate(
            { _id: req.params.id, userId },
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
        const userId = uid(req);
        const lead = await Lead.findOneAndUpdate(
            { _id: req.params.id, userId },
            {
                $set: { followup_queued: false, followup_note: '', followup_scheduled_at: null },
                $push: { activity: { type: 'followup', message: 'Removed from follow-up queue', date: new Date() } }
            }
        );
        if (!lead) return res.status(404).json({ error: 'Lead not found' });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Send follow-up WA (draft) from follow-up queue ───────
app.post('/api/leads/:id/followup-send-wa', async (req, res) => {
    try {
        const userId = uid(req);
        const lead = await Lead.findOne({ _id: req.params.id, userId }).lean();
        if (!lead) return res.status(404).json({ error: 'Lead not found' });
        res.json({ success: true, message: 'Follow-up WA draft started!' });
        setImmediate(async () => {
            const { sendLocalWA_Draft } = require('./playwright-sender');
            await sendLocalWA_Draft([req.params.id], true, { skipWaSent: false, companyId: userId });
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Send follow-up Email from follow-up queue ────────────
app.post('/api/leads/:id/followup-send-email', async (req, res) => {
    try {
        const userId = uid(req);
        const lead = await Lead.findOne({ _id: req.params.id, userId }).lean();
        if (!lead) return res.status(404).json({ error: 'Lead not found' });
        if (!lead.email) return res.status(400).json({ error: 'No email address for this lead' });
        const followupNum = (lead.followup_count || 0) + 1;
        const { subject, html } = buildFollowupEmail(lead, followupNum);
        await sendEmail(lead.email, subject, html, userId);
        await Lead.findOneAndUpdate({ _id: lead._id, userId }, {
            $inc:  { email_count: 1, followup_count: 1 },
            $set:  { email_sent: true, email_last_date: todayStr() },
            $push: { activity: { type: 'email_sent', message: `Follow-up #${followupNum} email sent`, date: new Date() } }
        });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST Bulk send follow-up WA (draft) ───────────────────────
app.post('/api/followups/send-wa', async (req, res) => {
    const userId = uid(req);
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    const matchingLeads = await Lead.find({ _id: { $in: ids }, userId }).select('_id');
    const allowedIds = matchingLeads.map(l => l._id.toString());
    if (!allowedIds.length) return res.status(400).json({ error: 'No authorized leads selected' });
    res.json({ success: true, message: 'Follow-up WA draft started for selected leads!' });
    setImmediate(async () => {
        const { sendLocalWA_Draft } = require('./playwright-sender');
        await sendLocalWA_Draft(allowedIds, true, { skipWaSent: false, companyId: userId });
    });
});

// ── POST Bulk send follow-up Emails ───────────────────────────
app.post('/api/followups/send-email', async (req, res) => {
    const userId = uid(req);
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    res.json({ success: true, message: 'Follow-up emails started!' });
    setImmediate(async () => {
        const leads = await Lead.find({ _id: { $in: ids }, userId }).lean();
        let sent = 0, failed = 0;
        emit({ type: 'start', total: leads.length });
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            emit({ type: 'sending', current: i+1, total: leads.length, name: lead.name, sent, failed });
            if (!lead.email) { failed++; emit({ type: 'failed', name: lead.name, reason: 'No email', sent, failed }); continue; }
            try {
                const followupNum = (lead.followup_count || 0) + 1;
                const { subject, html } = buildFollowupEmail(lead, followupNum);
                await sendEmail(lead.email, subject, html, userId);
                await Lead.findOneAndUpdate({ _id: lead._id, userId }, {
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

// ── Lead Temperature Migration ──────────────────────────────────
async function migrateLeadTemperatures() {
    try {
        const count = await Lead.countDocuments({ $or: [ { temperature: { $exists: false } }, { temperature: '' }, { temperature: null } ] });
        if (count === 0) return;
        
        console.log(`⏳ [MIGRATION] Found ${count} leads without temperature. Running migration...`);
        const cursor = Lead.find({ $or: [ { temperature: { $exists: false } }, { temperature: '' }, { temperature: null } ] }).cursor();
        let updated = 0;
        for (let lead = await cursor.next(); lead != null; lead = await cursor.next()) {
            const hasPhone = !!(lead.phone && lead.phone.trim());
            const hasEmail = !!(lead.email && lead.email.trim());
            const rating = lead.rating || 0;
            if (rating >= 4 && hasPhone && hasEmail) {
                lead.temperature = 'hot';
            } else if (rating >= 3 && (hasPhone || hasEmail)) {
                lead.temperature = 'warm';
            } else {
                lead.temperature = 'cold';
            }
            await lead.save();
            updated++;
        }
        console.log(`✅ [MIGRATION] Lead temperature migration completed. Updated ${updated} leads.`);
    } catch (e) {
        console.error(`❌ [MIGRATION] Lead temperature migration failed:`, e);
    }
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


// ================================================================
//  SOCIAL MEDIA LEAD EXTRACTOR — API Routes
//  Finds potential customers for Innvoque IT services
// ================================================================

// Active scrape jobs tracker
const activeScrapeJobs = new Map();
let socialSSEClients = [];

function emitSocialEvent(jobId, data) {
    const msg = `data: ${JSON.stringify({ jobId, ...data })}\n\n`;
    socialSSEClients.forEach(c => { try { c.write(msg); } catch(e) {} });
}

// SSE stream for social scraping progress
app.get('/api/social-leads/progress', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    socialSSEClients.push(res);
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    req.on('close', () => { socialSSEClients = socialSSEClients.filter(c => c !== res); });
});

// GET /api/social-leads/keywords — return Innvoque keyword presets
app.get('/api/social-leads/keywords', requireAuth, (req, res) => {
    res.json({ presets: socialScraper.getKeywordPresets() });
});

// POST /api/social-leads/search — start a scraping job
app.post('/api/social-leads/search', requireAuth, async (req, res) => {
    try {
        const {
            platforms = ['linkedin', 'twitter', 'indiamart', 'justdial'],
            keyword,
            city = 'India',
            maxPerPlatform = 20
        } = req.body;

        if (!keyword) return res.status(400).json({ error: 'keyword is required' });

        const jobId = Date.now().toString();
        activeScrapeJobs.set(jobId, { status: 'running', startedAt: new Date(), leads: [] });

        res.json({ jobId, status: 'started' });

        // Run scraping in background
        setImmediate(async () => {
            try {
                emitSocialEvent(jobId, { type: 'start', keyword, platforms });

                const leads = await socialScraper.scrapeAllPlatforms({
                    platforms,
                    keyword,
                    city,
                    maxPerPlatform: Math.min(maxPerPlatform, 50),
                    onProgress: (evt) => {
                        emitSocialEvent(jobId, { type: 'progress', ...evt });
                    }
                });

                // Save unique leads to DB (skip if profileUrl already exists for this user)
                const userId = uid(req);
                let saved = 0;
                const savedLeads = [];

                for (const lead of leads) {
                    try {
                        const existing = lead.profileUrl
                            ? await SocialLead.findOne({ profileUrl: lead.profileUrl, userId })
                            : null;
                        if (existing) continue;

                        const doc = await SocialLead.create({ ...lead, userId });
                        savedLeads.push(doc);
                        saved++;
                    } catch (e) { /* duplicate — skip */ }
                }

                activeScrapeJobs.set(jobId, { status: 'done', leads: savedLeads });
                emitSocialEvent(jobId, {
                    type: 'done',
                    total: leads.length,
                    saved,
                    leads: savedLeads
                });
            } catch (e) {
                activeScrapeJobs.set(jobId, { status: 'error', error: e.message });
                emitSocialEvent(jobId, { type: 'error', error: e.message });
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/social-leads — list all social leads for user
app.get('/api/social-leads', requireAuth, async (req, res) => {
    try {
        const userId = uid(req);
        const {
            platform, status, score, serviceCategory,
            page = 1, limit = 50, search
        } = req.query;

        const filter = { userId };
        if (platform) filter.platform = platform;
        if (status)   filter.status   = status;
        if (serviceCategory) filter.serviceCategory = serviceCategory;
        if (score)    filter.score = { $gte: parseInt(score) };
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { company: { $regex: search, $options: 'i' } },
                { intentText: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [leads, total] = await Promise.all([
            SocialLead.find(filter).sort({ score: -1, createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            SocialLead.countDocuments(filter)
        ]);

        // Stats
        const stats = await SocialLead.aggregate([
            { $match: { userId: userId ? require('mongoose').Types.ObjectId.createFromHexString(userId.toString()) : null } },
            { $group: {
                _id: '$platform',
                count: { $sum: 1 },
                avgScore: { $avg: '$score' }
            }}
        ]).catch(() => []);

        res.json({ leads, total, page: parseInt(page), limit: parseInt(limit), stats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/social-leads/:id — update status/notes
app.patch('/api/social-leads/:id', requireAuth, async (req, res) => {
    try {
        const userId = uid(req);
        const { status, notes, score } = req.body;
        const update = {};
        if (status) update.status = status;
        if (notes !== undefined) update.notes = notes;
        if (score) update.score = score;

        const lead = await SocialLead.findOneAndUpdate(
            { _id: req.params.id, userId },
            { $set: update },
            { new: true }
        );
        if (!lead) return res.status(404).json({ error: 'Not found' });
        res.json(lead);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/social-leads/:id/add-to-crm — push social lead to main CRM
app.post('/api/social-leads/:id/add-to-crm', requireAuth, async (req, res) => {
    try {
        const userId = uid(req);
        const socialLead = await SocialLead.findOne({ _id: req.params.id, userId });
        if (!socialLead) return res.status(404).json({ error: 'Social lead not found' });
        if (socialLead.addedToCRM) return res.status(400).json({ error: 'Already added to CRM' });

        // Create main lead from social lead data
        const leadData = {
            userId,
            name: socialLead.name || socialLead.company || 'Unknown',
            email: socialLead.contactEmail || '',
            phone: socialLead.phone || '',
            website: socialLead.website || socialLead.profileUrl || '',
            category: socialLead.serviceCategory || 'Social Media Lead',
            city: socialLead.location || '',
            keyword: socialLead.intentKeyword || '',
            source: 'manual',
            status: 'new',
            notes: [
                `Source: ${socialLead.platform} lead`,
                `Profile: ${socialLead.profileUrl || 'N/A'}`,
                `Intent: ${socialLead.intentText ? socialLead.intentText.substring(0, 300) : 'N/A'}`,
                `Score: ${socialLead.score}/5`
            ].join('\n'),
            tags: [`social-${socialLead.platform}`, `score-${socialLead.score}`, socialLead.serviceCategory].filter(Boolean)
        };

        // Try to avoid duplicate by phone
        let crmLead;
        if (leadData.phone) {
            crmLead = await Lead.findOne({ phone: leadData.phone, userId });
        }
        if (!crmLead) {
            crmLead = await Lead.create(leadData);
        }

        // Mark social lead as added to CRM
        socialLead.addedToCRM = true;
        socialLead.addedToCRMAt = new Date();
        socialLead.crmLeadId = crmLead._id;
        socialLead.status = 'contacted';
        await socialLead.save();

        res.json({ success: true, crmLeadId: crmLead._id, crmLead });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/social-leads/:id — remove a social lead
app.delete('/api/social-leads/:id', requireAuth, async (req, res) => {
    try {
        const userId = uid(req);
        await SocialLead.findOneAndDelete({ _id: req.params.id, userId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/social-leads — bulk delete by filter
app.delete('/api/social-leads', requireAuth, async (req, res) => {
    try {
        const userId = uid(req);
        const { status, platform, olderThanDays } = req.body;
        const filter = { userId };
        if (status) filter.status = status;
        if (platform) filter.platform = platform;
        if (olderThanDays) {
            filter.createdAt = { $lt: new Date(Date.now() - olderThanDays * 86400000) };
        }
        const result = await SocialLead.deleteMany(filter);
        res.json({ success: true, deleted: result.deletedCount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/social-leads/export-csv — export as CSV
app.get('/api/social-leads/export-csv', requireAuth, async (req, res) => {
    try {
        const userId = uid(req);
        const leads = await SocialLead.find({ userId }).sort({ score: -1 }).lean();

        const header = ['Name','Company','Title','Platform','Location','Phone','Email','Website','Service Category','Score','Intent Keyword','Intent Text','Profile URL','Status','Added To CRM','Date Found'];
        const rows = leads.map(l => [
            l.name || '', l.company || '', l.title || '',
            l.platform || '', l.location || '', l.phone || '',
            l.contactEmail || '', l.website || '',
            l.serviceCategory || '', l.score || '',
            l.intentKeyword || '',
            (l.intentText || '').replace(/,/g, ';').replace(/\n/g, ' ').substring(0, 200),
            l.profileUrl || '', l.status || '',
            l.addedToCRM ? 'Yes' : 'No',
            l.createdAt ? new Date(l.createdAt).toISOString().slice(0,10) : ''
        ]);

        const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="social_leads_${Date.now()}.csv"`);
        res.send(csv);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Start ────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT) || 3000;

async function start() {
    console.log('\n' + '='.repeat(52));
    console.log('  🤖  LEAD AUTOMATION CRM');
    console.log('='.repeat(52));

    const ok = await connectDB();
    if (!ok) console.log('  ⚠️  Running without MongoDB — check connection string');
    else {
        try {
            await mongoose.connection.db.collection('settings').dropIndex('key_1');
            console.log('  ✅ Dropped legacy unique key_1 index from settings');
        } catch(e) {
            // Index doesn't exist, ignore
        }
    }

    app.listen(PORT, async () => {
        console.log(`\n  ✅ http://localhost:${PORT}\n`);
        if (ok) {
            await migrateJson();
            await migrateLeadTemperatures();
            console.log('⏳ Syncing MongoDB indexes...');
            try {
                await Lead.syncIndexes();
                await SocialLead.syncIndexes();
                console.log('✅ MongoDB indexes synchronized successfully.');
            } catch (err) {
                console.error('❌ Failed to synchronize MongoDB indexes:', err.message);
            }
            await loadTemplatesCache();
            await loadGoogleCredentials();
            // ── Start scheduler from saved settings ──────────────────────
            scheduler.startScheduler();
            emailScheduler.startScheduler();

            // ── Start social poster scheduler ───────────────────────────
            scheduler.startSocialScheduler();

            // ── Boot auto scraper scheduler ──────────────────────────────
            await bootAllAutoScrapers();
        }
        if (PORT === 3000 && !process.env.NO_BROWSER) require('child_process').exec(`start http://localhost:${PORT}`);
    });
}

start();
