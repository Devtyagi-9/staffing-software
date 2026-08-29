import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';

const PAYMENT_TERMS_OPTIONS = [7, 14, 30, 45, 60, 90];

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-AU');
}

const emptyForm = {
  name: '', billing_email: '', billing_phone: '', billing_address: '',
  abn: '', payment_terms_days: 30,
};

export const PayerManagement: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'coordinator';

  const [payers, setPayers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/payers');
      setPayers(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const created = await apiRequest('/payers', { method: 'POST', body: JSON.stringify(form) });
      await load();
      setSelected(created);
      setShowForm(false);
      setForm({ ...emptyForm });
      flash('Payer created successfully!');
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true); setError('');
    try {
      const updated = await apiRequest(`/payers/${selected.id}`, { method: 'PUT', body: JSON.stringify(selected) });
      await load();
      setSelected(updated);
      setEditMode(false);
      flash('Payer updated!');
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete payer "${selected.name}"? This cannot be undone.`)) return;
    setSaving(true); setError('');
    try {
      await apiRequest(`/payers/${selected.id}`, { method: 'DELETE' });
      await load();
      setSelected(null);
      setEditMode(false);
      flash('Payer deleted.');
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const filtered = payers.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const F = (label: string, key: string, type = 'text', opts?: any) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</label>
      <input
        type={type}
        value={form[key] ?? ''}
        onChange={e => setForm((f: any) => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        style={{ width: '100%' }}
        {...opts}
      />
    </div>
  );

  const EF = (label: string, key: string, type = 'text') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</label>
      <input
        type={type}
        value={selected?.[key] ?? ''}
        onChange={e => setSelected((s: any) => ({ ...s, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        style={{ width: '100%' }}
        disabled={!editMode}
      />
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 20, height: '100%', minHeight: 600 }}>
      {/* ── Left Panel: Payer List ── */}
      <div style={{
        width: 320, flexShrink: 0,
        background: 'var(--bg-card)', borderRadius: 14,
        border: '1.5px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1.5px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🏢 Payers</h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{payers.length} total</div>
            </div>
            {isAdmin && (
              <button
                id="add-payer-btn"
                className="btn-primary"
                style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => { setShowForm(true); setSelected(null); setEditMode(false); setError(''); }}
              >
                + Add Payer
              </button>
            )}
          </div>
          <input
            placeholder="Search payers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No payers found.</div>
          ) : filtered.map(p => {
            const active = selected?.id === p.id;
            return (
              <div
                key={p.id}
                onClick={() => { setSelected(p); setShowForm(false); setEditMode(false); setError(''); }}
                style={{
                  padding: '14px 20px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f1f4fb',
                  background: active ? 'var(--primary-light)' : 'transparent',
                  borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
                  transition: 'all 0.12s',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: active ? 'var(--primary)' : 'var(--text-main)' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 10 }}>
                  <span>💰 {p.payment_terms_days}d terms</span>
                  <span>👥 {p.clients?.length ?? 0} client(s)</span>
                </div>
                {p.abn && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>ABN: {p.abn}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Success / Error banners */}
        {success && (
          <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: '10px 16px', marginBottom: 14, color: '#065f46', fontWeight: 600, fontSize: 14 }}>
            ✅ {success}
          </div>
        )}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', marginBottom: 14, color: '#991b1b', fontWeight: 600, fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Create Form Modal */}
        {showForm && (
          <div style={{
            background: 'var(--bg-card)', borderRadius: 14,
            border: '1.5px solid var(--border-color)',
            boxShadow: 'var(--shadow-lg)', padding: 28,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>➕ Add New Payer</h3>
              <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 13 }} onClick={() => { setShowForm(false); setError(''); }}>✕ Cancel</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Row 1 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  {F('Organisation Name *', 'name')}
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Payment Terms (Days)</label>
                  <select
                    value={form.payment_terms_days}
                    onChange={e => setForm((f: any) => ({ ...f, payment_terms_days: Number(e.target.value) }))}
                    style={{ width: '100%' }}
                  >
                    {PAYMENT_TERMS_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
                  </select>
                </div>
              </div>
              {/* Row 2 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {F('ABN', 'abn')}
                {F('Billing Email', 'billing_email', 'email')}
              </div>
              {/* Row 3 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {F('Billing Phone', 'billing_phone', 'tel')}
                {F('Billing Address', 'billing_address')}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setError(''); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving || !form.name}>
                  {saving ? 'Creating…' : '✓ Create Payer'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Payer Detail / Edit */}
        {selected && !showForm && (
          <div style={{
            background: 'var(--bg-card)', borderRadius: 14,
            border: '1.5px solid var(--border-color)',
            boxShadow: 'var(--shadow-md)', padding: 28,
            flex: 1,
          }}>
            {/* Detail Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22 }}>{selected.name}</h2>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  {selected.clients?.length ?? 0} linked client(s) · Created {fmt(selected.created_at)}
                </div>
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {editMode ? (
                    <>
                      <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => { setEditMode(false); }}>Cancel</button>
                      <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleUpdate} disabled={saving}>
                        {saving ? 'Saving…' : '💾 Save Changes'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setEditMode(true)}>✏️ Edit</button>
                      <button
                        className="btn-rose"
                        style={{ fontSize: 13, padding: '7px 14px', opacity: (selected.clients?.length ?? 0) > 0 ? 0.5 : 1 }}
                        onClick={handleDelete}
                        disabled={saving}
                        title={(selected.clients?.length ?? 0) > 0 ? 'Cannot delete: has linked clients' : ''}
                      >
                        🗑 Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Organisation Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Organisation Name</label>
                <input
                  value={selected.name ?? ''}
                  onChange={e => setSelected((s: any) => ({ ...s, name: e.target.value }))}
                  disabled={!editMode}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Payment Terms */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Payment Terms (Days)</label>
                {editMode ? (
                  <select
                    value={selected.payment_terms_days ?? 30}
                    onChange={e => setSelected((s: any) => ({ ...s, payment_terms_days: Number(e.target.value) }))}
                    style={{ width: '100%' }}
                  >
                    {PAYMENT_TERMS_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
                  </select>
                ) : (
                  <input value={`${selected.payment_terms_days ?? 30} days`} disabled style={{ width: '100%' }} />
                )}
              </div>

              {EF('ABN', 'abn')}
              {EF('Billing Email', 'billing_email', 'email')}
              {EF('Billing Phone', 'billing_phone', 'tel')}
              {EF('Billing Address', 'billing_address')}
            </div>

            {/* Linked Clients */}
            {selected.clients?.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Linked Clients ({selected.clients.length})
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selected.clients.map((c: any) => (
                    <span key={c.id} style={{
                      background: '#eef2ff', color: '#4338ca',
                      borderRadius: 8, padding: '5px 12px',
                      fontSize: 13, fontWeight: 500,
                      border: '1px solid #c7d2fe',
                    }}>{c.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!selected && !showForm && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 12,
            background: 'var(--bg-card)', borderRadius: 14,
            border: '1.5px dashed var(--border-color)',
            color: 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 48 }}>🏢</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Select a payer to view details</div>
            <div style={{ fontSize: 13 }}>or click "+ Add Payer" to create a new one</div>
          </div>
        )}
      </div>
    </div>
  );
};
