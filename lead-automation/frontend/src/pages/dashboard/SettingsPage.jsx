import React, { useEffect, useState } from 'react'
import { settingsAPI } from '../../services/api'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('smtp')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    smtp_host: '',
    smtp_port: '',
    smtp_secure: false,
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    ultramsg: {
      instanceId: '',
      token: ''
    },
    wa_template: '',
    email_subject: '',
    email_body: ''
  })
  
  const [testMail, setTestMail] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const res = await settingsAPI.get()
      setForm(f => ({
        ...f,
        ...res.data,
        ultramsg: res.data?.ultramsg || { instanceId: '', token: '' }
      }))
    } catch (err) {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      await settingsAPI.save(form)
      toast.success('Settings saved successfully!')
      loadSettings()
    } catch (err) {
      toast.error('Failed to save settings')
    }
  }

  const handleTestSmtp = async () => {
    if (!testMail.trim()) {
      toast.error('Please enter a test email address')
      return
    }
    setTesting(true)
    try {
      const res = await settingsAPI.testSMTP({
        host: form.smtp_host,
        port: form.smtp_port,
        secure: form.smtp_secure,
        user: form.smtp_user,
        pass: form.smtp_pass,
        to: testMail.trim()
      })
      if (res.data?.success || res.data?.message?.includes('verified') || res.data?.message?.includes('Connected')) {
        toast.success(res.data?.message || 'SMTP Connection Verified!')
      } else {
        toast.error(res.data?.error || 'SMTP Connection Failed')
      }
    } catch (err) {
      toast.error('SMTP Connection Failed')
    } finally {
      setTesting(false)
    }
  }

  const handleTestWA = async () => {
    setTesting(true)
    try {
      const res = await settingsAPI.testWA({
        instanceId: form.ultramsg?.instanceId,
        token: form.ultramsg?.token
      })
      if (res.data?.success) {
        toast.success('UltraMsg connection verified!')
      } else {
        toast.error(res.data?.error || 'UltraMsg Connection Failed')
      }
    } catch (err) {
      toast.error('UltraMsg connection failed')
    } finally {
      setTesting(false)
    }
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
          <h1 className="page-title">Workspace Configuration</h1>
          <p className="page-subtitle">Configure outbound gateways, templates and credentials</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Navigation Sidebar inside page */}
        <div className="card" style={{ padding: '0.75rem', width: '240px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <button 
              type="button"
              className={`btn ${activeTab === 'smtp' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('smtp')}
              style={{ textAlign: 'left', justifyContent: 'flex-start' }}
            >
              📧 SMTP Gateway
            </button>
            <button 
              type="button"
              className={`btn ${activeTab === 'wa' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('wa')}
              style={{ textAlign: 'left', justifyContent: 'flex-start' }}
            >
              📱 UltraMsg / WA
            </button>
            <button 
              type="button"
              className={`btn ${activeTab === 'templates' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('templates')}
              style={{ textAlign: 'left', justifyContent: 'flex-start' }}
            >
              📝 AI Templates
            </button>
          </div>
        </div>

        {/* Configurations Forms */}
        <div className="card" style={{ flex: 1, minWidth: '320px' }}>
          <form onSubmit={handleSave}>
            {activeTab === 'smtp' && (
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>Outbound SMTP Mail Server</h2>
                
                <div className="grid grid-2">
                  <div className="form-group">
                    <label className="form-label">SMTP Server Host</label>
                    <input
                      type="text"
                      className="form-control"
                      value={form.smtp_host}
                      onChange={(e) => setForm(f => ({ ...f, smtp_host: e.target.value }))}
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">SMTP Port</label>
                    <input
                      type="number"
                      className="form-control"
                      value={form.smtp_port}
                      onChange={(e) => setForm(f => ({ ...f, smtp_port: e.target.value }))}
                      placeholder="587"
                    />
                  </div>
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1rem 0' }}>
                  <input
                    type="checkbox"
                    id="smtp_secure"
                    checked={form.smtp_secure}
                    onChange={(e) => setForm(f => ({ ...f, smtp_secure: e.target.checked }))}
                  />
                  <label htmlFor="smtp_secure" className="form-label" style={{ marginBottom: 0 }}>
                    Use SSL/TLS Connection (Required for Port 465)
                  </label>
                </div>

                <div className="grid grid-2">
                  <div className="form-group">
                    <label className="form-label">SMTP Authentication User (Email)</label>
                    <input
                      type="email"
                      className="form-control"
                      value={form.smtp_user}
                      onChange={(e) => setForm(f => ({ ...f, smtp_user: e.target.value }))}
                      placeholder="name@gmail.com"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">App Password</label>
                    <input
                      type="password"
                      className="form-control"
                      value={form.smtp_pass}
                      onChange={(e) => setForm(f => ({ ...f, smtp_pass: e.target.value }))}
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">From Display Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.smtp_from}
                    onChange={(e) => setForm(f => ({ ...f, smtp_from: e.target.value }))}
                    placeholder="Lead Automation Team"
                  />
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.75rem' }}>Verify Outbox Server</h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="email"
                      placeholder="test@receiver.com"
                      className="form-control"
                      value={testMail}
                      onChange={(e) => setTestMail(e.target.value)}
                      style={{ maxWidth: '300px' }}
                    />
                    <button type="button" className="btn btn-secondary" onClick={handleTestSmtp} disabled={testing}>
                      {testing ? 'Testing...' : '🧪 Test SMTP'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'wa' && (
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>UltraMsg WhatsApp API Integration</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                  Alternatively to Playwright local automation, connect your UltraMsg cloud instance keys here for instant cloud broadcasts.
                </p>

                <div className="form-group">
                  <label className="form-label">UltraMsg Instance ID</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.ultramsg?.instanceId}
                    onChange={(e) => setForm(f => ({ ...f, ultramsg: { ...f.ultramsg, instanceId: e.target.value } }))}
                    placeholder="instance12345"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">API Token Key</label>
                  <input
                    type="password"
                    className="form-control"
                    value={form.ultramsg?.token}
                    onChange={(e) => setForm(f => ({ ...f, ultramsg: { ...f.ultramsg, token: e.target.value } }))}
                    placeholder="••••••••"
                  />
                </div>

                <button type="button" className="btn btn-secondary" onClick={handleTestWA} style={{ marginTop: '0.5rem' }} disabled={testing}>
                  {testing ? 'Testing...' : '🧪 Verify UltraMsg Connection'}
                </button>
              </div>
            )}

            {activeTab === 'templates' && (
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>AI Templates (Spintax supported)</h2>

                <div className="form-group">
                  <label className="form-label">WhatsApp Message Template</label>
                  <textarea
                    className="form-control"
                    rows="5"
                    value={form.wa_template}
                    onChange={(e) => setForm(f => ({ ...f, wa_template: e.target.value }))}
                    placeholder="Hi {name}, I noticed your business {company} in {city}..."
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Variables: {"{name}, {phone}, {city}, {category}"}</span>
                </div>

                <div className="form-group">
                  <label className="form-label">Email Outreach Subject</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.email_subject}
                    onChange={(e) => setForm(f => ({ ...f, email_subject: e.target.value }))}
                    placeholder="Outreach partnership proposal for {name}"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email HTML Body</label>
                  <textarea
                    className="form-control"
                    rows="6"
                    value={form.email_body}
                    onChange={(e) => setForm(f => ({ ...f, email_body: e.target.value }))}
                    placeholder="&lt;p&gt;Dear {name},&lt;/p&gt;&lt;p&gt;We noticed your website...&lt;/p&gt;"
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Variables: {"{name}, {email}, {city}, {category}"}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '2rem', paddingTop: '1rem' }}>
              <button type="submit" className="btn btn-primary">Save Settings Configuration</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
