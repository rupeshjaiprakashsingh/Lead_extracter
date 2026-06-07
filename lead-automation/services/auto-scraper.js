const _activeLoops = new Map();
const _runningIterations = new Set();
const _activeScrapers = new Map();

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

async function runIteration(userId, forceStart = false) {
    if (_runningIterations.has(userId.toString())) {
        if (forceStart) {
            console.log(`🤖 [AutoScraper:${userId}] Iteration running or winding down. Waiting for cleanup...`);
            for (let i = 0; i < 20; i++) { // 20 * 500ms = 10s max wait
                await new Promise(r => setTimeout(r, 500));
                if (!_runningIterations.has(userId.toString())) {
                    break;
                }
            }
        }
        if (_runningIterations.has(userId.toString())) {
            console.log(`🤖 [AutoScraper:${userId}] Iteration already running. Skipping duplicate call.`);
            return;
        }
    }
    _runningIterations.add(userId.toString());

    try {
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
            const exhaustedCombos = config.exhaustedCombos || [];
            const totalCombos = keywords.length * cities.length;

            let kwIdx = config.currentKeywordIdx % keywords.length;
            let cityIdx = config.currentCityIdx % cities.length;

            let skipped = 0;
            while (skipped < totalCombos) {
                const comboKey = `${keywords[kwIdx]}||${cities[cityIdx]}`;
                if (!exhaustedCombos.includes(comboKey)) break;

                cityIdx = (cityIdx + 1) % cities.length;
                if (cityIdx === 0) {
                    kwIdx = (kwIdx + 1) % keywords.length;
                }
                skipped++;
            }

            if (skipped === totalCombos) {
                await logMessage(userId, `🔄 All ${totalCombos} keyword+city combos exhausted! Resetting and starting fresh cycle...`);
                await AutoScraper.updateOne({ userId }, { $set: { exhaustedCombos: [], currentKeywordIdx: 0, currentCityIdx: 0 } });
                kwIdx = 0;
                cityIdx = 0;
            }

            const keyword = keywords[kwIdx];
            const city = cities[cityIdx];
            const remainingForToday = dailyTarget - currentLeadsToday;
            const maxResults = Math.min(config.maxResults || 200, remainingForToday);

            const citiesDoneForKw = exhaustedCombos.filter(c => c.startsWith(`${keyword}||`)).length;
            const cityProgress = `[${citiesDoneForKw + 1}/${cities.length} cities]`;

            await logMessage(userId, `🔍 Scraping: "${keyword}" in "${city}" ${cityProgress} (max ${maxResults} | today: ${currentLeadsToday}/${dailyTarget})...`);
            await AutoScraper.updateOne({ userId }, { $set: { status: 'Scraping Maps', currentKeywordIdx: kwIdx, currentCityIdx: cityIdx } });

            let newLeadIds = [];
            let added = 0;
            let dupes = 0;

            const shouldCancel = async () => {
                const freshCfg = await AutoScraper.findOne({ userId }, { enabled: 1 });
                return !freshCfg || !freshCfg.enabled;
            };

            const registerBrowser = (browserInstance) => {
                _activeScrapers.set(userId.toString(), { browser: browserInstance });
            };

            try {
                await scrapeGoogleMaps(keyword, city, maxResults, async (lead) => {
                    try {
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
                }, shouldCancel, registerBrowser);
                await logMessage(userId, `✅ Maps search complete. Saved ${added} new leads (${dupes} duplicates skipped).`);
            } catch (e) {
                const cancelled = await shouldCancel();
                if (cancelled) {
                    await logMessage(userId, `🛑 Maps scraping stopped by user.`);
                } else {
                    await logMessage(userId, `❌ Error during Maps scraping: ${e.message}`);
                }
            } finally {
                _activeScrapers.delete(userId.toString());
            }

            // Check cancellation before contact extraction
            if (await shouldCancel()) {
                await logMessage(userId, `🛑 Scrape cancelled by caller. Exiting iteration.`);
                return;
            }

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
                    }, shouldCancel, registerBrowser);
                    await logMessage(userId, `✅ Finished website crawling.`);
                } catch (err) {
                    const cancelled = await shouldCancel();
                    if (cancelled) {
                        await logMessage(userId, `🛑 Contact extraction stopped by user.`);
                    } else {
                        await logMessage(userId, `❌ Contact extraction failed: ${err.message}`);
                    }
                } finally {
                    _activeScrapers.delete(userId.toString());
                }
            }

            const comboKey = `${keyword}||${city}`;
            const isExhausted = added === 0;

            let nextCityIdx = (cityIdx + 1) % cities.length;
            let nextKeywordIdx = kwIdx;
            if (nextCityIdx === 0) {
                nextKeywordIdx = (kwIdx + 1) % keywords.length;
            }

            const updatedCfg = await AutoScraper.findOne({ userId });
            const todayCount = updatedCfg ? updatedCfg.leadsToday : 0;
            const totalCount = updatedCfg ? updatedCfg.totalLeadsExtracted : 0;
            const target = updatedCfg ? (updatedCfg.dailyTarget || 5000) : 5000;
            const pct = Math.round((todayCount / target) * 100);
            const intervalMins = updatedCfg ? (updatedCfg.intervalMinutes || 2) : 2;

            const updateFields = {
                currentKeywordIdx: nextKeywordIdx,
                currentCityIdx: nextCityIdx,
                status: 'Idle',
                lastRunAt: new Date()
            };

            if (isExhausted) {
                const currentExhausted = updatedCfg ? (updatedCfg.exhaustedCombos || []) : [];
                if (!currentExhausted.includes(comboKey)) {
                    updateFields.exhaustedCombos = [...currentExhausted, comboKey];
                }
            }

            await AutoScraper.updateOne({ userId }, { $set: updateFields });

            const finalExhausted = updateFields.exhaustedCombos || (updatedCfg ? updatedCfg.exhaustedCombos || [] : []);
            const citiesDoneForCurrentKw = finalExhausted.filter(c => c.startsWith(`${keyword}||`)).length;

            if (isExhausted && citiesDoneForCurrentKw >= cities.length) {
                await logMessage(userId, `🏁 Keyword "${keyword}" COMPLETE — all ${cities.length} cities extracted! Moving to next keyword: "${keywords[nextKeywordIdx]}"`);
            } else if (isExhausted) {
                await logMessage(userId, `⏩ "${keyword}" in "${city}" exhausted. [${citiesDoneForCurrentKw}/${cities.length} cities done] → Next: "${keywords[nextKeywordIdx]}" in "${cities[nextCityIdx]}"`);
            }

            await logMessage(userId, `📊 Today: ${todayCount}/${target} leads (${pct}%) | Total: ${totalCount} | Next: "${keywords[nextKeywordIdx]}" in "${cities[nextCityIdx]}"`);

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

            const finalCheck = await AutoScraper.findOne({ userId }, { enabled: 1 });
            if (!finalCheck || !finalCheck.enabled) {
                _activeLoops.delete(userId.toString());
                return;
            }

            if (isExhausted) {
                // Wait 30 seconds between exhausted combos to prevent CPU thrashing & rate limiting
                const nextRun = setTimeout(() => runIteration(userId), 30000);
                _activeLoops.set(userId.toString(), nextRun);
            } else {
                await logMessage(userId, `⏳ Cycle finished. Waiting ${intervalMins} minutes before next run...`);
                const nextRun = setTimeout(() => runIteration(userId), intervalMins * 60 * 1000);
                _activeLoops.set(userId.toString(), nextRun);
            }

        } catch (err) {
            await logMessage(userId, `❌ System error in auto-scraper worker: ${err.message}`);
            try {
                const freshCfg = await AutoScraper.findOne({ userId }, { enabled: 1 });
                if (freshCfg && freshCfg.enabled) {
                    const nextRun = setTimeout(() => runIteration(userId), 2 * 60 * 1000);
                    _activeLoops.set(userId.toString(), nextRun);
                } else {
                    _activeLoops.delete(userId.toString());
                }
            } catch (dbErr) {
                const nextRun = setTimeout(() => runIteration(userId), 2 * 60 * 1000);
                _activeLoops.set(userId.toString(), nextRun);
            }
        }
    } finally {
        _runningIterations.delete(userId.toString());
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
    // Run iteration immediately with forceStart = true
    runIteration(userId, true);
}

async function stopAutoScraper(userId) {
    const activeMongoose = global.activeMongoose || require('mongoose');
    const AutoScraper = activeMongoose.models.AutoScraper || require('../models/AutoScraper');

    await AutoScraper.updateOne({ userId }, { $set: { enabled: false, status: 'Stopped' } });
    
    if (_activeLoops.has(userId.toString())) {
        clearTimeout(_activeLoops.get(userId.toString()));
        _activeLoops.delete(userId.toString());
    }

    // Immediately terminate any active Playwright browser for this user
    if (_activeScrapers.has(userId.toString())) {
        const scraper = _activeScrapers.get(userId.toString());
        if (scraper.browser) {
            console.log(`🤖 [AutoScraper:${userId}] Stop requested. Closing active browser immediately.`);
            scraper.browser.close().catch(() => {});
        }
        _activeScrapers.delete(userId.toString());
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
