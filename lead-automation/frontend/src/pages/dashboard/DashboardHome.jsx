import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { leadAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import StatsCard from '../../components/ui/StatsCard'
import PlanBanner from '../../components/ui/PlanBanner'
import toast from 'react-hot-toast'

export default function DashboardHome() {
  const { user, planName, planLeadsLimit, totalLeads } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardStats()
  }, [])

  const loadDashboardStats = async () => {
    try {
      const res = await leadAPI.getStats()
      setStats(res.data)
    } catch (err) {
      toast.error('Failed to load dashboard metrics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div className="loading-spinner-lg" />
      </div>
    )
  }

  const s = stats || { total: 0, pending: 0, waSent: 0, emailSent: 0, noSite: 0, followup: 0, categoryBreakdown: [] }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome back, {user?.firstName || user?.username}!</h1>
          <p className="page-subtitle">Track your lead extraction pipelines and customer outreach campaigns</p>
        </div>
      </div>

      {/* Plan limit warning banner */}
      <PlanBanner 
        used={totalLeads || s.total} 
        limit={planLeadsLimit} 
        planName={planName}
      />

      <div className="grid grid-4" style={{ marginBottom: 'var(--space-6)' }}>
        <StatsCard
          title="Total Extracted Leads"
          value={s.total}
          subtitle="All leads in storage"
          icon="👥"
          color="var(--gradient-primary)"
        />
        <StatsCard
          title="WhatsApp Sent"
          value={s.waSent}
          subtitle={`${s.pending} pending outreach`}
          icon="📱"
          color="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        />
        <StatsCard
          title="Emails Sent"
          value={s.emailSent}
          subtitle="Outbox campaigns"
          icon="📧"
          color="linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
        />
        <StatsCard
          title="Follow-ups Pending"
          value={s.followup}
          subtitle="Due actions"
          icon="🔔"
          color="linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
        />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Outreach Action Panel</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Quickly trigger scrapers or start bulk message broadcasts using manual/automated WhatsApp and email templates.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Link to="/dashboard/leads" className="btn btn-primary" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Scrape Google Maps
            </Link>
            <Link to="/dashboard/leads" className="btn btn-secondary" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Import Lead Contacts
            </Link>
            <Link to="/dashboard/schedule" className="btn btn-secondary" style={{ textAlign: 'center', textDecoration: 'none' }}>
              WA Scheduler Setting
            </Link>
            <Link to="/dashboard/social" className="btn btn-secondary" style={{ textAlign: 'center', textDecoration: 'none' }}>
              AI Post Generator
            </Link>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Top Business Segments</h2>
          {s.categoryBreakdown.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
              No categories mapped yet. Start by scraping Google Maps.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {s.categoryBreakdown.slice(0, 5).map((cat) => {
                const maxCount = Math.max(...s.categoryBreakdown.map(c => c.count), 1)
                const pct = Math.round((cat.count / maxCount) * 100)
                return (
                  <div key={cat.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{cat.name}</span>
                      <span style={{ fontWeight: 600 }}>{cat.count}</span>
                    </div>
                    <div className="progress-bar-wrap">
                      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
