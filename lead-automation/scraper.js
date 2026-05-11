// ============================================================
//  scraper.js — Google Maps Extractor (Human-Like + CAPTCHA-Aware)
//  - Uses persistent browser profile to avoid repeated CAPTCHAs
//  - Detects CAPTCHA and pauses for user to solve
//  - Scrolls aggressively to collect ALL results
// ============================================================
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LEADS_FILE    = path.join(__dirname, 'leads.json');
const PROFILE_DIR   = path.join(__dirname, '.browser_profile'); // persistent session

function loadLeads() {
    if (fs.existsSync(LEADS_FILE)) {
        try { return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8')); }
        catch(e) { return []; }
    }
    return [];
}

function saveLeads(leads) {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
}

function cleanPhone(raw) {
    if (!raw) return '';
    let d = raw.replace(/\D/g, '');
    if (d.startsWith('91') && d.length === 12) return d;
    if (d.length === 10) return '91' + d;
    if (d.startsWith('0') && d.length === 11) return '91' + d.slice(1);
    return d.length >= 10 ? d.slice(-10).padStart(12, '91') : '';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Random delay to mimic human behavior
function humanDelay(min = 800, max = 2000) {
    return sleep(Math.floor(Math.random() * (max - min) + min));
}

// ── CAPTCHA detection & wait ──────────────────────────────────
async function waitForCaptchaIfNeeded(page, label = '') {
    const captchaSelectors = [
        'iframe[src*="recaptcha"]',
        '#captcha-form',
        'form#captcha',
        '[aria-label="CAPTCHA"]',
        'input[name="captcha"]',
        'div.g-recaptcha',
        'img[alt*="captcha" i]',
        'h1:has-text("Before you continue")',
        'h1:has-text("unusual traffic")',
        'div:has-text("not a robot")',
    ];

    for (const sel of captchaSelectors) {
        if (await page.locator(sel).isVisible({ timeout: 600 }).catch(() => false)) {
            console.log(`\n  ⚠️  ============================================`);
            console.log(`  ⚠️  CAPTCHA DETECTED ${label}`);
            console.log(`  ⚠️  Please solve it in the browser window.`);
            console.log(`  ⚠️  Waiting up to 3 minutes for you to solve...`);
            console.log(`  ⚠️  ============================================\n`);

            // Wait up to 3 minutes for CAPTCHA to be solved
            let solved = false;
            for (let i = 0; i < 36; i++) {      // 36 x 5s = 3 minutes
                await sleep(5000);
                let stillHasCaptcha = false;
                for (const s of captchaSelectors) {
                    if (await page.locator(s).isVisible({ timeout: 400 }).catch(() => false)) {
                        stillHasCaptcha = true; break;
                    }
                }
                if (!stillHasCaptcha) { solved = true; break; }
                console.log(`  ⏳ Still waiting for CAPTCHA... (${(i+1)*5}s)`);
            }

            if (solved) {
                console.log(`  ✅ CAPTCHA solved! Continuing...\n`);
                await sleep(2000);
            } else {
                console.log(`  ❌ CAPTCHA not solved in 3 minutes. Proceeding anyway...\n`);
            }
            return true; // was captcha
        }
    }
    return false; // no captcha
}

async function scrapeGoogleMaps(keyword, city, maxResults = 9999) {
    console.log(`\n🔍 Searching: "${keyword}" in ${city} | Target: ${maxResults} leads\n`);

    // ── Use persistent profile (avoids repeated CAPTCHA) ──────
    if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });

    const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',  // hides automation flag
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        viewport: null,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    const page = await browser.newPage();

    // ── Mask automation detection ──────────────────────────────
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
    });

    // ─────────────────────────────────────────────────────────
    //  PHASE 1: Navigate to Google MAPS and scroll ALL the way
    // ─────────────────────────────────────────────────────────
    // ✅ Always use maps.google.com — NOT google.com/search
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(keyword + ' ' + city)}`;
    console.log(`  🗺️  Navigating to Google Maps: ${mapsUrl}`);

    try {
        await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch(e) {
        if (!e.message.includes('ERR_ABORTED')) {
            try { await page.goto(mapsUrl, { timeout: 20000 }); } catch(e2) {}
        }
    }
    await sleep(3000);

    // Check CAPTCHA right after opening
    await waitForCaptchaIfNeeded(page, 'on page load');

    // Dismiss cookie/consent popup
    try {
        for (const txt of ['Accept all', 'I agree', 'Accept']) {
            const b = page.locator(`button:has-text("${txt}")`).first();
            if (await b.isVisible({ timeout: 1500 }).catch(() => false)) {
                await b.click(); await sleep(1500); break;
            }
        }
    } catch(e) {}

    // Wait for the left-side results feed to appear
    const feedFound = await page.waitForSelector('[role="feed"]', { timeout: 20000 }).catch(() => null);
    if (!feedFound) {
        console.log('  ⚠️ Feed not found — check browser for CAPTCHA or errors.');
        await waitForCaptchaIfNeeded(page, 'waiting for feed');
        await page.waitForSelector('[role="feed"]', { timeout: 30000 }).catch(() => {
            console.log('  ❌ Feed still not found. Aborting scroll phase.');
        });
    }
    await sleep(2000);

    // ── SCROLL AGGRESSIVELY until "end of list" ───────────────
    const collectedUrls = new Set();
    let noNewCount = 0;
    const MAX_NO_NEW = 20;    // stop after 20 scrolls with zero new results
    let totalScrolls = 0;

    console.log(`\n  📜 Starting aggressive scroll to collect ALL business URLs...\n`);

    while (noNewCount < MAX_NO_NEW) {
        // Collect all visible place links
        const links = await page.locator('[role="feed"] a[href*="/maps/place/"]').all();
        let added = 0;
        for (const link of links) {
            const href = await link.getAttribute('href').catch(() => null);
            if (href && !collectedUrls.has(href)) {
                collectedUrls.add(href);
                added++;
            }
        }

        if (added > 0) {
            noNewCount = 0;
            console.log(`  📍 ${collectedUrls.size} URLs collected (+${added} new)`);
        } else {
            noNewCount++;
            if (noNewCount % 5 === 0)
                console.log(`  ⏳ No new results for ${noNewCount} scrolls (max ${MAX_NO_NEW})...`);
        }

        // Hit user limit
        if (maxResults < 9999 && collectedUrls.size >= maxResults) {
            console.log(`  ✅ Reached requested limit of ${maxResults}.`);
            break;
        }

        // Check for true end-of-list
        const endSelectors = [
            "span:has-text(\"You've reached the end of the list\")",
            "span:has-text(\"No more results\")",
            ".HlvSq",
            "p.fontBodyMedium:has-text(\"end\")"
        ];
        let reachedEnd = false;
        for (const sel of endSelectors) {
            if (await page.locator(sel).isVisible({ timeout: 500 }).catch(() => false)) {
                reachedEnd = true; break;
            }
        }
        if (reachedEnd) {
            console.log(`\n  🏁 Google Maps: Reached end of list! Total: ${collectedUrls.size} URLs\n`);
            break;
        }

        // Check for mid-scroll CAPTCHA
        await waitForCaptchaIfNeeded(page, `after ${totalScrolls} scrolls`);

        // ── SCROLL THE FEED ──────────────────────────────────
        try {
            await page.locator('[role="feed"]').evaluate(el => {
                el.scrollTop += 5000;
            });
        } catch(e) {
            try {
                // Fallback: click feed then press End key
                await page.locator('[role="feed"]').click({ force: true, position: { x: 10, y: 300 } });
                await page.keyboard.press('End');
            } catch(e2) {
                console.log('  ⚠️  Scroll failed, trying mouse wheel...');
                try {
                    await page.mouse.wheel(0, 5000);
                } catch(e3) {}
            }
        }

        totalScrolls++;

        // Human-like wait between scrolls
        const waitMs = noNewCount > 8 ? 3500 : 1800;
        await sleep(waitMs);

        // Hard limit: 300 scrolls = ~3000+ results
        if (totalScrolls >= 300) {
            console.log(`  ⚠️  Reached max 300 scrolls. Collected ${collectedUrls.size} URLs.`);
            break;
        }
    }

    const urlList = Array.from(collectedUrls).slice(0, maxResults);
    console.log(`\n  ✅ Phase 1 complete: ${urlList.length} URLs to visit.\n`);

    // ─────────────────────────────────────────────────────────
    //  PHASE 2: Visit each place URL & extract full business data
    // ─────────────────────────────────────────────────────────
    const newLeads = [];

    for (let i = 0; i < urlList.length; i++) {
        const href = urlList[i];
        const fullUrl = href.startsWith('http') ? href : 'https://www.google.com' + href;

        try {
            console.log(`  [${i+1}/${urlList.length}] Visiting...`);
            try {
                await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            } catch(e) {
                if (!e.message.includes('ERR_ABORTED')) {
                    await page.goto(fullUrl, { timeout: 15000 }).catch(() => {});
                }
            }

            // Check for CAPTCHA on detail pages (every 50 pages)
            if (i % 50 === 0 && i > 0) {
                await waitForCaptchaIfNeeded(page, `at lead #${i+1}`);
            }

            await sleep(1500);
            await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {});

            // Extract data
            const name     = await page.locator('h1').first().textContent({ timeout: 4000 }).catch(() => '');
            const rating   = await page.locator('div.F7nice span[aria-hidden="true"]').first().textContent({ timeout: 2000 }).catch(() => '');
            const revLabel = await page.locator('div.F7nice span[aria-label]').first().getAttribute('aria-label', { timeout: 2000 }).catch(() => '');
            const reviews  = (revLabel || '').match(/[\d,]+/)?.[0]?.replace(',', '') || '';
            const category = await page.locator('button.DkEaL').first().textContent({ timeout: 2000 }).catch(() => '');
            const address  = await page.locator('[data-item-id="address"] .Io6YTe').first().textContent({ timeout: 2000 }).catch(() => '');
            const webHref  = await page.locator('a[data-item-id="authority"]').first().getAttribute('href', { timeout: 2000 }).catch(() => '');
            const website  = webHref ? webHref.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0].toLowerCase() : '';
            const phoneRaw = await page.locator('[data-item-id^="phone:tel"] .Io6YTe').first().textContent({ timeout: 2000 }).catch(() =>
                page.locator('button[aria-label^="Phone"] .Io6YTe').first().textContent({ timeout: 2000 }).catch(() => '')
            );
            const phone = cleanPhone(phoneRaw.trim());

            const biz = {
                id: Date.now() + Math.random(),
                name: name.trim(),
                raw_phone: phoneRaw.trim(),
                phone,
                website,
                rating: rating.trim(),
                reviews,
                category: category.trim(),
                address: address.trim(),
                city,
                keyword,
                scraped_at: new Date().toISOString(),
                wa_sent: false,
                email_sent: false
            };

            if (biz.name.trim()) {
                newLeads.push(biz);
                console.log(`  ✅ [${newLeads.length}] ${biz.name} | ☎ ${biz.raw_phone || 'No phone'} | 🌐 ${biz.website || 'NO WEBSITE'}`);
            }

        } catch(err) {
            console.log(`  ⚠️  Skipped [${i+1}]: ${err.message.split('\n')[0]}`);
        }

        // Small human-like delay between page visits
        await sleep(300 + Math.random() * 400);
    }

    await browser.close();

    // Save & merge (dedup by phone)
    const existing = loadLeads();
    const existingPhones = new Set(existing.filter(b => b.phone).map(b => b.phone));
    const unique = newLeads.filter(b => !b.phone || !existingPhones.has(b.phone));
    saveLeads([...existing, ...unique]);

    console.log(`\n✅ Done! Added ${unique.length} new leads. Total in DB: ${existing.length + unique.length}\n`);
    return unique;
}

if (require.main === module) {
    const keyword = process.argv[2] || 'clinic';
    const city    = process.argv[3] || 'Mumbai';
    const max     = parseInt(process.argv[4]) || 9999;
    scrapeGoogleMaps(keyword, city, max).catch(console.error);
}

module.exports = { scrapeGoogleMaps, loadLeads, saveLeads };
