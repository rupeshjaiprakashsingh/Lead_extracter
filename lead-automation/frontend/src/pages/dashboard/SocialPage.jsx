import React, { useEffect, useState } from 'react'
import { socialAPI } from '../../services/api'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'

export default function SocialPage() {
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [posting, setPosting] = useState(false)
  const [settings, setSettings] = useState({
    enabled: false,
    frequency: 'daily',
    time_hour: 10,
    website_url: '',
    topic: '',
    title: '',
    custom_content: '',
    categories: [],
    channels: {
      facebook: { enabled: false, token: '', pageId: '' },
      instagram: { enabled: false, token: '', accountId: '' },
      linkedin: { enabled: false, token: '', urn: '' },
      twitter: { enabled: false, token: '', apiKey: '' }
    }
  })

  const [newCat, setNewCat] = useState({ name: '', keywords: '', topic: '', custom_content: '' })

  const handleAddCategory = () => {
    if (!newCat.name.trim()) {
      toast.error('Category Name is required')
      return
    }
    setSettings(s => ({
      ...s,
      categories: [...(s.categories || []), newCat]
    }))
    setNewCat({ name: '', keywords: '', topic: '', custom_content: '' })
    toast.success('Category added locally! Make sure to Save Configuration.')
  }

  const handleDeleteCategory = (index) => {
    setSettings(s => ({
      ...s,
      categories: (s.categories || []).filter((_, i) => i !== index)
    }))
    toast.success('Category removed locally! Save Configuration to apply.')
  }

  const handleLoadDefaults = () => {
    const defaults = [
      {
        name: "Actionable Value Hacks",
        keywords: "leads, productivity, CRM, automation",
        topic: "Simple steps to save 10 hours a week in lead management",
        custom_content: "Provide 3 simple productivity hacks for outreach, then introduce Innvoque's automation tools to handle it for them."
      },
      {
        name: "Value-First Outreach",
        keywords: "sales, conversion, marketing, trust",
        topic: "Why cold calling is dead and value-first messaging converts better",
        custom_content: "Debunk the myth that cold outreach must be pushy. Explain the value-first approach (giving a tip first) and how we help."
      },
      {
        name: "Common Mistakes to Avoid",
        keywords: "local SEO, Google Maps, lead generation",
        topic: "Mistakes local businesses make that lose them 10-20 customers monthly",
        custom_content: "Point out the mistake of a slow response time or not showing up on Google Maps. Highlight how our CRM automates immediate responses."
      },
      {
        name: "The 5-Minute Reply Rule",
        keywords: "lead decay, customer response, conversion",
        topic: "Why waiting 30 minutes to reply to a lead kills 80% of sales",
        custom_content: "Explain the science of lead decay. Explain how immediate follow-ups build trust and showcase our auto-whatsapp tools."
      },
      {
        name: "WhatsApp vs Email Open Rates",
        keywords: "whatsapp marketing, open rates, outreach",
        topic: "Why WhatsApp has a 98% open rate compared to 20% for email",
        custom_content: "Explain the shift in customer communication behavior. Showcase how our WhatsApp automation helps businesses reach customers where they actually look."
      },
      {
        name: "Google Maps Traffic Goldmine",
        keywords: "local SEO, google business profile, local business",
        topic: "The hidden traffic source 90% of local businesses ignore",
        custom_content: "Reveal how map rankings drive high-intent calls. Explain how to extract these leads and sync them to close more sales."
      },
      {
        name: "Founder Time Management",
        keywords: "time-saving, delegation, business automation",
        topic: "What I learned saving 15 hours a week by automating lead gen",
        custom_content: "Share a breakdown of manual task time vs automated time. Pitch Innvoque as the founder's time-saving secret."
      },
      {
        name: "Personalized AI Outreach",
        keywords: "artificial intelligence, automation, email marketing",
        topic: "How personalized AI messaging generated 50+ meetings",
        custom_content: "Detail a story of using AI to research prospects before emailing them, showing our automated lead scraper in action."
      },
      {
        name: "Follow-Up Retention Advantage",
        keywords: "CRM, customer retention, follow up",
        topic: "Getting leads is easy. Retaining them is where the money is.",
        custom_content: "Explain that follow-up determines profitability. Show how automated follow-up cycles turn single inquiries into lifetime buyers."
      },
      {
        name: "The Cost of Manual Lead Syncing",
        keywords: "automation, lead sync, efficiency",
        topic: "Stop copy-pasting lead details between systems manually",
        custom_content: "Highlight the error rates and time wasted on manual data entry. Explain how automatic CRM syncing saves time and energy."
      },
      {
        name: "Mobile-Friendly Conversions",
        keywords: "web design, mobile conversion, customer experience",
        topic: "Why local businesses lose customers from outdated mobile sites",
        custom_content: "Discuss how mobile-unfriendly sites turn customers away. Pitch our responsive web design and landing page solutions."
      },
      {
        name: "B2B Trust Building",
        keywords: "trust, b2b sales, relationship building",
        topic: "The secret to building instant trust with B2B decision makers",
        custom_content: "Explain that giving free, helpful audits builds instant B2B trust. Connect it to our personalized maps outreach templates."
      },
      {
        name: "Local SEO Ranking Myths",
        keywords: "local SEO, google maps ranking, business profile",
        topic: "Debunking 3 common myths about ranking #1 on Google",
        custom_content: "Clarify that reviews, proximity, and details matter more than keywords. Show how our tool helps businesses audit local listings."
      },
      {
        name: "Customer Experience Speed",
        keywords: "customer experience, response speed, brand value",
        topic: "Speed is the new marketing: Why fast response times win markets",
        custom_content: "Explain that clients buy from whoever answers first. Pitch Innvoque's automatic WhatsApp responder as the speed winner."
      },
      {
        name: "Scaling Without Hiring",
        keywords: "scaling, leverage, technology, hiring",
        topic: "How to scale your sales outreach without doubling your headcount",
        custom_content: "Discuss using software as a force multiplier. Explain how automated lead extraction and follow-up does the work of a 3-person team."
      }
    ]
    setSettings(s => ({
      ...s,
      categories: [...(s.categories || []), ...defaults]
    }))
    toast.success('Pre-loaded 15 default value-first categories! Make sure to Save Configuration.')
  }
  
  const [posts, setPosts] = useState([])
  const [previews, setPreviews] = useState(null) // holds generated draft content
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState(null)

  useEffect(() => {
    loadSocialData()
  }, [])

  const loadSocialData = async () => {
    setLoading(true)
    try {
      const settingsRes = await socialAPI.getSettings()
      setSettings(settingsRes.data || settings)
      
      const postsRes = await socialAPI.getPosts()
      setPosts(postsRes.data || [])
    } catch (err) {
      toast.error('Failed to load social poster details')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    try {
      await socialAPI.saveSettings(settings)
      toast.success('Social poster settings saved successfully!')
      loadSocialData()
    } catch (err) {
      toast.error('Failed to save configuration')
    }
  }

  const handleTestConnections = async () => {
    setTesting(true)
    setTestResults(null)
    try {
      const res = await socialAPI.testConnections({ channels: settings.channels })
      if (res.data?.success) {
        setTestResults(res.data.results)
        toast.success('Social media API validation completed!')
      } else {
        toast.error('Test connections failed: ' + (res.data?.error || 'Server error'))
      }
    } catch (err) {
      toast.error('Test connections error: ' + (err.response?.data?.error || err.message))
    } finally {
      setTesting(false)
    }
  }

  const handleGeneratePreview = async () => {
    if (!settings.website_url.trim()) {
      toast.error('Please enter a Website URL to scrape')
      return
    }
    setGenerating(true)
    setPreviews(null)
    try {
      const res = await socialAPI.generatePreview({
        website_url: settings.website_url,
        topic: settings.topic,
        title: settings.title,
        custom_content: settings.custom_content
      })
      if (res.data?.success) {
        setPreviews(res.data.data?.posts)
        toast.success('AI Social Posts Drafted!')
      } else {
        toast.error('Generation failed')
      }
    } catch (err) {
      toast.error('Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const handlePostNow = async () => {
    setPosting(true)
    try {
      const res = await socialAPI.postNow({
        website_url: settings.website_url,
        topic: settings.topic,
        title: settings.title,
        custom_content: settings.custom_content
      })
      if (res.data?.success) {
        toast.success('Posts simulated successfully!')
        loadSocialData()
        setPreviews(null)
      } else {
        toast.error('Post simulation failed')
      }
    } catch (err) {
      toast.error('Simulation execution failed')
    } finally {
      setPosting(false)
    }
  }

  const handleChannelToggle = (ch) => {
    setSettings(s => ({
      ...s,
      channels: {
        ...s.channels,
        [ch]: {
          ...s.channels[ch],
          enabled: !s.channels[ch]?.enabled
        }
      }
    }))
  }

  const handleChannelConfigChange = (ch, key, val) => {
    setSettings(s => ({
      ...s,
      channels: {
        ...s.channels,
        [ch]: {
          ...s.channels[ch],
          [key]: val
        }
      }
    }))
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
          <h1 className="page-title">AI Social Poster</h1>
          <p className="page-subtitle">Draft, schedule and simulate multi-channel social media posts using AI scraping</p>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Settings Form */}
        <div className="card">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>AI Social Poster settings</h2>
          
          <form onSubmit={handleSaveSettings}>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="checkbox"
                id="enabled"
                checked={settings.enabled}
                onChange={(e) => setSettings(s => ({ ...s, enabled: e.target.checked }))}
              />
              <label htmlFor="enabled" className="form-label" style={{ marginBottom: 0, fontWeight: 600 }}>
                Enable Automatic Posting
              </label>
            </div>

            <div className="grid grid-2" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Posting Frequency</label>
                <select
                  className="form-control"
                  style={{ background: 'var(--bg-glass-light)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
                  value={settings.frequency || 'daily'}
                  onChange={(e) => setSettings(s => ({ ...s, frequency: e.target.value }))}
                >
                  <option value="daily">Every Day (Daily)</option>
                  <option value="hourly">Every Hour (Hourly)</option>
                  <option value="thirty_minutes">Every 30 Minutes</option>
                </select>
              </div>
              {settings.frequency === 'daily' && (
                <div className="form-group">
                  <label className="form-label">Time of Day (IST Hour)</label>
                  <select
                    className="form-control"
                    style={{ background: 'var(--bg-glass-light)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
                    value={settings.time_hour !== undefined ? settings.time_hour : 10}
                    onChange={(e) => setSettings(s => ({ ...s, time_hour: parseInt(e.target.value) }))}
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>
                        {h === 0 ? '12:00 AM' : h === 12 ? '12:00 PM' : h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Scraper Target Website URL</label>
              <input
                type="text"
                className="form-control"
                value={settings.website_url}
                onChange={(e) => setSettings(s => ({ ...s, website_url: e.target.value }))}
                placeholder="https://company-blog.com"
              />
            </div>

            <div className="grid grid-2">
              <div className="form-group">
                <label className="form-label">Context Topic (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={settings.topic}
                  onChange={(e) => setSettings(s => ({ ...s, topic: e.target.value }))}
                  placeholder="SaaS trends"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Preferred Title (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={settings.title}
                  onChange={(e) => setSettings(s => ({ ...s, title: e.target.value }))}
                  placeholder="AI for Outreach"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Additional Custom Prompt/Guidelines</label>
              <textarea
                className="form-control"
                rows="3"
                value={settings.custom_content}
                onChange={(e) => setSettings(s => ({ ...s, custom_content: e.target.value }))}
                placeholder="Make it sound energetic and end with call to action..."
              />
            </div>

            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '1.5rem 0 1rem 0', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📋 Content Categories & Keywords (Cycles on Schedule)</span>
              <button type="button" className="btn btn-sm btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={handleLoadDefaults}>
                ⚡ Load Defaults
              </button>
            </h3>

            {/* List of current categories */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              {(!settings.categories || settings.categories.length === 0) ? (
                <div style={{ padding: '0.75rem', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No custom categories defined. Auto-poster will rotate only using the global topic above.
                </div>
              ) : (
                settings.categories.map((cat, idx) => (
                  <div key={idx} style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.01)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, paddingRight: '0.5rem' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{cat.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        <strong>Keywords:</strong> {cat.keywords || 'None'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        <strong>Topic Focus:</strong> {cat.topic || 'None'}
                      </div>
                      {cat.custom_content && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic', background: 'rgba(255,255,255,0.02)', padding: '4px', borderRadius: '4px' }}>
                          "{cat.custom_content}"
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', padding: '2px 8px', fontSize: '0.75rem' }}
                      onClick={() => handleDeleteCategory(idx)}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add Category Sub-form */}
            <div style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass-light)', marginBottom: '1.5rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>➕ Add New Category Message</div>
              <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Category Name (e.g. Case Study)"
                  className="form-control form-control-sm"
                  style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  value={newCat.name}
                  onChange={(e) => setNewCat(c => ({ ...c, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-2" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Keywords (e.g. CRM, leads)"
                  className="form-control form-control-sm"
                  style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  value={newCat.keywords}
                  onChange={(e) => setNewCat(c => ({ ...c, keywords: e.target.value }))}
                />
                <input
                  type="text"
                  placeholder="Topic Focus (Optional)"
                  className="form-control form-control-sm"
                  style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  value={newCat.topic}
                  onChange={(e) => setNewCat(c => ({ ...c, topic: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                <textarea
                  placeholder="Help-then-sell Instructions (e.g. Give 3 tips to fix response times, then sell our CRM...)"
                  className="form-control form-control-sm"
                  style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  rows="2"
                  value={newCat.custom_content}
                  onChange={(e) => setNewCat(c => ({ ...c, custom_content: e.target.value }))}
                />
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                style={{ width: '100%', padding: '4px', fontSize: '0.8rem' }}
                onClick={handleAddCategory}
              >
                Add Category to Settings
              </button>
            </div>

            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '1.5rem 0 1rem 0', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
              Connected Channels Config
            </h3>
            
            {Object.keys(settings.channels || {}).map((ch) => (
              <div key={ch} style={{ marginBottom: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem', background: 'var(--bg-glass-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{ch}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                    <input
                      type="checkbox"
                      checked={!!settings.channels[ch]?.enabled}
                      onChange={() => handleChannelToggle(ch)}
                    />
                    Enabled
                  </label>
                </div>
                {settings.channels[ch]?.enabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input
                      type="password"
                      placeholder="API Access Token"
                      className="form-control"
                      autoComplete="new-password"
                      value={settings.channels[ch]?.token || ''}
                      onChange={(e) => handleChannelConfigChange(ch, 'token', e.target.value)}
                    />
                    {ch === 'linkedin' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          type="text"
                          placeholder="Your profile URL (e.g. https://www.linkedin.com/in/yourname) — leave blank to auto-detect"
                          className="form-control"
                          value={settings.channels[ch]?.urn || ''}
                          onChange={(e) => handleChannelConfigChange(ch, 'urn', e.target.value)}
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          💡 <strong>Personal profile:</strong> Paste your LinkedIn profile URL (linkedin.com/in/...) or leave blank — it will auto-detect from your token.<br />
                          🏢 <strong>Company page:</strong> Paste your company page URL (linkedin.com/company/...) — requires "Organization Pages" permission in your LinkedIn app.
                        </span>
                      </div>
                    ) : ch === 'facebook' ? (
                      <input
                        type="text"
                        placeholder="Facebook Page ID"
                        className="form-control"
                        value={settings.channels[ch]?.pageId || ''}
                        onChange={(e) => handleChannelConfigChange(ch, 'pageId', e.target.value)}
                      />
                    ) : ch === 'instagram' ? (
                      <input
                        type="text"
                        placeholder="Instagram Business Account ID"
                        className="form-control"
                        value={settings.channels[ch]?.accountId || ''}
                        onChange={(e) => handleChannelConfigChange(ch, 'accountId', e.target.value)}
                      />
                    ) : null}
                  </div>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-secondary">Save Configuration</button>
              <button type="button" className="btn" onClick={handleTestConnections} disabled={testing} style={{ background: '#7c3aed', color: '#fff', border: 'none' }}>
                {testing ? '🔌 Testing...' : '🔌 Test Connections'}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleGeneratePreview} disabled={generating}>
                {generating ? 'Drafting...' : '✨ Generate AI Previews'}
              </button>
            </div>
            {testResults && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong style={{ color: '#fff', display: 'block', marginBottom: '8px', fontSize: '0.875rem' }}>🔌 Connection Test Results:</strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8125rem' }}>
                  {Object.entries(testResults).map(([ch, outcome]) => (
                    <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{outcome.success ? '✅' : '❌'}</span>
                      <span style={{ fontWeight: 600, textTransform: 'capitalize', color: 'var(--text-primary)' }}>{ch}:</span>
                      <span style={{ color: outcome.success ? 'var(--color-success)' : 'var(--color-danger)' }}>{outcome.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>

        {/* AI Previews & Recent History */}
        <div>
          {previews ? (
            <div className="card" style={{ marginBottom: 'var(--space-5)', border: '1px solid var(--color-success)' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-success)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>✨ AI Generated Draft Previews</span>
                <button className="btn btn-primary btn-sm" onClick={handlePostNow} disabled={posting}>
                  {posting ? 'Sending simulation...' : '🚀 Publish Previews Now'}
                </button>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto' }}>
                {previews.image_url && (
                  <div style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', display: 'block', marginBottom: '8px', color: 'var(--text-primary)', textAlign: 'left' }}>🎨 Generated AI Post Image</span>
                    <img src={previews.image_url} alt="AI Generated Graphic" style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px', fontStyle: 'italic', textAlign: 'left' }}>Prompt: "{previews.image_prompt}"</span>
                  </div>
                )}
                {Object.entries(previews)
                  .filter(([ch]) => ch !== 'image_url' && ch !== 'image_prompt')
                  .map(([ch, content]) => (
                    <div key={ch} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
                      <span style={{ fontWeight: 700, textTransform: 'capitalize', fontSize: '0.875rem', display: 'block', marginBottom: '4px', color: 'var(--text-primary)' }}>{ch}</span>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.5, background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                        {content || 'No content drafted for this channel.'}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          <div className="card">
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>Recent Postings History</h2>
            <div className="table-responsive" style={{ maxHeight: '350px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Topic/Title</th>
                    <th>Channels</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>
                        No postings logged yet.
                      </td>
                    </tr>
                  ) : (
                    posts.map((post) => (
                      <tr key={post._id}>
                        <td>{new Date(post.createdAt).toLocaleDateString()}</td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{post.title || 'No Title'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{post.topic || 'Auto Scrape'}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {post.channels_posted?.map(ch => (
                              <Badge key={ch} variant="starter">{ch}</Badge>
                            ))}
                          </div>
                        </td>
                        <td>
                          <Badge variant={post.status}>{post.status?.toUpperCase()}</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
