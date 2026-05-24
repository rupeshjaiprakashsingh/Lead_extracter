const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://rupeshwork72:Gate%40air7208@mern-cluster.ahj3x8j.mongodb.net/lead_automation?appName=mern-cluster';

const SettingsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    key:    { type: String },
    value:  { type: mongoose.Schema.Types.Mixed }
});

const Settings = mongoose.model('Settings', SettingsSchema);

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');
    const rows = await Settings.find({});
    console.log('SETTINGS COUNT:', rows.length);
    rows.forEach(r => {
        console.log(`KEY: ${r.key}`);
        console.log(`VALUE:\n${r.value}`);
        console.log('-----------------------------');
    });
    await mongoose.disconnect();
}

run().catch(err => console.error(err));
