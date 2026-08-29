import React, { useEffect, useState, useRef } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const GENDER_OPTIONS = ['male', 'female', 'non_binary', 'prefer_not_to_say'];
const DOC_TYPES = ['certificate', 'compliance', 'identity', 'police_check', 'wwcc', 'visa', 'other'];
const SEVERITY_COLORS: Record<string, string> = {
  low: '#059669', medium: '#d97706', high: '#dc2626', critical: '#7c3aed',
};

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-AU');
}
function expirySoon(dateStr: string | null | undefined) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 60;
}
function expired(dateStr: string | null | undefined) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export const WorkerManagement: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'coordinator';

  const [workers, setWorkers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'availability' | 'documents' | 'incidents' | 'engagement' | 'admin'>('profile');
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Document upload state
  const [docUploading, setDocUploading] = useState(false);
  const [docForm, setDocForm] = useState({ name: '', doc_type: 'other', expiry_date: '' });
  const [docFile, setDocFile] = useState<File | null>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const [workerDocs, setWorkerDocs] = useState<any[]>([]);

  // Incident state
  const [incUploading, setIncUploading] = useState(false);
  const [incForm, setIncForm] = useState({ title: '', description: '', incident_date: '', severity: 'low' });
  const [incFile, setIncFile] = useState<File | null>(null);
  const incFileRef = useRef<HTMLInputElement>(null);
  const [workerIncs, setWorkerIncs] = useState<any[]>([]);

  // New worker form
  const [form, setForm] = useState<any>({
    name: '', preferred_name: '', email: '', phone: '', address: '',
    date_of_birth: '', gender: '', ethnicity: '', languages: [],
    next_of_kin_name: '', next_of_kin_phone: '', next_of_kin_relation: '',
    role_id: '', case_manager_id: '',
    worker_notes: '', admin_notes: '',
    engagement_start_date: '', engagement_end_date: '', dont_rehire: false, engagement_notes: '',
    wage_rate: '', skill_ids: [],
  });

  // Availability form
  const [availForm, setAvailForm] = useState({
    day_of_week: '1', start_time: '08:00', end_time: '17:00', is_available: true,
  });

  const loadWorkers = async () => {
    setLoading(true);
    try {
      const [ws, rs, sk] = await Promise.all([
        apiRequest('/workers'),
        apiRequest('/workers/roles'),
        apiRequest('/workers/skills/all'),
      ]);
      setWorkers(ws);
      setRoles(rs);
      setSkills(sk);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkerDetail = async (wId: string) => {
    const [w, docs, incs] = await Promise.all([
      apiRequest(`/workers/${wId}`),
      apiRequest(`/workers/${wId}/documents`),
      apiRequest(`/workers/${wId}/incidents`),
    ]);
    setSelectedWorker(w);
    setWorkerDocs(docs);
    setWorkerIncs(incs);
  };

  useEffect(() => { loadWorkers(); }, []);

  // Load staff users for case manager dropdown
  useEffect(() => {
    apiRequest('/auth/users').then(setStaffUsers).catch(() => setStaffUsers([]));
  }, []);

  const flashSuccess = (msg: string) => {
    setSuccess(msg); setTimeout(() => setSuccess(''), 3000);
  };

  /* ── Create Worker ── */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = { ...form, languages: form.languages };
      await apiRequest('/workers', { method: 'POST', body: JSON.stringify(payload) });
      await loadWorkers();
      setShowAddForm(false);
      setForm({
        name: '', preferred_name: '', email: '', phone: '', address: '',
        date_of_birth: '', gender: '', ethnicity: '', languages: [],
        next_of_kin_name: '', next_of_kin_phone: '', next_of_kin_relation: '',
        role_id: '', case_manager_id: '', worker_notes: '', admin_notes: '',
        engagement_start_date: '', engagement_end_date: '', dont_rehire: false, engagement_notes: '',
        wage_rate: '', skill_ids: [],
      });
      flashSuccess('Worker profile created successfully!');
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  /* ── Save Profile Changes ── */
  const handleSaveProfile = async () => {
    if (!selectedWorker) return;
    setSaving(true); setError('');
    try {
      const updated = await apiRequest(`/workers/${selectedWorker.id}/profile`, {
        method: 'PUT',
        body: JSON.stringify({
          ...selectedWorker,
          languages: Array.isArray(selectedWorker.languages) ? selectedWorker.languages : [],
        }),
      });
      setSelectedWorker({ ...selectedWorker, ...updated });
      await loadWorkers();
      flashSuccess('Profile saved!');
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  /* ── Add Availability ── */
  const handleAddAvail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker) return;
    setSaving(true);
    try {
      const avail = await apiRequest(`/workers/${selectedWorker.id}/availabilities`, {
        method: 'POST', body: JSON.stringify({ ...availForm, day_of_week: Number(availForm.day_of_week) }),
      });
      setSelectedWorker((w: any) => ({ ...w, availabilities: [...(w.availabilities || []), avail] }));
      flashSuccess('Availability rule added!');
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDeleteAvail = async (availId: string) => {
    if (!selectedWorker) return;
    await apiRequest(`/workers/${selectedWorker.id}/availabilities/${availId}`, { method: 'DELETE' });
    setSelectedWorker((w: any) => ({ ...w, availabilities: w.availabilities.filter((a: any) => a.id !== availId) }));
  };

  /* ── Upload Document ── */
  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker || !docFile) return;
    setDocUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('name', docForm.name || docFile.name);
      fd.append('doc_type', docForm.doc_type);
      if (docForm.expiry_date) fd.append('expiry_date', docForm.expiry_date);

      const token = localStorage.getItem('staffing_jwt_token');
      const res = await fetch(`/api/workers/${selectedWorker.id}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const doc = await res.json();
      setWorkerDocs((prev) => [doc, ...prev]);
      setDocForm({ name: '', doc_type: 'other', expiry_date: '' });
      setDocFile(null);
      if (docFileRef.current) docFileRef.current.value = '';
      flashSuccess('Document uploaded!');
    } catch (err: any) { setError(err.message); }
    finally { setDocUploading(false); }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedWorker || !window.confirm('Delete this document?')) return;
    await apiRequest(`/workers/${selectedWorker.id}/documents/${docId}`, { method: 'DELETE' });
    setWorkerDocs((prev) => prev.filter((d) => d.id !== docId));
  };

  const downloadDoc = (docId: string, workerID: string) => {
    const token = localStorage.getItem('staffing_jwt_token');
    window.open(`/api/workers/${workerID}/documents/${docId}/download?token=${token}`, '_blank');
  };

  /* ── Upload Incident ── */
  const handleUploadInc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker) return;
    setIncUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('title', incForm.title);
      fd.append('description', incForm.description);
      fd.append('incident_date', incForm.incident_date);
      fd.append('severity', incForm.severity);
      if (incFile) fd.append('file', incFile);

      const token = localStorage.getItem('staffing_jwt_token');
      const res = await fetch(`/api/workers/${selectedWorker.id}/incidents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const inc = await res.json();
      setWorkerIncs((prev) => [inc, ...prev]);
      setIncForm({ title: '', description: '', incident_date: '', severity: 'low' });
      setIncFile(null);
      if (incFileRef.current) incFileRef.current.value = '';
      flashSuccess('Incident report added!');
    } catch (err: any) { setError(err.message); }
    finally { setIncUploading(false); }
  };

  const downloadInc = (incId: string, workerID: string) => {
    const token = localStorage.getItem('staffing_jwt_token');
    window.open(`/api/workers/${workerID}/incidents/${incId}/download?token=${token}`, '_blank');
  };

  const TABS = [
    { id: 'profile', label: '👤 Profile' },
    { id: 'availability', label: '📅 Availability' },
    { id: 'documents', label: `📎 Documents${workerDocs.length ? ` (${workerDocs.length})` : ''}` },
    { id: 'incidents', label: `⚠️ Incidents${workerIncs.length ? ` (${workerIncs.length})` : ''}` },
    { id: 'engagement', label: '📋 Engagement' },
    { id: 'admin', label: '🔒 Admin Notes' },
  ] as const;

  /* ─── render ─── */
  return (
    <div style={{ display: 'flex', gap: 0, height: '100%', fontFamily: 'Inter, sans-serif' }}>

      {/* Left Panel — Worker List */}
      <div style={{
        flex: '0 0 480px', background: '#ffffff', borderRadius: 16,
        border: '1.5px solid var(--border-color)', boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1.5px solid var(--border-color)', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif', margin: 0 }}>
                👥 Worker Profiles
              </h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {workers.length} registered staff members
              </div>
            </div>
            {isAdmin && (
              <button
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700 }}
                onClick={() => { setShowAddForm(!showAddForm); setSelectedWorker(null); }}
              >
                {showAddForm ? '✕ Cancel' : '+ Add Worker'}
              </button>
            )}
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: '#fff5f5', border: '1.5px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 8, fontSize: 13, color: '#16a34a' }}>
            ✓ {success}
          </div>
        )}

        {/* Worker Table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading workers…</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['NAME', 'CONTACT', 'ROLE', 'STATUS', ''].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', borderBottom: '1.5px solid var(--border-color)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr
                    key={w.id}
                    style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background 0.12s', background: selectedWorker?.id === w.id ? '#f0f4ff' : 'transparent' }}
                    onClick={() => { loadWorkerDetail(w.id); setActiveTab('profile'); setShowAddForm(false); }}
                    onMouseEnter={(e) => { if (selectedWorker?.id !== w.id) (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = selectedWorker?.id === w.id ? '#f0f4ff' : 'transparent'; }}
                  >
                    <td style={{ padding: '12px 12px', fontWeight: 700, color: 'var(--text-main)' }}>
                      {w.name}
                      {w.preferred_name && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({w.preferred_name})</div>}
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      <div style={{ color: 'var(--text-main)', fontSize: 12 }}>{w.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w.phone}</div>
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      {w.role ? (
                        <span style={{ background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {w.role.name}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{
                        background: w.status === 'active' ? '#f0fdf4' : '#fff7ed',
                        color: w.status === 'active' ? '#16a34a' : '#ea580c',
                        border: `1px solid ${w.status === 'active' ? '#86efac' : '#fdba74'}`,
                        borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                      }}>
                        {w.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
                        onClick={(e) => { e.stopPropagation(); loadWorkerDetail(w.id); setActiveTab('profile'); setShowAddForm(false); }}
                      >View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right Panel — Detail or Add Form */}
      {(selectedWorker || showAddForm) && (
        <div style={{
          flex: 1, marginLeft: 16, background: '#ffffff',
          borderRadius: 16, border: '1.5px solid var(--border-color)',
          boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', minWidth: 0,
        }}>

          {/* ── ADD WORKER FORM ── */}
          {showAddForm && !selectedWorker && (
            <>
              <div style={{ padding: '20px 28px 16px', borderBottom: '1.5px solid var(--border-color)', background: '#f8fafc' }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif', margin: 0 }}>
                  ➕ New Worker Profile
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Fill in the details below to register a new staff member</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                <form onSubmit={handleCreate}>
                  <Section title="Basic Information">
                    <Grid2>
                      <Field label="Full Name *"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Smith" /></Field>
                      <Field label="Preferred Name"><input value={form.preferred_name} onChange={(e) => setForm({ ...form, preferred_name: e.target.value })} placeholder="Jane" /></Field>
                      <Field label="Email Address *"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" /></Field>
                      <Field label="Phone Number *"><input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+61 400 000 000" /></Field>
                      <Field label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, Sydney NSW" /></Field>
                      <Field label="Date of Birth"><input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></Field>
                      <Field label="Gender">
                        <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                          <option value="">Select…</option>
                          {GENDER_OPTIONS.map((g) => <option key={g} value={g}>{g.replace('_', ' ')}</option>)}
                        </select>
                      </Field>
                      <Field label="Ethnicity"><input value={form.ethnicity} onChange={(e) => setForm({ ...form, ethnicity: e.target.value })} placeholder="e.g. Australian, Indian" /></Field>
                      <Field label="Languages (comma-separated)">
                        <input value={Array.isArray(form.languages) ? form.languages.join(', ') : form.languages}
                          onChange={(e) => setForm({ ...form, languages: e.target.value.split(',').map((l: string) => l.trim()).filter(Boolean) })}
                          placeholder="English, Hindi" />
                      </Field>
                      <Field label="Role">
                        <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                          <option value="">Select role…</option>
                          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </Field>
                    </Grid2>
                    <Field label="Case Manager (linked user)" style={{ marginTop: 14 }}>
                      <select value={form.case_manager_id} onChange={(e) => setForm({ ...form, case_manager_id: e.target.value })}>
                        <option value="">None</option>
                        {staffUsers.map((u: any) => <option key={u.id} value={u.id}>{u.email} ({u.role})</option>)}
                      </select>
                    </Field>
                  </Section>

                  <Section title="Next of Kin">
                    <Grid2>
                      <Field label="Name"><input value={form.next_of_kin_name} onChange={(e) => setForm({ ...form, next_of_kin_name: e.target.value })} placeholder="John Smith" /></Field>
                      <Field label="Phone"><input value={form.next_of_kin_phone} onChange={(e) => setForm({ ...form, next_of_kin_phone: e.target.value })} placeholder="+61 400 111 222" /></Field>
                      <Field label="Relationship"><input value={form.next_of_kin_relation} onChange={(e) => setForm({ ...form, next_of_kin_relation: e.target.value })} placeholder="Spouse, Parent, Sibling" /></Field>
                    </Grid2>
                  </Section>

                  <Section title="Pay & Skills">
                    <Grid2>
                      <Field label="Hourly Rate (AUD) *">
                        <input required type="number" min="0" step="0.01" value={form.wage_rate} onChange={(e) => setForm({ ...form, wage_rate: e.target.value })} placeholder="45.00" />
                      </Field>
                    </Grid2>
                    <Field label="Skills" style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', background: 'var(--bg-input)', border: '1.5px solid var(--border-color)', borderRadius: 8, maxHeight: 120, overflowY: 'auto' }}>
                        {skills.map((s) => (
                          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text-main)', background: form.skill_ids.includes(s.id) ? '#eef2ff' : '#f8fafc', border: `1px solid ${form.skill_ids.includes(s.id) ? '#c7d2fe' : 'var(--border-color)'}`, borderRadius: 6, padding: '4px 10px', transition: 'all 0.12s' }}>
                            <input type="checkbox" checked={form.skill_ids.includes(s.id)}
                              onChange={(e) => setForm({ ...form, skill_ids: e.target.checked ? [...form.skill_ids, s.id] : form.skill_ids.filter((id: string) => id !== s.id) })} />
                            {s.name}
                          </label>
                        ))}
                      </div>
                    </Field>
                  </Section>

                  <Section title="Worker Notes">
                    <Field label="Rostering Notes (visible to rostering team)">
                      <textarea rows={3} value={form.worker_notes} onChange={(e) => setForm({ ...form, worker_notes: e.target.value })} placeholder="Any notes the rostering team should know…" />
                    </Field>
                  </Section>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
                    <button type="submit" className="btn-primary" disabled={saving} style={{ minWidth: 140 }}>
                      {saving ? '⏳ Saving…' : '✓ Create Worker'}
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

          {/* ── WORKER DETAIL PANEL ── */}
          {selectedWorker && (
            <>
              {/* Header */}
              <div style={{ padding: '20px 28px 0', borderBottom: '1.5px solid var(--border-color)', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif', margin: 0 }}>
                      {selectedWorker.name}
                      {selectedWorker.preferred_name && <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>({selectedWorker.preferred_name})</span>}
                    </h3>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
                      {selectedWorker.role?.name ?? 'No role assigned'} · {selectedWorker.email}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {selectedWorker.dont_rehire && (
                      <span style={{ background: '#fff1f2', color: '#be123c', border: '1px solid #fda4af', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                        🚫 Do Not Rehire
                      </span>
                    )}
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setSelectedWorker(null)}>✕</button>
                  </div>
                </div>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, marginBottom: -1 }}>
                  {TABS.map((t) => (
                    <button key={t.id} onClick={() => setActiveTab(t.id as any)} style={{
                      padding: '8px 14px', fontSize: 12, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
                      color: activeTab === t.id ? 'var(--primary)' : 'var(--text-muted)',
                      borderBottom: activeTab === t.id ? '2.5px solid var(--primary)' : '2.5px solid transparent',
                      transition: 'all 0.15s', whiteSpace: 'nowrap',
                    }}>{t.label}</button>
                  ))}
                </div>
              </div>

              {/* Tab Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

                {/* ── PROFILE TAB ── */}
                {activeTab === 'profile' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <Section title="Basic Information">
                      <Grid2>
                        <EditField label="Full Name" value={selectedWorker.name} onChange={(v) => setSelectedWorker({ ...selectedWorker, name: v })} />
                        <EditField label="Preferred Name" value={selectedWorker.preferred_name || ''} onChange={(v) => setSelectedWorker({ ...selectedWorker, preferred_name: v })} />
                        <EditField label="Email" type="email" value={selectedWorker.email} onChange={(v) => setSelectedWorker({ ...selectedWorker, email: v })} />
                        <EditField label="Phone" value={selectedWorker.phone} onChange={(v) => setSelectedWorker({ ...selectedWorker, phone: v })} />
                        <EditField label="Address" value={selectedWorker.address || ''} onChange={(v) => setSelectedWorker({ ...selectedWorker, address: v })} />
                        <EditField label="Date of Birth" type="date" value={selectedWorker.date_of_birth || ''} onChange={(v) => setSelectedWorker({ ...selectedWorker, date_of_birth: v })} />
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Gender</div>
                          <select value={selectedWorker.gender || ''} onChange={(e) => setSelectedWorker({ ...selectedWorker, gender: e.target.value })} style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-input)', border: '1.5px solid var(--border-color)', borderRadius: 8, color: 'var(--text-main)', fontSize: 13 }}>
                            <option value="">Select…</option>
                            {GENDER_OPTIONS.map((g) => <option key={g} value={g}>{g.replace('_', ' ')}</option>)}
                          </select>
                        </div>
                        <EditField label="Ethnicity" value={selectedWorker.ethnicity || ''} onChange={(v) => setSelectedWorker({ ...selectedWorker, ethnicity: v })} />
                        <EditField label="Languages (comma-separated)"
                          value={Array.isArray(selectedWorker.languages) ? selectedWorker.languages.join(', ') : (selectedWorker.languages ? JSON.parse(selectedWorker.languages).join(', ') : '')}
                          onChange={(v) => setSelectedWorker({ ...selectedWorker, languages: v.split(',').map((l: string) => l.trim()).filter(Boolean) })} />
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Role</div>
                          <select value={selectedWorker.role_id || ''} onChange={(e) => setSelectedWorker({ ...selectedWorker, role_id: e.target.value })} style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-input)', border: '1.5px solid var(--border-color)', borderRadius: 8, color: 'var(--text-main)', fontSize: 13 }}>
                            <option value="">No role</option>
                            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Status</div>
                          <select value={selectedWorker.status} onChange={(e) => setSelectedWorker({ ...selectedWorker, status: e.target.value })} style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-input)', border: '1.5px solid var(--border-color)', borderRadius: 8, color: 'var(--text-main)', fontSize: 13 }}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Case Manager</div>
                          <select value={selectedWorker.case_manager_id || ''} onChange={(e) => setSelectedWorker({ ...selectedWorker, case_manager_id: e.target.value })} style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-input)', border: '1.5px solid var(--border-color)', borderRadius: 8, color: 'var(--text-main)', fontSize: 13 }}>
                            <option value="">None</option>
                            {staffUsers.map((u: any) => <option key={u.id} value={u.id}>{u.email} ({u.role})</option>)}
                          </select>
                        </div>
                      </Grid2>
                    </Section>

                    <Section title="Next of Kin">
                      <Grid2>
                        <EditField label="Name" value={selectedWorker.next_of_kin_name || ''} onChange={(v) => setSelectedWorker({ ...selectedWorker, next_of_kin_name: v })} />
                        <EditField label="Phone" value={selectedWorker.next_of_kin_phone || ''} onChange={(v) => setSelectedWorker({ ...selectedWorker, next_of_kin_phone: v })} />
                        <EditField label="Relationship" value={selectedWorker.next_of_kin_relation || ''} onChange={(v) => setSelectedWorker({ ...selectedWorker, next_of_kin_relation: v })} />
                      </Grid2>
                    </Section>

                    <Section title="Wage Rates">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {selectedWorker.wage_rates?.map((wr: any) => (
                          <div key={wr.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0f4ff', border: '1.5px solid #c7d2fe', padding: '10px 14px', borderRadius: 8 }}>
                            <span style={{ fontWeight: 700, color: '#4338ca', fontSize: 15 }}>${wr.amount.toFixed(2)} {wr.currency} / {wr.rate_type}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Since {fmt(wr.effective_from)}{wr.effective_to ? ` → ${fmt(wr.effective_to)}` : ' (current)'}</span>
                          </div>
                        ))}
                      </div>
                    </Section>

                    <Section title="Worker Notes">
                      <Field label="Notes visible to rostering team">
                        <textarea rows={3} value={selectedWorker.worker_notes || ''}
                          onChange={(e) => setSelectedWorker({ ...selectedWorker, worker_notes: e.target.value })}
                          placeholder="Notes visible to the rostering team…" />
                      </Field>
                    </Section>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8 }}>
                      <button className="btn-primary" onClick={handleSaveProfile} disabled={saving} style={{ minWidth: 130 }}>
                        {saving ? '⏳ Saving…' : '💾 Save Profile'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── AVAILABILITY TAB ── */}
                {activeTab === 'availability' && (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                      {(selectedWorker.availabilities || []).length === 0 && (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>No availability rules set.</div>
                      )}
                      {(selectedWorker.availabilities || []).map((a: any) => (
                        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: a.is_available ? '#f0fdf4' : '#fff5f5', border: `1.5px solid ${a.is_available ? '#86efac' : '#fca5a5'}`, padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {a.day_of_week !== null ? DAY_NAMES[a.day_of_week] : `📅 ${a.specific_date}`}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>{a.start_time} – {a.end_time}</span>
                          <span style={{ fontWeight: 700, color: a.is_available ? '#16a34a' : '#dc2626' }}>
                            {a.is_available ? 'Available' : 'Unavailable'}
                          </span>
                          <button onClick={() => handleDeleteAvail(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, padding: '0 4px' }}>🗑</button>
                        </div>
                      ))}
                    </div>

                    <div style={{ background: '#f8fafc', border: '1.5px solid var(--border-color)', borderRadius: 10, padding: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 12 }}>ADD AVAILABILITY RULE</div>
                      <form onSubmit={handleAddAvail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Field label="Day of Week">
                          <select value={availForm.day_of_week} onChange={(e) => setAvailForm({ ...availForm, day_of_week: e.target.value })}>
                            {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                          </select>
                        </Field>
                        <Grid2>
                          <Field label="Start Time"><input type="time" value={availForm.start_time} onChange={(e) => setAvailForm({ ...availForm, start_time: e.target.value })} /></Field>
                          <Field label="End Time"><input type="time" value={availForm.end_time} onChange={(e) => setAvailForm({ ...availForm, end_time: e.target.value })} /></Field>
                        </Grid2>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-main)' }}>
                          <input type="checkbox" checked={availForm.is_available} onChange={(e) => setAvailForm({ ...availForm, is_available: e.target.checked })} />
                          Available for shifts
                        </label>
                        <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '10px', fontSize: 13, fontWeight: 700 }}>
                          {saving ? '⏳ Adding…' : '+ Add Rule'}
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {/* ── DOCUMENTS TAB ── */}
                {activeTab === 'documents' && (
                  <div>
                    {/* Document list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                      {workerDocs.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>No documents uploaded yet.</div>
                      )}
                      {workerDocs.map((doc) => {
                        const isExpired = expired(doc.expiry_date);
                        const isSoon = expirySoon(doc.expiry_date);
                        return (
                          <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: isExpired ? '#fff5f5' : isSoon ? '#fffbeb' : '#f8fafc', border: `1.5px solid ${isExpired ? '#fca5a5' : isSoon ? '#fde68a' : 'var(--border-color)'}`, borderRadius: 10, padding: '12px 16px' }}>
                            <div style={{ fontSize: 24 }}>{doc.mime_type?.includes('pdf') ? '📄' : doc.mime_type?.includes('image') ? '🖼️' : '📎'}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                {doc.doc_type} · {doc.original_name} · {doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : ''}
                              </div>
                              {doc.expiry_date && (
                                <div style={{ fontSize: 11, marginTop: 3, color: isExpired ? '#dc2626' : isSoon ? '#d97706' : '#16a34a', fontWeight: 600 }}>
                                  {isExpired ? '🔴 Expired: ' : isSoon ? '🟡 Expiring: ' : '🟢 Expires: '}{fmt(doc.expiry_date)}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {doc.file_path && (
                                <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => downloadDoc(doc.id, selectedWorker.id)}>⬇ Download</button>
                              )}
                              <button onClick={() => handleDeleteDoc(doc.id)} style={{ background: '#fff5f5', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Upload form */}
                    <div style={{ background: '#f8fafc', border: '1.5px solid var(--border-color)', borderRadius: 10, padding: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 14 }}>📤 Upload Document</div>
                      <form onSubmit={handleUploadDoc} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Grid2>
                          <Field label="Document Name"><input value={docForm.name} onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} placeholder="Police Check, WWCC, etc." /></Field>
                          <Field label="Document Type">
                            <select value={docForm.doc_type} onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}>
                              {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                            </select>
                          </Field>
                          <Field label="Expiry Date (optional)"><input type="date" value={docForm.expiry_date} onChange={(e) => setDocForm({ ...docForm, expiry_date: e.target.value })} /></Field>
                          <Field label="File (PDF / Image / Word) *">
                            <input ref={docFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt" onChange={(e) => setDocFile(e.target.files?.[0] || null)} required style={{ padding: '6px 0', background: 'none', border: 'none' }} />
                          </Field>
                        </Grid2>
                        <button type="submit" className="btn-primary" disabled={docUploading || !docFile} style={{ padding: '10px', fontWeight: 700, alignSelf: 'flex-start', minWidth: 160 }}>
                          {docUploading ? '⏳ Uploading…' : '📤 Upload Document'}
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {/* ── INCIDENTS TAB ── */}
                {activeTab === 'incidents' && (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                      {workerIncs.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>No incidents recorded.</div>
                      )}
                      {workerIncs.map((inc) => (
                        <div key={inc.id} style={{ background: '#ffffff', border: `2px solid ${SEVERITY_COLORS[inc.severity] || '#6b7280'}22`, borderLeft: `4px solid ${SEVERITY_COLORS[inc.severity]}`, borderRadius: 10, padding: '14px 16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: 14 }}>{inc.title}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                {fmt(inc.incident_date)} ·
                                <span style={{ color: SEVERITY_COLORS[inc.severity], fontWeight: 700, marginLeft: 4, textTransform: 'uppercase' }}>{inc.severity}</span>
                              </div>
                              {inc.description && <div style={{ fontSize: 12, color: 'var(--text-main)', marginTop: 8, lineHeight: 1.5 }}>{inc.description}</div>}
                            </div>
                            {inc.file_path && (
                              <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px', marginLeft: 10, whiteSpace: 'nowrap' }} onClick={() => downloadInc(inc.id, selectedWorker.id)}>
                                ⬇ Report
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ background: '#f8fafc', border: '1.5px solid var(--border-color)', borderRadius: 10, padding: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 14 }}>⚠️ Log New Incident</div>
                      <form onSubmit={handleUploadInc} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Grid2>
                          <Field label="Title *"><input required value={incForm.title} onChange={(e) => setIncForm({ ...incForm, title: e.target.value })} placeholder="Brief incident title" /></Field>
                          <Field label="Incident Date *"><input required type="date" value={incForm.incident_date} onChange={(e) => setIncForm({ ...incForm, incident_date: e.target.value })} /></Field>
                          <Field label="Severity">
                            <select value={incForm.severity} onChange={(e) => setIncForm({ ...incForm, severity: e.target.value })}>
                              {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </Field>
                          <Field label="Attach Report (optional)">
                            <input ref={incFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => setIncFile(e.target.files?.[0] || null)} style={{ padding: '6px 0', background: 'none', border: 'none' }} />
                          </Field>
                        </Grid2>
                        <Field label="Description">
                          <textarea rows={3} value={incForm.description} onChange={(e) => setIncForm({ ...incForm, description: e.target.value })} placeholder="Describe what happened…" />
                        </Field>
                        <button type="submit" className="btn-primary" disabled={incUploading} style={{ alignSelf: 'flex-start', minWidth: 160, padding: '10px', fontWeight: 700 }}>
                          {incUploading ? '⏳ Saving…' : '⚠️ Log Incident'}
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {/* ── ENGAGEMENT TAB ── */}
                {activeTab === 'engagement' && (
                  <div>
                    <Section title="Engagement Details">
                      <Grid2>
                        <Field label="Start Date"><input type="date" value={selectedWorker.engagement_start_date || ''} onChange={(e) => setSelectedWorker({ ...selectedWorker, engagement_start_date: e.target.value })} /></Field>
                        <Field label="End Date"><input type="date" value={selectedWorker.engagement_end_date || ''} onChange={(e) => setSelectedWorker({ ...selectedWorker, engagement_end_date: e.target.value })} /></Field>
                      </Grid2>
                      <div style={{ marginTop: 14 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', background: selectedWorker.dont_rehire ? '#fff1f2' : '#f8fafc', border: `1.5px solid ${selectedWorker.dont_rehire ? '#fda4af' : 'var(--border-color)'}`, borderRadius: 8 }}>
                          <input type="checkbox" checked={selectedWorker.dont_rehire || false} onChange={(e) => setSelectedWorker({ ...selectedWorker, dont_rehire: e.target.checked })} style={{ width: 16, height: 16 }} />
                          <div>
                            <div style={{ fontWeight: 700, color: selectedWorker.dont_rehire ? '#be123c' : 'var(--text-main)', fontSize: 13 }}>🚫 Do Not Rehire</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Mark this worker as ineligible for future engagements</div>
                          </div>
                        </label>
                      </div>
                      <Field label="Engagement Notes" style={{ marginTop: 14 }}>
                        <textarea rows={4} value={selectedWorker.engagement_notes || ''} onChange={(e) => setSelectedWorker({ ...selectedWorker, engagement_notes: e.target.value })} placeholder="Reason for ending engagement, rehire decision notes, etc." />
                      </Field>
                    </Section>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
                      <button className="btn-primary" onClick={handleSaveProfile} disabled={saving}>{saving ? '⏳ Saving…' : '💾 Save Engagement'}</button>
                    </div>
                  </div>
                )}

                {/* ── ADMIN NOTES TAB ── */}
                {activeTab === 'admin' && (
                  <div>
                    <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
                      🔒 Admin notes are <strong>not visible to workers</strong>. They are used for internal audits and compliance review only.
                    </div>
                    <Section title="Admin Notes">
                      <Field label="Internal Admin Notes">
                        <textarea rows={10} value={selectedWorker.admin_notes || ''} onChange={(e) => setSelectedWorker({ ...selectedWorker, admin_notes: e.target.value })} placeholder="Internal notes for audits, HR decisions, compliance observations…" style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 }} />
                      </Field>
                    </Section>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
                      <button className="btn-primary" onClick={handleSaveProfile} disabled={saving}>{saving ? '⏳ Saving…' : '🔒 Save Admin Notes'}</button>
                    </div>
                  </div>
                )}

              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Helper Sub-components ─── */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid var(--border-color)' }}>
      {title}
    </div>
    {children}
  </div>
);

const Grid2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
    {children}
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ label, children, style }) => (
  <div style={style}>
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
    {children}
  </div>
);

const EditField: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string }> = ({ label, value, onChange, type = 'text' }) => (
  <Field label={label}>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-input)', border: '1.5px solid var(--border-color)', borderRadius: 8, color: 'var(--text-main)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
  </Field>
);
