// ============================================================
//  scraper.js — Google Maps Extractor (Scroll-First Approach)
//  Phase 1: Scroll & collect ALL place URLs
//  Phase 2: Visit each URL directly and extract data
// ============================================================
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LEADS_FILE = path.join(__dirname, 'leads.json');

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

async function scrapeGoogleMaps(keyword, city, maxResults = 9999) {
    console.log(`\n🔍 Searching: "${keyword}" in ${city} | Target: ${maxResults} leads\n`);

    const browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: null
    });
    const page = await context.newPage();

    // ─────────────────────────────────────────────────────────
    //  PHASE 1: Navigate & scroll to collect all place URLs
    // ─────────────────────────────────────────────────────────
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(keyword + ' ' + city)}`;
    console.log('  Phase 1: Collecting listing URLs...');

    try {
        await page.goto(mapsUrl, { waitUntil: 'networkidle', timeout: 30000 });
    } catch(e) {
        // ERR_ABORTED is fine for Google Maps
        if (!e.message.includes('ERR_ABORTED')) {
            try { await page.goto(mapsUrl, { timeout: 20000 }); } catch(e2) {}
        }
    }
    await sleep(3000);

    // Dismiss cookie/consent popup
    try {
        for (const txt of ['Accept all', 'I agree', 'Accept']) {
            const b = page.locator(`button:has-text("${txt}")`).first();
            if (await b.isVisible({ timeout: 1500 }).catch(() => false)) {
                await b.click(); await sleep(1500); break;
            }
        }
    } catch(e) {}

    // Wait for feed
    await page.waitForSelector('[role="feed"]', { timeout: 15000 }).catch(() => {
        console.log('  ⚠️ Feed not found — possible CAPTCHA. Complete it in the browser window.');
    });
    await sleep(2000);

    // Scroll down to collect ALL available URLs — no limit
    const collectedUrls = new Set();
    let noNewCount = 0;
    const MAX_NO_NEW = 6; // stop after 6 consecutive scrolls with zero new results

    while (noNewCount < MAX_NO_NEW) {
        // Get current links
        const links = await page.locator('[role="feed"] a[href*="/maps/place/"]').all();
        let added = 0;
        for (const link of links) {
            const href = await link.getAttribute('href').catch(() => null);
            if (href && !collectedUrls.has(href)) {
                collectedUrls.add(href);
                added++;
            }
        }

        console.log(`  📍 Collected ${collectedUrls.size} URLs so far — scrolling for more...`);

        if (added === 0) {
            noNewCount++;
        } else {
            noNewCount = 0;
        }

        // Apply user-defined cap if explicitly set below 9999
        if (maxResults < 9999 && collectedUrls.size >= maxResults) {
            console.log(`  Reached requested limit of ${maxResults}.`);
            break;
        }

        // Check for Google Maps "end of list" message (multiple selectors)
        const endSelectors = [
            "span:has-text(\"You've reached the end of the list\")",
            "span:has-text(\"No more results\")",
            ".HlvSq",
            "p.fontBodyMedium:has-text(\"end\")"
        ];
        let reachedEnd = false;
        for (const sel of endSelectors) {
            if (await page.locator(sel).isVisible({ timeout: 400 }).catch(() => false)) {
                reachedEnd = true; break;
            }
        }
        if (reachedEnd) { console.log('  🏁 Google Maps: Reached end of results!'); break; }

        // Scroll the feed panel down
        try {
            await page.locator('[role="feed"]').evaluate(el => el.scrollBy(0, 3000));
            await sleep(1800);
        } catch(e) { break; }
    }

    const urlList = Array.from(collectedUrls).slice(0, maxResults);
    console.log(`\n  ✅ Phase 1 done. Collected ${urlList.length} URLs. Now extracting details...\n`);

    // ─────────────────────────────────────────────────────────
    //  PHASE 2: Visit each place URL & extract data
    // ─────────────────────────────────────────────────────────
    const newLeads = [];

    for (let i = 0; i < urlList.length; i++) {
        const href = urlList[i];
        // Make full URL (some hrefs are relative)
        const fullUrl = href.startsWith('http') ? href : 'https://www.google.com' + href;

        try {
            console.log(`  [${i+1}/${urlList.length}] Visiting...`);
            try {
                await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 20000 });
            } catch(e) {
                if (!e.message.includes('ERR_ABORTED')) {
                    await page.goto(fullUrl, { timeout: 15000 }).catch(() => {});
                }
            }
            await sleep(2000);
            await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {});

            // Extract all data
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
            const phone    = cleanPhone(phoneRaw.trim());

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
                console.log(`  ✅ [${newLeads.length}] ${biz.name} | ☎ ${biz.raw_phone || 'No phone'} | 🌐 ${biz.website || 'NO WEBSITE'} | ⭐ ${biz.rating} (${biz.reviews} reviews)`);
            }

        } catch(err) {
            console.log(`  ⚠️  Skipped [${i+1}]: ${err.message.split('\n')[0]}`);
        }

        await sleep(500); // Small delay between visits
    }

    await browser.close();

    // Save & merge
    const existing = loadLeads();
    const existingPhones = new Set(existing.filter(b => b.phone).map(b => b.phone));
    const unique = newLeads.filter(b => !b.phone || !existingPhones.has(b.phone));
    saveLeads([...existing, ...unique]);

    console.log(`\n✅ Extraction complete! Added ${unique.length} new leads. Total in DB: ${existing.length + unique.length}\n`);
    return unique;
}

if (require.main === module) {
    const keyword = process.argv[2] || 'refurbished laptop';
    const city    = process.argv[3] || 'Lucknow';
    const max     = parseInt(process.argv[4]) || 50;
    scrapeGoogleMaps(keyword, city, max).catch(console.error);
}

module.exports = { scrapeGoogleMaps, loadLeads, saveLeads };
