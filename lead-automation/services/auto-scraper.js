const _activeLoops = new Map();

// Helper to append logs to AutoScraper document and print to console
async function logMessage(userId, msg) {
    const time = new Date().toLocaleTimeString();
    const logLine = `[${time}] ${msg}\n`;
    console.log(`🤖 [AutoScraper:${userId}] ${msg}`);
    try {
        const activeMongoose = global.activeMongoose || require('mongoose');
        const AutoScraper = activeMongoose.models.AutoScraper || require('../models/AutoScraper');

        const config = await AutoScraper.findOne({ userId });
        if (config) {
            let currentLogs = config.logs || '';
            const lines = (currentLogs + logLine).split('\n');
            if (lines.length > 200) {
                currentLogs = lines.slice(-200).join('\n');
            } else {
                currentLogs = currentLogs + logLine;
            }
            await AutoScraper.updateOne({ userId }, { $set: { logs: currentLogs } });
        }
    } catch (e) {
        console.error('Error writing auto scraper logs:', e.message);
    }
}

async function runIteration(userId) {
    const activeMongoose = global.activeMongoose || require('mongoose');
    const AutoScraper = activeMongoose.models.AutoScraper || require('../models/AutoScraper');
    const Lead = activeMongoose.models.Lead || require('../models/Lead');
    const { scrapeGoogleMaps } = require('../scraper');
    const { extractEmailsForLeads } = require('./email-extractor');
    const { categorize } = require('./categories');

    try {
        const config = await AutoScraper.findOne({ userId });
        if (!config || !config.enabled) {
            _activeLoops.delete(userId.toString());
            return;
        }

        // ── Reset daily counter if it's a new day ─────────────────────
        const now = new Date();
        const lastReset = config.lastCountResetAt ? new Date(config.lastCountResetAt) : now;
        if (now.toDateString() !== lastReset.toDateString()) {
            // New day: reset daily counter AND clear exhausted combos
            await AutoScraper.updateOne({ userId }, {
                $set: {
                    leadsToday: 0,
                    lastCountResetAt: now,
                    exhaustedCombos: []  // reset exhausted list each new day
                }
            });
            await logMessage(userId, `🗓️ New day started — daily lead counter & exhausted combos reset.`);
        }

        // ── Check if daily target already reached ──────────────────────
        const dailyTarget = config.dailyTarget || 5000;
        const currentLeadsToday = config.leadsToday || 0;
        if (currentLeadsToday >= dailyTarget) {
            await logMessage(userId, `🎯 Daily target of ${dailyTarget} leads REACHED! (Today: ${currentLeadsToday}). Auto-scraper pausing until midnight.`);
            await AutoScraper.updateOne({ userId }, { $set: { status: 'Target Reached' } });

            const midnight = new Date(now);
            midnight.setDate(midnight.getDate() + 1);
            midnight.setHours(0, 0, 10, 0);
            const msUntilMidnight = midnight.getTime() - now.getTime();
            const nextRun = setTimeout(() => runIteration(userId), msUntilMidnight);
            _activeLoops.set(userId.toString(), nextRun);
            return;
        }

        // Split keywords & cities
        const keywords = config.keywords.split(',').map(s => s.trim()).filter(Boolean);
        const cities = config.cities.split(',').map(s => s.trim()).filter(Boolean);

        if (keywords.length === 0 || cities.length === 0) {
            await logMessage(userId, '❌ Error: Keywords or Cities list is empty. Disabling auto-scraper.');
            await AutoScraper.updateOne({ userId }, { $set: { status: 'Stopped', enabled: false } });
            _activeLoops.delete(userId.toString());
            return;
        }

        // ── Smart keyword+city cycling — skip exhausted combos ─────────
        // Cycling order: city advances each run, keyword advances when ALL cities done
        // e.g. clinic→Mumbai, clinic→Delhi, ..., clinic→Dhanbad, doctor→Mumbai, ...
        const exhaustedCombos = config.exhaustedCombos || [];
        const totalCombos = keywords.length * cities.length;

        let kwIdx = config.currentKeywordIdx % keywords.length;
        let cityIdx = config.currentCityIdx % cities.length;

        // Find the next non-exhausted combo (up to totalCombos attempts)
        // City advances first, keyword advances when city wraps
        let skipped = 0;
        while (skipped < totalCombos) {
            const comboKey = `${keywords[kwIdx]}||${cities[cityIdx]}`;
            if (!exhaustedCombos.includes(comboKey)) break;

            // This combo is exhausted — advance city first, keyword second
            cityIdx = (cityIdx + 1) % cities.length;
            if (cityIdx === 0) {
                kwIdx = (kwIdx + 1) % keywords.length;
            }
            skipped++;
        }

        if (skipped === totalCombos) {
            // ALL combos are exhausted today — reset and start fresh
            await logMessage(userId, `🔄 All ${totalCombos} keyword+city combos exhausted! Resetting and starting fresh cycle...`);
            await AutoScraper.updateOne({ userId }, { $set: { exhaustedCombos: [], currentKeywordIdx: 0, currentCityIdx: 0 } });
            kwIdx = 0;
            cityIdx = 0;
        }

        const keyword = keywords[kwIdx];
        const city = cities[cityIdx];
        const remainingForToday = dailyTarget - currentLeadsToday;
        const maxResults = Math.min(config.maxResults || 200, remainingForToday);

        // How many cities done for this keyword so far?
        const citiesDoneForKw = exhaustedCombos.filter(c => c.startsWith(`${keyword}||`)).length;
        const cityProgress = `[${citiesDoneForKw + 1}/${cities.length} cities]`;

        await logMessage(userId, `🔍 Scraping: "${keyword}" in "${city}" ${cityProgress} (max ${maxResults} | today: ${currentLeadsToday}/${dailyTarget})...`);
        await AutoScraper.updateOne({ userId }, { $set: { status: 'Scraping Maps', currentKeywordIdx: kwIdx, currentCityIdx: cityIdx } });

        // Run Playwright Scraper with incremental save callback
        let newLeadIds = [];
        let added = 0;
        let dupes = 0;

        try {
            await scrapeGoogleMaps(keyword, city, maxResults, async (lead) => {
                try {
                    // ── Re-check daily target inside the callback too ──────
                    const freshCfg = await AutoScraper.findOne({ userId }, { leadsToday: 1, dailyTarget: 1, enabled: 1 });
                    if (!freshCfg || !freshCfg.enabled) return;
                    if ((freshCfg.leadsToday || 0) >= (freshCfg.dailyTarget || 5000)) return;

                    const doc = {
                        ...lead,
                        userId,
                        keyword,
                        category: categorize(keyword, lead.category || ''),
                        source: 'google_maps_auto'
                    };
                    
                    // Deduplicate check
                    const existing = await Lead.findOne({
                        userId,
                        $or: [
                            lead.phone ? { phone: lead.phone } : { _id: null },
                            { name: lead.name, city: lead.city || city }
                        ]
                    });

                    if (!existing) {
                        const newDoc = await Lead.create(doc);
                        newLeadIds.push(newDoc._id);
                        added++;
                        await AutoScraper.updateOne({ userId }, {
                            $inc: { leadsToday: 1, totalLeadsExtracted: 1 }
                        });
                        await logMessage(userId, `📥 Saved new lead: "${lead.name}"`);
                    } else {
                        dupes++;
                    }
                } catch(e) {
                    if (e.code === 11000) {
                        dupes++;
                    } else {
                        console.error('AutoScraper incremental lead insert error:', e.message);
                    }
                }
            });
            await logMessage(userId, `✅ Maps search complete. Saved ${added} new leads (${dupes} duplicates skipped).`);
        } catch (e) {
            await logMessage(userId, `❌ Error during Maps scraping: ${e.message}`);
        }

        // Deep Website Contact Crawling (only if enabled — disabled by default for speed)
        if (config.deepEmailExtract && newLeadIds.length > 0) {
            await logMessage(userId, `🌐 Crawling website contact pages/footers for ${newLeadIds.length} new leads...`);
            await AutoScraper.updateOne({ userId }, { $set: { status: 'Extracting Contacts' } });

            try {
                await extractEmailsForLeads(newLeadIds, userId, (prog) => {
                    if (prog.type === 'status') {
                        logMessage(userId, `🌐 Crawling: ${prog.name} [${prog.current}/${prog.total}]`).catch(()=>{});
                    } else if (prog.type === 'success') {
                        logMessage(userId, `   ✅ Found: ${prog.name} -> ${prog.email}`).catch(()=>{});
                    } else if (prog.type === 'failed') {
                        logMessage(userId, `   ❌ No info: ${prog.name} -> ${prog.reason}`).catch(()=>{});
                    }
                });
                await logMessage(userId, `✅ Finished website crawling.`);
            } catch (err) {
                await logMessage(userId, `❌ Contact extraction failed: ${err.message}`);
            }
        }

        // ── Smart combo cycling logic ─────────────────────────────────
        // Cycle: city advances each run, keyword advances only when all cities done
        const comboKey = `${keyword}||${city}`;
        const isExhausted = added === 0; // 0 new leads = this city is done for this keyword

        // Advance: city-first, keyword-second
        let nextCityIdx = (cityIdx + 1) % cities.length;
        let nextKeywordIdx = kwIdx;
        if (nextCityIdx === 0) {
            // Wrapped around all cities → move to next keyword
            nextKeywordIdx = (kwIdx + 1) % keywords.length;
        }

        // ── Fetch updated stats for log ───────────────────────────────
        const updatedCfg = await AutoScraper.findOne({ userId });
        const todayCount = updatedCfg ? updatedCfg.leadsToday : 0;
        const totalCount = updatedCfg ? updatedCfg.totalLeadsExtracted : 0;
        const target = updatedCfg ? (updatedCfg.dailyTarget || 5000) : 5000;
        const pct = Math.round((todayCount / target) * 100);
        const intervalMins = updatedCfg ? (updatedCfg.intervalMinutes || 2) : 2;

        // Persist the next indexes and mark combo exhausted if needed
        const updateFields = {
            currentKeywordIdx: nextKeywordIdx,
            currentCityIdx: nextCityIdx,
            status: 'Idle',
            lastRunAt: new Date()
        };

        if (isExhausted) {
            // Mark this combo as exhausted so we skip it next time
            const currentExhausted = updatedCfg ? (updatedCfg.exhaustedCombos || []) : [];
            if (!currentExhausted.includes(comboKey)) {
                updateFields.exhaustedCombos = [...currentExhausted, comboKey];
            }
        }

        await AutoScraper.updateOne({ userId }, { $set: updateFields });

        // Calculate how many cities have been exhausted for the CURRENT keyword
        const finalExhausted = updateFields.exhaustedCombos || (updatedCfg ? updatedCfg.exhaustedCombos || [] : []);
        const citiesDoneForCurrentKw = finalExhausted.filter(c => c.startsWith(`${keyword}||`)).length;

        // Check if we just finished ALL cities for this keyword
        if (isExhausted && citiesDoneForCurrentKw >= cities.length) {
            await logMessage(userId, `🏁 Keyword "${keyword}" COMPLETE — all ${cities.length} cities extracted! Moving to next keyword: "${keywords[nextKeywordIdx]}"`);
        } else if (isExhausted) {
            await logMessage(userId, `⏩ "${keyword}" in "${city}" exhausted. [${citiesDoneForCurrentKw}/${cities.length} cities done] → Next: "${keywords[nextKeywordIdx]}" in "${cities[nextCityIdx]}"`);
        }

        await logMessage(userId, `📊 Today: ${todayCount}/${target} leads (${pct}%) | Total: ${totalCount} | Next: "${keywords[nextKeywordIdx]}" in "${cities[nextCityIdx]}"`);

        // ── Check again if daily target was hit this cycle ────────────
        if (todayCount >= target) {
            await logMessage(userId, `🎯 Daily target of ${target} leads REACHED! Pausing until midnight...`);
            await AutoScraper.updateOne({ userId }, { $set: { status: 'Target Reached' } });
            const midnight = new Date(now);
            midnight.setDate(midnight.getDate() + 1);
            midnight.setHours(0, 0, 10, 0);
            const msUntilMidnight = midnight.getTime() - now.getTime();
            const nextRun = setTimeout(() => runIteration(userId), msUntilMidnight);
            _activeLoops.set(userId.toString(), nextRun);
            return;
        }

        if (isExhausted) {
            // Run immediately (no wait) to jump to the next combo
            const nextRun = setTimeout(() => runIteration(userId), 500);
            _activeLoops.set(userId.toString(), nextRun);
        } else {
            await logMessage(userId, `⏳ Cycle finished. Waiting ${intervalMins} minutes before next run...`);
            const nextRun = setTimeout(() => runIteration(userId), intervalMins * 60 * 1000);
            _activeLoops.set(userId.toString(), nextRun);
        }

    } catch (err) {
        await logMessage(userId, `❌ System error in auto-scraper worker: ${err.message}`);
        // Retry in 2 minutes on any error
        const nextRun = setTimeout(() => runIteration(userId), 2 * 60 * 1000);
        _activeLoops.set(userId.toString(), nextRun);
    }
}

async function migrateConfig(userId, AutoScraper, clearExhausted = false) {
    // Auto-upgrade old configs to new 5k/day defaults
    const upgrades = {};
    const config = await AutoScraper.findOne({ userId });
    if (!config) return;

    const defaultCities = [
        'Mumbai', 'Delhi', 'Bangalore', 'Pune', 'Ahmedabad',
        'Hyderabad', 'Kolkata', 'Chennai', 'Lucknow', 'Jaipur',
        'Surat', 'Kanpur', 'Nagpur', 'Indore', 'Thane',
        'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara', 'Ghaziabad',
        'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut',
        'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad'
    ].join(', ');

    const defaultKeywords = [
        'clinic', 'doctor', 'hospital', 'dentist', 'pharmacy',
        'gym', 'yoga studio', 'spa', 'salon', 'beauty parlour',
        'hotel', 'restaurant', 'cafe', 'catering', 'bakery',
        'CA firm', 'chartered accountant', 'law firm', 'advocate', 'insurance agent',
        'interior designer', 'architect', 'real estate agent', 'builder', 'construction',
        'travel agent', 'tour operator', 'event management', 'wedding planner', 'photographer',
        'coaching institute', 'school', 'tutor', 'driving school', 'computer training'
    ].join(', ');

    if (!config.intervalMinutes || config.intervalMinutes > 5) upgrades.intervalMinutes = 2;
    if (!config.dailyTarget || config.dailyTarget < 1000) upgrades.dailyTarget = 5000;
    if (!config.maxResults || config.maxResults < 100) upgrades.maxResults = 200;
    if (!Array.isArray(config.exhaustedCombos)) upgrades.exhaustedCombos = [];
    
    // Auto-fill all 30 cities and 35 keywords if config cities contains 1 city or is empty
    const citiesCount = config.cities ? config.cities.split(',').map(c => c.trim()).filter(Boolean).length : 0;
    if (citiesCount <= 1) {
        upgrades.cities = defaultCities;
    }
    const keywordsCount = config.keywords ? config.keywords.split(',').map(k => k.trim()).filter(Boolean).length : 0;
    if (keywordsCount <= 1) {
        upgrades.keywords = defaultKeywords;
    }

    // On each boot/start, clear exhausted combos so fresh URLs can be tried
    // (Google Maps rotates listings slightly each session)
    if (clearExhausted) {
        upgrades.exhaustedCombos = [];
    }

    if (Object.keys(upgrades).length > 0) {
        await AutoScraper.updateOne({ userId }, { $set: upgrades });
        console.log(`🤖 [AutoScraper:${userId}] ⬆️  Config upgraded (Cities count: ${upgrades.cities ? '30' : citiesCount})${clearExhausted ? ' & exhausted combos cleared for fresh start.' : ''}`);
    }
}

async function startAutoScraper(userId) {
    const activeMongoose = global.activeMongoose || require('mongoose');
    const AutoScraper = activeMongoose.models.AutoScraper || require('../models/AutoScraper');

    let config = await AutoScraper.findOne({ userId });
    if (!config) {
        config = await AutoScraper.create({ userId, enabled: true });
    } else {
        config.enabled = true;
        config.status = 'Idle';
        await config.save();
    }

    // Migrate old config to new defaults, clearing exhausted combos for fresh start
    await migrateConfig(userId, AutoScraper, true);

    if (_activeLoops.has(userId.toString())) {
        clearTimeout(_activeLoops.get(userId.toString()));
    }

    await logMessage(userId, '🟢 Background Auto-Scraper STARTED.');
    // Run iteration immediately
    runIteration(userId);
}

async function stopAutoScraper(userId) {
    const activeMongoose = global.activeMongoose || require('mongoose');
    const AutoScraper = activeMongoose.models.AutoScraper || require('../models/AutoScraper');

    await AutoScraper.updateOne({ userId }, { $set: { enabled: false, status: 'Stopped' } });
    
    if (_activeLoops.has(userId.toString())) {
        clearTimeout(_activeLoops.get(userId.toString()));
        _activeLoops.delete(userId.toString());
    }
    
    await logMessage(userId, '🛑 Background Auto-Scraper STOPPED.');
}

async function getAutoScraperConfig(userId) {
    const activeMongoose = global.activeMongoose || require('mongoose');
    const AutoScraper = activeMongoose.models.AutoScraper || require('../models/AutoScraper');

    let config = await AutoScraper.findOne({ userId });
    if (!config) {
        config = await AutoScraper.create({ userId });
    }
    // Automatically apply migrations on load, but do NOT clear exhausted combos
    await migrateConfig(userId, AutoScraper, false);
    
    // Fetch fresh upgraded config
    config = await AutoScraper.findOne({ userId });
    return config;
}

async function bootAllAutoScrapers() {
    const activeMongoose = global.activeMongoose || require('mongoose');
    const AutoScraper = activeMongoose.models.AutoScraper || require('../models/AutoScraper');

    try {
        const activeConfigs = await AutoScraper.find({ enabled: true });
        for (const config of activeConfigs) {
            console.log(`🤖 Resuming background auto-scraper for user: ${config.userId}`);
            // Migrate to new defaults before resuming, clearing exhausted combos
            await migrateConfig(config.userId, AutoScraper, true);
            config.status = 'Idle';
            await config.save();
            runIteration(config.userId);
        }
    } catch (e) {
        console.error('Error booting background auto-scrapers:', e.message);
    }
}

module.exports = {
    startAutoScraper,
    stopAutoScraper,
    getAutoScraperConfig,
    bootAllAutoScrapers
};
