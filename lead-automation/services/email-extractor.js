const { chromium } = require('playwright');
const Lead = require('../models/Lead');

async function extractEmailsForLeads(leadIds, onProgress) {
    const filter = leadIds?.length 
        ? { _id: { $in: leadIds }, website: { $exists: true, $ne: '' } }
        : { $or: [{ email: { $exists: false } }, { email: null }, { email: '' }], website: { $exists: true, $ne: '' } };

    // Ignore known non-business sites
    const socialPatterns = ['facebook', 'instagram', 'whatsapp', 'wa.me', 'youtube', 'twitter', 'linkedin', 'justdial'];
    const leads = await Lead.find(filter).lean();
    const targetLeads = leads.filter(l => !socialPatterns.some(p => l.website.toLowerCase().includes(p)));

    if (!targetLeads.length) {
        onProgress({ type: 'done', extracted: 0, failed: 0, total: 0 });
        return;
    }

    onProgress({ type: 'start', total: targetLeads.length });

    const browser = await chromium.launch({
        headless: true, // we can run headless here
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let extracted = 0, failed = 0;

    for (let i = 0; i < targetLeads.length; i++) {
        const lead = targetLeads[i];
        let url = lead.website.trim();
        if (!url.startsWith('http')) url = 'https://' + url;

        onProgress({ type: 'status', current: i + 1, total: targetLeads.length, name: lead.name, url });

        let emailsStr = '';
        try {
            const page = await browser.newPage();
            // Optional: Block images/fonts to speed up extraction
            await page.route('**/*', (route) => {
                const type = route.request().resourceType();
                if (['image', 'font', 'stylesheet', 'media'].includes(type)) route.abort();
                else route.continue();
            });

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            
            // Wait for body to be available, give it a tiny bit of time for JS frameworks
            await page.waitForTimeout(2000); 

            // Get all text content including links
            const content = await page.evaluate(() => {
                let html = document.body ? document.body.innerHTML : '';
                // Also grab mailto links explicitly just in case
                const links = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => a.href);
                return html + ' ' + links.join(' ');
            });

            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
            const foundEmails = content.match(emailRegex);

            if (foundEmails) {
                const validEmails = foundEmails.filter(e => {
                    const lower = e.toLowerCase();
                    return !lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && 
                           !lower.endsWith('.gif') && !lower.endsWith('.webp') && !lower.endsWith('.svg') && 
                           !lower.includes('sentry') && !lower.includes('wixpress') && !lower.includes('example.com');
                }).map(e => e.replace(/^mailto:/i, '').toLowerCase());

                const uniqueEmails = [...new Set(validEmails)];
                emailsStr = uniqueEmails.join(',');
            }

            await page.close();

        } catch (e) {
            console.error(`Email extraction failed for ${url}:`, e.message);
        }

        if (emailsStr) {
            await Lead.findByIdAndUpdate(lead._id, { $set: { email: emailsStr } });
            extracted++;
            onProgress({ type: 'success', name: lead.name, email: emailsStr });
        } else {
            failed++;
            onProgress({ type: 'failed', name: lead.name, reason: 'No email found or site error' });
        }
    }

    await browser.close();
    onProgress({ type: 'done', extracted, failed, total: targetLeads.length });
}

module.exports = { extractEmailsForLeads };
