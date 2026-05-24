import React from 'react'

const TREND_ICONS = {
  up: '↑',
  down: '↓',
  neutral: '→',
}

export default function StatsCard({
  title,
  value,
  subtitle,
  icon,
  iconClass = 'icon-box-primary',
  trend,
  trendLabel,
  color,
  onClick,
}) {
  const trendIsPositive = trend === 'up'
  const trendIsNegative = trend === 'down'

  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        padding: 'var(--space-5)',
        cursor: onClick ? 'pointer' : 'default',
        background: 'var(--bg-card)',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        if (onClick) e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.borderColor = 'var(--border-color-hover)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = 'var(--border-card)'
      }}
    >
      {/* Subtle gradient accent */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '2px',
        background: color || 'var(--gradient-primary)',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            marginBottom: '0.5rem',
          }}>
            {title}
          </p>
          <p style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1,
            marginBottom: subtitle ? '0.375rem' : 0,
          }}>
            {value}
          </p>
          {subtitle && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          )}
          {trend && trendLabel && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              marginTop: '0.5rem',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.7rem',
              fontWeight: 700,
              background: trendIsPositive
                ? 'rgba(16,185,129,0.15)'
                : trendIsNegative
                ? 'rgba(239,68,68,0.15)'
                : 'rgba(100,116,139,0.15)',
              color: trendIsPositive
                ? '#6ee7b7'
                : trendIsNegative
                ? '#fca5a5'
                : 'var(--text-muted)',
            }}>
              {TREND_ICONS[trend]} {trendLabel}
            </div>
          )}
        </div>
        {icon && (
          <div className={`icon-box ${iconClass}`} style={{ flexShrink: 0 }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
