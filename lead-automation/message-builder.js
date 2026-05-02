// ============================================================
//  message-builder.js — Smart Personalized Message Generator
// ============================================================

const FAKE_WEBSITES = ['whatsapp.com', 'wa.me', 'youtube.com', 'facebook.com', 'instagram.com'];
const FREE_SITE_KEYWORDS = ['grexa', 'wixsite', 'weebly', 'blogspot', 'wordpress.com', 'linktr.ee', 'carrd.co'];

function classifyBusiness(biz) {
    const issues = [];
    const website = (biz.website || '').toLowerCase();

    if (!biz.website || biz.website === '') {
        issues.push('no_website');
    } else if (FAKE_WEBSITES.some(fw => website.includes(fw))) {
        issues.push('fake_website');
    } else if (FREE_SITE_KEYWORDS.some(fk => website.includes(fk))) {
        issues.push('free_website');
    } else {
        issues.push('has_website');
    }

    const reviews = parseInt(biz.reviews) || 0;
    if (reviews < 20)       issues.push('very_few_reviews');
    else if (reviews < 100) issues.push('few_reviews');
    else                    issues.push('good_reviews');

    return issues;
}

function buildWhatsAppMessage(biz) {
    const issues = classifyBusiness(biz);
    const name = biz.name || 'Sir/Ma\'am';
    const rating = biz.rating || '';
    const reviews = biz.reviews || '0';
    const city = biz.city || 'Lucknow';

    let intro = `Namaste! 🙏\n\nAapka *${name}* Google Maps pe dekha`;
    if (rating && reviews) {
        intro += ` — *${rating} stars with ${reviews} reviews*`;
    }
    intro += ` — bahut achha! 👏\n\nLekin ek important cheez share karna tha:\n\n`;

    let body = '';
    let cta = `\n\nKya ek *FREE 10-minute call* ho sakti hai? Main aapko poora plan share karunga. 🚀🙏`;

    if (issues.includes('no_website')) {
        body += `⚠️ *Google Maps pe aapki koi website nahi hai!*\n\n`;
        body += `Jab koi customer *"laptop ${city}"* Google pe search karta hai:\n`;
        body += `❌ Aap search results mein nahi dikhte\n`;
        body += `❌ Koi product page nahi — customer competitor ke paas chala jaata hai\n`;
        body += `❌ *${reviews} happy customers hain par zero online presence*\n\n`;
        body += `Main aapke liye:\n`;
        body += `✅ *Professional Website* banaunga\n`;
        body += `✅ *Google Ads* — "${city} laptop" searches pe top mein aao\n`;
        body += `✅ *WhatsApp Business* button for instant leads\n`;
        body += `✅ *Google Business Profile* fully optimize karunga`;

    } else if (issues.includes('fake_website')) {
        body += `⚠️ *Aapki "website" (${biz.website}) koi real business website nahi hai!*\n\n`;
        body += `Iska matlab:\n`;
        body += `❌ Google pe search karne wale customers aapko find nahi kar paate\n`;
        body += `❌ *${reviews} reviews ki reputation* online sales mein convert nahi ho rahi\n`;
        body += `❌ Competitors jo proper website run kar rahe hain aapke customers le ja rahe hain\n\n`;
        body += `Main aapke liye:\n`;
        body += `✅ *Professional Website* with product listings\n`;
        body += `✅ *Google Ads Campaign* — local buyers target karo\n`;
        body += `✅ *Landing Page* jo visitors ko buyers mein convert kare`;

    } else if (issues.includes('free_website')) {
        body += `⚠️ *Aapki website ek free platform pe hai — Google ise properly rank nahi karta!*\n\n`;
        body += `Competitors jo professional websites use karte hain:\n`;
        body += `❌ Google pe unhe pehle dikhata hai, aapko baad mein\n`;
        body += `❌ Customers free websites ko less trustworthy samajhte hain\n\n`;
        body += `Main aapke liye:\n`;
        body += `✅ *Custom Professional Website* (aapke domain pe)\n`;
        body += `✅ *SEO Optimization* — Google search pe top rank\n`;
        body += `✅ *Google Ads* — local buyers seedha aapke paas`;

    } else {
        // has_website - pitch ads + landing page
        body += `🔴 *Koi dedicated Google Ads campaign nahi* — competitors aapke potential customers le ja rahe hain\n`;
        body += `🔴 *No Landing Pages* — ad clicks homepage pe bounce karte hain, sale nahi hoti\n`;
        if (issues.includes('few_reviews') || issues.includes('very_few_reviews')) {
            body += `🔴 *Sirf ${reviews} reviews* — competitors ke zyada reviews hain, woh pehle trust karte hain\n`;
        }
        body += `\nMain aapke liye:\n`;
        body += `✅ *Google Ads Campaign* — "${city} laptop" pe top mein aao\n`;
        body += `✅ *High-Converting Landing Page*\n`;
        body += `✅ *Review Generation Strategy* — reviews fast badhaao\n`;
        body += `✅ *Social Media* — Instagram & Reels se brand viral karo`;
    }

    return intro + body + cta;
}

function buildEmailSubject(biz) {
    const issues = classifyBusiness(biz);
    if (issues.includes('no_website') || issues.includes('fake_website')) {
        return `Your Google listing is missing a website — losing customers daily`;
    }
    return `Quick growth ideas for ${biz.name} — Digital Marketing Audit`;
}

function buildEmailBody(biz) {
    const issues = classifyBusiness(biz);
    const wa_msg = buildWhatsAppMessage(biz);
    // Convert WhatsApp bold (*text*) to HTML <b>text</b>
    const html_msg = wa_msg
        .replace(/\*(.*?)\*/g, '<b>$1</b>')
        .replace(/\n/g, '<br>');
    return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <p>Dear ${biz.name} Team,</p>
        <br>
        ${html_msg}
        <br><br>
        <p>Best regards,<br><b>Your Digital Marketing Partner</b></p>
        <hr>
        <p style="font-size:11px;color:#999;">To unsubscribe, reply with "STOP".</p>
    </div>`;
}

module.exports = { buildWhatsAppMessage, buildEmailSubject, buildEmailBody, classifyBusiness };
