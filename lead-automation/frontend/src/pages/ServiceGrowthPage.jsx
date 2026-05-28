import React from 'react'
import { Link } from 'react-router-dom'

const features = [
  {
    icon: '🌐',
    title: 'Professional Mobile-Friendly Website',
    desc: '5-page website built from scratch — Home, About, Services, Testimonials, Contact — optimized for speed, mobile devices, and local search conversions.',
  },
  {
    icon: '🔍',
    title: 'Local SEO — Keyword Research',
    desc: 'Identify high-intent keywords your target customers are searching ("CA in Delhi", "finance consultant near me") and build your entire strategy around them.',
  },
  {
    icon: '📄',
    title: 'On-Page SEO Optimization',
    desc: 'Title tags, meta descriptions, heading structure, internal linking, schema markup, and image alt text — all optimized to rank higher on Google search.',
  },
  {
    icon: '🗺️',
    title: 'Google Maps Ranking',
    desc: 'Advanced Google Maps optimization including proximity targeting, category signals, review velocity, and GBP engagement strategies for top-3 map pack results.',
  },
  {
    icon: '📋',
    title: 'Citation Building (20+ Directories)',
    desc: 'List your business on 20+ authoritative local directories (JustDial, IndiaMart, Sulekha, Bing Places, Apple Maps, etc.) to build local authority.',
  },
  {
    icon: '✍️',
    title: 'Monthly SEO Blog Post',
    desc: 'One expert-written, fully SEO-optimized blog article per month that targets your key search terms, drives organic traffic, and establishes your expertise.',
  },
  {
    icon: '📈',
    title: 'Analytics & Search Console',
    desc: 'Full setup of Google Analytics 4 and Google Search Console with custom dashboards so you can see exactly how many visitors and leads your website generates.',
  },
  {
    icon: '📊',
    title: 'Lead Tracking & Reporting',
    desc: 'Monthly report detailing rankings, traffic growth, lead sources, and next-month priorities — clear metrics that show your exact ROI.',
  },
  {
    icon: '📍',
    title: 'Everything in Starter Package',
    desc: 'Includes GBP optimization, photo uploads, weekly posts, review management, NAP consistency fixes, and monthly performance reporting.',
  },
]

const results = [
  { stat: '20–40', label: 'New enquiries/month' },
  { stat: 'Top 3', label: 'Google Maps ranking' },
  { stat: '5×', label: 'Website traffic growth' },
]

const timeline = [
  { phase: 'Phase 1 (Days 1–7)', action: 'Website wireframe, keyword research, GBP audit & fixes' },
  { phase: 'Phase 2 (Days 8–14)', action: 'Website development, on-page SEO implementation, citation building begins' },
  { phase: 'Phase 3 (Days 15–21)', action: 'Website live, Analytics setup, first blog post published, GBP posts started' },
  { phase: 'Phase 4 (Days 22–30)', action: 'First rankings report, strategy review, month 2 plan finalized' },
]

const comparisons = [
  { label: 'Professional Website', starter: false, growth: true, pro: true },
  { label: 'Local SEO & Keywords', starter: false, growth: true, pro: true },
  { label: 'Google Maps Optimization', starter: '✓ Basic', growth: '✓ Advanced', pro: '✓ Advanced+' },
  { label: 'Citation Building', starter: false, growth: '20+', pro: '50+' },
  { label: 'Monthly Blog Posts', starter: false, growth: '1/month', pro: '4/month' },
  { label: 'GBP Management', starter: true, growth: true, pro: true },
  { label: 'Google Ads', starter: false, growth: false, pro: true },
  { label: 'Social Media', starter: false, growth: false, pro: '2 platforms' },
]

export default function ServiceGrowthPage() {
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
          href="https://wa.me/919999999999?text=Hi, I'm interested in the Growth Package. Please share more details."
          target="_blank" rel="noreferrer"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', padding: '0.4rem 1.1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none' }}
        >
          Get Started
        </a>
      </nav>

      {/* Hero */}
      <section style={{ padding: '4rem 1rem 3rem', maxWidth: '900px', margin: '0 auto', textAlign: 'center', position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: '500px', height: '300px',
          background: 'radial-gradient(ellipse, rgba(99,102,241,0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '999px', padding: '0.35rem 1rem', marginBottom: '1.5rem', fontSize: '0.8rem', color: '#a5b4fc', fontWeight: 600 }}>
          ⭐ Most Popular — Growth Package
        </div>

        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 900, background: 'linear-gradient(135deg, #f1f5f9, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '1rem', lineHeight: 1.15 }}>
          Rank Higher on Google &<br />Get 20–40 New Leads Every Month
        </h1>
        <p style={{ color: '#64748b', fontSize: '1.05rem', maxWidth: '620px', margin: '0 auto 2.5rem', lineHeight: 1.75 }}>
          The most popular choice for local businesses ready to invest in sustainable growth. Get a professional website + full local SEO that works while you sleep.
        </p>

        {/* Pricing block */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.06))',
          border: '1.5px solid rgba(99,102,241,0.35)',
          borderRadius: '20px', padding: '2rem', maxWidth: '500px', margin: '0 auto',
          boxShadow: '0 8px 40px rgba(99,102,241,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.25rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.1rem', color: '#94a3b8', fontWeight: 600, paddingBottom: '6px' }}>₹</span>
            <span style={{ fontSize: '3.5rem', fontWeight: 900, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>9,999</span>
            <span style={{ color: '#64748b', paddingBottom: '10px' }}>/month</span>
          </div>
          <div style={{ color: '#475569', fontSize: '0.85rem', marginBottom: '1.25rem' }}>+ One-time setup fee: ₹7,999</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <a
              href="https://wa.me/919999999999?text=Hi, I want to get started with the Growth Package (₹9,999/month). Please guide me."
              target="_blank" rel="noreferrer"
              id="growth-hero-cta"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', padding: '0.85rem', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', textDecoration: 'none', display: 'block', textAlign: 'center', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}
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
            <div key={i} style={{ textAlign: 'center', background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '16px', padding: '1.5rem 1rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.25rem' }}>{r.stat}</div>
              <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{r.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '3rem 1rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>Everything You Get</h2>
        <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '2.5rem' }}>A complete digital growth engine for your local business</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {features.map((f, i) => (
            <div key={i} style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', transition: 'border-color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'}
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
        <h2 style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 800, marginBottom: '2rem' }}>Your First Month — Step by Step</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {timeline.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>{t.phase}</div>
              <div style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.75rem 1rem', flex: 1, color: '#94a3b8', fontSize: '0.875rem' }}>{t.action}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Package comparison */}
      <section style={{ maxWidth: '850px', margin: '0 auto', padding: '0 1rem 5rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 800, marginBottom: '2rem' }}>How Growth Compares</h2>
        <div style={{ background: 'rgba(13,21,38,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'rgba(15,23,42,0.9)' }}>
                <th style={{ padding: '1rem 1.25rem', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feature</th>
                <th style={{ padding: '1rem', textAlign: 'center', color: '#22d3ee', fontWeight: 700, fontSize: '0.85rem' }}>Starter<br /><span style={{ fontWeight: 400, color: '#475569', fontSize: '0.75rem' }}>₹4,999</span></th>
                <th style={{ padding: '1rem', textAlign: 'center', background: 'rgba(99,102,241,0.08)', color: '#818cf8', fontWeight: 800, fontSize: '0.85rem', borderLeft: '1px solid rgba(99,102,241,0.2)', borderRight: '1px solid rgba(99,102,241,0.2)' }}>Growth ★<br /><span style={{ fontWeight: 400, color: '#475569', fontSize: '0.75rem' }}>₹9,999</span></th>
                <th style={{ padding: '1rem', textAlign: 'center', color: '#34d399', fontWeight: 700, fontSize: '0.85rem' }}>Pro<br /><span style={{ fontWeight: 400, color: '#475569', fontSize: '0.75rem' }}>₹19,999</span></th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '0.875rem 1.25rem', color: '#94a3b8' }}>{row.label}</td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: row.starter === true ? '#22d3ee' : row.starter ? '#94a3b8' : '#374151' }}>
                    {row.starter === true ? '✓' : row.starter === false ? '—' : row.starter}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center', background: 'rgba(99,102,241,0.06)', borderLeft: '1px solid rgba(99,102,241,0.15)', borderRight: '1px solid rgba(99,102,241,0.15)', color: row.growth === true ? '#818cf8' : row.growth ? '#a5b4fc' : '#374151', fontWeight: row.growth !== false ? 600 : 400 }}>
                    {row.growth === true ? '✓' : row.growth === false ? '—' : row.growth}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: row.pro === true ? '#34d399' : row.pro ? '#6ee7b7' : '#374151' }}>
                    {row.pro === true ? '✓' : row.pro === false ? '—' : row.pro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '4rem 1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 900, marginBottom: '0.75rem' }}>Start Getting 20–40 Leads/Month</h2>
        <p style={{ color: '#64748b', marginBottom: '2rem' }}>Most popular package — book your free strategy call now</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="https://wa.me/919999999999?text=Hi, I want the Growth Package for ₹9,999/month." target="_blank" rel="noreferrer"
            id="growth-footer-cta"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', padding: '0.85rem 2rem', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', textDecoration: 'none', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
            💬 Get Started — ₹9,999/month
          </a>
          <Link to="/pricing" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '0.85rem 2rem', borderRadius: '12px', fontWeight: 600, fontSize: '1rem', textDecoration: 'none' }}>
            Compare All Packages
          </Link>
        </div>
      </section>
    </div>
  )
}
