// ============================================================
//  middleware/security.js — Security hardening
// ============================================================
const helmet         = require('helmet');
const rateLimit      = require('express-rate-limit');
const mongoSanitize  = require('express-mongo-sanitize');

/**
 * Apply all security middleware to an Express app
 */
function applySecurityMiddleware(app) {
  // ── Helmet: set security HTTP headers ────────────────────
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false // disabled for API-only server
  }));

  // ── MongoDB injection prevention ─────────────────────────
  app.use(mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
      console.warn(`⚠️  Sanitized request key: ${key} from ${req.ip}`);
    }
  }));

  // ── Trust proxy (for rate limiting behind reverse proxy) ──
  app.set('trust proxy', 1);

  console.log('  🔒 Security middleware applied (Helmet + MongoSanitize)');
}

/** General API rate limiter: 100 requests per 15 minutes */
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' }
});

/** Auth rate limiter: 10 requests per 15 minutes (prevent brute force) */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Please try again in 15 minutes.' }
});

/** Export rate limiter: 10 exports per hour */
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Export rate limit reached. Please try again in an hour.' }
});

/** Scrape rate limiter: 5 scrapes per 30 minutes */
const scrapeLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Scraping rate limit reached. Please try again in 30 minutes.' }
});

module.exports = { applySecurityMiddleware, generalLimiter, authLimiter, exportLimiter, scrapeLimiter };
