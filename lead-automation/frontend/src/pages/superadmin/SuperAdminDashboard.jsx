import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { companyAPI } from '../../services/api'
import StatsCard from '../../components/ui/StatsCard'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [recentCompanies, setRecentCompanies] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [statsRes, activityRes, companiesRes] = await Promise.all([
        companyAPI.getStats(),
        companyAPI.getActivity(),
        companyAPI.getAll({ limit: 5, sort: 'created_at', order: 'desc' }),
      ])
      setStats(statsRes.data)
      setActivity(activityRes.data?.activity || [])
      setRecentCompanies(companiesRes.data?.companies || [])
    } catch (err) {
      toast.error('Failed to load dashboard data')
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

  const s = stats || {}

  // Build bar chart data for companies by plan
  const planData = [
    { label: 'Trial', value: s.trial_count || 0, color: '#8b5cf6' },
    { label: 'Starter', value: s.starter_count || 0, color: '#6366f1' },
    { label: 'Business', value: s.business_count || 0, color: '#06b6d4' },
    { label: 'Agency', value: s.agency_count || 0, color: '#10b981' },
  ]
  const maxPlan = Math.max(...planData.map(d => d.value), 1)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">System Overview</h1>
          <p className="page-subtitle">Monitor all tenants, usage and system health</p>
        </div>
        <div className="page-actions">
          <Link to="/superadmin/companies" className="btn btn-secondary btn-sm">
            🏢 All Companies
          </Link>
          <button className="btn btn-primary btn-sm" onClick={loadData}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <StatsCard
          title="Total Companies"
          value={s.total_companies ?? '—'}
          icon="🏢"
          iconClass="icon-box-primary"
          subtitle={`${s.active_companies || 0} active`}
        />
        <StatsCard
          title="Total Users"
          value={s.total_users ?? '—'}
          icon="👥"
          iconClass="icon-box-cyan"
          subtitle="Across all tenants"
        />
        <StatsCard
          title="Total Leads"
          value={(s.total_leads ?? 0).toLocaleString()}
          icon="📊"
          iconClass="icon-box-success"
          subtitle="System-wide"
        />
        <StatsCard
          title="Active Trials"
          value={s.trial_count ?? '—'}
          icon="⏳"
          iconClass="icon-box-warning"
          subtitle="Free tier companies"
        />
        <StatsCard
          title="Expiring Soon"
          value={s.expiring_soon ?? '—'}
          icon="⚠️"
          iconClass="icon-box-danger"
          subtitle="Within 7 days"
        />
        <StatsCard
          title="WA Sent Today"
          value={(s.wa_sent_today ?? 0).toLocaleString()}
          icon="📱"
          iconClass="icon-box-purple"
          subtitle="All companies"
        />
      </div>

      {/* Content grid */}
      <div className="content-grid">
        {/* Recent Companies */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Companies</h3>
            <Link to="/superadmin/companies" className="btn btn-ghost btn-sm">
              View All →
            </Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {recentCompanies.length === 0 ? (
              <div className="table-empty">
                <div className="table-empty-icon">🏢</div>
                <p>No companies yet</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Plan</th>
                    <th>Leads</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCompanies.map(c => (
                    <tr key={c.id}>
                      <td>
                        <Link
                          to={`/superadmin/companies/${c.id}`}
                          className="td-primary"
                          style={{ color: 'var(--text-link)', fontWeight: 600 }}
                        >
                          {c.name}
                        </Link>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {c.admin_email}
                        </div>
                      </td>
                      <td>
                        <Badge variant={c.plan_name}>{c.plan_name}</Badge>
                      </td>
                      <td className="td-primary">
                        {(c.lead_count || 0).toLocaleString()}
                      </td>
                      <td>
                        <Badge variant={c.is_active ? 'active' : 'inactive'}>
                          {c.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Plan Distribution Chart */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Companies by Plan</h3>
            <Link to="/superadmin/plans" className="btn btn-ghost btn-sm">
              Manage Plans →
            </Link>
          </div>
          <div className="card-body">
            {/* Bar chart */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <div className="bar-chart">
                {planData.map(d => (
                  <div
                    key={d.label}
                    className="bar-chart-bar"
                    data-value={d.value}
                    style={{
                      height: `${(d.value / maxPlan) * 100}%`,
                      background: d.color,
                      minHeight: '4px',
                    }}
                    title={`${d.label}: ${d.value}`}
                  />
                ))}
              </div>
              <div className="bar-chart-labels">
                {planData.map(d => (
                  <span key={d.label} className="bar-chart-label" style={{ color: d.color }}>
                    {d.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              {planData.map(d => (
                <div key={d.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '2px',
                      background: d.color, flexShrink: 0
                    }} />
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{d.label}</span>
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {d.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="divider" />

            {/* Quick stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              {[
                { label: 'Avg Leads/Co.', value: s.avg_leads_per_company || '0' },
                { label: 'New This Month', value: s.new_this_month || '0' },
              ].map(item => (
                <div key={item.label} style={{
                  background: 'var(--bg-input)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      {activity.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--space-5)' }}>
          <div className="card-header">
            <h3 className="card-title">Recent Activity</h3>
          </div>
          <div className="card-body">
            <div className="activity-feed">
              {activity.slice(0, 10).map((item, i) => (
                <div key={i} className="activity-item">
                  <div className="activity-dot" style={{
                    background: item.type === 'error' ? 'var(--color-danger)'
                      : item.type === 'success' ? 'var(--color-success)'
                      : 'var(--color-primary)'
                  }} />
                  <div className="activity-content">
                    <div className="activity-text">{item.message}</div>
                    <div className="activity-time">{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
