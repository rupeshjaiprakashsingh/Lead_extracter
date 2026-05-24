require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const Plan = require('../models/Plan');
const Company = require('../models/Company');
const User = require('../models/User');

const plans = [
  {
    name: 'Trial',
    slug: 'trial',
    price: 0,
    leadLimit: 100,
    userLimit: 1,
    waLimit: 50,
    exportEnabled: false,
    features: ['Lead Scraping', 'Basic Email', 'Basic WhatsApp'],
    isActive: true
  },
  {
    name: 'Starter',
    slug: 'starter',
    price: 29,
    leadLimit: 1000,
    userLimit: 2,
    waLimit: 500,
    exportEnabled: true,
    features: ['Lead Scraping', 'WhatsApp Auto-Scheduler', 'Email Outreach', 'Social Poster'],
    isActive: true
  },
  {
    name: 'Business',
    slug: 'business',
    price: 79,
    leadLimit: 10000,
    userLimit: 10,
    waLimit: 5000,
    exportEnabled: true,
    features: ['Everything in Starter', 'Bulk WhatsApp Outreach', 'Priority Support'],
    isActive: true
  },
  {
    name: 'Agency',
    slug: 'agency',
    price: 199,
    leadLimit: 50000,
    userLimit: 50,
    waLimit: 30000,
    exportEnabled: true,
    features: ['Unlimited leads and scans', 'Custom Branding', 'Multi-user access control'],
    isActive: true
  }
];

async function seed() {
  try {
    const ok = await connectDB();
    if (!ok) {
      console.error('Could not connect to database for seeding.');
      process.exit(1);
    }

    console.log('Seeding plans...');
    await Plan.deleteMany({});
    await Plan.insertMany(plans);
    console.log('Plans seeded successfully!');

    // Seed SuperAdmin
    console.log('Seeding SuperAdmin...');
    const superAdminEmail = process.env.SUPERADMIN_EMAIL || 'admin@yourdomain.com';
    const superAdminPassword = process.env.SUPERADMIN_PASSWORD || 'Admin@123456';

    await User.deleteMany({ role: 'superadmin' });
    const superAdmin = await User.create({
      username: 'superadmin',
      email: superAdminEmail,
      password: superAdminPassword,
      role: 'superadmin',
      companyId: null,
      isActive: true,
      firstName: 'System',
      lastName: 'Administrator'
    });
    console.log('SuperAdmin seeded successfully!');

    // Seed a test company and company admin
    console.log('Seeding Demo Company...');
    await Company.deleteMany({ slug: 'demo-company' });
    const demoCompany = await Company.create({
      name: 'Demo Company',
      slug: 'demo-company',
      email: 'demo@company.com',
      phone: '919999999999',
      plan: {
        type: 'business',
        leadLimit: 10000,
        userLimit: 10,
        waLimit: 5000,
        exportEnabled: true
      },
      subscription: {
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      isActive: true
    });

    console.log('Seeding Demo Company Admin User...');
    await User.deleteMany({ username: 'demo_admin' });
    const demoAdmin = await User.create({
      username: 'demo_admin',
      email: 'demo_admin@company.com',
      password: 'Demo@123456Password',
      role: 'company_admin',
      companyId: demoCompany._id,
      isActive: true,
      firstName: 'Demo',
      lastName: 'Admin'
    });

    // Update company creator
    demoCompany.createdBy = demoAdmin._id;
    await demoCompany.save();

    console.log('\n' + '='.repeat(40));
    console.log('  SEEDING COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(40));
    console.log(`  SuperAdmin Username: superadmin`);
    console.log(`  SuperAdmin Email:    ${superAdminEmail}`);
    console.log(`  SuperAdmin Password: ${superAdminPassword}`);
    console.log('-'.repeat(40));
    console.log(`  Demo Company Slug:   demo-company`);
    console.log(`  Demo Admin Username: demo_admin`);
    console.log(`  Demo Admin Password: Demo@123456Password`);
    console.log('='.repeat(40) + '\n');

    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
}

seed();
