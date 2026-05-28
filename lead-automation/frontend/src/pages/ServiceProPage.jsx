import React from 'react'
import { Link } from 'react-router-dom'

const features = [
  {
    icon: '🌐',
    title: 'Premium Website (10 Pages + Blog)',
    desc: 'A fully custom, high-converting website with up to 10 pages including service pages, team profiles, case studies, testimonials, and an integrated blog.',
  },
  {
    icon: '⚙️',
    title: 'Advanced Technical SEO',
    desc: 'In-depth technical audit covering site speed, Core Web Vitals, schema markup, crawlability, mobile-friendliness, and structured data to maximize Google rankings.',
  },
  {
    icon: '📝',
    title: '4 SEO Blog Articles/Month',
    desc: 'Four professionally written, keyword-targeted blog articles every month — each designed to rank on Google, drive organic traffic, and convert visitors into leads.',
  },
  {
    icon: '📢',
    title: 'Google Ads Management',
    desc: 'Complete Google Ads campaign setup and management (ad spend is separate) — keyword bidding, ad copy creation, landing page optimization, and weekly optimization.',
  },
  {
    icon: '📱',
    title: 'Social Media Management (2 Platforms)',
    desc: 'Active management of 2 social media platforms (Instagram + Facebook recommended) — content calendar, posting schedule, engagement replies, and growth strategy.',
  },
  {
    icon: '🎬',
    title: 'Video / Reel Creation (2/month)',
    desc: 'Two professionally scripted short-form videos or reels per month showcasing your business, services, team, or customer stories — optimized for maximum reach.',
  },
  {
    icon: '⭐',
    title: 'Review Generation Campaign',
    desc: 'Systematic process to generate a steady stream of positive reviews on Google, JustDial, and other platforms — the single biggest trust factor for new customers.',
  },
  {
    icon: '🔔',
    title: 'Reputation Monitoring & Alerts',
    desc: 'Real-time monitoring of all mentions, reviews, and ratings across the web. Receive instant alerts and professional responses to protect your online reputation.',
  },
  {
    icon: '👤',
    title: 'Dedicated Account Manager',
    desc: 'Your own dedicated point of contact who knows your business, reports your results, and works proactively on your growth strategy every week.',
  },
  {
    icon: '📊',
    title: 'Weekly Reporting & Strategy Calls',
    desc: 'Weekly performance reports and bi-monthly strategy calls to review progress, discuss market opportunities, and adapt tactics for maximum ROI.',
  },
]

const results = [
  { stat: '40–80+', label: 'New enquiries/month' },
  { stat: '#1', label: 'Local search rankings' },
  { stat: '10×', label: 'Digital presence growth' },
]

const testimonials = [
  {
    name: 'Rajesh Sharma',
    biz: 'CA Firm, Connaught Place',
    quote: 'Before Innvoque, we were getting maybe 3-4 calls a week from Google. Now we get 12-15 calls daily. The Pro package completely transformed our practice.',
    stars: 5,
  },
  {
    name: 'Priya Mehta',
    biz: 'Clinic, Lajpat Nagar',
    quote: "Our appointment bookings doubled within 2 months. The website they built and the Google Ads campaign together are the best investment I've made for my clinic.",
    stars: 5,
  },
  {
    name: 'Amit Kumar',
    biz: 'Restaurant, Nehru Place',
    quote: 'Instagram following went from 200 to 3,500 in 4 months, and our weekend walk-ins increased by 60%. The content team at Innvoque is excellent.',
    stars: 5,
  },
]

const timeline = [
  { phase: 'Week 1', action: 'Business deep-dive, keyword strategy, GBP fixes, website planning' },
  { phase: 'Week 2', action: 'Website development begins, Google Ads account setup, social media profiles optimized' },
  { phase: 'Week 3', action: 'Website launched, first Google Ads campaign live, social posts started' },
  { phase: 'Week 4', action: 'First performance report, Ads optimization, review generation campaign starts' },
  { phase: 'Month 2+', action: 'Content production, Ads scaling, weekly strategy refinement, growth acceleration' },
]

export default function ServiceProPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#020817', fontFamily: "'Inter', sans-serif", color: '#f1f5f9' }}>
      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(2,8,23,0.92)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 2rem', height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/pricing" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back to All Packages
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🚀</div>
          <span style={{ fontWeight: 800, color: '#f1f5f9' }}>Innvoque Solutions</span>
        </div>
        <a
          href="https://wa.me/919999999999?text=Hi, I'm interested in the Pro Package. Please share more details."
          target="_blank" rel="noreferrer"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', padding: '0.4rem 1.1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none' }}
        >
          Get Started
        </a>
      </nav>

      {/* Hero */}
      <section style={{ padding: '4rem 1rem 3rem', maxWidth: '900px', margin: '0 auto', textAlign: 'center', position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: '600px', height: '350px',
          background: 'radial-gradient(ellipse, rgba(16,185,129,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '999px', padding: '0.35rem 1rem', marginBottom: '1.5rem', fontSize: '0.8rem', color: '#34d399', fontWeight: 600 }}>
          🚀 Best Value — Pro Package
        </div>

        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 900, background: 'linear-gradient(135deg, #f1f5f9, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '1rem', lineHeight: 1.15 }}>
          Complete Digital Dominance —<br />Own Your Local Market
        </h1>
        <p style={{ color: '#64748b', fontSize: '1.05rem', maxWidth: '640px', margin: '0 auto 2.5rem', lineHeight: 1.75 }}>
          The all-in-one package for businesses ready to become the #1 name in their area. Website + SEO + Google Ads + Social Media + Videos + Reviews — everything working together.
        </p>

        {/* Pricing block */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.05))',
          border: '1.5px solid rgba(16,185,129,0.35)',
          borderRadius: '20px', padding: '2rem', maxWidth: '520px', margin: '0 auto',
          boxShadow: '0 8px 40px rgba(16,185,129,0.18)',
        }}>
          <div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontSize: '0.75rem', fontWeight: 800, padding: '0.3rem 1rem', borderRadius: '999px', display: 'inline-block', marginBottom: '1rem', letterSpacing: '0.05em' }}>BEST VALUE</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.25rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.1rem', color: '#94a3b8', fontWeight: 600, paddingBottom: '6px' }}>₹</span>
            <span style={{ fontSize: '3.5rem', fontWeight: 900, background: 'linear-gradient(135deg, #10b981, #059669)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>19,999</span>
            <span style={{ color: '#64748b', paddingBottom: '10px' }}>/month</span>
          </div>
          <div style={{ color: '#475569', fontSize: '0.85rem', marginBottom: '1.25rem' }}>+ One-time setup fee: ₹14,999</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <a
              href="https://wa.me/919999999999?text=Hi, I want to get started with the Pro Package (₹19,999/month). Please guide me."
              target="_blank" rel="noreferrer"
              id="pro-hero-cta"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', padding: '0.85rem', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', textDecoration: 'none', display: 'block', textAlign: 'center', boxShadow: '0 4px 20px rgba(16,185,129,0.4)' }}
            >
              💬 Start Now via WhatsApp
            </a>
            <a href="tel:+919999999999"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '0.75rem', borderRadius: '12px', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', display: 'block', textAlign: 'center' }}>
              📞 Book a FREE Strategy Call
            </a>
          </div>
        </div>
      </section>

      {/* Result stats */}
      <section style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {results.map((r, i) => (
            <div key={i} style={{ textAlign: 'center', background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '16px', padding: '1.5rem 1rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, background: 'linear-gradient(135deg, #10b981, #059669)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.25rem' }}>{r.stat}</div>
              <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{r.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* What's included */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '3rem 1rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>The Complete Digital Growth System</h2>
        <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '2.5rem' }}>Every tool, channel, and strategy working together for maximum results</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {features.map((f, i) => (
            <div key={i} style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', transition: 'border-color 0.2s, transform 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(16,185,129,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <div style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>{f.title}</div>
              <div style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.65 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 1rem 4rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 800, marginBottom: '2rem' }}>Real Results from Real Businesses</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {testimonials.map((t, i) => (
            <div key={i} style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '16px', padding: '1.5rem' }}>
              <div style={{ color: '#10b981', fontSize: '1rem', marginBottom: '0.75rem' }}>{'★'.repeat(t.stars)}</div>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '1rem', fontStyle: 'italic' }}>"{t.quote}"</p>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{t.name}</div>
                <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{t.biz}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section style={{ maxWidth: '700px', margin: '0 auto', padding: '0 1rem 4rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 800, marginBottom: '2rem' }}>Your Growth Timeline</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {timeline.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>{t.phase}</div>
              <div style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.75rem 1rem', flex: 1, color: '#94a3b8', fontSize: '0.875rem' }}>{t.action}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Guarantee */}
      <section style={{ maxWidth: '700px', margin: '0 auto', padding: '0 1rem 4rem' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.04))', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '20px', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🛡️</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>Results-First Guarantee</h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.7 }}>
            If you don't see a measurable increase in Google visibility and enquiries within 30 days, we continue working for free until you do. No contracts, cancel anytime with 30 days notice.
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.04))', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '4rem 1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 900, marginBottom: '0.75rem' }}>Ready to Dominate Your Local Market?</h2>
        <p style={{ color: '#64748b', marginBottom: '2rem' }}>Book your free strategy call — we'll show you exactly how many leads you're missing</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="https://wa.me/919999999999?text=Hi, I want the Pro Package for ₹19,999/month. Please contact me." target="_blank" rel="noreferrer"
            id="pro-footer-cta"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', padding: '0.85rem 2rem', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', textDecoration: 'none', boxShadow: '0 4px 20px rgba(16,185,129,0.4)' }}>
            💬 Get Started — ₹19,999/month
          </a>
          <Link to="/pricing" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '0.85rem 2rem', borderRadius: '12px', fontWeight: 600, fontSize: '1rem', textDecoration: 'none' }}>
            Compare All Packages
          </Link>
        </div>
      </section>
    </div>
  )
}
