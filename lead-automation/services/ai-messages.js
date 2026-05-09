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
    if (cleaned.split(' ').length > 4) cleaned = cleaned.split(' ').slice(0, 4).join(' ');
    return cleaned;
}

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
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
async function buildInitialWA(lead) {
    const { wa_template } = getTemplates();
    const name     = cleanName(lead.name) || 'your business';
    const hasWeb   = !!(lead.website && !['facebook','instagram','whatsapp','wa.me','youtube'].some(s => (lead.website || '').includes(s)));
    const city     = lead.city || 'India';
    const category = lead.category || lead.keyword || 'business';
    const rating   = lead.rating ? `${lead.rating}⭐ (${lead.reviews || 0} reviews)` : null;

    // ── Pick a random style for this message ──────────────────
    const style = getRandom(WA_STYLES);

    if (aiModel) {
        try {
            let prompt;

            if (wa_template && wa_template.trim()) {
                // ── USER HAS A TEMPLATE → Gemini personalises it in the chosen style ──
                prompt = `You are an expert WhatsApp sales copywriter for Indian businesses. Personalise this template using the "${style.name}" style.

USER'S TEMPLATE:
"""
${wa_template}
"""

STYLE TO USE — ${style.name}:
${style.desc}

BUSINESS DETAILS:
- Business Name: "${name}"
- Category: ${category}
- City: ${city}
- Has Own Website: ${hasWeb ? 'Yes' : 'No — losing online customers daily'}
- Google Rating: ${rating || 'Not listed'}

STRICT RULES:
1. Replace ALL placeholders ([Business Name], [City], etc.) with real values.
2. Apply the ${style.name} style naturally — don't just copy the template word-for-word.
3. Keep it SHORT — max 4 lines. WhatsApp messages must be readable in 10 seconds.
4. End with ONE easy yes/no question CTA.
5. Use *bold* for 1-2 key phrases only.
6. Sound like a REAL PERSON texting, not a marketing robot.
7. NO generic openers like "Hope this finds you well" or "I am a digital marketing expert".
8. Output ONLY the final message. No explanation, no quotes.`;

            } else {
                // ── NO TEMPLATE → Gemini writes fresh using chosen style ──
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
4. Keep it VERY SHORT — max 4 lines total. No essays. People don't read long WhatsApp messages.
5. End with ONE simple question that needs just a "Yes" or "Interested" reply.
   Good CTAs: "Want me to check?" / "Should I share more?" / "Would a quick 5-min call work?"
6. Use *bold* on 1-2 words maximum.
7. Max 1 emoji — or zero.
8. Sound human, curious, helpful — NOT sales-y, desperate, or corporate.
9. Language: English (natural, conversational — not formal).
10. Output ONLY the WhatsApp message. No subject, no notes, no prefix.`;
            }

            const result = await aiModel.generateContent(prompt);
            const text   = result.response.text().replace(/\*\*/g, '*').trim();
            console.log(`  ✍️  Gemini [${style.name}] → ${name}`);
            return text;

        } catch (e) {
            console.log('Gemini WA failed, using smart fallback:', e.message);
        }
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
async function buildFollowupWA(lead, followupNum) {
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
async function buildInitialEmail(lead) {
    const { email_subject, email_body } = getTemplates();
    const name     = cleanName(lead.name) || 'Business Owner';
    const hasWeb   = !!(lead.website && !['facebook','instagram','whatsapp','wa.me'].some(s => (lead.website || '').includes(s)));
    const city     = lead.city || '';
    const category = lead.category || lead.keyword || 'business';

    // ── Personalise Subject ───────────────────────────────────
    let subject = email_subject && email_subject.trim()
        ? email_subject
            .replace(/\[Business Name\]|\[Name\]/gi, name)
            .replace(/\[City\]/gi, city || 'your city')
        : getRandom([
            `Quick question for ${name}`,
            `I noticed something about ${name}`,
            `${name} — are you missing these customers?`,
            `Found something interesting about ${name}'s online presence`,
        ]);

    // ── Build Body via Gemini ──────────────────────────────────
    let bodyText = '';
    const emailStyle = getRandom(['direct', 'curious', 'insight-led']);

    if (aiModel) {
        try {
            let prompt;

            if (email_body && email_body.trim()) {
                prompt = `You are an email copywriter. Personalise this email body template for a specific business. Use a "${emailStyle}" style — make it feel personal and handwritten, not a mass email.

EMAIL TEMPLATE:
"""
${email_body}
"""

BUSINESS DETAILS:
- Business Name: "${name}"
- Has Website: ${hasWeb ? 'Yes' : 'No — no website, losing customers'}
- City: ${city || 'India'}
- Business Category: ${category}
- Google Rating: ${lead.rating ? lead.rating + ' ⭐ (' + lead.reviews + ' reviews)' : 'Not listed'}

INSTRUCTIONS:
1. Replace ALL placeholders with actual values.
2. Add ONE specific insight (no website = missing customers; has website = ranking opportunity).
3. Keep tone warm and personal — like a colleague reaching out, not a marketer.
4. Output ONLY the email body text. No subject line.`;

            } else {
                prompt = `Write a short, personalised cold email to "${name}", a ${category} business${city ? ' in ' + city : ''}.

Context: They ${hasWeb ? 'have a website but could rank higher on Google' : 'do NOT have a website — losing online customers daily'}.
${lead.rating ? `Google Rating: ${lead.rating}⭐ (${lead.reviews} reviews)` : ''}

Style: "${emailStyle}" — ${emailStyle === 'curious' ? 'open with a genuine question about their online presence' : emailStyle === 'insight-led' ? 'open with a specific data point or insight that grabs attention' : 'be direct about the opportunity and your solution'}

RULES:
1. Open with their SPECIFIC business name — not "Dear Business Owner".
2. Identify ONE specific problem or opportunity in 1-2 sentences.
3. State what you do and the core benefit briefly (1 sentence).
4. CTA: ask for a free 15-min call or just a reply.
5. Keep it SHORT — 3 paragraphs max.
6. Sign off: "Best regards,\nRupesh Singh\nInnvoque | Digital Growth"
7. Output ONLY the body text. No subject line. No HTML.`;
            }

            const result = await aiModel.generateContent(prompt);
            bodyText = result.response.text().trim();
        } catch(e) {
            console.log('Gemini email failed, using fallback:', e.message);
        }
    }

    // ── Fallback body ─────────────────────────────────────────
    if (!bodyText) {
        bodyText = email_body && email_body.trim()
            ? email_body
                .replace(/\[Business Name\]|\[Name\]/gi, name)
                .replace(/\[City\]/gi, city || 'your city')
                .replace(/\[Category\]/gi, category)
            : `Hi ${name},\n\nI came across your business on Google Maps and wanted to reach out directly.\n\n${!hasWeb
                ? `I noticed ${name} doesn't have a website yet — which means customers searching for "${category} in ${city || 'your area'}" online are going to your competitors instead of you.`
                : `I noticed ${name}'s Google ranking has room to improve — meaning you're missing customers who are actively searching for your services right now.`
            }\n\nAt Innvoque, we help local businesses like yours get more customers online — through websites, SEO, and Google ranking. I'd love to share a free 15-minute insights call specific to ${name}.\n\nWould that work for you?\n\nBest regards,\nRupesh Singh\nInnvoque | Digital Growth\ncontact@innvoque.com`;
    }

    // ── Wrap body in HTML email template ──────────────────────
    const htmlBody = bodyText
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n\n/g, '</p><p style="color:#374151;font-size:14px;line-height:1.8;margin:0 0 16px">')
        .replace(/\n/g, '<br>');

    return {
        subject,
        html: `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#1e3a5f 0%,#4f8ef7 100%);padding:28px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">${subject}</h1>
    <p style="color:rgba(255,255,255,.7);margin:6px 0 0;font-size:12px">Personalised for ${name}</p>
  </div>
  <div style="padding:28px 28px 20px">
    <p style="color:#374151;font-size:14px;line-height:1.8;margin:0 0 16px">${htmlBody}</p>
    <div style="background:#f0fdf4;border:1px solid #86efac;padding:16px 20px;border-radius:8px;margin:24px 0;text-align:center">
      <strong style="color:#166534;font-size:14px">🎁 Free 15-Minute Strategy Call — No Commitment</strong>
      <p style="color:#166534;margin:4px 0 0;font-size:12px">Just reply to this email to book your slot.</p>
    </div>
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6">
    You're receiving this because your business is listed on Google Maps. &nbsp;
    <a href="mailto:unsubscribe@innvoque.com" style="color:#6b7280">Unsubscribe</a>
  </div>
</div>`
    };
}

// ── Build Follow-Up Email ─────────────────────────────────────
function buildFollowupEmail(lead, followupNum) {
    const name = cleanName(lead.name) || 'there';
    return {
        subject: followupNum === 1
            ? `Quick follow-up — ${name}`
            : `Last note — ${name}`,
        html: `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#1e3a5f,#4f8ef7);padding:24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:18px">${followupNum === 1 ? '👋 Quick Follow-Up' : '🙏 One Last Note'}</h1>
  </div>
  <div style="padding:28px">
    <p style="color:#374151;font-size:14px;line-height:1.8">Hi <strong>${name}</strong>,</p>
    <p style="color:#374151;font-size:14px;line-height:1.8">${followupNum === 1
        ? `Just following up on my earlier email. I know your inbox gets busy — so I'll keep this very short.<br><br>I genuinely believe there's a real opportunity for <strong>${name}</strong> to get more customers online. Would a quick 15-min call this week work?`
        : `This is my final note — I won't reach out again after this, I promise.<br><br>If <strong>${name}</strong> ever needs help with your digital presence — website, Google ranking, or getting more leads — I'm just one reply away. Wishing you and your business all the best!`
    }</p>
    <p style="color:#374151;font-size:14px">Best regards,<br><strong>Rupesh Singh</strong><br>Innvoque | Digital Growth<br>contact@innvoque.com</p>
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6">
    <a href="mailto:unsubscribe@innvoque.com" style="color:#6b7280">Unsubscribe</a>
  </div>
</div>`
    };
}

module.exports = { buildInitialWA, buildFollowupWA, buildInitialEmail, buildFollowupEmail, daysSince };
