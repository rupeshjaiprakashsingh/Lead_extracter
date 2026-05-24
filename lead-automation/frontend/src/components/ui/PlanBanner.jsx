import React from 'react'

export default function PlanBanner({ used, limit, planName, onUpgrade }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  if (pct < 70) return null

  const isDanger = pct >= 90
  const isWarning = pct >= 70 && pct < 90

  return (
    <div style={{
      background: isDanger
        ? 'rgba(239,68,68,0.1)'
        : 'rgba(245,158,11,0.1)',
      border: `1px solid ${isDanger ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-4) var(--space-5)',
      marginBottom: 'var(--space-5)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4)',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '1.25rem' }}>
        {isDanger ? '🚨' : '⚠️'}
      </span>
      <div style={{ flex: 1 }}>
        <p style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: isDanger ? '#fca5a5' : '#fcd34d',
          marginBottom: '2px',
        }}>
          {isDanger
            ? `You've used ${pct}% of your ${planName} plan limit`
            : `Approaching lead limit (${pct}% used)`}
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {used} of {limit} leads used
        </p>
      </div>
      <div style={{ flex: 1, maxWidth: 200 }}>
        <div className="progress-bar-wrap">
          <div
            className={`progress-bar-fill ${isDanger ? 'danger' : 'warning'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {onUpgrade && (
        <button className="btn btn-primary btn-sm" onClick={onUpgrade}>
          Upgrade Plan
        </button>
      )}
    </div>
  )
}
