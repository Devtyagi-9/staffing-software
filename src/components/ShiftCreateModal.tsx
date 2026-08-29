import React, { useState, useEffect, useRef } from 'react';
import { apiRequest, createShift } from '../api/client';

interface ShiftCreateModalProps {
  /** The date the user clicked — used to pre-fill start/end */
  defaultDate: Date;
  onClose: () => void;
  onCreated: () => void;
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export const ShiftCreateModal: React.FC<ShiftCreateModalProps> = ({ defaultDate, onClose, onCreated }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  /* ── form state ── */
  const [requirements, setRequirements] = useState<any[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);

  // Pre-fill: start = clicked date at 08:00, end = same date at 16:00
  const startDefault = new Date(defaultDate);
  startDefault.setHours(8, 0, 0, 0);
  const endDefault = new Date(defaultDate);
  endDefault.setHours(16, 0, 0, 0);

  const [clientReqId, setClientReqId]     = useState('');
  const [startVal,    setStartVal]         = useState(toLocalDatetimeValue(startDefault));
  const [endVal,      setEndVal]           = useState(toLocalDatetimeValue(endDefault));
  const [recurringWeeks, setRecurringWeeks] = useState(1);   // 1 = single shift
  const [submitting,  setSubmitting]       = useState(false);
  const [error,       setError]            = useState<string | null>(null);
  const [successInfo, setSuccessInfo]      = useState<{ weeks: number; dates: string[] } | null>(null);

  /* ── load client requirements for dropdown ── */
  useEffect(() => {
    apiRequest('/requirements')
      .then(data => {
        const list = Array.isArray(data) ? data : (data.requirements || []);
        setRequirements(list);
        if (list.length > 0) setClientReqId(list[0].id);
      })
      .catch(() => setError('Failed to load client requirements.'))
      .finally(() => setLoadingReqs(false));
  }, []);

  /* ── close on Escape ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  /* ── close on overlay click ── */
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  /* ── preview dates for recurring ── */
  const previewDates: string[] = [];
  if (startVal) {
    const base = new Date(startVal);
    for (let w = 0; w < Math.min(recurringWeeks, 12); w++) {
      const d = addDays(base, w * 7);
      previewDates.push(d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }));
    }
  }

  /* ── submit ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clientReqId) { setError('Please select a client requirement.'); return; }
    const start = new Date(startVal);
    const end   = new Date(endVal);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) { setError('Invalid date/time.'); return; }
    if (end <= start) { setError('End time must be after start time.'); return; }

    setSubmitting(true);
    try {
      const result = await createShift({
        client_requirement_id: clientReqId,
        scheduled_start: start.toISOString(),
        scheduled_end:   end.toISOString(),
        recurring_weeks: recurringWeeks,
      });

      if (recurringWeeks > 1) {
        // Show success banner with dates before closing
        setSuccessInfo({ weeks: result.total_weeks, dates: previewDates });
        onCreated(); // refresh calendar immediately
      } else {
        onCreated();
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create shift.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── helpers for requirement label ── */
  const reqLabel = (r: any) => {
    const clientName = r.client?.name || r.client_id || '—';
    const date = r.shift_date ? ` · ${r.shift_date}` : '';
    const time = r.start_time && r.end_time ? ` · ${r.start_time}–${r.end_time}` : '';
    return `${clientName}${date}${time}`;
  };

  /* ── success screen ── */
  if (successInfo) {
    return (
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000,
        }}
      >
        <div style={{
          width: 440,
          background: '#ffffff',
          border: '1.5px solid #6ee7b7',
          borderRadius: 18,
          boxShadow: 'var(--shadow-lg)',
          padding: '32px 28px',
          textAlign: 'center',
          animation: 'modal-in 0.2s ease',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#065f46', fontFamily: 'Outfit, sans-serif' }}>
            {successInfo.weeks} Recurring Shifts Created!
          </h3>
          <p style={{ color: '#047857', fontSize: 13, marginTop: 6, marginBottom: 20 }}>
            The same shift has been scheduled every week on:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 24 }}>
            {successInfo.dates.map((d, i) => (
              <span key={i} style={{
                background: '#ecfdf5', border: '1px solid #6ee7b7',
                borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#065f46', fontWeight: 600,
              }}>{d}</span>
            ))}
            {successInfo.weeks > 12 && (
              <span style={{ fontSize: 12, color: '#047857', padding: '4px 0' }}>
                + {successInfo.weeks - 12} more weeks…
              </span>
            )}
          </div>
          <button onClick={onClose} className="btn-emerald" style={{ padding: '10px 28px', fontSize: 14, fontWeight: 700 }}>
            ✓ Done
          </button>
        </div>
        <style>{`@keyframes modal-in { from { opacity:0; transform:scale(0.93) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
      </div>
    );
  }

  /* ── main form ── */
  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div style={{
        width: 500,
        background: '#ffffff',
        border: '1.5px solid var(--border-color)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        animation: 'modal-in 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          background: '#f8fafc',
          borderBottom: '1.5px solid var(--border-color)',
          padding: '18px 22px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
              ➕ Create New Shift
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Add a single or recurring job slot to the roster
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f1f4fb', border: '1px solid var(--border-color)',
              color: '#64748b', borderRadius: 8, width: 32, height: 32,
              cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171',
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Client Requirement */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              🏥 Client Requirement
            </label>
            {loadingReqs ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading requirements…</div>
            ) : requirements.length === 0 ? (
              <div style={{ color: '#f87171', fontSize: 13 }}>
                No approved requirements found. Create a client requirement first.
              </div>
            ) : (
              <select
                value={clientReqId}
                onChange={e => setClientReqId(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'var(--bg-input)', border: '1.5px solid var(--border-color)',
                  borderRadius: 8, color: 'var(--text-main)', fontSize: 14,
                  outline: 'none', cursor: 'pointer',
                }}
              >
                {requirements.map(r => (
                  <option key={r.id} value={r.id}>{reqLabel(r)}</option>
                ))}
              </select>
            )}
          </div>

          {/* Start / End times */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                🕐 Start Time
              </label>
              <input
                type="datetime-local"
                value={startVal}
                onChange={e => setStartVal(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'var(--bg-input)', border: '1.5px solid var(--border-color)',
                  borderRadius: 8, color: 'var(--text-main)', fontSize: 14,
                  outline: 'none', boxSizing: 'border-box', colorScheme: 'light',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                🏁 End Time
              </label>
              <input
                type="datetime-local"
                value={endVal}
                onChange={e => setEndVal(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'var(--bg-input)', border: '1.5px solid var(--border-color)',
                  borderRadius: 8, color: 'var(--text-main)', fontSize: 14,
                  outline: 'none', boxSizing: 'border-box', colorScheme: 'light',
                }}
              />
            </div>
          </div>

          {/* ── Recurring section ── */}
          <div style={{
            background: recurringWeeks > 1 ? 'var(--primary-light)' : '#f8fafc',
            border: `1.5px solid ${recurringWeeks > 1 ? '#c7d2fe' : 'var(--border-color)'}`,
            borderRadius: 10, padding: '14px 16px',
            transition: 'all 0.2s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: recurringWeeks > 1 ? 12 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>🔁</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>Repeat Weekly</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Create the same shift on the same day every week</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>weeks:</span>
                <select
                  value={recurringWeeks}
                  onChange={e => setRecurringWeeks(Number(e.target.value))}
                  style={{
                    padding: '6px 10px', background: 'var(--bg-input)', border: '1.5px solid var(--border-color)',
                    borderRadius: 6, color: recurringWeeks > 1 ? 'var(--primary)' : 'var(--text-main)',
                    fontSize: 14, fontWeight: 700, outline: 'none', cursor: 'pointer', width: 70,
                  }}
                >
                  {[1,2,3,4,6,8,10,12,16,20,26,52].map(n => (
                    <option key={n} value={n}>{n === 1 ? 'Once' : `${n}w`}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview dates */}
            {recurringWeeks > 1 && previewDates.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
                  SHIFT DATES ({recurringWeeks} total):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {previewDates.map((d, i) => (
                    <span key={i} style={{
                      background: '#eef2ff', border: '1px solid #c7d2fe',
                      borderRadius: 5, padding: '3px 8px', fontSize: 11, color: '#4338ca', fontWeight: 700,
                    }}>{d}</span>
                  ))}
                  {recurringWeeks > 12 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '3px 0' }}>
                      + {recurringWeeks - 12} more…
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Info note */}
          <div style={{
            background: '#eef2ff', border: '1px solid #c7d2fe',
            borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#4338ca',
          }}>
            💡 Shifts will be created as <strong>Open</strong>. Assign a worker afterwards via <em>Smart Match</em> on any shift chip.
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} className="btn-secondary" style={{ padding: '10px 20px', fontSize: 14 }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingReqs || requirements.length === 0}
              className="btn-primary"
              style={{ padding: '10px 24px', fontSize: 14, fontWeight: 700, opacity: submitting ? 0.7 : 1 }}
            >
              {submitting
                ? '⏳ Creating…'
                : recurringWeeks > 1
                  ? `🔁 Create ${recurringWeeks} Shifts`
                  : '✅ Create Shift'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.93) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        .btn-emerald {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white; border-radius: 8px; font-weight: 600;
          border: none; cursor: pointer;
        }
      `}</style>
    </div>
  );
};
