// AI-style personalized message generator (no API key needed)
// Generates context-aware follow-up messages based on lead data

function daysSince(date) {
    if (!date) return 999;
    return Math.floor((Date.now() - new Date(date)) / (1000 * 60 * 60 * 24));
}

function buildInitialWA(lead) {
    const name     = lead.name || 'there';
    const rating   = lead.rating || '';
    const reviews  = lead.reviews || '';
    const hasWeb   = lead.website && !lead.website.includes('facebook') && !lead.website.includes('instagram');
    const category = lead.category || 'business';

    const ratingLine = rating ? `⭐ ${rating} stars with ${reviews} reviews — bahut achha!` : '';

    const painPoints = hasWeb
        ? `🔴 Website hai but Google Ads campaign nahi — competitors aapke customers le ja rahe hain\n🔴 Sirf ${reviews||'kuch'} reviews — zyada reviews se pehle trust milta hai`
        : `🔴 Website nahi hai — online customers miss ho rahe hain\n🔴 Google Maps profile weak hai — competitors aage hain\n🔴 Digital presence zero — aaj ke time mein yeh bahut badi kami hai`;

    return `Namaste! 🙏

Aapka *${name}* Google Maps pe dekha — ${ratingLine} 👏

Lekin ek important cheez share karna tha:

${painPoints}

Main aapke liye laya hoon:
✅ *Google Ads Campaign* — "${lead.keyword || lead.city} ${category}" me top mein aao
✅ *${hasWeb ? 'Landing Page Optimization' : 'Professional Website'}* — leads convert karein
✅ *Review Generation Strategy* — reviews fast badhaao
✅ *Social Media* — Instagram & Reels se brand viral karo

Kya ek *FREE 10-minute call* ho sakti hai? Main aapko poora plan share karunga. 🙏

📞 Reply "YES" ya Call karein!`;
}

function buildFollowupWA(lead, followupNum) {
    const name = lead.name || 'Sir/Ma\'am';
    const days = daysSince(lead.wa_sent_at);

    if (followupNum === 1) {
        return `Namaste ${name}! 🙏

Maine pehle ek message bheja tha aapke *digital growth* ke baare mein.

Aajkal competition bahut badh gaya hai — jo businesses online hain, woh baaki sab se aage nikal rahe hain. 📈

Sirf *1 FREE call* mein main aapko bataunga:
✅ Aapke competitors kya kar rahe hain
✅ Aapke liye best digital strategy kya hogi
✅ Kitna budget lagega aur kitna return milega

Reply karein "CALL" — main call schedule karunga! 🤝`;
    }

    if (followupNum === 2) {
        return `*Last message* — ${name} ji 🙏

Aapke business ki care karta hoon isliye ek baar aur reach kar raha hoon.

Agar aap *digital marketing* mein interested nahi hain toh koi baat nahi — yeh mera last message hoga.

Lekin agar aap chahte hain ki:
📈 Aapka business online grow kare
⭐ Reviews aur reputation badhein  
💰 Online se leads aayein

Toh abhi reply karein — *LIMITED TIME FREE CONSULTATION* offer hai!

Best wishes 🙏`;
    }

    return `${name} ji, best of luck for your business! 🙏 Kabhi bhi digital marketing ki zaroorat ho toh humse zaroor contact karein. 😊`;
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
