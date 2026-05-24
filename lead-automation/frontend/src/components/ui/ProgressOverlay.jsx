import React, { useEffect, useRef, useState } from 'react'

export default function ProgressOverlay({ isOpen, onClose, title, endpoint, onDone }) {
  const [logs, setLogs] = useState([])
  const [count, setCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('running') // running | done | error
  const [summary, setSummary] = useState('')
  const logsEndRef = useRef(null)
  const esRef = useRef(null)

  useEffect(() => {
    if (!isOpen || !endpoint) return
    setLogs([])
    setCount(0)
    setTotal(0)
    setStatus('running')
    setSummary('')

    const token = localStorage.getItem('crm_token')
    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${token}`
    const es = new EventSource(url)
    esRef.current = es

    es.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.current !== undefined) setCount(data.current)
        if (data.total !== undefined) setTotal(data.total)
        if (data.message) {
          setLogs(prev => [...prev, { text: data.message, type: data.type || 'info' }])
        }
      } catch {}
    })

    es.addEventListener('done', (e) => {
      try {
        const data = JSON.parse(e.data)
        setSummary(data.summary || 'Operation completed')
        setStatus('done')
      } catch {
        setStatus('done')
      }
      es.close()
    })

    es.addEventListener('error', () => {
      setStatus('error')
      setLogs(prev => [...prev, { text: 'Connection error', type: 'error' }])
      es.close()
    })

    return () => {
      es.close()
    }
  }, [isOpen, endpoint])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleClose = () => {
    esRef.current?.close()
    if (status === 'done' && onDone) onDone()
    onClose()
  }

  if (!isOpen) return null

  const pct = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0

  return (
    <div className="modal-backdrop" style={{ zIndex: 'var(--z-modal)' }}>
      <div className="sse-progress-box" style={{ maxWidth: 480, width: '100%' }}>
        {/* Icon */}
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
          {status === 'running' && '⚡'}
          {status === 'done' && '✅'}
          {status === 'error' && '❌'}
        </div>

        <div className="sse-progress-title">{title || 'Processing...'}</div>
        <div className="sse-progress-subtitle">
          {status === 'running' ? 'Please wait, do not close this window' :
           status === 'done' ? summary || 'All done!' :
           'An error occurred'}
        </div>

        {/* Counter */}
        {total > 0 && (
          <div className="sse-progress-counter">
            {count}<span style={{ fontSize: '1.5rem', fontWeight: 400, opacity: 0.5 }}>/{total}</span>
          </div>
        )}

        {/* Progress bar */}
        {total > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div className="progress-bar-wrap" style={{ height: 8 }}>
              <div
                className="progress-bar-fill"
                style={{ width: `${pct}%`, transition: 'width 0.3s ease' }}
              />
            </div>
            <div style={{
              textAlign: 'right',
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              marginTop: '4px'
            }}>
              {pct}%
            </div>
          </div>
        )}

        {status === 'running' && total === 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '1rem 0' }}>
            <div className="loading-spinner-lg" />
          </div>
        )}

        {/* Log */}
        {logs.length > 0 && (
          <div className="sse-log">
            {logs.map((log, i) => (
              <div key={i} className={`sse-log-item ${log.type}`}>
                {log.text}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}

        {/* Close button */}
        {status !== 'running' && (
          <button
            className="btn btn-primary"
            onClick={handleClose}
            style={{ marginTop: '1.5rem', width: '100%' }}
          >
            {status === 'done' ? '✓ Done' : '✕ Close'}
          </button>
        )}
      </div>
    </div>
  )
}
