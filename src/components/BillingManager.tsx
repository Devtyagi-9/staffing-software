import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';

/* ── helpers ── */
const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-AU');
};
const fmtCurrency = (amount: number, currency = 'AUD') =>
  `${currency} $${(amount ?? 0).toFixed(2)}`;

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  draft:          { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  sent:           { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' },
  partially_paid: { bg: '#eff6ff', color: '#1e40af', border: '#93c5fd' },
  paid:           { bg: '#ecfdf5', color: '#065f46', border: '#6ee7b7' },
  overdue:        { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
  void:           { bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.draft;
  return (
    <span style={{
      display: 'inline-block',
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
      borderRadius: 20, padding: '3px 10px',
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
    }}>
      {status.replace('_', ' ').toUpperCase()}
    </span>
  );
}

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Direct Bank Transfer' },
  { value: 'credit_card',   label: 'Credit Card' },
  { value: 'check',         label: 'Cheque' },
];

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export const BillingManager: React.FC = () => {
  /* ── data ── */
  const [payers,   setPayers]   = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [billRates, setBillRates] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);

  /* ── generate form ── */
  const [payerId,    setPayerId]    = useState('');
  const [startDate,  setStartDate]  = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(0);
    return d.toISOString().slice(0, 10);
  });

  /* ── preview state ── */
  const [preview,          setPreview]          = useState<any | null>(null);
  const [previewing,       setPreviewing]       = useState(false);
  const [previewError,     setPreviewError]     = useState('');
  const [selectedClients,  setSelectedClients]  = useState<Set<string>>(new Set());

  /* ── generate state ── */
  const [generating,   setGenerating]   = useState(false);
  const [generateMsg,  setGenerateMsg]  = useState('');
  const [generateErr,  setGenerateErr]  = useState('');

  /* ── invoice detail ── */
  const [expandedInv,    setExpandedInv]    = useState<string | null>(null);
  const [filterPayerId,  setFilterPayerId]  = useState('');

  /* ── payment modal ── */
  const [payModal,    setPayModal]    = useState<any | null>(null);
  const [payAmount,   setPayAmount]   = useState(0);
  const [payMethod,   setPayMethod]   = useState('bank_transfer');
  const [payRef,      setPayRef]      = useState('');
  const [payLoading,  setPayLoading]  = useState(false);

  /* ── bill rate form ── */
  const [showRateForm, setShowRateForm] = useState(false);
  const [rateForm, setRateForm] = useState({ payer_id: '', amount: '', effective_from: new Date().toISOString().slice(0, 10) });

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [inv, rates, pyr] = await Promise.all([
        apiRequest('/billing/invoices'),
        apiRequest('/billing/bill-rates'),
        apiRequest('/payers'),
      ]);
      setInvoices(Array.isArray(inv) ? inv : []);
      setBillRates(Array.isArray(rates) ? rates : []);
      setPayers(Array.isArray(pyr) ? pyr : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  /* ── PREVIEW ── */
  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payerId || !startDate || !endDate) return;
    setPreviewing(true); setPreviewError(''); setPreview(null);
    try {
      const data = await apiRequest(
        `/billing/invoices/preview?payer_id=${payerId}&billing_period_start=${startDate}&billing_period_end=${endDate}`
      );
      setPreview(data);
      // default: select all clients
      setSelectedClients(new Set((data.preview || []).map((p: any) => p.client_id)));
      setGenerateMsg(''); setGenerateErr('');
    } catch (err: any) {
      setPreviewError(err.message || 'Preview failed.');
    } finally { setPreviewing(false); }
  };

  /* ── GENERATE ── */
  const handleGenerate = async () => {
    if (!preview || selectedClients.size === 0) return;
    setGenerating(true); setGenerateErr('');
    try {
      const { invoices: created, count } = await apiRequest('/billing/invoices/generate', {
        method: 'POST',
        body: JSON.stringify({
          payer_id:             payerId,
          billing_period_start: startDate,
          billing_period_end:   endDate,
          client_ids:           Array.from(selectedClients),
        }),
      });
      setGenerateMsg(`✅ ${count} invoice${count !== 1 ? 's' : ''} generated successfully!`);
      setPreview(null);
      await fetchAll();
    } catch (err: any) {
      setGenerateErr(err.message || 'Generation failed.');
    } finally { setGenerating(false); }
  };

  /* ── STATUS CHANGE ── */
  const handleStatusChange = async (invoiceId: string, status: string) => {
    try {
      await apiRequest(`/billing/invoices/${invoiceId}/status`, {
        method: 'PUT', body: JSON.stringify({ status }),
      });
      await fetchAll();
    } catch (err: any) { alert(err.message); }
  };

  /* ── DELETE DRAFT ── */
  const handleDeleteDraft = async (invoiceId: string) => {
    if (!window.confirm('Delete this draft invoice? The time logs will be returned to "approved" status so they can be re-billed.')) return;
    try {
      await apiRequest(`/billing/invoices/${invoiceId}`, { method: 'DELETE' });
      await fetchAll();
    } catch (err: any) { alert(err.message); }
  };

  /* ── PAYMENT ── */
  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal) return;
    setPayLoading(true);
    try {
      await apiRequest(`/billing/invoices/${payModal.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: payAmount, method: payMethod, reference_number: payRef || `REF-${Date.now()}` }),
      });
      setPayModal(null);
      await fetchAll();
    } catch (err: any) { alert(err.message); }
    finally { setPayLoading(false); }
  };

  /* ── PDF ── */
  const downloadPDF = (id: string) => {
    const token = localStorage.getItem('staffing_jwt_token');
    window.open(`/api/billing/invoices/${id}/pdf?token=${token}`, '_blank');
  };

  /* ── BILL RATE ── */
  const handleAddRate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/billing/bill-rates', {
        method: 'POST',
        body: JSON.stringify({ ...rateForm, amount: Number(rateForm.amount) }),
      });
      setShowRateForm(false);
      setRateForm({ payer_id: '', amount: '', effective_from: new Date().toISOString().slice(0, 10) });
      await fetchAll();
    } catch (err: any) { alert(err.message); }
  };

  const filteredInvoices = filterPayerId
    ? invoices.filter(inv => inv.payer_id === filterPayerId)
    : invoices;

  /* ── totals for summary cards ── */
  const totalRevenue   = invoices.filter(i => i.status !== 'void').reduce((a, i) => a + i.total, 0);
  const outstanding    = invoices.filter(i => ['sent', 'partially_paid', 'overdue'].includes(i.status)).reduce((a, i) => a + i.total, 0);
  const paidRevenue    = invoices.filter(i => i.status === 'paid').reduce((a, i) => a + i.total, 0);
  const overdueCount   = invoices.filter(i => i.status === 'overdue').length;

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[
          { label: 'Total Invoiced',  value: fmtCurrency(totalRevenue),  icon: '📊', color: '#6366f1', bg: '#eef2ff' },
          { label: 'Outstanding',     value: fmtCurrency(outstanding),   icon: '⏳', color: '#d97706', bg: '#fffbeb' },
          { label: 'Collected',       value: fmtCurrency(paidRevenue),   icon: '✅', color: '#059669', bg: '#ecfdf5' },
          { label: 'Overdue',         value: `${overdueCount} invoice${overdueCount !== 1 ? 's' : ''}`, icon: '🔴', color: '#dc2626', bg: '#fef2f2' },
        ].map(card => (
          <div key={card.label} style={{
            background: card.bg, borderRadius: 14,
            border: `1.5px solid ${card.color}30`,
            padding: '16px 20px',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{card.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: card.color, fontFamily: 'Outfit, sans-serif' }}>
              {card.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{card.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>

        {/* ═══ LEFT COLUMN ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Generate Invoice Panel ── */}
          <div style={{
            background: 'var(--bg-card)', borderRadius: 14,
            border: '1.5px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)', padding: 22,
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              🧾 <span>Generate Invoices</span>
            </h3>

            {generateMsg && (
              <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#065f46', fontWeight: 600, fontSize: 13 }}>
                {generateMsg}
              </div>
            )}
            {generateErr && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#991b1b', fontWeight: 600, fontSize: 13 }}>
                ⚠️ {generateErr}
              </div>
            )}

            <form onSubmit={handlePreview} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Payer Account</label>
                <select
                  value={payerId}
                  onChange={e => { setPayerId(e.target.value); setPreview(null); setGenerateMsg(''); }}
                  style={{ width: '100%' }} required
                >
                  <option value="">— Select Payer —</option>
                  {payers.map(p => (
                    <option key={p.id} value={p.id}>{p.name} · {p.payment_terms_days}d terms</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Period Start</label>
                  <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPreview(null); }} style={{ width: '100%' }} required />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Period End</label>
                  <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPreview(null); }} style={{ width: '100%' }} required />
                </div>
              </div>

              <button type="submit" className="btn-secondary" disabled={previewing || !payerId} style={{ width: '100%' }}>
                {previewing ? '⏳ Loading preview…' : '🔍 Preview Billable Work'}
              </button>
            </form>

            {previewError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginTop: 12, color: '#991b1b', fontSize: 13 }}>
                {previewError === 'NO_UNBILLED_LOGS: No unbilled approved time logs found for the selected period and payer.'
                  ? '✅ No unbilled approved time logs found for this payer/period. All shifts have already been invoiced or need timesheet approval.'
                  : `⚠️ ${previewError}`}
              </div>
            )}

            {/* ── Preview cards ── */}
            {preview && preview.preview?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>
                  {preview.preview.length} client{preview.preview.length !== 1 ? 's' : ''} · {preview.preview.reduce((a: number, c: any) => a + c.shift_count, 0)} shifts ready to invoice
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                  {preview.preview.map((c: any) => {
                    const selected = selectedClients.has(c.client_id);
                    return (
                      <div
                        key={c.client_id}
                        onClick={() => {
                          setSelectedClients(prev => {
                            const n = new Set(prev);
                            selected ? n.delete(c.client_id) : n.add(c.client_id);
                            return n;
                          });
                        }}
                        style={{
                          border: selected ? '2px solid var(--primary)' : '1.5px solid var(--border-color)',
                          borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                          background: selected ? 'var(--primary-light)' : '#f8fafc',
                          transition: 'all 0.14s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: selected ? 'var(--primary)' : 'var(--text-main)' }}>
                            {selected ? '☑' : '☐'} {c.client_name}
                          </div>
                          <span style={{ fontWeight: 800, fontSize: 13, color: '#059669' }}>
                            AUD ${(c.estimated_total * 1.1).toFixed(2)}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 12 }}>
                          <span>📋 {c.shift_count} shift{c.shift_count !== 1 ? 's' : ''}</span>
                          <span>⏱ {c.estimated_hours.toFixed(1)}h</span>
                          <span>👷 {c.workers.length} worker{c.workers.length !== 1 ? 's' : ''}</span>
                        </div>
                        {c.workers.length > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 3 }}>
                            {c.workers.slice(0, 3).join(', ')}{c.workers.length > 3 ? ` +${c.workers.length - 3} more` : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  className="btn-primary"
                  onClick={handleGenerate}
                  disabled={generating || selectedClients.size === 0}
                  style={{ width: '100%', marginTop: 14, padding: '11px', fontSize: 14, fontWeight: 700 }}
                >
                  {generating
                    ? '⏳ Generating…'
                    : `⚡ Generate ${selectedClients.size} Invoice${selectedClients.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>

          {/* ── Bill Rates Panel (Disabled per request, using worker wage rates instead) ── */}
          {/* 
          <div style={{
            background: 'var(--bg-card)', borderRadius: 14,
            border: '1.5px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)', padding: 22,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>💲 Bill Rate Hierarchy</h3>
              <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setShowRateForm(v => !v)}>
                {showRateForm ? 'Cancel' : '+ Add Rate'}
              </button>
            </div>

            {showRateForm && (
              <form onSubmit={handleAddRate} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Payer</label>
                  <select value={rateForm.payer_id} onChange={e => setRateForm(f => ({ ...f, payer_id: e.target.value }))} style={{ width: '100%', marginTop: 4 }} required>
                    <option value="">— Select —</option>
                    {payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Rate (AUD/hr)</label>
                    <input type="number" step="0.01" min="0" value={rateForm.amount} onChange={e => setRateForm(f => ({ ...f, amount: e.target.value }))} style={{ width: '100%', marginTop: 4 }} required />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Effective From</label>
                    <input type="date" value={rateForm.effective_from} onChange={e => setRateForm(f => ({ ...f, effective_from: e.target.value }))} style={{ width: '100%', marginTop: 4 }} required />
                  </div>
                </div>
                <button type="submit" className="btn-primary" style={{ fontSize: 13 }}>Save Rate</button>
              </form>
            )}

            {billRates.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No bill rates configured.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {billRates.slice(0, 20).map(r => (
                  <div key={r.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', background: '#f8fafc', borderRadius: 8,
                    border: '1px solid var(--border-color)',
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{r.payer?.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {r.client ? `Client: ${r.client.name}` : 'Payer default'}
                        {r.skill ? ` · ${r.skill.name}` : ''}
                        {!r.effective_to ? '' : ` · until ${fmtDate(r.effective_to)}`}
                      </div>
                    </div>
                    <span style={{ fontWeight: 800, color: '#059669', fontSize: 13 }}>
                      ${r.amount.toFixed(2)}/hr
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          */}
        </div>

        {/* ═══ RIGHT COLUMN: Invoice List ═══ */}
        <div style={{
          background: 'var(--bg-card)', borderRadius: 14,
          border: '1.5px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm)', padding: 22,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>📋 Invoices</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={filterPayerId}
                onChange={e => setFilterPayerId(e.target.value)}
                style={{ fontSize: 12, padding: '5px 10px' }}
              >
                <option value="">All Payers</option>
                {payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={fetchAll} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }}>🔄 Refresh</button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading invoices…</div>
          ) : filteredInvoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>No invoices yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Preview billable work on the left to generate invoices</div>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table className="custom-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Payer</th>
                    <th>Client</th>
                    <th>Period</th>
                    <th>Total (inc. GST)</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map(inv => {
                    // Derive client name from line items (all line items in a per-client invoice share one client)
                    const clientName = inv.line_items?.[0]?.client?.name || '—';
                    const totalPaid  = (inv.payments || []).reduce((a: number, p: any) => a + p.amount, 0);
                    const expanded   = expandedInv === inv.id;

                    return (
                      <React.Fragment key={inv.id}>
                        <tr
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpandedInv(expanded ? null : inv.id)}
                        >
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>
                              INV-{inv.id.substring(0, 8).toUpperCase()}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {inv.line_items?.length || 0} line items
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, fontSize: 13 }}>{inv.payer?.name || '—'}</td>
                          <td style={{ fontSize: 13 }}>{clientName}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            <div>{fmtDate(inv.billing_period_start)}</div>
                            <div>→ {fmtDate(inv.billing_period_end)}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{fmtCurrency(inv.total, inv.currency)}</div>
                            {totalPaid > 0 && (
                              <div style={{ fontSize: 10, color: '#059669' }}>
                                Paid: {fmtCurrency(totalPaid, inv.currency)}
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(inv.due_at)}</td>
                          <td><StatusBadge status={inv.status} /></td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {/* PDF */}
                              <button
                                onClick={(e) => { e.stopPropagation(); downloadPDF(inv.id); }}
                                className="btn-secondary"
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                title="Download PDF"
                              >📄</button>

                              {/* Mark as Sent */}
                              {inv.status === 'draft' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleStatusChange(inv.id, 'sent'); }}
                                  className="btn-secondary"
                                  style={{ padding: '4px 8px', fontSize: 11 }}
                                  title="Mark as Sent"
                                >📤 Send</button>
                              )}

                              {/* Record Payment */}
                              {['sent', 'partially_paid', 'overdue'].includes(inv.status) && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setPayModal(inv); setPayAmount(inv.total - totalPaid); setPayRef(''); }}
                                  style={{
                                    padding: '4px 8px', fontSize: 11, fontWeight: 600,
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    color: 'white', borderRadius: 6, border: 'none', cursor: 'pointer',
                                  }}
                                  title="Record Payment"
                                >💳 Pay</button>
                              )}

                              {/* Void */}
                              {['sent', 'partially_paid'].includes(inv.status) && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (window.confirm('Void this invoice?')) handleStatusChange(inv.id, 'void'); }}
                                  className="btn-secondary"
                                  style={{ padding: '4px 8px', fontSize: 11 }}
                                  title="Void Invoice"
                                >🚫</button>
                              )}

                              {/* Delete draft */}
                              {inv.status === 'draft' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteDraft(inv.id); }}
                                  style={{
                                    padding: '4px 8px', fontSize: 11, fontWeight: 600,
                                    background: '#fef2f2', color: '#dc2626',
                                    borderRadius: 6, border: '1px solid #fca5a5', cursor: 'pointer',
                                  }}
                                  title="Delete Draft"
                                >🗑</button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Line Items */}
                        {expanded && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0, background: '#f8faff' }}>
                              <div style={{ padding: '14px 20px' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                  Line Items — {clientName}
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                  <thead>
                                    <tr style={{ background: '#e8ecf8' }}>
                                      {['Description', 'Quantity', 'Price', 'Tax', 'Amount'].map(h => (
                                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Description' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 700, fontSize: 11 }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(inv.line_items || []).map((item: any, i: number) => {
                                      const dateParts = (item.shift_date || '').split('-');
                                      const dateStr = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : item.shift_date || '—';
                                      const startTime = item.shift_start_time || item.time_log?.assignment?.shift?.client_requirement?.start_time || '';
                                      const endTime = item.shift_end_time || item.time_log?.assignment?.shift?.client_requirement?.end_time || '';
                                      const dayOfWeek = item.shift_date ? new Date(item.shift_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long' }) : 'Weekday';
                                      const fmtTime = (t: string) => {
                                        if (!t) return '';
                                        const [h, m] = t.split(':').map(Number);
                                        const suffix = h >= 12 ? 'pm' : 'am';
                                        const h12 = h % 12 || 12;
                                        return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}${suffix}`;
                                      };
                                      const description = `${dateStr} IND Assistance with Daily Living ${dayOfWeek} ${fmtTime(startTime)} ${fmtTime(endTime)}`.trim();
                                      return (
                                        <tr key={item.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                                          <td style={{ padding: '6px 10px', maxWidth: 340 }}>{description}</td>
                                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>{Math.round(item.hours)}</td>
                                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>{item.bill_rate_applied?.toFixed(2)}</td>
                                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>0%</td>
                                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>{item.line_total?.toFixed(2)}</td>
                                        </tr>
                                      );
                                    })}
                                    <tr style={{ background: '#e8ecf8', fontWeight: 700 }}>
                                      <td colSpan={3} style={{ padding: '8px 10px' }}></td>
                                      <td style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right' }}>Subtotal</td>
                                      <td style={{ padding: '8px 10px', fontSize: 13, textAlign: 'right' }}>{inv.subtotal?.toFixed(2)}</td>
                                    </tr>
                                    <tr style={{ background: '#e8ecf8' }}>
                                      <td colSpan={3}></td>
                                      <td style={{ padding: '4px 10px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>Total</td>
                                      <td style={{ padding: '4px 10px', fontSize: 12, textAlign: 'right' }}>{inv.total?.toFixed(2)}</td>
                                    </tr>
                                    <tr style={{ background: '#111827' }}>
                                      <td colSpan={3}></td>
                                      <td style={{ padding: '8px 10px', color: 'white', fontWeight: 700, fontSize: 12, textAlign: 'right' }}>Amount due</td>
                                      <td style={{ padding: '8px 10px', color: 'white', fontWeight: 800, fontSize: 14, textAlign: 'right' }}>${inv.total?.toFixed(2)}</td>
                                    </tr>
                                  </tbody>
                                </table>

                                {/* Payment history */}
                                {inv.payments?.length > 0 && (
                                  <div style={{ marginTop: 12 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>PAYMENTS RECEIVED</div>
                                    {inv.payments.map((p: any) => (
                                      <div key={p.id} style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', padding: '3px 0' }}>
                                        <span>{fmtDate(p.paid_at)}</span>
                                        <span style={{ fontWeight: 600, color: '#059669' }}>{fmtCurrency(p.amount, inv.currency)}</span>
                                        <span>{p.method.replace('_', ' ')}</span>
                                        <span style={{ fontFamily: 'monospace' }}>{p.reference_number}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ══ Payment Recording Modal ══ */}
      {payModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>💳 Record Payment</h3>
              <button className="btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setPayModal(null)}>✕</button>
            </div>

            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>INV-{payModal.id.substring(0, 8).toUpperCase()}</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                {payModal.payer?.name} · {payModal.line_items?.[0]?.client?.name || '—'}
              </div>
              <div style={{ marginTop: 4, fontWeight: 700, color: '#059669' }}>
                Total Due: {fmtCurrency(payModal.total, payModal.currency)}
              </div>
            </div>

            <form onSubmit={handlePayment} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Payment Amount ({payModal.currency})</label>
                <input type="number" step="0.01" min="0.01" value={payAmount} onChange={e => setPayAmount(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }} required />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Payment Method</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Reference Number</label>
                <input type="text" placeholder="e.g. TXN-998811" value={payRef} onChange={e => setPayRef(e.target.value)} style={{ width: '100%', marginTop: 4 }} required />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="submit" disabled={payLoading} className="btn-emerald" style={{ flex: 1, padding: '10px' }}>
                  {payLoading ? 'Processing…' : '✓ Record Payment'}
                </button>
                <button type="button" onClick={() => setPayModal(null)} className="btn-secondary" style={{ padding: '10px 16px' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
