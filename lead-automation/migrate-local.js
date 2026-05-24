const mongoose = require('mongoose');
const { connectDB } = require('./services/mongodb');
const User = require('./models/User');
const Lead = require('./models/Lead');
const Settings = require('./models/Settings');
const Schedule = require('./models/Schedule');
const SocialSettings = require('./models/SocialSettings');
const SocialPost = require('./models/SocialPost');

const COMPANY = 'Innvoque Solutions';
const USERNAME = 'admin';
const PASSWORD = 'password123';
const EMAIL = 'info@innvoque.com';

async function run() {
    try {
        console.log('Connecting to database...');
        const connected = await connectDB();
        if (!connected) {
            console.error('Could not connect to MongoDB.');
            process.exit(1);
        }

        // 1. Create or update user
        let user = await User.findOne({ username: USERNAME });
        if (!user) {
            console.log(`Creating default admin user: "${USERNAME}"...`);
            user = new User({
                company: COMPANY,
                username: USERNAME,
                password: PASSWORD,
                email: EMAIL,
                role: 'admin',
                plan: 'pro',
                isActive: true
            });
            await user.save();
            console.log('User created successfully.');
        } else {
            console.log(`User "${USERNAME}" already exists.`);
        }

        const userId = user._id;

        // 2. Migrate Leads (One by one to handle unique index conflicts and bypass schema validations)
        console.log('Migrating leads one by one...');
        const leads = await Lead.find({ $or: [{ userId: { $exists: false } }, { userId: null }] });
        console.log(`Found ${leads.length} leads to migrate.`);
        
        let migratedLeads = 0;
        let skippedLeads = 0;

        for (const lead of leads) {
            try {
                // If it has phone as empty string, unset it so it doesn't conflict in sparse unique index
                if (lead.phone === '') {
                    await Lead.updateOne(
                        { _id: lead._id },
                        { $set: { userId }, $unset: { phone: 1 } }
                    );
                } else {
                    await Lead.updateOne(
                        { _id: lead._id },
                        { $set: { userId } }
                    );
                }
                migratedLeads++;
            } catch (err) {
                if (err.code === 11000) {
                    skippedLeads++;
                    // Remove duplicate lead to clean up the DB
                    await Lead.deleteOne({ _id: lead._id });
                } else {
                    console.error(`Error migrating lead ${lead.name}:`, err.message);
                }
            }
        }
        console.log(`Leads Migration: ${migratedLeads} migrated, ${skippedLeads} duplicates deleted.`);

        console.log('Migrating settings...');
        const settingsRes = await Settings.updateMany(
            { $or: [{ userId: { $exists: false } }, { userId: null }] },
            { $set: { userId } }
        );
        console.log(`Associated ${settingsRes.modifiedCount} settings with user ${USERNAME}.`);

        console.log('Migrating schedules...');
        const scheduleRes = await Schedule.updateMany(
            { $or: [{ userId: { $exists: false } }, { userId: null }] },
            { $set: { userId } }
        );
        console.log(`Associated ${scheduleRes.modifiedCount} schedules with user ${USERNAME}.`);

        console.log('Migrating social settings...');
        const socialSettingsRes = await SocialSettings.updateMany(
            { $or: [{ userId: { $exists: false } }, { userId: null }] },
            { $set: { userId } }
        );
        console.log(`Associated ${socialSettingsRes.modifiedCount} social settings with user ${USERNAME}.`);

        console.log('Migrating social posts...');
        const socialPostRes = await SocialPost.updateMany(
            { $or: [{ userId: { $exists: false } }, { userId: null }] },
            { $set: { userId } }
        );
        console.log(`Associated ${socialPostRes.modifiedCount} social posts with user ${USERNAME}.`);

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}

run();
