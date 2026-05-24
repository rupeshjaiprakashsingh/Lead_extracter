const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://rupeshwork72:Gate%40air7208@mern-cluster.ahj3x8j.mongodb.net/lead_automation?appName=mern-cluster';

const SettingsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    key:    { type: String },
    value:  { type: mongoose.Schema.Types.Mixed }
});

const Settings = mongoose.model('Settings', SettingsSchema);

const template = `Hi [Business Name]! 🖐️

I came across your business on Google Maps and had a quick question — when someone searches for [Category] in [City] right now, does your business show up on Google?

I work with Innvoque and we help local businesses get found online and get more customers. Would a quick 5-minute call work this week?`;

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');
    const result = await Settings.findOneAndUpdate(
        { key: 'wa_template' },
        { value: template },
        { upsert: true, new: true }
    );
    console.log('Updated wa_template:', result);
    await mongoose.disconnect();
}

run().catch(err => console.error(err));
