import React, { useEffect, useState } from 'react'
import { scheduleAPI } from '../../services/api'
import toast from 'react-hot-toast'

export default function SchedulePage() {
  const [loading, setLoading] = useState(true)
  const [categoriesList, setCategoriesList] = useState([])
  const [running, setRunning] = useState(false)
  const [form, setForm] = useState({
    enabled: false,
    categories: [],
    daily_limit: 60,
    skip_sent: true,
    allow_resend: false,
    morning_hour: 10,
    evening_hour: 16,
    report_email: ''
  })
  
  const [stats, setStats] = useState({
    enabled: false,
    today_sent: 0,
    today_failed: 0,
    daily_limit: 60,
    last_run: null,
    is_running: false
  })

  useEffect(() => {
    loadSchedulerData()
  }, [])

  const loadSchedulerData = async () => {
    setLoading(true)
    try {
      const sRes = await scheduleAPI.get()
      setForm({
        enabled: sRes.data?.enabled || false,
        categories: sRes.data?.categories || [],
        daily_limit: sRes.data?.daily_limit || 60,
        skip_sent: sRes.data?.skip_sent !== false,
        allow_resend: !!sRes.data?.allow_resend,
        morning_hour: sRes.data?.morning_hour || 10,
        evening_hour: sRes.data?.evening_hour || 16,
        report_email: sRes.data?.report_email || ''
      })
      setCategoriesList(sRes.data?.categories_list || [])
      
      const statusRes = await scheduleAPI.getStatus()
      setStats(statusRes.data || { enabled: false, today_sent: 0, today_failed: 0, daily_limit: 60, last_run: null, is_running: false })
      setRunning(!!statusRes.data?.is_running)
    } catch (err) {
      toast.error('Failed to load scheduler parameters')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      await scheduleAPI.save(form)
      toast.success('Scheduler parameters saved!')
      loadSchedulerData()
    } catch (err) {
      toast.error('Failed to save scheduler configuration')
    }
  }

  const handleRunNow = async () => {
    try {
      const res = await scheduleAPI.runNow()
      if (res.data?.success) {
        toast.success(res.data?.message || 'Outreach process triggered!')
        setRunning(true)
      } else {
        toast.error(res.data?.error || 'Already running')
      }
    } catch (err) {
      toast.error('Trigger failed')
    }
  }

  const handleCategoryChange = (cat) => {
    setForm(f => {
      const isSelected = f.categories.includes(cat)
      const categories = isSelected 
        ? f.categories.filter(c => c !== cat) 
        : [...f.categories, cat]
      return { ...f, categories }
    })
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div className="loading-spinner-lg" />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Outreach Scheduler</h1>
          <p className="page-subtitle">Configure cron-driven WhatsApp outreach loops</p>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Settings card */}
        <div className="card">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>Auto-Scheduler settings</h2>
          
          <form onSubmit={handleSave}>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="checkbox"
                id="enabled"
                checked={form.enabled}
                onChange={(e) => setForm(f => ({ ...f, enabled: e.target.checked }))}
              />
              <label htmlFor="enabled" className="form-label" style={{ marginBottom: 0, fontWeight: 600 }}>
                Enable Cron Auto-Scheduler
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">Daily outreach Limit (Max messages per day)</label>
              <input
                type="number"
                className="form-control"
                value={form.daily_limit}
                onChange={(e) => setForm(f => ({ ...f, daily_limit: parseInt(e.target.value) || 0 }))}
              />
            </div>

            <div className="grid grid-2">
              <div className="form-group">
                <label className="form-label">Morning Hour (24h IST)</label>
                <input
                  type="number"
                  min="0" max="23"
                  className="form-control"
                  value={form.morning_hour}
                  onChange={(e) => setForm(f => ({ ...f, morning_hour: parseInt(e.target.value) || 10 }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Evening Hour (24h IST)</label>
                <input
                  type="number"
                  min="0" max="23"
                  className="form-control"
                  value={form.evening_hour}
                  onChange={(e) => setForm(f => ({ ...f, evening_hour: parseInt(e.target.value) || 16 }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Daily Reports Email Address</label>
              <input
                type="email"
                className="form-control"
                value={form.report_email}
                onChange={(e) => setForm(f => ({ ...f, report_email: e.target.value }))}
                placeholder="reports@yourdomain.com"
              />
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="skip_sent"
                checked={form.skip_sent}
                onChange={(e) => setForm(f => ({ ...f, skip_sent: e.target.checked }))}
              />
              <label htmlFor="skip_sent" className="form-label" style={{ marginBottom: 0 }}>
                Skip WhatsApp Contacts Already Messaged
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">Target Segments / Categories (Empty = All)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem', background: 'var(--bg-input)' }}>
                {categoriesList.map(cat => (
                  <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                    <input
                      type="checkbox"
                      checked={form.categories.includes(cat)}
                      onChange={() => handleCategoryChange(cat)}
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="submit" className="btn btn-primary">Save Settings</button>
            </div>
          </form>
        </div>

        {/* Status card */}
        <div className="card">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>Scheduler Operational Status</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '12px', height: '12px', borderRadius: '50%',
                background: stats.enabled ? 'var(--color-success)' : 'var(--text-muted)'
              }} />
              <span style={{ fontWeight: 600, fontSize: '1.125rem' }}>
                {stats.enabled ? 'CRON DAEMON ONLINE' : 'CRON DAEMON OFFLINE'}
              </span>
            </div>

            <div className="grid grid-2">
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>MESSAGES DELIVERED TODAY</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{stats.today_sent}</span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>MESSAGES FAILED TODAY</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-danger)' }}>{stats.today_failed}</span>
              </div>
            </div>

            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>LAST ACTIVE LAUNCH</span>
              <span style={{ fontWeight: 500 }}>
                {stats.last_run ? new Date(stats.last_run).toLocaleString() : 'No execution logged today'}
              </span>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.75rem' }}>Immediate Operations</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                Manually trigger the scheduler batch immediately in a safe, persistent browser instance on the server.
              </p>
              
              <button 
                type="button" 
                className={`btn ${running ? 'btn-secondary' : 'btn-primary'}`} 
                onClick={handleRunNow} 
                disabled={running}
              >
                {running ? '⏳ Sending batch now...' : '⚡ Trigger scheduler run now'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
