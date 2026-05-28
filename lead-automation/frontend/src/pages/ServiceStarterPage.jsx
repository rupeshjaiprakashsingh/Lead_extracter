import React from 'react'
import { Link } from 'react-router-dom'

const features = [
  {
    icon: '📍',
    title: 'Google Business Profile Setup',
    desc: 'Full optimization of your GBP listing — accurate business information, categories, opening hours, attributes, and service areas configured for maximum local visibility.',
  },
  {
    icon: '📸',
    title: 'Professional Photo Uploads',
    desc: 'Upload and optimize up to 20 high-quality photos showcasing your business, products, and team — photos dramatically increase customer trust and click-through rates.',
  },
  {
    icon: '📝',
    title: 'Weekly Google Posts',
    desc: 'Fresh, keyword-rich posts published to your GBP every week to signal activity to Google and keep potential customers engaged with offers, updates, and events.',
  },
  {
    icon: '⭐',
    title: 'Review Management',
    desc: 'Professional responses crafted for all customer reviews — positive and negative — to build trust, maintain your reputation, and improve your Google ranking.',
  },
  {
    icon: '🎯',
    title: 'NAP Consistency Fix',
    desc: 'Ensure your Name, Address, and Phone number is identical across all online directories and listings — a critical local SEO ranking factor.',
  },
  {
    icon: '📊',
    title: 'Monthly Performance Report',
    desc: 'Clear, jargon-free report every month showing your visibility improvements, search impressions, profile views, direction requests, and call counts.',
  },
]

const results = [
  { stat: '10–20', label: 'New enquiries/month' },
  { stat: '3×', label: 'More profile views' },
  { stat: '60%', label: 'More calls & direction requests' },
]

const timeline = [
  { week: 'Week 1', action: 'Audit current GBP & fix all critical errors' },
  { week: 'Week 2', action: 'Upload photos, optimize categories & attributes' },
  { week: 'Week 3', action: 'Publish first 3 Google posts + respond to reviews' },
  { week: 'Week 4', action: 'First performance report & strategy review' },
]

export default function ServiceStarterPage() {
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
          href="https://wa.me/919999999999?text=Hi, I'm interested in the Starter Package. Please share more details."
          target="_blank" rel="noreferrer"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', padding: '0.4rem 1.1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none' }}
        >
          Get Started
        </a>
      </nav>

      {/* Hero */}
      <section style={{ padding: '4rem 1rem 3rem', maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <div style={{
            position: 'absolute', top: '-30px', left: '50%', transform: 'translateX(-50%)',
            width: '300px', height: '200px',
            background: 'radial-gradient(ellipse, rgba(6,182,212,0.2) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '999px', padding: '0.35rem 1rem', marginBottom: '1.5rem', fontSize: '0.8rem', color: '#22d3ee', fontWeight: 600 }}>
          📍 Starter Package
        </div>

        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 900, background: 'linear-gradient(135deg, #f1f5f9, #22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '1rem', lineHeight: 1.15 }}>
          Get Found on Google —<br />Start Getting Calls This Month
        </h1>
        <p style={{ color: '#64748b', fontSize: '1.05rem', maxWidth: '600px', margin: '0 auto 2.5rem', lineHeight: 1.75 }}>
          Most local businesses lose 30–50 enquiries every month simply because their Google Business Profile is incomplete or not optimized. We fix that.
        </p>

        {/* Pricing CTA block */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(8,145,178,0.05))',
          border: '1.5px solid rgba(6,182,212,0.3)',
          borderRadius: '20px', padding: '2rem', maxWidth: '500px', margin: '0 auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.25rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.1rem', color: '#94a3b8', fontWeight: 600, paddingBottom: '6px' }}>₹</span>
            <span style={{ fontSize: '3.5rem', fontWeight: 900, background: 'linear-gradient(135deg, #06b6d4, #0891b2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>4,999</span>
            <span style={{ color: '#64748b', paddingBottom: '10px' }}>/month</span>
          </div>
          <div style={{ color: '#475569', fontSize: '0.85rem', marginBottom: '1.25rem' }}>+ One-time setup fee: ₹2,999</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <a
              href="https://wa.me/919999999999?text=Hi, I want to get started with the Starter Package (₹4,999/month). Please guide me."
              target="_blank" rel="noreferrer"
              id="starter-hero-cta"
              style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: 'white', padding: '0.85rem', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', textDecoration: 'none', display: 'block', textAlign: 'center', boxShadow: '0 4px 20px rgba(6,182,212,0.35)' }}
            >
              💬 Start Now via WhatsApp
            </a>
            <a href="tel:+919999999999"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '0.75rem', borderRadius: '12px', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', display: 'block', textAlign: 'center' }}>
              📞 Book a FREE Call
            </a>
          </div>
        </div>
      </section>

      {/* Results stats */}
      <section style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {results.map((r, i) => (
            <div key={i} style={{ textAlign: 'center', background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(6,182,212,0.15)', borderRadius: '16px', padding: '1.5rem 1rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, background: 'linear-gradient(135deg, #06b6d4, #0891b2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.25rem' }}>{r.stat}</div>
              <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{r.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 1rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>What's Included</h2>
        <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '2.5rem' }}>Everything your Google Business Profile needs to rank and convert</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
          {features.map((f, i) => (
            <div key={i} style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', transition: 'border-color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(6,182,212,0.3)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}
            >
              <div style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>{f.title}</div>
              <div style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.65 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section style={{ maxWidth: '700px', margin: '0 auto', padding: '0 1rem 4rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 800, marginBottom: '2rem' }}>Your First Month Roadmap</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {timeline.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: 'white', padding: '0.3rem 0.75rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>{t.week}</div>
              <div style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.75rem 1rem', flex: 1, color: '#94a3b8', fontSize: '0.875rem' }}>{t.action}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(8,145,178,0.04))', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '4rem 1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 900, marginBottom: '0.75rem' }}>Ready to Get Started?</h2>
        <p style={{ color: '#64748b', marginBottom: '2rem' }}>Join 200+ businesses who are now getting consistent enquiries from Google</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="https://wa.me/919999999999?text=Hi, I want the Starter Package for ₹4,999/month." target="_blank" rel="noreferrer"
            id="starter-footer-cta"
            style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: 'white', padding: '0.85rem 2rem', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', textDecoration: 'none', boxShadow: '0 4px 20px rgba(6,182,212,0.35)' }}>
            💬 Get Started — ₹4,999/month
          </a>
          <Link to="/pricing" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '0.85rem 2rem', borderRadius: '12px', fontWeight: 600, fontSize: '1rem', textDecoration: 'none' }}>
            Compare All Packages
          </Link>
        </div>
      </section>
    </div>
  )
}
