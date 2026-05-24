import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const NAV_ITEMS_ALL = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊', exact: true },
  { to: '/dashboard/leads', label: 'Leads', icon: '👥' },
  { to: '/dashboard/followups', label: 'Follow-ups', icon: '🔔' },
  { to: '/dashboard/campaigns', label: 'Campaigns', icon: '🎯' },
  { to: '/dashboard/schedule', label: 'Scheduler', icon: '⏰' },
  { to: '/dashboard/social', label: 'Social Poster', icon: '📱' },
]

const ADMIN_ITEMS = [
  { to: '/dashboard/users', label: 'Users', icon: '👤' },
  { to: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
]

export default function DashboardLayout() {
  const { user, logout, companyName, isSuperAdmin, isCompanyAdmin, planName, planLeadsLimit, totalLeads } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    toast.success('Logged out successfully')
    navigate('/login')
  }

  const usagePct = planLeadsLimit > 0 ? Math.min(100, Math.round((totalLeads / planLeadsLimit) * 100)) : 0
  const usageColor = usagePct >= 90 ? 'danger' : usagePct >= 70 ? 'warning' : ''

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || 'U'

  const getPageTitle = () => {
    const p = location.pathname
    if (p === '/dashboard') return 'Dashboard'
    if (p.includes('/leads')) return 'Leads'
    if (p.includes('/followups')) return 'Follow-ups'
    if (p.includes('/campaigns')) return 'Campaigns'
    if (p.includes('/schedule')) return 'Scheduler'
    if (p.includes('/social')) return 'Social Poster'
    if (p.includes('/users')) return 'Team'
    if (p.includes('/settings')) return 'Settings'
    return 'Dashboard'
  }

  return (
    <div className="layout">
      {/* Mobile backdrop */}
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'visible' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand" style={{ cursor: 'default' }}>
          <div className="sidebar-brand-icon">🚀</div>
          {!sidebarCollapsed && (
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">LeadFlow</span>
              <span className="sidebar-brand-tagline">CRM Platform</span>
            </div>
          )}
        </div>

        {/* Plan usage */}
        {!sidebarCollapsed && (
          <div className="plan-usage">
            <div className="plan-usage-header">
              <span className="plan-usage-label">{planName} plan</span>
              <span className="plan-usage-value">{totalLeads}/{planLeadsLimit}</span>
            </div>
            <div className="progress-bar-wrap">
              <div
                className={`progress-bar-fill ${usageColor}`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="sidebar-nav">
          <span className="nav-section-label">Main</span>
          {NAV_ITEMS_ALL.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-item-text">{item.label}</span>
            </NavLink>
          ))}

          {(isCompanyAdmin || isSuperAdmin) && (
            <>
              <span className="nav-section-label">Admin</span>
              {ADMIN_ITEMS.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                >
                  <span className="nav-item-icon">{item.icon}</span>
                  <span className="nav-item-text">{item.label}</span>
                </NavLink>
              ))}
            </>
          )}

          {isSuperAdmin && (
            <>
              <span className="nav-section-label">SuperAdmin</span>
              <NavLink
                to="/superadmin/dashboard"
                className="nav-item"
              >
                <span className="nav-item-icon">🛡️</span>
                <span className="nav-item-text">Admin Panel</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Footer user info */}
        <div className="sidebar-footer">
          <div className="sidebar-user" onClick={handleLogout} title="Click to logout">
            <div className="sidebar-avatar">{initials}</div>
            {!sidebarCollapsed && (
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user?.username || user?.email}</div>
                <div className="sidebar-user-role">{user?.role?.replace('_', ' ')}</div>
              </div>
            )}
            {!sidebarCollapsed && (
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                ↩
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className={`layout-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Header */}
        <header className="header">
          <button
            className="header-toggle"
            onClick={() => {
              if (window.innerWidth <= 768) {
                setMobileOpen(o => !o)
              } else {
                setSidebarCollapsed(c => !c)
              }
            }}
            title="Toggle sidebar"
          >
            ☰
          </button>

          <div style={{ flex: 1 }}>
            <h1 className="header-title">{getPageTitle()}</h1>
          </div>

          <div className="header-actions">
            {companyName && (
              <span className="header-company" title={companyName}>
                🏢 {companyName}
              </span>
            )}
            <div className="avatar avatar-md" title={user?.username}>
              {initials}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              ↩ Logout
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
