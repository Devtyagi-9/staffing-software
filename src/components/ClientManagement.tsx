import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';

const GENDER_OPTIONS = [
  { value: '', label: '— Not specified —' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const TIMEZONE_OPTIONS = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Darwin',
  'Australia/Hobart',
];

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-AU');
}

const emptyForm = {
  payer_id: '', name: '', preferred_name: '', address_line: '',
  lat: '', lng: '', timezone: 'Australia/Sydney',
  phone: '', gender: '', date_of_birth: '',
  next_of_kin_name: '', next_of_kin_phone: '', next_of_kin_relation: '',
  funding_type_id: '', notes: '',
};

type DetailTab = 'profile' | 'kin' | 'funding' | 'notes';

export const ClientManagement: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'coordinator';

  const [clients, setClients] = useState<any[]>([]);
  const [payers, setPayers] = useState<any[]>([]);
  const [fundingTypes, setFundingTypes] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('profile');
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [filterPayer, setFilterPayer] = useState('');
  const [newFtName, setNewFtName] = useState('');
  const [addingFt, setAddingFt] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cl, py, ft] = await Promise.all([
        apiRequest('/clients'),
        apiRequest('/payers'),
        apiRequest('/clients/funding-types'),
      ]);
      setClients(cl);
      setPayers(py);
      setFundingTypes(ft);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        lat: form.lat !== '' ? Number(form.lat) : 0,
        lng: form.lng !== '' ? Number(form.lng) : 0,
      };
      const created = await apiRequest('/clients', { method: 'POST', body: JSON.stringify(payload) });
      await load();
      setSelected(created);
      setShowForm(false);
      setForm({ ...emptyForm });
      flash('Client profile created successfully!');
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!selected) return;
    setSaving(true); setError('');
    try {
      const updated = await apiRequest(`/clients/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...selected,
          lat: Number(selected.lat),
          lng: Number(selected.lng),
        }),
      });
      await load();
      setSelected(updated);
      setEditMode(false);
      flash('Client profile saved!');
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete client "${selected.name}"? This cannot be undone.`)) return;
    setSaving(true); setError('');
    try {
      await apiRequest(`/clients/${selected.id}`, { method: 'DELETE' });
      await load();
      setSelected(null);
      setEditMode(false);
      flash('Client deleted.');
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleAddFundingType = async () => {
    if (!newFtName.trim()) return;
    setAddingFt(true);
    try {
      const ft = await apiRequest('/clients/funding-types', { method: 'POST', body: JSON.stringify({ name: newFtName.trim() }) });
      setFundingTypes(prev => [...prev, ft].sort((a, b) => a.name.localeCompare(b.name)));
      setNewFtName('');
      flash(`Funding type "${ft.name}" added!`);
    } catch (err: any) { setError(err.message); }
    finally { setAddingFt(false); }
  };

  const filtered = clients.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.preferred_name && c.preferred_name.toLowerCase().includes(search.toLowerCase()));
    const matchPayer = !filterPayer || c.payer_id === filterPayer;
    return matchSearch && matchPayer;
  });

  // Shared field renderer for create form
  const F = (label: string, key: string, type = 'text', required = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}{required ? ' *' : ''}</label>
      <input
        type={type}
        required={required}
        value={form[key] ?? ''}
        onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%' }}
      />
    </div>
  );

  // Shared field renderer for detail/edit panel
  const EF = (label: string, key: string, type = 'text') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</label>
      <input
        type={type}
        value={selected?.[key] ?? ''}
        onChange={e => setSelected((s: any) => ({ ...s, [key]: e.target.value }))}
        disabled={!editMode}
        style={{ width: '100%' }}
      />
    </div>
  );

  const DETAIL_TABS: { id: DetailTab; label: string }[] = [
    { id: 'profile', label: '👤 Profile' },
    { id: 'kin', label: '👨‍👩‍👧 Next of Kin' },
    { id: 'funding', label: '💰 Funding' },
    { id: 'notes', label: '📝 Notes' },
  ];

  return (
    <div style={{ display: 'flex', gap: 20, height: '100%', minHeight: 600 }}>

      {/* ── Left: Client List ── */}
      <div style={{
        width: 320, flexShrink: 0,
        background: 'var(--bg-card)', borderRadius: 14,
        border: '1.5px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1.5px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🧑‍🤝‍🧑 Clients</h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{clients.length} total</div>
            </div>
            {isAdmin && (
              <button
                id="add-client-btn"
                className="btn-primary"
                style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => { setShowForm(true); setSelected(null); setEditMode(false); setError(''); }}
              >
                + Add Client
              </button>
            )}
          </div>
          <input
            placeholder="Search clients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', marginBottom: 8 }}
          />
          <select
            value={filterPayer}
            onChange={e => setFilterPayer(e.target.value)}
            style={{ width: '100%', fontSize: 13 }}
          >
            <option value="">All Payers</option>
            {payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No clients found.</div>
          ) : filtered.map(c => {
            const active = selected?.id === c.id;
            return (
              <div
                key={c.id}
                onClick={() => { setSelected(c); setShowForm(false); setEditMode(false); setDetTab('profile'); setError(''); }}
                style={{
                  padding: '13px 20px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f1f4fb',
                  background: active ? 'var(--primary-light)' : 'transparent',
                  borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
                  transition: 'all 0.12s',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: active ? 'var(--primary)' : 'var(--text-main)' }}>
                  {c.name}
                  {c.preferred_name && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>"{c.preferred_name}"</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 8 }}>
                  <span>🏢 {c.payer?.name || '—'}</span>
                  {c.funding_type && <span>· {c.funding_type.name}</span>}
                </div>
                {c.phone && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>📞 {c.phone}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Banners */}
        {success && (
          <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: '10px 16px', color: '#065f46', fontWeight: 600, fontSize: 14 }}>
            ✅ {success}
          </div>
        )}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', color: '#991b1b', fontWeight: 600, fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Create Form ── */}
        {showForm && (
          <div style={{
            background: 'var(--bg-card)', borderRadius: 14,
            border: '1.5px solid var(--border-color)',
            boxShadow: 'var(--shadow-lg)', padding: 28,
            overflowY: 'auto', maxHeight: 'calc(100vh - 180px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>➕ Add New Client Profile</h3>
              <button className="btn-secondary" onClick={() => { setShowForm(false); setError(''); }}>✕ Cancel</button>
            </div>
            <form onSubmit={handleCreate}>
              {/* SECTION: Basic Info */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14, paddingBottom: 6, borderBottom: '1px solid var(--border-color)' }}>
                  Basic Information
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {F('Full Name', 'name', 'text', true)}
                  {F('Preferred Name', 'preferred_name')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Gender</label>
                    <select value={form.gender} onChange={e => setForm((f: any) => ({ ...f, gender: e.target.value }))} style={{ width: '100%' }}>
                      {GENDER_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  </div>
                  {F('Date of Birth', 'date_of_birth', 'date')}
                  {F('Phone Number', 'phone', 'tel')}
                </div>
              </div>

              {/* SECTION: Payer & Funding */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14, paddingBottom: 6, borderBottom: '1px solid var(--border-color)' }}>
                  Payer & Funding
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Payer *</label>
                    <select required value={form.payer_id} onChange={e => setForm((f: any) => ({ ...f, payer_id: e.target.value }))} style={{ width: '100%' }}>
                      <option value="">— Select Payer —</option>
                      {payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Funding Type</label>
                    <select value={form.funding_type_id} onChange={e => setForm((f: any) => ({ ...f, funding_type_id: e.target.value }))} style={{ width: '100%' }}>
                      <option value="">— None —</option>
                      {fundingTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION: Address & Location */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14, paddingBottom: 6, borderBottom: '1px solid var(--border-color)' }}>
                  Address & Location
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 14 }}>
                  {F('Address', 'address_line')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  {F('Latitude', 'lat', 'number')}
                  {F('Longitude', 'lng', 'number')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Timezone</label>
                    <select value={form.timezone} onChange={e => setForm((f: any) => ({ ...f, timezone: e.target.value }))} style={{ width: '100%' }}>
                      {TIMEZONE_OPTIONS.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION: Next of Kin */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14, paddingBottom: 6, borderBottom: '1px solid var(--border-color)' }}>
                  Next of Kin
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  {F('Name', 'next_of_kin_name')}
                  {F('Phone', 'next_of_kin_phone', 'tel')}
                  {F('Relationship', 'next_of_kin_relation')}
                </div>
              </div>

              {/* SECTION: Notes */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14, paddingBottom: 6, borderBottom: '1px solid var(--border-color)' }}>
                  Notes / Worker Preferences
                </div>
                <textarea
                  value={form.notes}
                  onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))}
                  rows={4}
                  placeholder="Any preferences around workers, special requirements, care notes…"
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setError(''); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving || !form.name || !form.payer_id}>
                  {saving ? 'Creating…' : '✓ Create Client Profile'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Detail / Edit Panel ── */}
        {selected && !showForm && (
          <div style={{
            background: 'var(--bg-card)', borderRadius: 14,
            border: '1.5px solid var(--border-color)',
            boxShadow: 'var(--shadow-md)',
            flex: 1, display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Detail Header */}
            <div style={{ padding: '20px 28px', borderBottom: '1.5px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22 }}>
                    {selected.name}
                    {selected.preferred_name && (
                      <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 10 }}>
                        "{selected.preferred_name}"
                      </span>
                    )}
                  </h2>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span>🏢 {selected.payer?.name || '—'}</span>
                    {selected.funding_type && <span>💰 {selected.funding_type.name}</span>}
                    {selected.phone && <span>📞 {selected.phone}</span>}
                    {selected.date_of_birth && <span>🎂 {fmt(selected.date_of_birth)}</span>}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {editMode ? (
                      <>
                        <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setEditMode(false)}>Cancel</button>
                        <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleUpdate} disabled={saving}>
                          {saving ? 'Saving…' : '💾 Save Changes'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setEditMode(true)}>✏️ Edit</button>
                        <button className="btn-rose" style={{ fontSize: 13, padding: '7px 14px' }} onClick={handleDelete} disabled={saving}>
                          🗑 Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Sub-tabs */}
              <div style={{ display: 'flex', gap: 2, marginTop: 14 }}>
                {DETAIL_TABS.map(t => {
                  const active = detailTab === t.id;
                  return (
                    <button key={t.id} onClick={() => setDetTab(t.id)} style={{
                      padding: '7px 14px', fontSize: 13, fontWeight: active ? 700 : 500,
                      background: active ? 'var(--primary-light)' : 'transparent',
                      color: active ? 'var(--primary)' : 'var(--text-muted)',
                      borderRadius: 8, border: active ? '1.5px solid #c7d2fe' : '1.5px solid transparent',
                      transition: 'all 0.12s',
                    }}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, padding: 28, overflowY: 'auto' }}>

              {/* PROFILE TAB */}
              {detailTab === 'profile' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  {EF('Full Name', 'name')}
                  {EF('Preferred Name', 'preferred_name')}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Gender</label>
                    {editMode ? (
                      <select value={selected.gender ?? ''} onChange={e => setSelected((s: any) => ({ ...s, gender: e.target.value }))} style={{ width: '100%' }}>
                        {GENDER_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                      </select>
                    ) : (
                      <input value={GENDER_OPTIONS.find(g => g.value === selected.gender)?.label || '—'} disabled style={{ width: '100%' }} />
                    )}
                  </div>

                  {EF('Date of Birth', 'date_of_birth', 'date')}
                  {EF('Phone', 'phone', 'tel')}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Linked Payer</label>
                    {editMode ? (
                      <select value={selected.payer_id ?? ''} onChange={e => setSelected((s: any) => ({ ...s, payer_id: e.target.value }))} style={{ width: '100%' }}>
                        <option value="">— Select Payer —</option>
                        {payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : (
                      <input value={selected.payer?.name || '—'} disabled style={{ width: '100%' }} />
                    )}
                  </div>

                  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                    {EF('Address', 'address_line')}
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                    {EF('Latitude', 'lat', 'number')}
                    {EF('Longitude', 'lng', 'number')}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Timezone</label>
                      {editMode ? (
                        <select value={selected.timezone ?? 'Australia/Sydney'} onChange={e => setSelected((s: any) => ({ ...s, timezone: e.target.value }))} style={{ width: '100%' }}>
                          {TIMEZONE_OPTIONS.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                      ) : (
                        <input value={selected.timezone || '—'} disabled style={{ width: '100%' }} />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* NEXT OF KIN TAB */}
              {detailTab === 'kin' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                  {EF('Name', 'next_of_kin_name')}
                  {EF('Phone', 'next_of_kin_phone', 'tel')}
                  {EF('Relationship', 'next_of_kin_relation')}
                </div>
              )}

              {/* FUNDING TAB */}
              {detailTab === 'funding' && (
                <div>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Funding Type</label>
                      {editMode ? (
                        <select value={selected.funding_type_id ?? ''} onChange={e => setSelected((s: any) => ({ ...s, funding_type_id: e.target.value || null }))} style={{ maxWidth: 300 }}>
                          <option value="">— None —</option>
                          {fundingTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
                        </select>
                      ) : (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center',
                          background: selected.funding_type ? '#eef2ff' : '#f8fafc',
                          color: selected.funding_type ? '#4338ca' : 'var(--text-muted)',
                          border: selected.funding_type ? '1px solid #c7d2fe' : '1px solid var(--border-color)',
                          borderRadius: 8, padding: '8px 16px',
                          fontWeight: 600, fontSize: 15,
                        }}>
                          {selected.funding_type?.name || '— Not set —'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manage Funding Types */}
                  {isAdmin && (
                    <div style={{ marginTop: 20, padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Manage Funding Types</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        {fundingTypes.map(ft => (
                          <span key={ft.id} style={{
                            background: '#eef2ff', color: '#4338ca',
                            borderRadius: 20, padding: '4px 12px',
                            fontSize: 13, fontWeight: 500,
                            border: '1px solid #c7d2fe',
                          }}>{ft.name}</span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          placeholder="New funding type name…"
                          value={newFtName}
                          onChange={e => setNewFtName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddFundingType())}
                          style={{ flex: 1 }}
                        />
                        <button className="btn-primary" onClick={handleAddFundingType} disabled={addingFt || !newFtName.trim()} style={{ fontSize: 13 }}>
                          {addingFt ? 'Adding…' : '+ Add'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* NOTES TAB */}
              {detailTab === 'notes' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                    Notes / Worker Preferences
                  </label>
                  <textarea
                    value={selected.notes ?? ''}
                    onChange={e => setSelected((s: any) => ({ ...s, notes: e.target.value }))}
                    disabled={!editMode}
                    rows={10}
                    placeholder="Any preferences around workers, special requirements, care notes…"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
              )}
            </div>
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
            <div style={{ fontSize: 48 }}>🧑‍🤝‍🧑</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Select a client to view their profile</div>
            <div style={{ fontSize: 13 }}>or click "+ Add Client" to create a new profile</div>
          </div>
        )}
      </div>
    </div>
  );

  function setDetTab(tab: DetailTab) { setDetailTab(tab); }
};
