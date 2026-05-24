// ============================================================
//  run-scheduler.js
//  CLI Utility to trigger automated schedules from Command Prompt
// ============================================================
const mongoose = require('mongoose');
const { connectDB } = require('./services/mongodb');
const scheduler = require('./services/scheduler');
const emailScheduler = require('./services/email-scheduler');

// Load models
const Lead = require('./models/Lead');
const Schedule = require('./models/Schedule');
const EmailSchedule = require('./models/EmailSchedule');

async function run() {
    console.log('\n============================================================');
    console.log('⏰ Starting Command Line Scheduler trigger...');
    console.log('============================================================');

    const ok = await connectDB();
    if (!ok) {
        console.error('❌ Failed to connect to MongoDB');
        process.exit(1);
    }

    const force = process.argv.includes('--force');
    const now = new Date();
    const currentHour = parseInt(now.toLocaleTimeString('en-US', { hour12: false, hour: 'numeric', timeZone: 'Asia/Kolkata' }));
    
    console.log(`Current Time (IST): ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (Hour: ${currentHour})`);
    if (force) {
        console.log('🔥 Mode: FORCE (Running all enabled rules immediately)');
    } else {
        console.log('⏰ Mode: Time check (Running rules scheduled for the current hour)');
    }

    // 1. Run WhatsApp schedules
    console.log('\n--- Checking WhatsApp Schedules ---');
    const waQuery = { enabled: true };
    if (!force) {
        waQuery.send_hours = currentHour;
    }
    const waRules = await Schedule.find(waQuery);
    console.log(`Found ${waRules.length} enabled WhatsApp rules.`);
    for (const rule of waRules) {
        // If not force, check if already run in the current hour
        if (!force && rule.last_run) {
            const lastRunHour = new Date(rule.last_run).toLocaleTimeString('en-US', { hour12: false, hour: 'numeric', timeZone: 'Asia/Kolkata' });
            const lastRunDate = new Date(rule.last_run).toISOString().slice(0, 10);
            const todayStr = now.toISOString().slice(0, 10);
            if (parseInt(lastRunHour) === currentHour && lastRunDate === todayStr) {
                console.log(`- Rule "${rule.name}" already ran in this hour, skipping.`);
                continue;
            }
        }
        console.log(`- Running WhatsApp Rule: "${rule.name}" for user ${rule.userId}`);
        const res = await scheduler.runScheduledSendForRule(rule);
        console.log(`  Result: ${res.sent} sent, ${res.failed} failed.`);
    }

    // 2. Run Email schedules
    console.log('\n--- Checking Email Schedules ---');
    const emailQuery = { enabled: true };
    if (!force) {
        emailQuery.send_hours = currentHour;
    }
    const emailRules = await EmailSchedule.find(emailQuery);
    console.log(`Found ${emailRules.length} enabled Email rules.`);
    for (const rule of emailRules) {
        if (!force && rule.last_run) {
            const lastRunHour = new Date(rule.last_run).toLocaleTimeString('en-US', { hour12: false, hour: 'numeric', timeZone: 'Asia/Kolkata' });
            const lastRunDate = new Date(rule.last_run).toISOString().slice(0, 10);
            const todayStr = now.toISOString().slice(0, 10);
            if (parseInt(lastRunHour) === currentHour && lastRunDate === todayStr) {
                console.log(`- Rule "${rule.name}" already ran in this hour, skipping.`);
                continue;
            }
        }
        console.log(`- Running Email Rule: "${rule.name}" for user ${rule.userId}`);
        const res = await emailScheduler.runScheduledSendForRule(rule);
        console.log(`  Result: ${res.sent} sent, ${res.failed} failed.`);
    }

    console.log('\n============================================================');
    console.log('✅ Scheduler execution completed.');
    console.log('============================================================\n');
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(e => {
    console.error('❌ Scheduler CLI Error:', e);
    process.exit(1);
});
