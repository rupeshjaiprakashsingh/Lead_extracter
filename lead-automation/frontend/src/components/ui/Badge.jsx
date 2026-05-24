import React from 'react'

const VARIANT_MAP = {
  active: 'badge-success',
  inactive: 'badge-secondary',
  pending: 'badge-warning',
  trial: 'badge-purple',
  success: 'badge-success',
  failed: 'badge-danger',
  sent: 'badge-success',
  not_sent: 'badge-secondary',
  hot: 'badge-danger',
  warm: 'badge-warning',
  cold: 'badge-cyan',
  new: 'badge-primary',
  converted: 'badge-success',
  lost: 'badge-danger',
  superadmin: 'badge-danger',
  company_admin: 'badge-purple',
  employee: 'badge-secondary',
  starter: 'badge-primary',
  business: 'badge-purple',
  agency: 'badge-warning',
  enterprise: 'badge-danger',
}

export default function Badge({ children, variant, className = '' }) {
  const cls = variant
    ? (VARIANT_MAP[variant] || VARIANT_MAP[variant?.toLowerCase()] || 'badge-secondary')
    : 'badge-secondary'

  return (
    <span className={`badge ${cls} ${className}`}>
      {children}
    </span>
  )
}
