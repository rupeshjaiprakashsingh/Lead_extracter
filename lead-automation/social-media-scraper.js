// ================================================================
//  social-media-scraper.js — Multi-Platform Social Lead Extractor
//  Finds businesses interested in Innvoque IT services
//  Platforms: LinkedIn, Twitter/X, IndiaMART, JustDial
// ================================================================

const { chromium } = require('playwright');

// ── Intent keywords tailored to Innvoque services ───────────────
const INNVOQUE_KEYWORDS = {
    software: [
        'need software development', 'looking for software developer',
        'want custom software', 'need web application', 'software development quote',
        'need a developer', 'need backend developer', 'need fullstack developer'
    ],
    website: [
        'need website development', 'want a website', 'need web design',
        'website developer needed', 'need wordpress developer', 'build my website',
        'need landing page', 'need business website'
    ],
    mobile: [
        'need mobile app', 'looking for app developer', 'want android app',
        'need ios app', 'mobile app development quote', 'app developer needed',
        'need flutter developer', 'build mobile app'
    ],
    ai: [
        'need ai automation', 'want ai chatbot', 'looking for chatbot developer',
        'need whatsapp bot', 'whatsapp automation', 'ai for business',
        'need machine learning', 'business automation needed'
    ],
    marketing: [
        'need digital marketing', 'looking for marketing agency',
        'need seo services', 'want social media marketing', 'need google ads',
        'facebook ads management', 'digital marketing agency needed',
        'grow my business online', 'need online marketing'
    ],
    erp: [
        'need erp software', 'looking for crm software', 'need inventory management',
        'want erp system', 'business management software', 'need accounting software',
        'erp implementation', 'need hr software'
    ],
    ecommerce: [
        'need ecommerce website', 'want online store', 'need shopify development',
        'ecommerce development', 'need payment gateway', 'online store development',
        'need marketplace development'
    ],
    cloud: [
        'need cloud hosting', 'aws setup needed', 'need devops engineer',
        'cloud migration', 'need server setup', 'need deployment help',
        'docker deployment needed'
    ]
};

// All keywords flattened
const ALL_KEYWORDS = Object.values(INNVOQUE_KEYWORDS).flat();

// ── Score calculator based on intent signals ─────────────────────
function calculateScore(text, keyword) {
    if (!text) return 2;
    const t = text.toLowerCase();
    const directPhrases = ['need', 'looking for', 'want', 'hiring', 'required', 'urgently', 'asap', 'quote'];
    const mediumPhrases = ['interested in', 'considering', 'exploring', 'thinking about', 'budget'];
    const weakPhrases = ['tips', 'advice', 'how to', 'learn'];

    let score = 2;
    if (directPhrases.some(p => t.includes(p))) score = Math.max(score, 4);
    if (mediumPhrases.some(p => t.includes(p))) score = Math.max(score, 3);
    if (weakPhrases.some(p => t.includes(p))) score = Math.min(score, 2);
    if (t.includes(keyword.toLowerCase())) score = Math.min(5, score + 1);
    // India-based bonus
    if (t.includes('india') || t.includes('indian') || t.includes('delhi') ||
        t.includes('mumbai') || t.includes('bangalore') || t.includes('hyderabad') ||
        t.includes('lucknow')) score = Math.min(5, score + 1);

    return score;
}

// ── Detect which Innvoque service this lead needs ────────────────
function detectServiceCategory(text, keyword) {
    const t = (text + ' ' + keyword).toLowerCase();
    if (t.includes('ai') || t.includes('chatbot') || t.includes('automation') || t.includes('whatsapp bot')) return 'AI & Automation';
    if (t.includes('mobile') || t.includes('app') || t.includes('android') || t.includes('ios') || t.includes('flutter')) return 'Mobile App Development';
    if (t.includes('erp') || t.includes('crm') || t.includes('inventory') || t.includes('hr software')) return 'ERP/CRM Systems';
    if (t.includes('marketing') || t.includes('seo') || t.includes('ads') || t.includes('social media')) return 'Digital Marketing';
    if (t.includes('ecommerce') || t.includes('shopify') || t.includes('online store')) return 'E-commerce Development';
    if (t.includes('cloud') || t.includes('aws') || t.includes('devops') || t.includes('server')) return 'Cloud & DevOps';
    if (t.includes('website') || t.includes('web design') || t.includes('landing page')) return 'Web Development';
    return 'Custom Software Development';
}

// ── Sleep utility ────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Random delay to avoid bot detection ─────────────────────────
const randomDelay = (min = 1500, max = 3000) => sleep(Math.floor(Math.random() * (max - min)) + min);

// ================================================================
//  PLATFORM SCRAPERS
// ================================================================

// ── 1. LinkedIn Public Search ────────────────────────────────────
async function scrapeLinkedIn(browser, keyword, maxResults = 20, onProgress) {
    const leads = [];
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const url = `https://www.linkedin.com/search/results/all/?keywords=${encodedKeyword}&origin=GLOBAL_SEARCH_HEADER`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(2000, 4000);

        // Check if we get public results or login wall
        const isLoginWall = await page.locator('.authwall-join-form, .join-form').count() > 0;
        if (isLoginWall) {
            // Fall back to people search (public profiles)
            await page.goto(
                `https://www.linkedin.com/search/results/people/?keywords=${encodedKeyword}`,
                { waitUntil: 'domcontentloaded', timeout: 30000 }
            );
            await randomDelay(2000, 3000);
        }

        // Try to extract result cards
        const cards = await page.locator('[data-chameleon-result-urn], .search-result__wrapper, .entity-result').all();

        for (let i = 0; i < Math.min(cards.length, maxResults); i++) {
            try {
                const card = cards[i];
                const name = await card.locator('.entity-result__title-text a, .actor-name, h3').first().textContent({ timeout: 2000 }).catch(() => '');
                const title = await card.locator('.entity-result__primary-subtitle, .subline-level-1').first().textContent({ timeout: 2000 }).catch(() => '');
                const location = await card.locator('.entity-result__secondary-subtitle, .subline-level-2').first().textContent({ timeout: 2000 }).catch(() => '');
                const profileHref = await card.locator('a[href*="/in/"], a[href*="/company/"]').first().getAttribute('href', { timeout: 2000 }).catch(() => '');
                const snippet = await card.locator('.entity-result__summary, .search-result__snippets').first().textContent({ timeout: 2000 }).catch(() => '');

                if (!name.trim()) continue;

                const intentText = [title, snippet].join(' ').trim();
                const score = calculateScore(intentText, keyword);
                const profileUrl = profileHref ? `https://www.linkedin.com${profileHref.split('?')[0]}` : '';

                leads.push({
                    platform: 'linkedin',
                    name: name.trim().replace(/\n/g, '').substring(0, 100),
                    title: title.trim().substring(0, 150),
                    location: location.trim().substring(0, 100),
                    profileUrl,
                    intentKeyword: keyword,
                    intentText: intentText.substring(0, 500),
                    serviceCategory: detectServiceCategory(intentText, keyword),
                    score
                });

                if (onProgress) onProgress({ platform: 'LinkedIn', count: leads.length, name: name.trim() });
            } catch (e) { /* skip bad card */ }
        }

        // If no structured cards found, try Google scraping of LinkedIn
        if (leads.length === 0) {
            await page.goto(
                `https://www.google.com/search?q=site:linkedin.com/in+${encodedKeyword}+India`,
                { waitUntil: 'domcontentloaded', timeout: 20000 }
            );
            await randomDelay(1500, 2500);

            const results = await page.locator('div.g').all();
            for (let i = 0; i < Math.min(results.length, maxResults); i++) {
                try {
                    const r = results[i];
                    const title = await r.locator('h3').first().textContent({ timeout: 1500 }).catch(() => '');
                    const snippet = await r.locator('[data-sncf="1"], .VwiC3b').first().textContent({ timeout: 1500 }).catch(() => '');
                    const href = await r.locator('a').first().getAttribute('href', { timeout: 1500 }).catch(() => '');

                    if (!title.trim() || !href?.includes('linkedin.com')) continue;

                    const score = calculateScore(snippet, keyword);
                    // Parse name from LinkedIn title format: "Name - Title | LinkedIn"
                    const namePart = title.split(' - ')[0].split(' | ')[0].trim();

                    leads.push({
                        platform: 'linkedin',
                        name: namePart.substring(0, 100),
                        title: title.split(' - ')[1]?.split(' | ')[0]?.trim()?.substring(0, 150) || '',
                        profileUrl: href,
                        intentKeyword: keyword,
                        intentText: snippet.substring(0, 500),
                        serviceCategory: detectServiceCategory(snippet, keyword),
                        score
                    });

                    if (onProgress) onProgress({ platform: 'LinkedIn (Google)', count: leads.length, name: namePart });
                } catch (e) { /* skip */ }
            }
        }
    } catch (e) {
        console.error('[LinkedIn] Error:', e.message);
    } finally {
        await page.close();
    }

    return leads;
}

// ── 2. Twitter/X Public Search ───────────────────────────────────
async function scrapeTwitter(browser, keyword, maxResults = 20, onProgress) {
    const leads = [];
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    try {
        // Use Nitter (Twitter mirror) for scraping without login
        const encodedKeyword = encodeURIComponent(keyword + ' India');
        const nitterInstances = [
            `https://nitter.net/search?q=${encodedKeyword}&f=tweets`,
            `https://nitter.poast.org/search?q=${encodedKeyword}&f=tweets`,
            `https://nitter.privacydev.net/search?q=${encodedKeyword}&f=tweets`
        ];

        let loaded = false;
        for (const nitterUrl of nitterInstances) {
            try {
                await page.goto(nitterUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await randomDelay(1000, 2000);
                const tweetCount = await page.locator('.timeline-item, .tweet-body').count();
                if (tweetCount > 0) { loaded = true; break; }
            } catch (e) { /* try next */ }
        }

        if (!loaded) {
            // Fall back to Google search of Twitter content
            await page.goto(
                `https://www.google.com/search?q=site:twitter.com+"${encodeURIComponent(keyword)}"&tbs=qdr:w`,
                { waitUntil: 'domcontentloaded', timeout: 20000 }
            );
            await randomDelay(1500, 2500);

            const results = await page.locator('div.g').all();
            for (let i = 0; i < Math.min(results.length, maxResults); i++) {
                try {
                    const r = results[i];
                    const title = await r.locator('h3').first().textContent({ timeout: 1500 }).catch(() => '');
                    const snippet = await r.locator('[data-sncf="1"], .VwiC3b').first().textContent({ timeout: 1500 }).catch(() => '');
                    const href = await r.locator('a').first().getAttribute('href', { timeout: 1500 }).catch(() => '');

                    if (!href?.includes('twitter.com') && !href?.includes('x.com')) continue;

                    const username = href?.match(/(?:twitter|x)\.com\/([^\/\?]+)/)?.[1] || '';
                    if (!username || ['search', 'home', 'explore'].includes(username)) continue;

                    const score = calculateScore(snippet, keyword);
                    leads.push({
                        platform: 'twitter',
                        name: username,
                        profileUrl: `https://twitter.com/${username}`,
                        intentKeyword: keyword,
                        intentText: (title + ' ' + snippet).substring(0, 500),
                        serviceCategory: detectServiceCategory(snippet, keyword),
                        score
                    });

                    if (onProgress) onProgress({ platform: 'Twitter/X', count: leads.length, name: '@' + username });
                } catch (e) { /* skip */ }
            }
        } else {
            // Parse Nitter results
            const tweets = await page.locator('.timeline-item').all();
            for (let i = 0; i < Math.min(tweets.length, maxResults); i++) {
                try {
                    const t = tweets[i];
                    const username = await t.locator('.username').first().textContent({ timeout: 1500 }).catch(() => '');
                    const fullname = await t.locator('.fullname').first().textContent({ timeout: 1500 }).catch(() => '');
                    const tweetText = await t.locator('.tweet-content').first().textContent({ timeout: 1500 }).catch(() => '');
                    const statsText = await t.locator('.tweet-stats').first().textContent({ timeout: 1500 }).catch(() => '');

                    if (!username.trim() && !tweetText.trim()) continue;

                    const score = calculateScore(tweetText, keyword);
                    leads.push({
                        platform: 'twitter',
                        name: (fullname || username).trim().replace('@', ''),
                        profileUrl: `https://twitter.com/${username.replace('@', '').trim()}`,
                        intentKeyword: keyword,
                        intentText: tweetText.trim().substring(0, 500),
                        serviceCategory: detectServiceCategory(tweetText, keyword),
                        score
                    });

                    if (onProgress) onProgress({ platform: 'Twitter/X', count: leads.length, name: username.trim() });
                } catch (e) { /* skip */ }
            }
        }
    } catch (e) {
        console.error('[Twitter] Error:', e.message);
    } finally {
        await page.close();
    }

    return leads;
}

// ── 3. IndiaMART Business Directory ─────────────────────────────
async function scrapeIndiaMART(browser, keyword, maxResults = 30, onProgress) {
    const leads = [];
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-IN,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });

    try {
        // Search for businesses that BUY IT services — look for businesses in target industries
        const searchTerm = keyword.replace('need ', '').replace('looking for ', '').replace('want ', '');
        const url = `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(searchTerm)}&prdsrc=1`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(2000, 3500);

        // Extract business cards
        const cards = await page.locator('.lst-lst-card, .bsrCard, .pr-inf-cntnr').all();

        for (let i = 0; i < Math.min(cards.length, maxResults); i++) {
            try {
                const card = cards[i];
                const name = await card.locator('.lcname, .comp-name, h4').first().textContent({ timeout: 2000 }).catch(() => '');
                const category = await card.locator('.prd-name, .prod-name, .category').first().textContent({ timeout: 2000 }).catch(() => '');
                const location = await card.locator('.loc, .locName, [class*="location"]').first().textContent({ timeout: 2000 }).catch(() => '');
                const phone = await card.locator('.cmptel, .tel, [href^="tel:"]').first().textContent({ timeout: 2000 }).catch(() => '');
                const website = await card.locator('a[href*="http"]').first().getAttribute('href', { timeout: 2000 }).catch(() => '');
                const profileHref = await card.locator('a.lcname, a[href*="indiamart"]').first().getAttribute('href', { timeout: 2000 }).catch(() => '');

                if (!name.trim()) continue;

                const intentText = [name, category, location].join(' ');
                const score = calculateScore(intentText, keyword);

                leads.push({
                    platform: 'indiamart',
                    name: name.trim().substring(0, 100),
                    title: category.trim().substring(0, 150),
                    location: location.trim().substring(0, 100),
                    phone: phone.replace(/[^\d+\s-]/g, '').trim().substring(0, 20),
                    website: website?.startsWith('http') ? website : '',
                    profileUrl: profileHref || url,
                    intentKeyword: keyword,
                    intentText: intentText.substring(0, 500),
                    serviceCategory: detectServiceCategory(intentText, keyword),
                    score: Math.max(score, 3) // IndiaMART leads are generally warm
                });

                if (onProgress) onProgress({ platform: 'IndiaMART', count: leads.length, name: name.trim() });
            } catch (e) { /* skip */ }
        }

        // If no results found, try alternative selectors
        if (leads.length === 0) {
            await page.goto(
                `https://www.indiamart.com/search.mp?ss=${encodeURIComponent(searchTerm)}`,
                { waitUntil: 'domcontentloaded', timeout: 30000 }
            );
            await randomDelay(2000, 3000);

            const altCards = await page.locator('.impSug, .cardv2, [class*="product-card"]').all();
            for (let i = 0; i < Math.min(altCards.length, maxResults); i++) {
                try {
                    const card = altCards[i];
                    const name = await card.locator('h4, h3, .name').first().textContent({ timeout: 2000 }).catch(() => '');
                    const location = await card.locator('[class*="loc"], [class*="city"]').first().textContent({ timeout: 2000 }).catch(() => '');
                    if (!name.trim()) continue;

                    leads.push({
                        platform: 'indiamart',
                        name: name.trim().substring(0, 100),
                        location: location.trim().substring(0, 100),
                        profileUrl: url,
                        intentKeyword: keyword,
                        intentText: name.trim(),
                        serviceCategory: detectServiceCategory(name, keyword),
                        score: 3
                    });

                    if (onProgress) onProgress({ platform: 'IndiaMART', count: leads.length, name: name.trim() });
                } catch (e) { /* skip */ }
            }
        }
    } catch (e) {
        console.error('[IndiaMART] Error:', e.message);
    } finally {
        await page.close();
    }

    return leads;
}

// ── 4. JustDial Business Directory ──────────────────────────────
async function scrapeJustDial(browser, keyword, city = 'India', maxResults = 30, onProgress) {
    const leads = [];
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-IN,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });

    try {
        const searchTerm = keyword.replace('need ', '').replace('looking for ', '').replace('want ', '');
        const citySlug = city.toLowerCase().replace(/\s+/g, '-');
        const termSlug = searchTerm.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        const urls = [
            `https://www.justdial.com/${citySlug}/${termSlug}/nct-10003073`,
            `https://www.justdial.com/All-India/${termSlug}`,
            `https://www.justdial.com/${citySlug}/${termSlug}`
        ];

        let loaded = false;
        for (const url of urls) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await randomDelay(2000, 3500);
                const count = await page.locator('[class*="store-in"], .resultbox_info, .store-details').count();
                if (count > 0) { loaded = true; break; }
            } catch (e) { /* try next URL */ }
        }

        if (!loaded) {
            // Google fallback for JustDial
            await page.goto(
                `https://www.google.com/search?q=site:justdial.com+${encodeURIComponent(searchTerm)}+services`,
                { waitUntil: 'domcontentloaded', timeout: 20000 }
            );
            await randomDelay(1500, 2500);

            const results = await page.locator('div.g').all();
            for (let i = 0; i < Math.min(results.length, maxResults); i++) {
                try {
                    const r = results[i];
                    const title = await r.locator('h3').first().textContent({ timeout: 1500 }).catch(() => '');
                    const snippet = await r.locator('[data-sncf="1"], .VwiC3b').first().textContent({ timeout: 1500 }).catch(() => '');
                    const href = await r.locator('a').first().getAttribute('href', { timeout: 1500 }).catch(() => '');

                    if (!href?.includes('justdial.com') || !title.trim()) continue;

                    const score = calculateScore(snippet, keyword);
                    const namePart = title.split(' in ')[0].split(' - ')[0].trim();

                    leads.push({
                        platform: 'justdial',
                        name: namePart.substring(0, 100),
                        location: city,
                        profileUrl: href,
                        intentKeyword: keyword,
                        intentText: (title + ' ' + snippet).substring(0, 500),
                        serviceCategory: detectServiceCategory(snippet, keyword),
                        score: Math.max(score, 2)
                    });

                    if (onProgress) onProgress({ platform: 'JustDial', count: leads.length, name: namePart });
                } catch (e) { /* skip */ }
            }
        } else {
            const cards = await page.locator('[class*="store-in"], .resultbox_info').all();
            for (let i = 0; i < Math.min(cards.length, maxResults); i++) {
                try {
                    const card = cards[i];
                    const name = await card.locator('[class*="store-name"], h2, .companyname, .resultbox_title').first().textContent({ timeout: 2000 }).catch(() => '');
                    const category = await card.locator('[class*="catg"], .category, .resultbox_category').first().textContent({ timeout: 2000 }).catch(() => '');
                    const location = await card.locator('[class*="address"], .address, .resultbox_address').first().textContent({ timeout: 2000 }).catch(() => '');
                    const phone = await card.locator('[class*="mobilesv"], [href^="tel:"], .mobilesv').first().textContent({ timeout: 2000 }).catch(() => '');
                    const ratingEl = await card.locator('[class*="rating"], .star_m').first().textContent({ timeout: 2000 }).catch(() => '');

                    if (!name.trim()) continue;

                    const intentText = [name, category].join(' ');
                    const score = calculateScore(intentText, keyword);

                    leads.push({
                        platform: 'justdial',
                        name: name.trim().substring(0, 100),
                        title: category.trim().substring(0, 150),
                        location: location.trim().substring(0, 100),
                        phone: phone.replace(/[^\d+\s-]/g, '').trim().substring(0, 20),
                        profileUrl: page.url(),
                        intentKeyword: keyword,
                        intentText: intentText.substring(0, 500),
                        serviceCategory: detectServiceCategory(intentText, keyword),
                        score: Math.max(score, 3)
                    });

                    if (onProgress) onProgress({ platform: 'JustDial', count: leads.length, name: name.trim() });
                } catch (e) { /* skip */ }
            }
        }
    } catch (e) {
        console.error('[JustDial] Error:', e.message);
    } finally {
        await page.close();
    }

    return leads;
}

// ================================================================
//  MAIN SCRAPER FUNCTION
// ================================================================

/**
 * Main entry point — scrape all selected platforms for a keyword
 *
 * @param {object} options
 * @param {string[]} options.platforms - ['linkedin','twitter','indiamart','justdial']
 * @param {string} options.keyword - search keyword
 * @param {string} options.serviceCategory - filter by service (optional)
 * @param {string} options.city - city filter (for JustDial)
 * @param {number} options.maxPerPlatform - max results per platform
 * @param {function} options.onProgress - callback(event)
 * @returns {Promise<object[]>} - array of social leads
 */
async function scrapeAllPlatforms(options = {}) {
    const {
        platforms = ['linkedin', 'twitter', 'indiamart', 'justdial'],
        keyword = 'need software development',
        city = 'India',
        maxPerPlatform = 20,
        onProgress = null
    } = options;

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled',
            '--window-size=1366,768'
        ]
    });

    const allLeads = [];

    try {
        const tasks = [];
        if (platforms.includes('linkedin'))   tasks.push(() => scrapeLinkedIn(browser, keyword, maxPerPlatform, onProgress));
        if (platforms.includes('twitter'))    tasks.push(() => scrapeTwitter(browser, keyword, maxPerPlatform, onProgress));
        if (platforms.includes('indiamart'))  tasks.push(() => scrapeIndiaMART(browser, keyword, maxPerPlatform, onProgress));
        if (platforms.includes('justdial'))   tasks.push(() => scrapeJustDial(browser, keyword, city, maxPerPlatform, onProgress));

        // Run platforms sequentially to avoid overwhelming the machine
        for (const task of tasks) {
            const results = await task();
            allLeads.push(...results);
        }
    } finally {
        await browser.close();
    }

    // De-duplicate by profileUrl
    const seen = new Set();
    const unique = allLeads.filter(l => {
        const key = (l.profileUrl || l.name || '').toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Sort by score descending
    return unique.sort((a, b) => b.score - a.score);
}

// ── Keyword presets for Innvoque services ────────────────────────
function getKeywordPresets() {
    return {
        'All Services': ALL_KEYWORDS,
        'Software Development': INNVOQUE_KEYWORDS.software,
        'Website Development': INNVOQUE_KEYWORDS.website,
        'Mobile App': INNVOQUE_KEYWORDS.mobile,
        'AI & Automation': INNVOQUE_KEYWORDS.ai,
        'Digital Marketing': INNVOQUE_KEYWORDS.marketing,
        'ERP/CRM': INNVOQUE_KEYWORDS.erp,
        'E-commerce': INNVOQUE_KEYWORDS.ecommerce,
        'Cloud & DevOps': INNVOQUE_KEYWORDS.cloud
    };
}

module.exports = {
    scrapeAllPlatforms,
    scrapeLinkedIn,
    scrapeTwitter,
    scrapeIndiaMART,
    scrapeJustDial,
    getKeywordPresets,
    INNVOQUE_KEYWORDS,
    ALL_KEYWORDS
};
