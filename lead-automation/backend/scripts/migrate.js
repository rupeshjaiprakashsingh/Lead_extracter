require('dotenv').config();
const { connectDB } = require('../config/db');
const Company = require('../models/Company');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Settings = require('../models/Settings');
const Schedule = require('../models/Schedule');
const SocialPost = require('../models/SocialPost');
const SocialSettings = require('../models/SocialSettings');

async function migrate() {
    try {
        const ok = await connectDB();
        if (!ok) {
            console.error('Could not connect to database for migration.');
            process.exit(1);
        }

        console.log('Starting SaaS migration...');

        // Find all users (excluding superadmins which might not have a company name)
        const users = await User.find({ role: { $ne: 'superadmin' } });
        console.log(`Found ${users.length} users to migrate.`);

        let migratedCompanies = 0;
        let migratedLeads = 0;
        let migratedSettings = 0;
        let migratedSchedules = 0;
        let migratedSocialPosts = 0;
        let migratedSocialSettings = 0;

        for (const user of users) {
            console.log(`\nMigrating user: ${user.username} (company name: ${user.company || 'Unknown Company'})`);

            // 1. Create or Find Company
            const companyName = user.company || `${user.username}'s Company`;
            const slug = Company.generateSlug(companyName);

            let company = await Company.findOne({ slug });
            if (!company) {
                // Map plans
                let planType = 'trial';
                if (['starter', 'pro', 'business', 'agency'].includes(user.plan?.toLowerCase())) {
                    planType = user.plan.toLowerCase() === 'pro' ? 'business' : user.plan.toLowerCase();
                }

                // Plan limits
                let leadLimit = 500;
                let userLimit = 2;
                let waLimit = 200;
                let exportEnabled = false;

                if (planType === 'starter') {
                    leadLimit = 1000;
                    userLimit = 2;
                    waLimit = 500;
                    exportEnabled = true;
                } else if (planType === 'business') {
                    leadLimit = 10000;
                    userLimit = 10;
                    waLimit = 5000;
                    exportEnabled = true;
                } else if (planType === 'agency') {
                    leadLimit = 50000;
                    userLimit = 50;
                    waLimit = 30000;
                    exportEnabled = true;
                }

                company = await Company.create({
                    name: companyName,
                    slug,
                    email: user.email || `${user.username}@example.com`,
                    phone: user.phone || '',
                    plan: {
                        type: planType,
                        leadLimit,
                        userLimit,
                        waLimit,
                        exportEnabled
                    },
                    subscription: {
                        status: 'active',
                        expiresAt: user.licenseExpiry || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                    },
                    isActive: user.isActive,
                    createdBy: user._id
                });
                migratedCompanies++;
                console.log(`Created Company: ${companyName} (${slug}) with plan ${planType}`);
            } else {
                console.log(`Using existing Company: ${company.name}`);
            }

            // 2. Associate User with Company
            user.companyId = company._id;
            // Map original 'admin' role to 'company_admin', and others to 'employee'
            if (user.role === 'admin' || !user.role) {
                user.role = 'company_admin';
            } else if (user.role === 'user') {
                user.role = 'employee';
            }
            await user.save();
            console.log(`Updated user ${user.username} role to ${user.role} and companyId to ${company._id}`);

            // 3. Migrate Leads
            const leadRes = await Lead.updateMany(
                { userId: user._id, companyId: { $exists: false } },
                { $set: { companyId: company._id } }
            );
            migratedLeads += leadRes.modifiedCount;
            if (leadRes.modifiedCount > 0) {
                console.log(`Associated ${leadRes.modifiedCount} leads with Company.`);
            }

            // 4. Migrate Settings
            const settingsRes = await Settings.updateMany(
                { userId: user._id, companyId: { $exists: false } },
                { $set: { companyId: company._id } }
            );
            migratedSettings += settingsRes.modifiedCount;
            if (settingsRes.modifiedCount > 0) {
                console.log(`Associated ${settingsRes.modifiedCount} settings entries with Company.`);
            }

            // 5. Migrate Schedules
            // In the old system, userId in Schedule could be string or objectId. We support both.
            const schedRes = await Schedule.updateMany(
                {
                    $or: [
                        { userId: user._id },
                        { userId: user._id.toString() }
                    ],
                    companyId: { $exists: false }
                },
                { $set: { companyId: company._id, userId: user._id } }
            );
            migratedSchedules += schedRes.modifiedCount;
            if (schedRes.modifiedCount > 0) {
                console.log(`Associated ${schedRes.modifiedCount} schedules with Company.`);
            }

            // 6. Migrate Social Posts
            const postRes = await SocialPost.updateMany(
                {
                    $or: [
                        { userId: user._id },
                        { userId: user._id.toString() }
                    ],
                    companyId: { $exists: false }
                },
                { $set: { companyId: company._id, userId: user._id.toString() } }
            );
            migratedSocialPosts += postRes.modifiedCount;
            if (postRes.modifiedCount > 0) {
                console.log(`Associated ${postRes.modifiedCount} social posts with Company.`);
            }

            // 7. Migrate Social Settings
            const socialSettingsRes = await SocialSettings.updateMany(
                {
                    $or: [
                        { userId: user._id },
                        { userId: user._id.toString() }
                    ],
                    companyId: { $exists: false }
                },
                { $set: { companyId: company._id, userId: user._id.toString() } }
            );
            migratedSocialSettings += socialSettingsRes.modifiedCount;
            if (socialSettingsRes.modifiedCount > 0) {
                console.log(`Associated ${socialSettingsRes.modifiedCount} social settings with Company.`);
            }

            // Update Company Usage Stats
            const leadCount = await Lead.countDocuments({ companyId: company._id });
            const userCount = await User.countDocuments({ companyId: company._id });
            company.usage = {
                leadCount,
                userCount,
                waCount: 0 // Reset or keep 0 for simplicity
            };
            await company.save();
        }

        console.log('\n' + '='.repeat(40));
        console.log('  MIGRATION COMPLETED SUCCESSFULLY!');
        console.log('='.repeat(40));
        console.log(`  Companies Created:      ${migratedCompanies}`);
        console.log(`  Leads Associated:        ${migratedLeads}`);
        console.log(`  Settings Associated:     ${migratedSettings}`);
        console.log(`  Schedules Associated:    ${migratedSchedules}`);
        console.log(`  Social Posts Associated: ${migratedSocialPosts}`);
        console.log(`  Social Settings Assoc:   ${migratedSocialSettings}`);
        console.log('='.repeat(40) + '\n');

        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
