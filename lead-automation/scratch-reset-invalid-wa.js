require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('./services/mongodb');
const Lead = require('./models/Lead');

async function run() {
    await connectDB();
    const result = await Lead.updateMany({ wa_invalid: true }, { $set: { wa_invalid: false } });
    console.log(`✅ Cleared wa_invalid=false for ${result.modifiedCount} leads.`);
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
