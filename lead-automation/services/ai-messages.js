// ============================================================
//  services/ai-messages.js — AI-Powered Personalised Messages
//  Gemini with 5 style variations + strong conversion CTAs
// ============================================================

const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();
const { getTemplates } = require('./templates-cache');

const genAI   = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const aiModel = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;

function daysSince(date) {
    if (!date) return 999;
    return Math.floor((Date.now() - new Date(date)) / (1000 * 60 * 60 * 24));
}

function cleanName(rawName) {
    if (!rawName) return '';
    let cleaned = rawName.split(/\||-|,/)[0].trim();
    cleaned = cleaned.replace(/\b(pvt\.?|ltd\.?|llp|inc\.?|co\.?|corp\.?|corporation|associates|group|solutions|innovations|services|systems|infotech|technologies|private|limited|chartered\s+accountants?|advocates?|clinics?|hospitals?|schools?|colleges?|academies|academy|and\s+company|&\s+co|&\s+sons)\b/gi, '').trim();
    cleaned = cleaned.replace(/[^a-zA-Z0-9\s]+$/, '').trim();
    if (cleaned.split(/\s+/).length > 4) {
        cleaned = cleaned.split(/\s+/).slice(0, 4).join(' ');
    }
    cleaned = cleaned.replace(/[^a-zA-Z0-9\s]+$/, '').trim();
    return cleaned || 'your business';
}

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ── Clean any AI-instruction placeholders from user templates ──
function cleanTemplate(template, name, city, category, specificInsight) {
    if (!template) return '';
    return template
        .replace(/\[Gemini will add specific insight[^\]]*\]/gi, specificInsight)
        .replace(/\[AI[^\]]*\]/gi, specificInsight)
        .replace(/\[Business Name\]|\[Name\]/gi, name)
        .replace(/\[City\]/gi, city || 'your area')
        .replace(/\[Category\]/gi, category);
}

// ── Build a real, specific insight line from lead data ─────────
function buildSpecificInsight(name, hasWeb, city, category, rating, reviews) {
    if (!hasWeb) {
        return `Since ${name} doesn't have a website yet, customers searching "${category} in ${city || 'your area'}" on Google are going directly to your competitors.`;
    }
    if (rating && parseFloat(rating) >= 4.0) {
        return `I noticed ${name} has a ${rating}⭐ rating on Google Maps — that's a strong reputation. With better SEO, you could convert even more of those searchers into actual customers.`;
    }
    if (rating) {
        return `I found ${name} on Google Maps with a ${rating}⭐ rating. A few profile and SEO improvements could significantly increase the number of customers who find and contact you.`;
    }
    return `I found ${name} on Google Maps — with some targeted local SEO improvements, you could attract significantly more customers in ${city || 'your area'} who are already searching for ${category} services.`;
}

// ── 5 Message Styles for maximum variation ────────────────────
const WA_STYLES = [
    {
        name: 'CURIOUS',
        desc: `Ask a genuine question that makes them think. Open with curiosity, not a pitch.
Example style: "Quick question — when someone searches for [their service] in [their city] on Google, does [business name] show up? I checked and noticed [specific issue]. Mind if I share what I found? Takes 2 min."`
    },
    {
        name: 'PROBLEM_FIRST',
        desc: `Open by naming a specific problem they likely don't know they have. No pitching yet.
Example style: "[Business name] is losing [X] customers every month to competitors just because of [specific issue]. I can show you the data. Would you want to see it?"`
    },
    {
        name: 'COMPLIMENT_HOOK',
        desc: `Genuinely compliment something specific about their business first, then pivot to opportunity.
Example style: "I saw [business name] on Google Maps — [specific genuine compliment about rating/category]. That's impressive. One thing I noticed that could bring you even more customers: [specific issue]. Want to know more?"`
    },
    {
        name: 'STORY',
        desc: `Share a brief micro-story about a similar business you helped, then connect it to them.
Example style: "I recently helped a [same category] business in [similar city] go from 5 enquiries/month to 30+ in 60 days. Looking at [business name], I think we can do the same. Interested?"`
    },
    {
        name: 'DIRECT_VALUE',
        desc: `Be extremely direct and value-first. State exactly what you can do for them in one line.
Example style: "I can get [business name] to appear on the first page of Google for '[their service] in [city]' within 30 days. Want me to show you how? No cost, no commitment."`
    }
];

// ── Build Initial WhatsApp Message ───────────────────────────
// ── Build Initial WhatsApp Message ───────────────────────────
async function buildInitialWA(lead, userOrCompanyId = null) {
    // Use companyId (multi-tenant) or userId (legacy single-tenant) to look up saved templates
    const templateId = userOrCompanyId || lead?.companyId || lead?.userId;
    const { wa_template } = await getTemplates(templateId);
    const name     = cleanName(lead.name) || 'your business';
    const hasWeb   = !!(lead.website && !['facebook','instagram','whatsapp','wa.me','youtube'].some(s => (lead.website || '').includes(s)));
    const city     = lead.city || 'India';
    const category = lead.category || lead.keyword || 'business';
    const rating   = lead.rating ? `${lead.rating}⭐ (${lead.reviews || 0} reviews)` : null;

    const specificInsight = buildSpecificInsight(name, hasWeb, city, category, lead.rating, lead.reviews);

    // ── Pick a random style for fallback/default use ──────────
    const style = getRandom(WA_STYLES);

    if (aiModel) {
        try {
            let prompt;
            let logStyle = 'TEMPLATE';

            if (wa_template && wa_template.trim()) {
                const cleanedWa = cleanTemplate(wa_template, name, city, category, specificInsight);

                prompt = `You are an expert WhatsApp sales copywriter. Personalise the user's template below for the target business.
Use the template below as your structure and tone, but rewrite and personalise it so it feels specific, natural, and highly engaging for this business.

USER'S TEMPLATE:
"""
${cleanedWa}
"""

BUSINESS DETAILS:
- Business Name: "${name}"
- Category: ${category}
- City: ${city}
- Has Own Website: ${hasWeb ? 'Yes' : 'No — losing online customers daily'}
- Google Rating: ${rating || 'Not listed'}
- Key Insight to weave in naturally: ${specificInsight}

STRICT RULES TO ENSURE CUSTOMER READS AND REPLIES:
1. Use the template structure, tone, and offer as your core guide. Do NOT change the core message or offer.
2. Naturally weave in the Key Insight or details from the business details (like Google rating, city, etc.) if appropriate.
3. Keep it VERY SHORT — max 4-5 lines. WhatsApp messages must be readable in 5 seconds on a mobile screen.
4. Resolve/replace all placeholders with actual details.
5. Sound like a REAL PERSON sending a direct, 1-on-1 WhatsApp text, not a marketing robot or bulk automation.
6. End with ONE simple, direct CTA/question (like the template has) that makes it easy for the customer to reply (e.g., "Would a quick 5-min call work this week?").
7. Use *bold* for 1-2 key words only (e.g., *${name}*).
8. NO conversational filler, no subject line, no quotes. Output ONLY the final WhatsApp message body.`;

            } else {
                logStyle = style.name;
                const problemLine = !hasWeb
                    ? `no website — customers searching "${category} in ${city}" on Google can't find them`
                    : `website exists but Google ranking is low — missing local search traffic`;

                prompt = `You are a WhatsApp sales expert helping an Indian IT company reach local businesses. Write ONE personalised cold WhatsApp message using the "${style.name}" style.

STYLE — ${style.name}:
${style.desc}

TARGET BUSINESS:
- Name: "${name}"
- Type: ${category}
- Location: ${city}
- Problem: ${problemLine}
${rating ? `- Google: ${rating}` : ''}

YOUR COMPANY (Innvoque — IT & Digital Marketing, India):
- Helps local businesses get more customers online
- Services: Website, SEO, Google ranking, digital marketing

WRITE THE MESSAGE:
1. Use the ${style.name} style naturally and conversationally.
2. Mention "${name}" by name specifically — NOT "your business" or "Sir/Ma'am".
3. Reference a SPECIFIC detail: their city, their category, their rating if available.
4. Keep it VERY SHORT — max 4 lines total. No essays.
5. End with ONE simple question that needs just a "Yes" or "Interested" reply.
6. Use *bold* on 1-2 words maximum.
7. Max 1 emoji — or zero.
8. Sound human, curious, helpful — NOT sales-y or corporate.
9. Language: English (natural, conversational).
10. Output ONLY the WhatsApp message. No subject, no notes, no prefix.`;
            }

            const result = await aiModel.generateContent(prompt);
            const text   = result.response.text().replace(/\*\*/g, '*').trim();
            console.log(`  ✍️  Gemini [${logStyle}] → ${name}`);
            return text;

        } catch (e) {
            console.log('Gemini WA failed, using smart fallback:', e.message);
        }
    }

    // ── Fallback ──
    if (wa_template && wa_template.trim()) {
        console.log(`  📝 Fallback template used (no AI) → ${name}`);
        return cleanTemplate(wa_template, name, city, category, specificInsight);
    }

    // ── Smart fallback — 5 human-sounding templates ──────────────
    return buildFallbackWA(name, city, category, hasWeb, rating, style.name);
}

// ── Smart Fallback Messages (no AI) ──────────────────────────
function buildFallbackWA(name, city, category, hasWeb, rating, styleName) {
    const problem = !hasWeb
        ? `doesn't have a website — so customers searching online can't find you`
        : `isn't ranking on Google's first page for "${category} in ${city}"`;

    const templates = {
        CURIOUS: `Quick question for *${name}* — when someone searches "${category} in ${city}" on Google right now, do you show up? 🤔\n\nI noticed your business ${problem}. Mind if I share what I found? Takes 2 min.`,
        PROBLEM_FIRST: `*${name}* might be losing 10–20 customers every month — just because ${problem}.\n\nI can show you the data. Want to see it?`,
        COMPLIMENT_HOOK: `${rating ? `Saw *${name}* on Google Maps — ${rating} is genuinely impressive for a ${category} in ${city}!` : `Noticed *${name}* on Google Maps — great business!`}\n\nOne thing holding you back: ${problem}. Want to fix that?`,
        STORY: `I recently helped a ${category} in ${city} get 3× more enquiries in 45 days. Their situation was similar — ${problem}.\n\nThink *${name}* could benefit from the same? Happy to explain.`,
        DIRECT_VALUE: `I can get *${name}* to appear on Page 1 of Google for "${category} in ${city}" within 30 days.\n\nNo cost to explore. Interested?`
    };

    return templates[styleName] || templates.CURIOUS;
}

// ── Build Follow-Up WhatsApp Message ─────────────────────────
async function buildFollowupWA(lead, followupNum, userOrCompanyId = null) {
    const name = cleanName(lead.name) || 'there';

    if (aiModel) {
        try {
            const styles = [
                `Extremely brief. Just 1-2 sentences. Acknowledge they're busy. Soft re-open.`,
                `"The last nudge" style — polite, no pressure, leave door open. Show you respect their time.`,
                `Add new value — share ONE quick insight or stat relevant to their business type before the CTA.`
            ];
            const style = styles[(followupNum - 1) % styles.length];

            const prompt = `Write a short WhatsApp follow-up message for "${name}" about digital marketing services. Follow-up number: ${followupNum}.

Style: ${style}

Rules:
- Max 2-3 sentences. Very human, not corporate.
- No "I hope this message finds you well" type openers.
- End with a soft, easy yes/no CTA.
- 0 emojis or max 1.
- English, conversational.
- Output ONLY the message.`;

            const result = await aiModel.generateContent(prompt);
            return result.response.text().replace(/\*\*/g, '*').trim();
        } catch (e) {
            console.log('Gemini followup WA failed:', e.message);
        }
    }

    // Fallback follow-ups
    if (followupNum === 1) {
        return `Hi *${name}* — just following up on my earlier message. I know you're busy!\n\nWould a 5-min call this week work? I have something specific to show you.`;
    }
    if (followupNum === 2) {
        return `Last message from me, promise! 😊\n\nIf *${name}* ever needs help getting more customers online, I'm here. Wishing you great success!`;
    }
    return `All the best to *${name}*! Feel free to reach out anytime if you'd like to grow your online presence. 🙏`;
}

// ── Build Initial Email ───────────────────────────────────────
async function buildInitialEmail(lead, userOrCompanyId = null) {
    const templateId = userOrCompanyId || lead?.companyId || lead?.userId;
    const { email_subject, email_body } = await getTemplates(templateId);
    const name     = cleanName(lead.name) || 'Business Owner';
    const hasWeb   = !!(lead.website && !['facebook','instagram','whatsapp','wa.me'].some(s => (lead.website || '').includes(s)));
    const city     = lead.city || '';
    const category = lead.category || lead.keyword || 'business';

    // Build a real, specific insight based on actual lead data (no placeholder needed)
    const specificInsight = buildSpecificInsight(name, hasWeb, city, category, lead.rating, lead.reviews);

    // ── Personalise Subject ───────────────────────────────────
    let subject = email_subject && email_subject.trim()
        ? email_subject
            .replace(/\[Business Name\]|\[Name\]/gi, name)
            .replace(/\[City\]/gi, city || 'your city')
        : getRandom([
            `Quick question about ${name}'s online presence`,
            `${name} — are you getting enough customers from Google?`,
            `Found something about ${name} worth sharing`,
            `How ${name} can get more enquiries from ${city || 'your area'}`,
        ]);

    // ── Clean user template — strip any AI-instruction placeholders ───
    const cleanedTemplate = cleanTemplate(email_body || '', name, city, category, specificInsight);

    // ── Build Body via Gemini ──────────────────────────────────
    let bodyText = '';
    const emailStyle = getRandom(['direct', 'curious', 'insight-led']);

    if (aiModel) {
        try {
            let prompt;

            if (cleanedTemplate) {
                prompt = `You are a professional sales copywriter. Write a highly personalized cold outreach email for a local business.
Use the sample email below as your structure and tone, but rewrite it so it feels personal and specific for this exact business.

SAMPLE EMAIL BODY (match the tone, offer, and CTA structure):
"""
${cleanedTemplate}
"""

BUSINESS DETAILS:
- Business Name: "${name}"
- Has Website: ${hasWeb ? 'Yes' : 'No (a major missed opportunity)'}
- City: ${city || 'India'}
- Business Category: ${category}
- Google Maps Rating: ${lead.rating ? lead.rating + ' ⭐ (' + (lead.reviews || 0) + ' reviews)' : 'Not listed'}
- Key Insight to weave in naturally: ${specificInsight}

RULES:
1. Open with "Hi ${name} team," or "Hi ${name},"
2. Naturally weave in the Key Insight in the first 1-2 sentences — make it feel researched, not templated.
3. Keep the same core offer and CTA as the sample, but rephrase so it doesn't look copy-pasted.
4. Be concise — max 5 short paragraphs. Nobody reads long cold emails.
5. End with a clear, low-pressure CTA (free call / free audit / just reply).
6. Do NOT add any HTML, links, or URLs. Clean text only.
7. Sign off: "Best regards,\nRupesh\nInnvoque Solutions\n+91 9136662022\ninfo@innvoque.com"
8. Output ONLY the email body. No subject line.`;

            } else {
                prompt = `Write a short, persuasive cold email to "${name}", a ${category} business${city ? ' in ' + city : ''}.

KEY INSIGHT (lead with this): ${specificInsight}
${lead.rating ? `Google Rating: ${lead.rating}⭐ (${lead.reviews || 0} reviews)` : ''}

Style: "${emailStyle}" — ${emailStyle === 'curious' ? 'open with a genuine question about their online presence' : emailStyle === 'insight-led' ? 'lead with the key insight above to grab attention immediately' : 'be direct about the opportunity and your specific solution'}

GOAL: Get them to reply or book a free call. This must feel personal, not like a mass email.

RULES:
1. Open with "${name}" by name — never "Dear Business Owner" or "Sir/Madam".
2. Lead with the key insight above — it should feel like you actually looked them up.
3. Mention Innvoque (Indian IT & digital marketing company) and what you specifically do for ${category} businesses.
4. Offer a free 10-min discovery call or a free Google/website audit.
5. Keep it SHORT — 3-4 paragraphs max. People skim cold emails.
6. Do NOT add any HTML, links, or URLs. Clean text only.
7. Sign off: "Best regards,\nRupesh\nInnvoque Solutions\n+91 9136662022\ninfo@innvoque.com"
8. Output ONLY the body text. No subject line. No HTML.`;
            }

            const result = await aiModel.generateContent(prompt);
            bodyText = result.response.text().trim();
        } catch(e) {
            console.log('Gemini email failed, using fallback:', e.message);
        }
    }

    // ── Fallback body ─────────────────────────────────────────
    if (!bodyText) {
        if (cleanedTemplate) {
            bodyText = cleanedTemplate;
        } else {
            bodyText = `Hi ${name},\n\nI was searching for ${category} businesses in ${city || 'your area'} on Google and came across your listing.\n\n${specificInsight}\n\nI work with Innvoque — we help local businesses in ${city || 'India'} show up better on Google and get more enquiries through their website.\n\nA few things we typically help with:\n- Getting found by more local customers on Google\n- Making sure your website works well on mobile\n- Building trust through better reviews and profile\n\nWould you be open to a quick 10-minute call this week to see if there's a fit? No pressure at all — happy to share what we've seen working for similar businesses in your area.\n\nThanks for your time,\n\nRupesh\nInnvoque Solutions\n+91 9136662022\ninfo@innvoque.com`;
        }
    }

    // ── Wrap body in HTML email template (plain, text-style, spam-resistant) ──
    const htmlBody = bodyText
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n\n/g, '</p><p style="margin:0 0 16px">')
        .replace(/\n/g, '<br>');

    return {
        subject,
        html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#333333;line-height:1.6;font-size:15px">
  <p style="margin:0 0 16px">${htmlBody}</p>
</div>`
    };
}

// ── Build Follow-Up Email ─────────────────────────────────────
function buildFollowupEmail(lead, followupNum) {
    const name = cleanName(lead.name) || 'there';
    const subject = followupNum === 1
        ? `Quick follow-up — ${name}`
        : `Last note — ${name}`;

    const body = followupNum === 1
        ? `Hi ${name},\n\nJust following up on my earlier email. I know your inbox gets busy — so I'll keep this very short.\n\nI genuinely believe there's a real opportunity for ${name} to get more customers online. Would a quick 15-min call this week work?\n\nBest regards,\nRupesh\nInnvoque Solutions\n+91 9136662022\ninfo@innvoque.com`
        : `Hi ${name},\n\nThis is my final note — I won't reach out again after this, I promise.\n\nIf ${name} ever needs help with your digital presence — website, Google ranking, or getting more leads — I'm just one reply away. Wishing you and your business all the best!\n\nBest regards,\nRupesh\nInnvoque Solutions\n+91 9136662022\ninfo@innvoque.com`;

    const htmlBody = body
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n\n/g, '</p><p style="margin:0 0 16px">')
        .replace(/\n/g, '<br>');

    return {
        subject,
        html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#333333;line-height:1.6;font-size:15px">
  <p style="margin:0 0 16px">${htmlBody}</p>
</div>`
    };
}

module.exports = { buildInitialWA, buildFollowupWA, buildInitialEmail, buildFollowupEmail, daysSince };
