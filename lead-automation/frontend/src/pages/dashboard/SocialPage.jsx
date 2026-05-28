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
    channels: {
      facebook: { enabled: false, token: '', pageId: '' },
      instagram: { enabled: false, token: '', accountId: '' },
      linkedin: { enabled: false, token: '', urn: '' },
      twitter: { enabled: false, token: '', apiKey: '' }
    }
  })
  
  const [posts, setPosts] = useState([])
  const [previews, setPreviews] = useState(null) // holds generated draft content

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
                Enable Automatic Daily Posting
              </label>
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="submit" className="btn btn-secondary">Save Configuration</button>
              <button type="button" className="btn btn-primary" onClick={handleGeneratePreview} disabled={generating}>
                {generating ? 'Drafting...' : '✨ Generate AI Previews'}
              </button>
            </div>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
                {Object.entries(previews).map(([ch, content]) => (
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
