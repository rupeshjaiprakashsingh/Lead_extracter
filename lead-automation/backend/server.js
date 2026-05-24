// ============================================================
//  server.js — Lead Automation CRM SaaS (Multi-Tenant Edition)
//  Backend API — Port 5000
// ============================================================
require('dotenv').config();

const express = require('express');
const path    = require('path');
const cors    = require('cors');
const { connectDB } = require('./config/db');
const { applySecurityMiddleware } = require('./middleware/security');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ── CORS ────────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true
}));

// ── Body parsing ────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Security ─────────────────────────────────────────────────
applySecurityMiddleware(app);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── SSE Progress (company-scoped) ────────────────────────────
const sseClients = new Map(); // companyId → Set of res objects

app.get('/api/progress', (req, res) => {
  const { companyId } = req.query;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
  res.flushHeaders();

  const key = companyId || 'global';
  if (!sseClients.has(key)) sseClients.set(key, new Set());
  sseClients.get(key).add(res);

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  req.on('close', () => {
    const clients = sseClients.get(key);
    if (clients) { clients.delete(res); if (clients.size === 0) sseClients.delete(key); }
  });
});

// Emit to company-specific SSE clients
function emitToCompany(companyId, data) {
  const key = companyId?.toString() || 'global';
  const clients = sseClients.get(key);
  if (clients) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach(c => { try { c.write(msg); } catch(e){} });
  }
}
global.emitToCompany = emitToCompany;

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/superadmin', require('./routes/superadmin'));
app.use('/api/company',    require('./routes/company'));
app.use('/api/leads',      require('./routes/leads'));
app.use('/api/settings',   require('./routes/settings'));
app.use('/api/schedule',   require('./routes/schedule'));
app.use('/api/social',     require('./routes/social'));
app.use('/api/followups',  require('./routes/followups'));
app.use('/api/campaigns',  require('./routes/campaigns'));

// ── 404 handler ──────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ── Global error handler ─────────────────────────────────────
app.use(errorHandler);

// ── Start server ─────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 5000;

async function start() {
  console.log('\n' + '═'.repeat(56));
  console.log('  🤖  LEAD AUTOMATION CRM — SaaS Edition v2.0');
  console.log('       Backend API Server');
  console.log('═'.repeat(56));

  const dbOk = await connectDB();
  if (!dbOk) {
    console.log('  ⚠️  Running without MongoDB — some features unavailable');
  }

  app.listen(PORT, async () => {
    console.log(`\n  ✅ Backend API: http://localhost:${PORT}`);
    console.log(`  ✅ Health:      http://localhost:${PORT}/health`);
    console.log(`  ✅ Auth:        http://localhost:${PORT}/api/auth`);
    console.log('\n  Waiting for connections...\n');

    if (dbOk) {
      // Start schedulers for all companies
      try {
        const Schedule = require('./models/Schedule');
        const scheduler = require('../services/scheduler');
        const schedules = await Schedule.find({ enabled: true }).lean();
        schedules.forEach(s => {
          scheduler.startScheduler(s);
          console.log(`  ⏰ Scheduler started for company: ${s.companyId}`);
        });

        // Social scheduler
        const SocialSettings = require('./models/SocialSettings');
        const ss = await SocialSettings.find({ enabled: true }).lean();
        if (ss.length > 0) scheduler.startSocialScheduler();
      } catch (e) {
        console.log('  ⚠️  Scheduler init error:', e.message);
      }
    }
  });
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
