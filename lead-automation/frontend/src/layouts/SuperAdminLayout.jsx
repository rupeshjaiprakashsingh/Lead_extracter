import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const SUPERADMIN_NAV = [
  { to: '/superadmin/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/superadmin/companies', label: 'Companies', icon: '🏢' },
  { to: '/superadmin/plans', label: 'Plans', icon: '💎' },
]

export default function SuperAdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    toast.success('Logged out')
    navigate('/login')
  }

  const getPageTitle = () => {
    const p = location.pathname
    if (p.includes('/companies') && p.split('/').length > 3) return 'Company Detail'
    if (p.includes('/companies')) return 'Companies'
    if (p.includes('/plans')) return 'Plans'
    return 'SuperAdmin Dashboard'
  }

  const initials = user?.username?.slice(0, 2).toUpperCase() || 'SA'

  return (
    <div className="layout">
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'visible' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand" style={{ cursor: 'default' }}>
          <div className="sidebar-brand-icon" style={{
            background: 'linear-gradient(135deg, #ef4444, #dc2626)'
          }}>🛡️</div>
          {!sidebarCollapsed && (
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">LeadFlow</span>
              <span className="sidebar-brand-tagline" style={{ color: '#fca5a5' }}>
                Super Admin
              </span>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Management</span>
          {SUPERADMIN_NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-item-text">{item.label}</span>
            </NavLink>
          ))}

          <span className="nav-section-label">Quick Access</span>
          <NavLink
            to="/dashboard"
            className="nav-item"
          >
            <span className="nav-item-icon">🚀</span>
            <span className="nav-item-text">Company CRM</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user" onClick={handleLogout} title="Logout">
            <div className="sidebar-avatar" style={{
              background: 'linear-gradient(135deg, #ef4444, #dc2626)'
            }}>
              {initials}
            </div>
            {!sidebarCollapsed && (
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user?.username}</div>
                <div className="sidebar-user-role" style={{ color: '#fca5a5' }}>
                  Super Admin
                </div>
              </div>
            )}
            {!sidebarCollapsed && (
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.75rem' }}>↩</span>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className={`layout-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <header className="header" style={{ borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          <button
            className="header-toggle"
            onClick={() => {
              if (window.innerWidth <= 768) {
                setMobileOpen(o => !o)
              } else {
                setSidebarCollapsed(c => !c)
              }
            }}
          >
            ☰
          </button>

          <div style={{ flex: 1 }}>
            <h1 className="header-title">{getPageTitle()}</h1>
            <p style={{ fontSize: '0.75rem', color: '#fca5a5', marginTop: '1px' }}>
              Super Administrator
            </p>
          </div>

          <div className="header-actions">
            <span style={{
              padding: '0.25rem 0.75rem',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.7rem',
              color: '#fca5a5',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              Super Admin
            </span>
            <div className="avatar avatar-md" style={{
              background: 'linear-gradient(135deg, #ef4444, #dc2626)'
            }}>
              {initials}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              ↩ Logout
            </button>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
