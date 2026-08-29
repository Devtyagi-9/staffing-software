import React from 'react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { user, login, logout } = useAuth();

  const handleSwitchRole = (email: string) => {
    login(email, 'Password123!');
  };

  return (
    <header style={{
      background: '#ffffff',
      borderBottom: '1.5px solid var(--border-color)',
      padding: '0 24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
            padding: '6px 12px',
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 16,
            color: 'white',
            letterSpacing: '0.5px',
            fontFamily: 'Outfit, sans-serif',
          }}>
            APEX
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
              {user?.agency_name || 'Apex Staffing Solutions Australia'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span>Multi-Tenant Agency Engine</span>
              <span>•</span>
              <span className="badge badge-open" style={{ fontSize: 10, padding: '1px 6px' }}>
                Currency: {user?.default_currency || 'AUD'}
              </span>
            </div>
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Demo Role Switcher */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-dark)', padding: '5px 12px',
            borderRadius: 8, border: '1.5px solid var(--border-color)',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Demo Role:</span>
            <select
              value={user?.email || ''}
              onChange={(e) => handleSwitchRole(e.target.value)}
              style={{
                padding: '2px 6px', fontSize: 12, border: 'none',
                background: 'transparent', fontWeight: 700, color: 'var(--primary)', cursor: 'pointer',
              }}
            >
              <option value="admin@apexstaffing.com.au">Admin (Full Access)</option>
              <option value="coordinator@apexstaffing.com.au">Coordinator (Roster & Billing)</option>
              <option value="sarah.jenkins@example.com">Worker (Sarah Jenkins - RN Nurse)</option>
              <option value="david.miller@example.com">Worker (David Miller - EN Nurse)</option>
              <option value="payer@healthfirst.com.au">Payer Portal (Read-Only)</option>
            </select>
          </div>

          {/* User chip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--primary-light)', padding: '5px 12px',
            borderRadius: 8, border: '1px solid #c7d2fe',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1, #4338ca)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: 'white',
            }}>
              {(user?.worker_name || user?.email || 'A')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.2 }}>
                {user?.worker_name || user?.email?.split('@')[0]}
              </div>
              <span className={`badge ${user?.role === 'admin' ? 'badge-danger' : user?.role === 'worker' ? 'badge-confirmed' : 'badge-pending'}`}
                style={{ fontSize: 9, padding: '1px 5px' }}>
                {user?.role?.toUpperCase()}
              </span>
            </div>
          </div>

          <button
            id="logout-btn"
            onClick={logout}
            className="btn-secondary"
            style={{ padding: '6px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ⬡ Logout
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <nav style={{ display: 'flex', gap: 2, paddingBottom: 0, overflowX: 'auto' }}>
        {[
          { id: 'roster',              label: '📅 Roster Calendar',        roles: ['admin', 'coordinator'] },
          { id: 'approval-queue',      label: '📋 Requirement Approvals',  roles: ['admin', 'coordinator'] },
          { id: 'worker-portal',       label: '📱 Worker Portal',          roles: ['admin', 'coordinator', 'worker'] },
          { id: 'workers-management',  label: '👥 Workers',                roles: ['admin', 'coordinator'] },
          { id: 'payer-management',    label: '🏢 Payers',                 roles: ['admin', 'coordinator'] },
          { id: 'client-profiles',     label: '🧑‍🤝‍🧑 Clients',                roles: ['admin', 'coordinator'] },
          { id: 'hours-dashboard',     label: '⏱️ Hours & Variance',       roles: ['admin', 'coordinator', 'payer_readonly'] },
          { id: 'billing',             label: '💳 Billing & Invoices',     roles: ['admin', 'coordinator', 'payer_readonly'] },
          { id: 'audit-logs',          label: '🛡️ Audit Logs',            roles: ['admin', 'coordinator'] },
          { id: 'labor-config',        label: '⚙️ Compliance Config',      roles: ['admin'] },
        ]
          .filter((t) => !user || t.roles.includes(user.role))
          .map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'transparent',
                  color: active ? 'var(--primary)' : 'var(--text-muted)',
                  padding: '10px 16px',
                  borderRadius: 0,
                  fontWeight: active ? 700 : 500,
                  fontSize: 13,
                  transition: 'all 0.15s ease',
                  borderBottom: active ? '2.5px solid var(--primary)' : '2.5px solid transparent',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#4f46e5'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                {tab.label}
              </button>
            );
          })}
      </nav>
    </header>
  );
};
