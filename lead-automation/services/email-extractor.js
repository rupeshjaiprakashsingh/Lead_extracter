const { chromium } = require('playwright');
const Lead = require('../models/Lead');

function cleanAndValidatePhone(raw) {
    if (!raw) return null;
    // Strip everything except + and digits
    const cleaned = raw.replace(/[^\d+]/g, '');
    
    // Check if digit count is valid (7 to 15 digits)
    if (cleaned.length < 7 || cleaned.length > 15) return null;
    
    // Filter out obvious numbers like dates (e.g. 20260523) or timestamps
    if (/^(20\d{6}|19\d{6})$/.test(cleaned)) return null; 

    // Check if it is a 10-digit Indian mobile
    if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
        return {
            phone: '91' + cleaned,
            raw_phone: cleaned,
            isMobile: true
        };
    }
    
    // If it starts with +91 and has 10 digits after
    if (cleaned.startsWith('+91') && cleaned.length === 13) {
        const local = cleaned.slice(3);
        if (/^[6-9]/.test(local)) {
            return {
                phone: '91' + local,
                raw_phone: local,
                isMobile: true
            };
        }
    }
    
    // If it starts with 91 and has 10 digits after
    if (cleaned.startsWith('91') && cleaned.length === 12) {
        const local = cleaned.slice(2);
        if (/^[6-9]/.test(local)) {
            return {
                phone: '91' + local,
                raw_phone: local,
                isMobile: true
            };
        }
    }
    
    // If it starts with 0 and has 10 digits after
    if (cleaned.startsWith('0') && cleaned.length === 11) {
        const local = cleaned.slice(1);
        if (/^[6-9]/.test(local)) {
            return {
                phone: '91' + local,
                raw_phone: local,
                isMobile: true
            };
        }
    }
    
    // Landline or other formats
    return {
        phone: cleaned.startsWith('+') ? cleaned.slice(1) : cleaned,
        raw_phone: raw.trim(),
        isMobile: false
    };
}

function extractPhonesFromText(text) {
    if (!text) return [];
    // Match common phone number patterns
    const phoneRegex = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
    const matches = text.match(phoneRegex) || [];
    const validPhones = [];

    for (const match of matches) {
        const cleaned = cleanAndValidatePhone(match);
        if (cleaned) {
            validPhones.push(cleaned);
        }
    }
    return validPhones;
}

function cleanEmails(emails) {
    if (!emails) return [];
    return emails.filter(e => {
        const lower = e.toLowerCase();
        return !lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && 
               !lower.endsWith('.gif') && !lower.endsWith('.webp') && !lower.endsWith('.svg') && 
               !lower.includes('sentry') && !lower.includes('wixpress') && !lower.includes('example.com') &&
               !lower.includes('bootstrap') && !lower.includes('jquery');
    }).map(e => e.replace(/^mailto:/i, '').toLowerCase());
}

async function findContactLinks(page, baseUrl) {
    try {
        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href]')).map(a => ({
                text: a.innerText.trim().toLowerCase(),
                href: a.getAttribute('href').trim()
            }));
        });

        const contactKeywords = ['contact', 'about', 'get-in-touch', 'reach-us', 'find-us', 'support', 'connect'];
        const results = [];

        for (const link of links) {
            if (!link.href) continue;
            const textLower = link.text;
            const hrefLower = link.href.toLowerCase();

            const isContact = contactKeywords.some(keyword => 
                hrefLower.includes(keyword) || textLower.includes(keyword)
            );

            if (isContact) {
                try {
                    const resolved = new URL(link.href, baseUrl).toString();
                    const baseHost = new URL(baseUrl).hostname.replace('www.', '');
                    const resolvedHost = new URL(resolved).hostname.replace('www.', '');

                    // Ensure it stays on the same domain and is not the home page itself
                    if (baseHost === resolvedHost && resolved !== baseUrl && !results.includes(resolved)) {
                        results.push(resolved);
                    }
                } catch(err) {
                    // Invalid URL
                }
            }
        }
        return results;
    } catch (e) {
        console.error('Error finding contact links:', e.message);
        return [];
    }
}

async function extractEmailsForLeads(leadIds, userId, onProgress) {
    const filter = { userId };
    if (leadIds?.length) {
        filter._id = { $in: leadIds };
        filter.website = { $exists: true, $ne: '' };
    } else {
        filter.$or = [{ email: { $exists: false } }, { email: null }, { email: '' }];
        filter.website = { $exists: true, $ne: '' };
    }

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
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    let extracted = 0, failed = 0;

    for (let i = 0; i < targetLeads.length; i++) {
        const lead = targetLeads[i];
        let startUrl = lead.website.trim();
        if (!startUrl.startsWith('http')) startUrl = 'https://' + startUrl;

        onProgress({ type: 'status', current: i + 1, total: targetLeads.length, name: lead.name, url: startUrl });

        const uniqueEmails = new Set();
        const uniquePhones = new Map(); // Map phone -> phoneObj

        try {
            const page = await context.newPage();
            // Block heavy media assets
            await page.route('**/*', (route) => {
                const type = route.request().resourceType();
                if (['image', 'font', 'stylesheet', 'media'].includes(type)) route.abort();
                else route.continue();
            });

            // 1. Visit homepage
            await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForTimeout(2000); 

            // Extract from homepage
            const getPageInfo = async () => {
                return await page.evaluate(() => {
                    const html = document.body ? document.body.innerHTML : '';
                    const text = document.body ? document.body.innerText : '';
                    const mailto = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => a.href);
                    const tels = Array.from(document.querySelectorAll('a[href^="tel:"]')).map(a => a.href);
                    return { html, text, mailto, tels };
                });
            };

            const homeInfo = await getPageInfo();
            
            // Extract emails
            const homeMailto = cleanEmails(homeInfo.mailto);
            homeMailto.forEach(e => uniqueEmails.add(e));
            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
            const homeMatches = cleanEmails(homeInfo.html.match(emailRegex) || []);
            homeMatches.forEach(e => uniqueEmails.add(e));

            // Extract phones
            const homeTels = homeInfo.tels.map(t => t.replace(/^tel:/i, '').trim());
            homeTels.forEach(t => {
                const val = cleanAndValidatePhone(t);
                if (val) uniquePhones.set(val.phone, val);
            });
            const textPhones = extractPhonesFromText(homeInfo.text);
            textPhones.forEach(p => uniquePhones.set(p.phone, p));

            // 2. Discover contact page link(s)
            const contactLinks = await findContactLinks(page, startUrl);

            // Visit discovered contact pages
            const pagesToVisit = contactLinks.slice(0, 2);
            for (const contactUrl of pagesToVisit) {
                try {
                    await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
                    await page.waitForTimeout(1500);

                    const contactInfo = await getPageInfo();
                    
                    // Add emails
                    const cMailto = cleanEmails(contactInfo.mailto);
                    cMailto.forEach(e => uniqueEmails.add(e));
                    const cMatches = cleanEmails(contactInfo.html.match(emailRegex) || []);
                    cMatches.forEach(e => uniqueEmails.add(e));

                    // Add phones
                    const cTels = contactInfo.tels.map(t => t.replace(/^tel:/i, '').trim());
                    cTels.forEach(t => {
                        const val = cleanAndValidatePhone(t);
                        if (val) uniquePhones.set(val.phone, val);
                    });
                    const cTextPhones = extractPhonesFromText(contactInfo.text);
                    cTextPhones.forEach(p => uniquePhones.set(p.phone, p));

                } catch (err) {
                    console.error(`Failed to load contact subpage ${contactUrl}:`, err.message);
                }
            }

            await page.close();

        } catch (e) {
            console.error(`Crawling failed for ${startUrl}:`, e.message);
        }

        const finalEmails = Array.from(uniqueEmails);
        const finalPhones = Array.from(uniquePhones.values());

        if (finalEmails.length || finalPhones.length) {
            const updateDoc = {};
            const activityMsgs = [];

            if (finalEmails.length) {
                const emailsStr = finalEmails.join(',');
                updateDoc.email = emailsStr;
                activityMsgs.push(`Extracted email(s): ${emailsStr}`);
            }

            if (finalPhones.length) {
                // Determine the best phone number (prioritize mobile over landline)
                const mobileNum = finalPhones.find(p => p.isMobile);
                const landlineNum = finalPhones.find(p => !p.isMobile);
                const bestPhoneObj = mobileNum || landlineNum;

                if (bestPhoneObj) {
                    // Check if we should update lead's phone:
                    // 1. Lead has no phone
                    // 2. Lead has landline/empty phone but we found a mobile number
                    const currentPhone = lead.phone ? lead.phone.trim() : '';
                    const currentIsMobile = currentPhone.length === 12 && currentPhone.startsWith('91') && /^[6-9]/.test(currentPhone.slice(2));

                    if (!currentPhone || (!currentIsMobile && bestPhoneObj.isMobile)) {
                        updateDoc.phone = bestPhoneObj.phone;
                        updateDoc.raw_phone = bestPhoneObj.raw_phone;
                        activityMsgs.push(`Updated phone number to: ${bestPhoneObj.raw_phone}`);
                    } else {
                        activityMsgs.push(`Found phone number on site: ${bestPhoneObj.raw_phone} (did not overwrite existing mobile)`);
                    }
                }
            }

            if (activityMsgs.length) {
                // Build activity logs
                const activityEntries = activityMsgs.map(msg => ({
                    type: 'note',
                    message: `🌐 Website Extractor: ${msg}`,
                    date: new Date()
                }));
                
                // Add to Lead
                await Lead.findOneAndUpdate(
                    { _id: lead._id, userId },
                    { 
                        $set: updateDoc,
                        $push: { activity: { $each: activityEntries } } 
                    }
                );
            }

            extracted++;
            onProgress({ 
                type: 'success', 
                name: lead.name, 
                email: finalEmails.length ? finalEmails.join(', ') : 'No Email',
                extracted, 
                failed, 
                total: targetLeads.length 
            });
        } else {
            failed++;
            onProgress({ 
                type: 'failed', 
                name: lead.name, 
                reason: 'No contact info found on site',
                extracted, 
                failed, 
                total: targetLeads.length 
            });
        }
    }

    await browser.close();
    onProgress({ type: 'done', extracted, failed, total: targetLeads.length });
}

module.exports = { extractEmailsForLeads };
