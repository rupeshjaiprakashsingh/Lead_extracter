import React, { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'

// ── Platform icons & colors ──────────────────────────────────────
const PLATFORMS = {
  linkedin:  { label: 'LinkedIn',  icon: '💼', color: '#0077b5', bg: '#e8f4fb' },
  twitter:   { label: 'Twitter/X', icon: '🐦', color: '#1da1f2', bg: '#e8f5fd' },
  indiamart: { label: 'IndiaMART', icon: '🏪', color: '#e07b39', bg: '#fef3ec' },
  justdial:  { label: 'JustDial',  icon: '📞', color: '#fc6a08', bg: '#fff3e8' },
}

// ── Score badge component ────────────────────────────────────────
function ScoreBadge({ score }) {
  const configs = {
    5: { label: '🔥 Hot',    color: '#ef4444', bg: '#fef2f2' },
    4: { label: '⚡ Warm',   color: '#f59e0b', bg: '#fffbeb' },
    3: { label: '🌱 Medium', color: '#10b981', bg: '#f0fdf4' },
    2: { label: '❄️ Cool',   color: '#6b7280', bg: '#f3f4f6' },
    1: { label: '💤 Low',    color: '#9ca3af', bg: '#f9fafb' },
  }
  const c = configs[score] || configs[2]
  return (
    <span style={{
      background: c.bg, color: c.color,
      padding: '2px 10px', borderRadius: 20,
      fontSize: '0.72rem', fontWeight: 700, border: `1px solid ${c.color}30`
    }}>{c.label}</span>
  )
}

// ── Platform badge ────────────────────────────────────────────────
function PlatformBadge({ platform }) {
  const p = PLATFORMS[platform] || { label: platform, icon: '🌐', color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span style={{
      background: p.bg, color: p.color,
      padding: '2px 10px', borderRadius: 20,
      fontSize: '0.72rem', fontWeight: 600, border: `1px solid ${p.color}30`,
      display: 'inline-flex', alignItems: 'center', gap: 4
    }}>
      {p.icon} {p.label}
    </span>
  )
}

// ── Status badge ─────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    new:       { label: 'New',       color: '#3b82f6', bg: '#eff6ff' },
    reviewed:  { label: 'Reviewed',  color: '#8b5cf6', bg: '#f5f3ff' },
    contacted: { label: 'Contacted', color: '#f59e0b', bg: '#fffbeb' },
    qualified: { label: 'Qualified', color: '#10b981', bg: '#f0fdf4' },
    converted: { label: 'Converted', color: '#06b6d4', bg: '#ecfeff' },
    rejected:  { label: 'Rejected',  color: '#ef4444', bg: '#fef2f2' },
  }
  const c = cfg[status] || cfg.new
  return (
    <span style={{
      background: c.bg, color: c.color,
      padding: '2px 10px', borderRadius: 20,
      fontSize: '0.72rem', fontWeight: 600
    }}>{c.label}</span>
  )
}

export default function SocialLeadsPage() {
  // ── State ──────────────────────────────────────────────────────
  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [scrapeProgress, setScrapeProgress] = useState([])
  const [jobId, setJobId] = useState(null)
  const [keywordPresets, setKeywordPresets] = useState({})
  const [selectedLead, setSelectedLead] = useState(null)
  const [activeTab, setActiveTab] = useState('search')

  // Search / filter state
  const [keyword, setKeyword] = useState('')
  const [customKeyword, setCustomKeyword] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('')
  const [platforms, setPlatforms] = useState(['linkedin', 'twitter', 'indiamart', 'justdial'])
  const [city, setCity] = useState('India')
  const [maxPerPlatform, setMaxPerPlatform] = useState(20)

  // Filter state
  const [filterPlatform, setFilterPlatform] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterScore, setFilterScore] = useState('')
  const [filterService, setFilterService] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const sseRef = useRef(null)

  // ── Load keyword presets ──────────────────────────────────────
  useEffect(() => {
    fetch('/api/social-leads/keywords')
      .then(r => r.json())
      .then(d => setKeywordPresets(d.presets || {}))
      .catch(() => {})
    fetchLeads()
  }, [])

  useEffect(() => { fetchLeads() }, [page, filterPlatform, filterStatus, filterScore, filterService, search])

  // ── Fetch leads from DB ──────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 50 })
      if (filterPlatform) params.set('platform', filterPlatform)
      if (filterStatus)   params.set('status', filterStatus)
      if (filterScore)    params.set('score', filterScore)
      if (filterService)  params.set('serviceCategory', filterService)
      if (search)         params.set('search', search)

      const r = await fetch(`/api/social-leads?${params}`)
      const d = await r.json()
      setLeads(d.leads || [])
      setTotal(d.total || 0)
      setStats(d.stats || [])
    } catch (e) {
      toast.error('Failed to load leads')
    }
    setLoading(false)
  }, [page, filterPlatform, filterStatus, filterScore, filterService, search])

  // ── Start scraping ───────────────────────────────────────────
  const startScrape = async () => {
    const kw = customKeyword.trim() || keyword
    if (!kw) { toast.error('Please enter or select a keyword'); return }
    if (platforms.length === 0) { toast.error('Select at least one platform'); return }

    setScraping(true)
    setScrapeProgress([])
    setActiveTab('results')

    try {
      // Connect SSE first
      if (sseRef.current) sseRef.current.close()
      const sse = new EventSource('/api/social-leads/progress')
      sseRef.current = sse

      sse.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'progress') {
            setScrapeProgress(prev => [...prev, `${data.platform}: Found ${data.name}`].slice(-50))
          }
          if (data.type === 'done') {
            setScraping(false)
            toast.success(`✅ Found ${data.total} leads, saved ${data.saved} new ones!`)
            fetchLeads()
            sse.close()
          }
          if (data.type === 'error') {
            setScraping(false)
            toast.error('Scraping error: ' + data.error)
            sse.close()
          }
        } catch (e) {}
      }

      const r = await fetch('/api/social-leads/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, platforms, city, maxPerPlatform })
      })
      const d = await r.json()
      setJobId(d.jobId)
    } catch (e) {
      setScraping(false)
      toast.error('Failed to start scraping: ' + e.message)
    }
  }

  // ── Platform toggle ──────────────────────────────────────────
  const togglePlatform = (p) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  // ── Add to CRM ───────────────────────────────────────────────
  const addToCRM = async (lead) => {
    try {
      const r = await fetch(`/api/social-leads/${lead._id}/add-to-crm`, { method: 'POST' })
      const d = await r.json()
      if (d.success) {
        toast.success(`✅ ${lead.name} added to CRM!`)
        fetchLeads()
        setSelectedLead(null)
      } else {
        toast.error(d.error || 'Failed to add to CRM')
      }
    } catch (e) {
      toast.error('Error: ' + e.message)
    }
  }

  // ── Update lead status ────────────────────────────────────────
  const updateStatus = async (id, status) => {
    try {
      await fetch(`/api/social-leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      fetchLeads()
      if (selectedLead?._id === id) setSelectedLead(prev => ({ ...prev, status }))
    } catch (e) {}
  }

  // ── Delete lead ───────────────────────────────────────────────
  const deleteLead = async (id) => {
    if (!confirm('Delete this lead?')) return
    try {
      await fetch(`/api/social-leads/${id}`, { method: 'DELETE' })
      toast.success('Lead deleted')
      fetchLeads()
      setSelectedLead(null)
    } catch (e) {}
  }

  // ── Export CSV ────────────────────────────────────────────────
  const exportCSV = () => {
    window.open('/api/social-leads/export-csv', '_blank')
  }

  // ── Preset keyword selection ──────────────────────────────────
  const handlePresetSelect = (presetName) => {
    setSelectedPreset(presetName)
    const keywords = keywordPresets[presetName]
    if (keywords && keywords.length > 0) {
      setKeyword(keywords[0])
      setCustomKeyword('')
    }
  }

  const totalByPlatform = Object.fromEntries(stats.map(s => [s._id, s.count]))
  const uniqueServices = [...new Set(leads.map(l => l.serviceCategory).filter(Boolean))]

  return (
    <div className="social-leads-page" style={{ padding: '1.5rem', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.75rem' }}>🎯</span>
            Social Media Lead Intelligence
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Find businesses on LinkedIn, Twitter, IndiaMART & JustDial interested in Innvoque's IT services
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} id="social-export-csv-btn">
            📤 Export CSV
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setActiveTab('search')}
            id="social-new-search-btn"
          >
            🔍 New Search
          </button>
        </div>
      </div>

      {/* ── Stats Cards ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent)' }}>{total}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>Total Leads</div>
        </div>
        {Object.entries(PLATFORMS).map(([key, p]) => (
          <div key={key} className="stat-card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: p.color }}>{totalByPlatform[key] || 0}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{p.icon} {p.label}</div>
          </div>
        ))}
        <div className="stat-card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>
            {leads.filter(l => l.addedToCRM).length}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>Added to CRM</div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '2px solid var(--border-card)', paddingBottom: 0 }}>
        {[
          { id: 'search', label: '🔍 Search' },
          { id: 'results', label: `📋 Results (${total})` },
        ].map(tab => (
          <button
            key={tab.id}
            id={`social-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 20px', fontSize: '0.9rem', fontWeight: 600,
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.2s'
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* ──────────────────────────────────────────────────────── */}
      {/* TAB: SEARCH                                            */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'search' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

          {/* Left: Keyword Selection */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>
              🎯 Service Category / Keyword
            </h3>

            {/* Preset buttons */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                Innvoque Service Presets:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.keys(keywordPresets).map(preset => (
                  <button
                    key={preset}
                    onClick={() => handlePresetSelect(preset)}
                    id={`preset-${preset.replace(/[^a-z]/gi, '-').toLowerCase()}`}
                    style={{
                      padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem',
                      fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
                      borderColor: selectedPreset === preset ? 'var(--accent)' : 'var(--border-card)',
                      background: selectedPreset === preset ? 'var(--accent)' : 'transparent',
                      color: selectedPreset === preset ? 'white' : 'var(--text-muted)',
                      transition: 'all 0.2s'
                    }}
                  >{preset}</button>
                ))}
              </div>
            </div>

            {/* Selected preset keywords */}
            {selectedPreset && keywordPresets[selectedPreset] && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                  Select a specific keyword:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {keywordPresets[selectedPreset].map(kw => (
                    <button
                      key={kw}
                      onClick={() => { setKeyword(kw); setCustomKeyword('') }}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem',
                        cursor: 'pointer', border: '1px solid',
                        borderColor: keyword === kw ? 'var(--accent)' : 'var(--border-card)',
                        background: keyword === kw ? 'rgba(99,102,241,0.1)' : 'transparent',
                        color: keyword === kw ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >{kw}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom keyword */}
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
                Or type a custom keyword:
              </div>
              <input
                id="social-custom-keyword"
                value={customKeyword}
                onChange={e => { setCustomKeyword(e.target.value); setKeyword(''); setSelectedPreset('') }}
                placeholder="e.g. need website development, looking for AI automation..."
                className="form-control"
                style={{ width: '100%' }}
              />
            </div>

            {/* Active keyword display */}
            {(keyword || customKeyword) && (
              <div style={{
                marginTop: '0.75rem', padding: '8px 14px',
                background: 'rgba(99,102,241,0.08)', borderRadius: 8,
                border: '1px solid rgba(99,102,241,0.2)',
                fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 600
              }}>
                🔍 Will search for: "{customKeyword || keyword}"
              </div>
            )}

            {/* City filter */}
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
                City / Location:
              </div>
              <select
                id="social-city-select"
                value={city}
                onChange={e => setCity(e.target.value)}
                className="form-control"
                style={{ width: '100%' }}
              >
                {['India','Mumbai','Delhi','Bangalore','Hyderabad','Pune','Chennai','Kolkata','Lucknow','Ahmedabad','Jaipur'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Max results */}
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
                Max results per platform: <strong>{maxPerPlatform}</strong>
              </div>
              <input
                id="social-max-results"
                type="range" min={5} max={50} value={maxPerPlatform}
                onChange={e => setMaxPerPlatform(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
          </div>

          {/* Right: Platform Selection + Start */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>
              🌐 Select Platforms
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {Object.entries(PLATFORMS).map(([key, p]) => (
                <button
                  key={key}
                  id={`platform-toggle-${key}`}
                  onClick={() => togglePlatform(key)}
                  style={{
                    padding: '1rem', borderRadius: 12, cursor: 'pointer',
                    border: `2px solid ${platforms.includes(key) ? p.color : 'var(--border-card)'}`,
                    background: platforms.includes(key) ? p.bg : 'transparent',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ fontSize: '2rem' }}>{p.icon}</span>
                  <span style={{
                    fontSize: '0.82rem', fontWeight: 700,
                    color: platforms.includes(key) ? p.color : 'var(--text-muted)'
                  }}>{p.label}</span>
                  {platforms.includes(key) && (
                    <span style={{ fontSize: '0.7rem', color: p.color }}>✓ Selected</span>
                  )}
                </button>
              ))}
            </div>

            {/* Start button */}
            <button
              id="social-start-scrape-btn"
              onClick={startScrape}
              disabled={scraping || platforms.length === 0 || (!keyword && !customKeyword)}
              className="btn btn-primary"
              style={{ width: '100%', height: 52, fontSize: '1rem', fontWeight: 700, borderRadius: 12 }}
            >
              {scraping ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span className="spinner" style={{ width: 18, height: 18 }} />
                  Scanning platforms...
                </span>
              ) : '🚀 Start Lead Search'}
            </button>

            <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              This will scan all selected platforms and automatically save new leads to your database.
            </p>

            {/* Live progress log */}
            {scraping && scrapeProgress.length > 0 && (
              <div style={{
                marginTop: '1rem', background: 'var(--bg-input)', borderRadius: 8,
                padding: '0.75rem', maxHeight: 200, overflowY: 'auto',
                fontSize: '0.75rem', fontFamily: 'monospace', border: '1px solid var(--border-card)'
              }}>
                {scrapeProgress.map((line, i) => (
                  <div key={i} style={{ color: 'var(--text-muted)', marginBottom: 2 }}>
                    <span style={{ color: '#10b981' }}>▶</span> {line}
                  </div>
                ))}
                <div style={{ color: 'var(--accent)', animation: 'pulse 1s infinite' }}>
                  ● Scanning...
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* TAB: RESULTS                                           */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'results' && (
        <div>
          {/* Filters row */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
            <input
              id="social-filter-search"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="🔍 Search leads..."
              className="form-control"
              style={{ maxWidth: 220 }}
            />
            <select
              id="social-filter-platform"
              value={filterPlatform}
              onChange={e => { setFilterPlatform(e.target.value); setPage(1) }}
              className="form-control"
              style={{ maxWidth: 160 }}
            >
              <option value="">All Platforms</option>
              {Object.entries(PLATFORMS).map(([k, p]) => (
                <option key={k} value={k}>{p.icon} {p.label}</option>
              ))}
            </select>
            <select
              id="social-filter-score"
              value={filterScore}
              onChange={e => { setFilterScore(e.target.value); setPage(1) }}
              className="form-control"
              style={{ maxWidth: 160 }}
            >
              <option value="">All Scores</option>
              <option value="5">🔥 Hot (5)</option>
              <option value="4">⚡ Warm (4+)</option>
              <option value="3">🌱 Medium (3+)</option>
            </select>
            <select
              id="social-filter-status"
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
              className="form-control"
              style={{ maxWidth: 160 }}
            >
              <option value="">All Statuses</option>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="converted">Converted</option>
              <option value="rejected">Rejected</option>
            </select>
            <select
              id="social-filter-service"
              value={filterService}
              onChange={e => { setFilterService(e.target.value); setPage(1) }}
              className="form-control"
              style={{ maxWidth: 200 }}
            >
              <option value="">All Services</option>
              {uniqueServices.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {total} leads found
            </span>
          </div>

          {/* Scraping in-progress bar */}
          {scraping && (
            <div style={{
              background: 'rgba(99,102,241,0.08)', borderRadius: 10,
              border: '1.5px solid rgba(99,102,241,0.3)',
              padding: '0.75rem 1rem', marginBottom: '1rem',
              display: 'flex', alignItems: 'center', gap: 10
            }}>
              <span className="spinner" style={{ width: 16, height: 16, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)' }}>
                  🔍 Scanning social media platforms for leads...
                </div>
                {scrapeProgress.length > 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {scrapeProgress[scrapeProgress.length - 1]}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Leads grid / list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto 1rem' }} />
              Loading leads...
            </div>
          ) : leads.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '4rem 2rem',
              background: 'var(--bg-card)', borderRadius: 16,
              border: '2px dashed var(--border-card)'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
              <h3 style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>No Social Leads Yet</h3>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
                Go to the Search tab, select a keyword and platforms, then click "Start Lead Search" to find potential customers.
              </p>
              <button className="btn btn-primary" onClick={() => setActiveTab('search')} id="social-go-search-btn">
                🔍 Start Searching
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {leads.map(lead => (
                  <div
                    key={lead._id}
                    className="card"
                    id={`social-lead-${lead._id}`}
                    style={{
                      padding: '1rem 1.25rem',
                      cursor: 'pointer',
                      border: selectedLead?._id === lead._id ? '2px solid var(--accent)' : '1px solid var(--border-card)',
                      transition: 'all 0.18s'
                    }}
                    onClick={() => setSelectedLead(selectedLead?._id === lead._id ? null : lead)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                      {/* Avatar */}
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                        background: `${PLATFORMS[lead.platform]?.color || '#6b7280'}20`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.4rem'
                      }}>
                        {PLATFORMS[lead.platform]?.icon || '🌐'}
                      </div>

                      {/* Main info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <strong style={{ fontSize: '0.95rem' }}>{lead.name || 'Unknown'}</strong>
                          {lead.company && lead.company !== lead.name && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@ {lead.company}</span>
                          )}
                          <PlatformBadge platform={lead.platform} />
                          <ScoreBadge score={lead.score} />
                          <StatusBadge status={lead.status} />
                          {lead.addedToCRM && (
                            <span style={{
                              fontSize: '0.72rem', background: '#f0fdf4',
                              color: '#16a34a', padding: '2px 8px', borderRadius: 20, fontWeight: 600
                            }}>✅ In CRM</span>
                          )}
                        </div>
                        {lead.title && (
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 3 }}>
                            💼 {lead.title}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {lead.location && <span>📍 {lead.location}</span>}
                          {lead.phone && <span>📞 {lead.phone}</span>}
                          {lead.contactEmail && <span>✉️ {lead.contactEmail}</span>}
                          {lead.serviceCategory && (
                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>🔧 {lead.serviceCategory}</span>
                          )}
                          {lead.intentKeyword && (
                            <span>🔍 {lead.intentKeyword}</span>
                          )}
                        </div>
                        {lead.intentText && (
                          <div style={{
                            marginTop: 6, fontSize: '0.78rem', color: 'var(--text-muted)',
                            background: 'var(--bg-input)', borderRadius: 6, padding: '6px 10px',
                            borderLeft: `3px solid ${PLATFORMS[lead.platform]?.color || '#6b7280'}`
                          }}>
                            "{lead.intentText.substring(0, 180)}{lead.intentText.length > 180 ? '...' : ''}"
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {lead.profileUrl && (
                          <a
                            href={lead.profileUrl}
                            target="_blank" rel="noopener noreferrer"
                            id={`social-lead-open-${lead._id}`}
                            onClick={e => e.stopPropagation()}
                            style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--bg-input)',
                              fontSize: '0.78rem', textDecoration: 'none', color: 'var(--text-muted)',
                              border: '1px solid var(--border-card)' }}
                          >
                            🔗 View
                          </a>
                        )}
                        {!lead.addedToCRM ? (
                          <button
                            id={`social-lead-add-crm-${lead._id}`}
                            onClick={e => { e.stopPropagation(); addToCRM(lead) }}
                            className="btn btn-primary btn-sm"
                            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                          >
                            + CRM
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#16a34a', padding: '6px 8px' }}>✅ CRM</span>
                        )}
                        <button
                          id={`social-lead-delete-${lead._id}`}
                          onClick={e => { e.stopPropagation(); deleteLead(lead._id) }}
                          style={{ padding: '6px 10px', borderRadius: 8, background: 'transparent',
                            border: '1px solid var(--border-card)', cursor: 'pointer', color: '#ef4444',
                            fontSize: '0.78rem' }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail panel */}
                    {selectedLead?._id === lead._id && (
                      <div style={{
                        marginTop: '1rem', paddingTop: '1rem',
                        borderTop: '1px solid var(--border-card)'
                      }}>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>Update Status:</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {['new','reviewed','contacted','qualified','converted','rejected'].map(s => (
                                <button
                                  key={s}
                                  id={`social-status-${lead._id}-${s}`}
                                  onClick={e => { e.stopPropagation(); updateStatus(lead._id, s) }}
                                  style={{
                                    padding: '3px 10px', borderRadius: 20,
                                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                    background: lead.status === s ? 'var(--accent)' : 'var(--bg-input)',
                                    color: lead.status === s ? 'white' : 'var(--text-muted)',
                                    border: '1px solid var(--border-card)'
                                  }}
                                >{s}</button>
                              ))}
                            </div>
                          </div>
                          {lead.website && (
                            <a href={lead.website} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>
                              🌐 Website
                            </a>
                          )}
                          <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Found: {new Date(lead.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {total > 50 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '1.5rem' }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="btn btn-ghost btn-sm"
                    id="social-prev-page"
                  >← Prev</button>
                  <span style={{ padding: '6px 12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Page {page} of {Math.ceil(total / 50)}
                  </span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= Math.ceil(total / 50)}
                    className="btn btn-ghost btn-sm"
                    id="social-next-page"
                  >Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
