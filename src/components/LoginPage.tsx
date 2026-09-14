import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const DEMO_ACCOUNTS = [
  { email: 'admin@apexstaffing.com.au', label: 'Admin — Full Access', icon: '🛡️' },
  { email: 'coordinator@apexstaffing.com.au', label: 'Coordinator — Roster & Billing', icon: '📋' },
  { email: 'sarah.jenkins@example.com', label: 'Worker — Sarah Jenkins (RN Nurse)', icon: '👩‍⚕️' },
  { email: 'david.miller@example.com', label: 'Worker — David Miller (EN Nurse)', icon: '👨‍⚕️' },
  { email: 'payer@healthfirst.com.au', label: 'Payer — HealthFirst (Read-Only)', icon: '💼' },
];

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!password.trim()) { setError('Please enter your password.'); return; }
    setIsLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setError('');
    setIsLoading(true);
    try {
      await login(demoEmail, 'Password123!');
    } catch (err: any) {
      setError(err?.message || 'Demo login failed. Ensure the backend server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-dark)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: '-20%', left: '-10%',
        width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'pulse-glow 6s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', right: '-10%',
        width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'pulse-glow 8s ease-in-out infinite reverse',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 980, display: 'flex', gap: 40, alignItems: 'flex-start', zIndex: 1 }}>

        {/* Left Branding */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/unity-help-logo.jpg" alt="Unity Help" style={{
              height: 64,
              borderRadius: 12,
              boxShadow: '0 8px 30px rgba(99,102,241,0.15)',
            }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
                Unity Help
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                Aged Care & NDIS Support
              </div>
            </div>
          </div>

          <div>
            <h1 style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: 36,
              fontWeight: 800,
              lineHeight: 1.2,
              color: 'var(--text-main)',
              marginBottom: 12,
            }}>
              Intelligent<br />
              <span style={{
                background: 'linear-gradient(135deg, #6366f1, #34d399)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>Staffing Management</span>
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 420 }}>
              Multi-tenant roster scheduling, compliance tracking, billing automation, and real-time workforce insights — all in one platform.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {['📅 Roster Calendar', '📋 Shift Approvals', '⏱️ Hours Tracking', '💳 Auto Billing', '🛡️ Audit Logs'].map(f => (
              <span key={f} className="badge badge-open" style={{ fontSize: 12, padding: '5px 12px' }}>{f}</span>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              ⚡ Quick Demo Access
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => handleDemoLogin(acc.email)}
                  disabled={isLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: '#ffffff',
                    border: '1.5px solid var(--border-color)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'left',
                    opacity: isLoading ? 0.6 : 1,
                    width: '100%',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  onMouseEnter={e => {
                    if (!isLoading) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1';
                      (e.currentTarget as HTMLButtonElement).style.background = '#f5f7ff';
                    }
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-color)';
                    (e.currentTarget as HTMLButtonElement).style.background = '#ffffff';
                  }}
                >
                  <span style={{ fontSize: 18 }}>{acc.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>{acc.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{acc.email}</div>
                  </div>
                  <span style={{ color: '#6366f1', fontSize: 16 }}>→</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Login Form */}
        <div style={{ width: 390, flexShrink: 0 }}>
          <div style={{
            background: '#ffffff',
            border: '1.5px solid var(--border-color)',
            borderRadius: 20,
            padding: 36,
            boxShadow: 'var(--shadow-lg)',
          }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
              Sign in to your account
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>
              Enter your credentials to access the platform
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: 6 }}>
                  Email Address
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@unityhelp.com.au"
                  autoComplete="email"
                  style={{ width: '100%', fontSize: 14 }}
                  disabled={isLoading}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    autoComplete="current-password"
                    style={{ width: '100%', fontSize: 14, paddingRight: 44 }}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: 16, padding: 0,
                    }}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 13,
                  color: '#f87171',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <span>⚠️</span> {error}
                </div>
              )}

              <button
                id="login-submit"
                type="submit"
                disabled={isLoading}
                className="btn-primary"
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  fontSize: 15,
                  fontWeight: 700,
                  marginTop: 4,
                  opacity: isLoading ? 0.7 : 1,
                }}
              >
                {isLoading ? '⏳ Signing in…' : '🔐 Sign In'}
              </button>
            </form>

            <div style={{ marginTop: 24, padding: '14px 16px', background: '#f8fafc', borderRadius: 10, border: '1.5px solid var(--border-color)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Default Demo Password
              </div>
              <code style={{ fontSize: 13, color: '#4f46e5', fontFamily: 'monospace', background: '#eef2ff', padding: '2px 8px', borderRadius: 4 }}>
                Password123!
              </code>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
};
