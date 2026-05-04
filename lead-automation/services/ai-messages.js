// AI-style personalized message generator (no API key needed)
// Generates context-aware follow-up messages based on lead data

const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const aiModel = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;

function daysSince(date) {
    if (!date) return 999;
    return Math.floor((Date.now() - new Date(date)) / (1000 * 60 * 60 * 24));
}

function cleanName(rawName) {
    if (!rawName) return '';
    // Take only the first part before a pipe, hyphen, or comma
    let cleaned = rawName.split(/\||-|,/)[0].trim();
    // If it's still weirdly long (keyword stuffing), just take first 4 words
    if (cleaned.split(' ').length > 4) {
        cleaned = cleaned.split(' ').slice(0, 4).join(' ');
    }
    return cleaned;
}

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function buildInitialWA(lead) {
    const name = cleanName(lead.name) || 'sir/ma\'am';
    const hasWeb = lead.website && !lead.website.includes('facebook') && !lead.website.includes('instagram');
    
    if (aiModel) {
        try {
            const prompt = `Write a short, highly professional WhatsApp cold outreach message in conversational Hinglish.
Target Business Name: ${name}
Has Website: ${hasWeb}
Google Reviews: ${lead.reviews ? lead.rating + ' stars' : 'Unknown'}

Rules:
1. Max 3-4 short sentences. Extremely conversational.
2. Do NOT sound like a sales bot. Sound like a real digital marketing consultant casually reaching out.
3. If they don't have a website (Has Website: false), politely point out they might be losing online customers.
4. If they have a website, say their Google ranking could be optimized to beat competitors.
5. Ask for a quick 5-min call at the end.
6. Max 2 emojis in the whole message.
7. Use WhatsApp bolding (*word*) for important keywords.
8. Only output the message text itself.`;
            
            const result = await aiModel.generateContent(prompt);
            return result.response.text().replace(/\*\*/g, '*').trim();
        } catch (e) {
            console.log('Gemini API failed, falling back to Spintax:', e.message);
        }
    }

    // Fallback to Spintax
    const greeting = getRandom(['Hello!', 'Hi there!', 'Namaste!', 'Hi!']);
    const intro = getRandom([
        'Main abhi Google par search kar raha tha',
        'Main local businesses check kar raha tha',
        'Google Maps par dekhte waqt'
    ]);
    
    let msg = `${greeting} 👋\n\n${intro} aur mujhe aapka *"${name}"* mila. `;
    
    if (lead.rating && lead.reviews) {
        msg += getRandom([
            `Aapke reviews kaafi acche hain (*${lead.rating}⭐*)!\n\n`,
            `Great to see your positive reviews (*${lead.rating}⭐*)!\n\n`
        ]);
    } else {
        msg += `\n\n`;
    }

    msg += `Lekin maine ek cheez notice ki — `;
    if (!hasWeb) {
        msg += getRandom([
            `aapki koi proper *website nahi hai* aur *online presence thodi missing* hai. `,
            `aapki *online website missing* hai jisse digital presence weak ho rahi hai. `
        ]);
    } else {
        msg += getRandom([
            `aapki *Google ranking utni optimized nahi hai* jitni honi chahiye. `,
            `aapki website to hai but *Google par proper visibility missing* hai. `
        ]);
    }

    msg += `Aaj kal customers sab kuch Google pe search karke aate hain, aur is wajah se aapke kaafi *potential customers competitors ke paas ja rahe hain*.\n\n`;
    
    const pitch = getRandom([
        `Main ek *digital marketing consultant* hu. Hum local businesses ko *online grow* karne mein help karte hain. `,
        `Hum ek digital agency hain jo clinic aur businesses ki *daily inquiries badhane* mein help karte hain. `
    ]);
    
    msg += `${pitch}Kya aap free hain toh hum ek *5-min ki quick call* par is baare mein discuss kar sakte hain?\n\n`;
    
    msg += getRandom([
        `Please let me know if it's a good time to call you. Thank you!`,
        `Agar aap interested hain toh please reply karein. Thanks!`,
        `Aap kis time free honge baat karne ke liye?`
    ]);
    
    return msg;
}

async function buildFollowupWA(lead, followupNum) {
    const name = cleanName(lead.name) || 'sir/ma\'am';

    if (aiModel) {
        try {
            const prompt = `Write a short follow-up WhatsApp message in Hinglish to ${name} for digital marketing services. This is follow-up #${followupNum}. Keep it under 3 sentences, very polite, and ask if they have 5 minutes to chat. Do not sound like a bot. Only output the message.`;
            const result = await aiModel.generateContent(prompt);
            return result.response.text().replace(/\*\*/g, '*').trim();
        } catch (e) {
            console.log('Gemini API failed, falling back to Spintax:', e.message);
        }
    }

    if (followupNum === 1) {
        return `Hi again! Just following up on my previous message regarding *"${name}"*.\n\nMain samajh sakta hu aap apne business mein kaafi busy honge. Mujhe sirf aapke *5 minute chahiye* the ek idea discuss karne ke liye jisse aapki *online sales/inquiries badh sakti hain*.\n\nKis time call karna sahi rahega aapko?`;
    }

    if (followupNum === 2) {
        return `Hello! Yeh mera *last message hai* aapko aage disturb nahi karunga. 😊\n\nHumne recently kaafi local businesses ki *growth double ki hai* sirf unki Google listing aur online presence theek karke. Agar aap kabhi future mein apna business grow karna chahein, toh is number par zaroor contact kijiyega.\n\nHave a great day ahead!`;
    }

    return `Best wishes for your business! Kabhi bhi *website ya marketing* ki zarurat ho toh yaad rakhiyega. 😊`;
}

function buildInitialEmail(lead) {
    const name     = lead.name || 'Business Owner';
    const hasWeb   = lead.website && !lead.website.includes('facebook');

    return {
        subject: `Grow ${lead.name} with Digital Marketing — Free Consultation`,
        html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#1e3a5f,#4f8ef7);padding:24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px">🚀 Digital Growth Strategy for ${name}</h1>
    <p style="color:rgba(255,255,255,.8);margin:8px 0 0">Helping Local Businesses Win Online</p>
  </div>
  <div style="padding:24px">
    <p style="font-size:15px;color:#374151">Dear <strong>${name}</strong>,</p>
    <p style="font-size:14px;color:#6b7280">We found your business on Google Maps — ${lead.rating ? `${lead.rating}⭐ with ${lead.reviews} reviews` : 'great local presence'}! We noticed an opportunity to help you grow significantly online.</p>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin:16px 0;border-radius:4px">
      <strong>🔍 Quick Analysis of Your Business:</strong><br>
      ${!hasWeb ? '• <strong style="color:#dc2626">No website found</strong> — missing online customers' : '• Website exists but needs optimization'}<br>
      • Local competitors are running Google Ads targeting your area<br>
      • ${lead.reviews || 'Few'} reviews — more reviews = more trust = more customers
    </div>
    <h3 style="color:#1e3a5f">What We Offer:</h3>
    <ul style="color:#374151;line-height:1.8">
      <li>✅ <strong>Google Ads Campaign</strong> — appear at top for "${lead.keyword || lead.city}" searches</li>
      <li>✅ <strong>${hasWeb ? 'Website Optimization' : 'Professional Website'}</strong> — convert visitors to customers</li>
      <li>✅ <strong>Review Generation</strong> — automated review collection system</li>
      <li>✅ <strong>Social Media Management</strong> — Instagram, Facebook, Reels</li>
      <li>✅ <strong>WhatsApp Marketing</strong> — reach customers directly</li>
    </ul>
    <div style="background:#f0fdf4;border:1px solid #86efac;padding:16px;border-radius:8px;margin:20px 0;text-align:center">
      <strong style="color:#166534;font-size:16px">🎁 FREE 30-Minute Strategy Call</strong><br>
      <p style="color:#166534;margin:8px 0">No commitment. Pure value. Let us show you exactly what's possible for your business.</p>
    </div>
    <p style="font-size:14px;color:#6b7280">Simply reply to this email or call us to schedule your free consultation.</p>
    <p style="color:#374151">Best regards,<br><strong>Digital Growth Team</strong></p>
  </div>
  <div style="background:#f9fafb;padding:12px;text-align:center;font-size:12px;color:#9ca3af">
    You are receiving this because your business is listed on Google Maps.
    <a href="mailto:unsubscribe@yourdomain.com" style="color:#6b7280">Unsubscribe</a>
  </div>
</div>`
    };
}

function buildFollowupEmail(lead, followupNum) {
    const name = lead.name || 'Business Owner';
    return {
        subject: followupNum === 1
            ? `Following up — Free Digital Strategy for ${name}`
            : `Last Attempt — ${name}, Don't Miss This Opportunity`,
        html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#1e3a5f,#4f8ef7);padding:24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px">${followupNum === 1 ? '👋 Quick Follow-up' : '🚨 Last Chance'}</h1>
  </div>
  <div style="padding:24px">
    <p>Dear <strong>${name}</strong>,</p>
    <p style="color:#6b7280">${followupNum === 1
        ? `I reached out a few days ago about growing your business online. I wanted to follow up as I believe there's a significant opportunity for ${name} that I don't want you to miss.`
        : `This is my final follow-up. I respect your time and won't reach out again after this.`}</p>
    <div style="background:#eff6ff;padding:16px;border-radius:8px;margin:16px 0">
      <strong>📊 Did you know?</strong><br>
      <p style="color:#374151;margin:8px 0">Businesses that invest in digital marketing see an average <strong>3-5x return</strong> on their investment within 6 months. Your competitors in ${lead.city || 'your city'} are already doing this.</p>
    </div>
    <p><strong>Book your FREE strategy call today →</strong> Simply reply to this email.</p>
    <p>Best regards,<br><strong>Digital Growth Team</strong></p>
  </div>
</div>`
    };
}

module.exports = { buildInitialWA, buildFollowupWA, buildInitialEmail, buildFollowupEmail, daysSince };
