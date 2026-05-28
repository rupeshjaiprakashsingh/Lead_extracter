import React, { useState } from 'react'
import { Link } from 'react-router-dom'

const packages = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Get Found on Google',
    icon: '📍',
    price: 4999,
    priceLabel: '/month',
    badge: null,
    color: '#06b6d4',
    gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
    glow: 'rgba(6, 182, 212, 0.3)',
    description: 'Perfect for local businesses who want to show up when customers search on Google Maps & Local Search.',
    features: [
      'Google Business Profile Setup & Optimization',
      'Accurate NAP (Name, Address, Phone) Setup',
      'Business Category & Attributes Optimization',
      'Photo Uploads (up to 20 optimized photos)',
      'Weekly Posts on Google Business',
      'Review Response Management',
      'Monthly Performance Report',
      'WhatsApp Support',
    ],
    results: '10–20 new enquiries/month',
    setupFee: 2999,
    slug: '/services/starter',
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'Rank Higher, Get More Calls',
    icon: '📈',
    price: 9999,
    priceLabel: '/month',
    badge: 'Most Popular',
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    glow: 'rgba(99, 102, 241, 0.4)',
    description: 'For businesses serious about growth — includes a professional mobile-friendly website + full local SEO to dominate Google search.',
    features: [
      'Everything in Starter Package',
      'Professional Mobile-Friendly Website (5 pages)',
      'Local SEO — Keyword Research & On-Page Optimization',
      'Google Maps Ranking Optimization',
      'Citation Building (20+ local directories)',
      'Monthly Blog Post (SEO Article)',
      'Google Analytics & Search Console Setup',
      'Lead Tracking & Reporting Dashboard',
      'Priority WhatsApp + Email Support',
    ],
    results: '20–40 new enquiries/month',
    setupFee: 7999,
    slug: '/services/growth',
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Complete Digital Dominance',
    icon: '🚀',
    price: 19999,
    priceLabel: '/month',
    badge: 'Best Value',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    glow: 'rgba(16, 185, 129, 0.35)',
    description: 'The all-in-one package for businesses ready to dominate their local market and generate consistent, high-quality leads every month.',
    features: [
      'Everything in Growth Package',
      'Premium Website (10 pages + Blog)',
      'Advanced SEO — Technical + Content Strategy',
      'Google Ads Management (Ad Spend Separate)',
      'Social Media Management (2 platforms)',
      'Review Generation Campaign',
      'Reputation Monitoring & Alerts',
      'Video / Reel Creation (2/month)',
      'Dedicated Account Manager',
      'Weekly Reporting & Strategy Calls',
    ],
    results: '40–80+ new enquiries/month',
    setupFee: 14999,
    slug: '/services/pro',
  },
]

export default function PricingPage() {
  const [annual, setAnnual] = useState(false)

  return (
    <div style={{ minHeight: '100vh', background: '#020817', fontFamily: "'Inter', sans-serif", overflowX: 'hidden' }}>
      {/* Navigation */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(2, 8, 23, 0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 2rem',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px', height: '36px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px',
          }}>🚀</div>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#f1f5f9' }}>Innvoque Solutions</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <a href="https://innvoque.com" target="_blank" rel="noreferrer"
            style={{ color: '#94a3b8', fontSize: '0.875rem', textDecoration: 'none' }}>
            Website ↗
          </a>
          <a href="https://wa.me/919999999999"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white', padding: '0.4rem 1.1rem',
              borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600,
              textDecoration: 'none',
            }}>
            WhatsApp Us
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '5rem 1rem 3rem', position: 'relative' }}>
        {/* Glow background */}
        <div style={{
          position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)',
          width: '600px', height: '400px',
          background: 'radial-gradient(ellipse, rgba(99,102,241,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
          background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: '999px', padding: '0.35rem 1rem', marginBottom: '1.5rem',
          fontSize: '0.8rem', color: '#a5b4fc', fontWeight: 600,
        }}>
          <span>🏆</span> Trusted by 200+ Local Businesses in Delhi
        </div>

        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 900,
          background: 'linear-gradient(135deg, #f1f5f9, #818cf8)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: '1.25rem', lineHeight: 1.15,
        }}>
          Simple, Transparent Pricing<br />That Actually Gets Results
        </h1>
        <p style={{ color: '#64748b', fontSize: '1.1rem', maxWidth: '560px', margin: '0 auto 2.5rem', lineHeight: 1.7 }}>
          Stop losing 30–50 enquiries every month to competitors. Choose a package and start growing today.
        </p>

        {/* Billing toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '3.5rem' }}>
          <span style={{ color: !annual ? '#f1f5f9' : '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Monthly</span>
          <button
            id="billing-toggle"
            onClick={() => setAnnual(a => !a)}
            style={{
              width: '52px', height: '28px',
              background: annual ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(30,41,59,1)',
              borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer', position: 'relative', transition: 'all 0.3s ease',
            }}
          >
            <div style={{
              width: '20px', height: '20px',
              background: 'white', borderRadius: '50%',
              position: 'absolute', top: '3px',
              left: annual ? '28px' : '3px',
              transition: 'left 0.3s ease',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            }} />
          </button>
          <span style={{ color: annual ? '#f1f5f9' : '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>
            Annual <span style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800,
            }}>Save 20%</span>
          </span>
        </div>
      </section>

      {/* Pricing Cards */}
      <section style={{ padding: '0 1rem 5rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
          alignItems: 'start',
        }}>
          {packages.map((pkg) => {
            const displayPrice = annual ? Math.round(pkg.price * 0.8) : pkg.price
            const isPopular = pkg.badge === 'Most Popular'

            return (
              <div
                key={pkg.id}
                id={`package-${pkg.id}`}
                style={{
                  background: isPopular
                    ? 'linear-gradient(180deg, rgba(99,102,241,0.08) 0%, rgba(14,20,36,1) 100%)'
                    : 'rgba(13, 21, 38, 0.9)',
                  border: isPopular
                    ? '1.5px solid rgba(99,102,241,0.45)'
                    : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '24px',
                  padding: '2rem',
                  position: 'relative',
                  transform: isPopular ? 'scale(1.03)' : 'scale(1)',
                  boxShadow: isPopular
                    ? `0 20px 60px ${pkg.glow}, 0 4px 20px rgba(0,0,0,0.5)`
                    : '0 4px 24px rgba(0,0,0,0.4)',
                  transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = isPopular ? 'scale(1.05)' : 'scale(1.02)'
                  e.currentTarget.style.boxShadow = `0 24px 70px ${pkg.glow}, 0 8px 30px rgba(0,0,0,0.5)`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = isPopular ? 'scale(1.03)' : 'scale(1)'
                  e.currentTarget.style.boxShadow = isPopular
                    ? `0 20px 60px ${pkg.glow}, 0 4px 20px rgba(0,0,0,0.5)`
                    : '0 4px 24px rgba(0,0,0,0.4)'
                }}
              >
                {/* Badge */}
                {pkg.badge && (
                  <div style={{
                    position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
                    background: pkg.gradient,
                    color: 'white', padding: '0.3rem 1.2rem',
                    borderRadius: '999px', fontSize: '0.75rem', fontWeight: 800,
                    whiteSpace: 'nowrap', boxShadow: `0 4px 16px ${pkg.glow}`,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>
                    {pkg.badge}
                  </div>
                )}

                {/* Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{
                      width: '44px', height: '44px',
                      background: pkg.gradient,
                      borderRadius: '12px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '22px',
                      boxShadow: `0 4px 16px ${pkg.glow}`,
                    }}>{pkg.icon}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#f1f5f9' }}>{pkg.name}</div>
                      <div style={{ fontSize: '0.78rem', color: pkg.color, fontWeight: 600 }}>{pkg.tagline}</div>
                    </div>
                  </div>
                  <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.6 }}>{pkg.description}</p>
                </div>

                {/* Price */}
                <div style={{ marginBottom: '1.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <span style={{ fontSize: '1.1rem', color: '#94a3b8', fontWeight: 600, paddingBottom: '6px' }}>₹</span>
                    <span style={{
                      fontSize: '3rem', fontWeight: 900,
                      background: pkg.gradient,
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                      lineHeight: 1,
                    }}>{displayPrice.toLocaleString('en-IN')}</span>
                    <span style={{ fontSize: '0.875rem', color: '#64748b', paddingBottom: '8px' }}>{pkg.priceLabel}</span>
                  </div>
                  {annual && (
                    <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600, marginTop: '0.25rem' }}>
                      🎉 You save ₹{(pkg.price * 0.2 * 12).toLocaleString('en-IN')}/year
                    </div>
                  )}
                  <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.3rem' }}>
                    + One-time setup fee: ₹{pkg.setupFee.toLocaleString('en-IN')}
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    marginTop: '0.75rem',
                    background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                    borderRadius: '8px', padding: '0.3rem 0.75rem',
                    fontSize: '0.78rem', color: '#10b981', fontWeight: 600,
                  }}>
                    📊 Expected: {pkg.results}
                  </div>
                </div>

                {/* Features */}
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem 0', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {pkg.features.map((f, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                      <span style={{ color: pkg.color, flexShrink: 0, marginTop: '1px' }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <Link
                    to={pkg.slug}
                    id={`btn-details-${pkg.id}`}
                    style={{
                      display: 'block', textAlign: 'center',
                      background: pkg.gradient,
                      color: 'white', padding: '0.85rem',
                      borderRadius: '12px', fontWeight: 700, fontSize: '0.95rem',
                      textDecoration: 'none',
                      boxShadow: `0 4px 20px ${pkg.glow}`,
                      transition: 'all 0.25s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
                  >
                    View Full Details →
                  </Link>
                  <a
                    href={`https://wa.me/919999999999?text=Hi, I'm interested in the ${pkg.name} Package (₹${displayPrice.toLocaleString('en-IN')}/month). Please share more details.`}
                    id={`btn-whatsapp-${pkg.id}`}
                    target="_blank" rel="noreferrer"
                    style={{
                      display: 'block', textAlign: 'center',
                      background: 'rgba(16,185,129,0.12)',
                      border: '1px solid rgba(16,185,129,0.3)',
                      color: '#10b981', padding: '0.75rem',
                      borderRadius: '12px', fontWeight: 600, fontSize: '0.875rem',
                      textDecoration: 'none', transition: 'all 0.25s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.12)' }}
                  >
                    💬 WhatsApp for Free Consultation
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Guarantee Section */}
      <section style={{
        maxWidth: '900px', margin: '0 auto', padding: '0 1rem 5rem',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.06))',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '24px', padding: '2.5rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡️</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f1f5f9', marginBottom: '0.75rem' }}>
            30-Day Results Guarantee
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem', maxWidth: '560px', margin: '0 auto 1.5rem', lineHeight: 1.7 }}>
            If you don't see measurable improvement in your Google visibility within 30 days, we'll work for free until you do. That's our commitment.
          </p>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {['No Hidden Charges', 'Cancel Anytime', 'Dedicated Support'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#a5b4fc', fontSize: '0.875rem', fontWeight: 600 }}>
                <span style={{ color: '#10b981' }}>✓</span> {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem 6rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 800, color: '#f1f5f9', marginBottom: '2.5rem' }}>
          Frequently Asked Questions
        </h2>
        {[
          { q: 'How long before I see results?', a: 'Most clients see improved Google ranking and enquiries within 4–8 weeks. Local SEO results grow stronger over time.' },
          { q: 'What is the contract period?', a: 'We offer month-to-month contracts. No long-term lock-in. Cancel anytime with 30 days notice.' },
          { q: 'Is the website included in the price?', a: 'Yes! The Growth & Pro packages include a professionally designed, mobile-friendly website built specifically for your business.' },
          { q: 'Do you work with all types of local businesses?', a: 'Yes, we specialize in all categories — CA/Finance, Doctors, Restaurants, Retailers, Service Providers, and more.' },
          { q: 'What payment methods do you accept?', a: 'We accept UPI, bank transfer, and major debit/credit cards. Monthly invoices are issued on the 1st of each month.' },
        ].map((faq, i) => (
          <FaqItem key={i} q={faq.q} a={faq.a} />
        ))}
      </section>

      {/* Footer CTA */}
      <section style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(6,182,212,0.06))',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '4rem 1rem', textAlign: 'center',
      }}>
        <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 900, color: '#f1f5f9', marginBottom: '0.75rem' }}>
          Ready to Get More Customers?
        </h2>
        <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '1rem' }}>
          Book your FREE 10-minute consultation call today. No obligation.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="https://wa.me/919999999999?text=Hi, I'd like a FREE consultation for my business."
            target="_blank" rel="noreferrer"
            id="cta-whatsapp-footer"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white', padding: '0.85rem 2rem',
              borderRadius: '12px', fontWeight: 700, fontSize: '1rem',
              textDecoration: 'none', boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            }}>
            💬 WhatsApp Free Consultation
          </a>
          <a
            href="tel:+919999999999"
            id="cta-call-footer"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#f1f5f9', padding: '0.85rem 2rem',
              borderRadius: '12px', fontWeight: 600, fontSize: '1rem',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            }}>
            📞 Call Us Now
          </a>
        </div>
        <p style={{ color: '#374151', fontSize: '0.8rem', marginTop: '2.5rem' }}>
          © 2025 Innvoque Solutions. All rights reserved. |{' '}
          <a href="https://innvoque.com" style={{ color: '#4b5563' }}>innvoque.com</a>
        </p>
      </section>
    </div>
  )
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      padding: '1.25rem 0',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#f1f5f9', fontWeight: 600, fontSize: '0.95rem', textAlign: 'left', gap: '1rem',
        }}
      >
        {q}
        <span style={{ fontSize: '1.2rem', color: '#6366f1', flexShrink: 0, transition: 'transform 0.3s', transform: open ? 'rotate(45deg)' : 'none' }}>+</span>
      </button>
      {open && (
        <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.7, marginTop: '0.75rem', paddingRight: '2rem' }}>
          {a}
        </p>
      )}
    </div>
  )
}
