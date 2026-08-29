import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { SmartMatchModal } from './SmartMatchModal';
import { ShiftCreateModal } from './ShiftCreateModal';


/* ─── helpers ─────────────────────────────────────────────────── */
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
function isToday(d: Date) { return isSameDay(d, new Date()); }
function fmt12(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function shiftColor(shift: any): { bg: string; border: string; text: string } {
  if (shift.has_conflict_warning) return { bg: '#fef2f2', border: '#ef4444', text: '#b91c1c' };
  if (shift.status === 'confirmed') return { bg: '#ecfdf5', border: '#10b981', text: '#065f46' };
  return { bg: '#eef2ff', border: '#6366f1', text: '#4338ca' };
}

/* ─── Event Popover ───────────────────────────────────────────── */
interface PopoverProps {
  shift: any;
  anchorRect: DOMRect;
  onClose: () => void;
  onSmartMatch: () => void;
  onDelete: (shiftId: string) => Promise<void>;
  isAdmin: boolean;
}

const EventPopover: React.FC<PopoverProps> = ({ shift, anchorRect, onClose, onSmartMatch, onDelete, isAdmin }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const client = shift.client_requirement?.client;
  const assignment = shift.assignments?.[0];
  const worker = assignment?.worker;
  const skills = shift.client_requirement?.requirement_skills || [];
  const colors = shiftColor(shift);

  /* position: prefer right of anchor, fall back to left */
  const POPUP_W = 340;
  const vpW = window.innerWidth;
  let left = anchorRect.right + 12;
  if (left + POPUP_W > vpW - 16) left = anchorRect.left - POPUP_W - 12;
  if (left < 8) left = 8;
  let top = anchorRect.top + window.scrollY - 8;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => document.addEventListener('mousedown', handler), 50);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', esc); };
  }, []);

  return (
    <div
      ref={popRef}
      style={{
        position: 'fixed',
        left,
        top: Math.min(top, window.innerHeight - 460),
        width: POPUP_W,
        background: '#ffffff',
        border: `1.5px solid ${colors.border}`,
        borderRadius: 14,
        boxShadow: `0 12px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)`,
        zIndex: 9999,
        overflow: 'hidden',
        animation: 'pop-in 0.15s ease',
      }}
    >
      {/* Colour strip header */}
      <div style={{
        background: colors.bg,
        borderBottom: `1.5px solid ${colors.border}33`,
        padding: '14px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {shift.status === 'confirmed' ? '✅ Confirmed' : shift.has_conflict_warning ? '⚠️ Conflict' : '🔵 Open Slot'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)', marginTop: 3 }}>
            {fmt12(shift.scheduled_start)} – {fmt12(shift.scheduled_end)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {fmtDate(shift.scheduled_start)}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: '#f1f4fb', border: '1px solid var(--border-color)',
          color: '#64748b', borderRadius: 8, width: 28, height: 28, cursor: 'pointer',
          fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Client */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, marginTop: 1 }}>🏥</span>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CLIENT / WORKSITE</div>
            <div style={{ fontSize: 14, color: 'var(--text-main)', fontWeight: 600 }}>{client?.name || '—'}</div>
            {client?.address && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{client.address}</div>}
          </div>
        </div>

        {/* Worker */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, marginTop: 1 }}>👤</span>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ASSIGNED WORKER</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: worker ? '#059669' : '#94a3b8' }}>
              {worker ? worker.name : 'Unassigned (Open Slot)'}
            </div>
            {worker?.employment_type && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{worker.employment_type}</div>
            )}
          </div>
        </div>

        {/* Slot # */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, marginTop: 1 }}>🔢</span>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>SLOT</div>
            <div style={{ fontSize: 14, color: 'var(--text-main)', fontWeight: 600 }}>#{shift.slot_number}</div>
          </div>
        </div>

        {/* Required skills */}
        {skills.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>📋 Required Skills</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {skills.map((rs: any) => (
                <span key={rs.id} className="badge badge-open">{rs.skill?.name}</span>
              ))}
            </div>
          </div>
        )}

        {/* Conflict banner */}
        {shift.has_conflict_warning && (
          <div style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: '#f87171',
            fontWeight: 600,
          }}>⚠️ Advisory: Worker has an overlapping confirmed shift</div>
        )}

        {/* Admin actions */}
        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <button
              onClick={onSmartMatch}
              className="btn-primary"
              style={{ width: '100%', padding: '10px', fontSize: 14, fontWeight: 700 }}
            >
              🤖 Smart Match Worker
            </button>

            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  width: '100%', padding: '9px', fontSize: 13, fontWeight: 600,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#f87171', borderRadius: 8, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
              >
                🗑️ Delete Shift
              </button>
            ) : (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: 8, padding: '10px 12px',
              }}>
                <div style={{ fontSize: 12, color: '#f87171', fontWeight: 600, marginBottom: 8 }}>
                  ⚠️ Delete this shift? This cannot be undone.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{
                      flex: 1, padding: '7px', fontSize: 12, fontWeight: 600,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                      color: '#9ca3af', borderRadius: 6, cursor: 'pointer',
                    }}
                  >Cancel</button>
                  <button
                    onClick={async () => {
                      setDeleting(true);
                      try { await onDelete(shift.id); onClose(); }
                      catch { setDeleting(false); setConfirmDelete(false); }
                    }}
                    disabled={deleting}
                    style={{
                      flex: 1, padding: '7px', fontSize: 12, fontWeight: 700,
                      background: 'linear-gradient(135deg,#ef4444,#dc2626)',
                      border: 'none', color: 'white', borderRadius: 6, cursor: 'pointer',
                      opacity: deleting ? 0.6 : 1,
                    }}
                  >{deleting ? 'Deleting…' : '✓ Confirm Delete'}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pop-in {
          from { opacity: 0; transform: scale(0.92) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

/* ─── Main Calendar ───────────────────────────────────────────── */
export const SchedulingCalendar: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'coordinator';

  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedShift, setSelectedShift] = useState<any | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [smartMatchShift, setSmartMatchShift] = useState<any | null>(null);
  const [createDate, setCreateDate] = useState<Date | null>(null);


  const fetchShifts = () => {
    setLoading(true);
    const som = startOfMonth(currentMonth);
    // fetch ±1 month so chips show for any visible cells
    const prevM = addMonths(som, -1);
    const nextM = addMonths(som, 1);
    const startStr = `${prevM.getFullYear()}-${String(prevM.getMonth()+1).padStart(2,'0')}-01`;
    const endEnd = endOfMonth(nextM);
    const endStr = `${endEnd.getFullYear()}-${String(endEnd.getMonth()+1).padStart(2,'0')}-${String(endEnd.getDate()).padStart(2,'0')}`;
    apiRequest(`/roster/shifts?start_date=${startStr}&end_date=${endStr}`)
      .then(res => setShifts(res.shifts || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchShifts(); }, [currentMonth]);

  /* build calendar grid */
  const som = startOfMonth(currentMonth);
  const eom = endOfMonth(currentMonth);
  // first cell: go back to the Sunday of the week containing 1st
  const gridStart = new Date(som);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  // last cell: go forward to the Saturday of the week containing last day
  const gridEnd = new Date(eom);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const days: Date[] = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

  /* shifts grouped by date string */
  const shiftsByDay: Record<string, any[]> = {};
  shifts.forEach(s => {
    const key = new Date(s.scheduled_start).toLocaleDateString('en-CA'); // YYYY-MM-DD
    if (!shiftsByDay[key]) shiftsByDay[key] = [];
    shiftsByDay[key].push(s);
  });

  const handleChipClick = (e: React.MouseEvent, shift: any) => {
    e.stopPropagation();
    setAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setSelectedShift(shift);
  };

  const handleSmartMatch = () => {
    setSelectedShift(null);
    setSmartMatchShift(selectedShift);
  };

  return (
    <div style={{ padding: 24, minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
            📅 Roster Calendar
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {isAdmin
              ? 'Click any shift to view details or run Smart Match'
              : 'Your upcoming shifts — click a shift to see details'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setCurrentMonth(m => addMonths(m, -1))} className="btn-secondary"
            style={{ padding: '8px 14px', fontSize: 16 }}>‹</button>

          <div style={{
            minWidth: 180,
            textAlign: 'center',
            fontWeight: 700,
            fontSize: 18,
            color: 'var(--text-main)',
            fontFamily: 'Outfit, sans-serif',
          }}>
            {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </div>

          <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="btn-secondary"
            style={{ padding: '8px 14px', fontSize: 16 }}>›</button>

          <button onClick={() => setCurrentMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            className="btn-secondary" style={{ padding: '8px 14px', fontSize: 13 }}>
            Today
          </button>

          <button onClick={fetchShifts} className="btn-secondary" style={{ padding: '8px 14px', fontSize: 13 }}>
            🔄
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          Loading shifts…
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Calendar Grid */}
      {!loading && (
        <div style={{
          background: '#ffffff',
          border: '1.5px solid var(--border-color)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-md)',
        }}>

          {/* Day-of-week header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1.5px solid var(--border-color)' }}>
            {DAY_NAMES.map(d => (
              <div key={d} style={{
                padding: '10px 0',
                textAlign: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                background: '#f8fafc',
              }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {days.map((day, idx) => {
              const key = day.toLocaleDateString('en-CA');
              const dayShifts = shiftsByDay[key] || [];
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
              const todayFlag = isToday(day);
              const MAX_VISIBLE = 3;
              const overflow = dayShifts.length - MAX_VISIBLE;

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (isAdmin) {
                      setSelectedShift(null);
                      setAnchorRect(null);
                      setCreateDate(day);
                    }
                  }}
                  style={{
                    minHeight: 110,
                    padding: '8px 6px 6px',
                    borderRight: (idx + 1) % 7 !== 0 ? '1px solid #e8edf5' : 'none',
                    borderBottom: idx < days.length - 7 ? '1px solid #e8edf5' : 'none',
                    background: todayFlag ? '#eef2ff' : isCurrentMonth ? '#ffffff' : '#f8fafc',
                    position: 'relative',
                    transition: 'background 0.15s',
                    cursor: isAdmin ? 'pointer' : 'default',
                  }}
                  onMouseEnter={e => {
                    if (isAdmin) (e.currentTarget as HTMLDivElement).style.background =
                      todayFlag ? '#e0e7ff' : '#f5f7ff';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      todayFlag ? '#eef2ff' : isCurrentMonth ? '#ffffff' : '#f8fafc';
                  }}
                >
                  {/* Date number + admin "+" hint */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    {isAdmin && (
                      <span title="Click to create a new shift" style={{
                        fontSize: 15, color: 'rgba(99,102,241,0.4)',
                        lineHeight: 1, paddingLeft: 2, userSelect: 'none',
                      }}>＋</span>
                    )}
                    <span style={{
                      width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%',
                      fontSize: 13,
                      fontWeight: todayFlag ? 800 : 500,
                      background: todayFlag ? '#6366f1' : 'transparent',
                      color: todayFlag ? 'white' : isCurrentMonth ? '#334155' : '#cbd5e1',
                      marginLeft: 'auto',
                    }}>
                      {day.getDate()}
                    </span>
                  </div>


                  {/* Shift chips */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {dayShifts.slice(0, MAX_VISIBLE).map((shift) => {
                      const c = shiftColor(shift);
                      const workerName = shift.assignments?.[0]?.worker?.name;
                      const clientName = shift.client_requirement?.client?.name;
                      return (
                        <button
                          key={shift.id}
                          onClick={(e) => handleChipClick(e, shift)}
                          style={{
                            background: c.bg,
                            border: `1px solid ${c.border}66`,
                            borderLeft: `3px solid ${c.border}`,
                            borderRadius: 5,
                            padding: '3px 6px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: 11,
                            fontWeight: 600,
                            color: c.text,
                            lineHeight: 1.3,
                            transition: 'all 0.15s',
                            width: '100%',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.2)';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                          }}
                          title={`${fmt12(shift.scheduled_start)}–${fmt12(shift.scheduled_end)}${clientName ? ' • ' + clientName : ''}${workerName ? ' • ' + workerName : ''}`}
                        >
                          {fmt12(shift.scheduled_start)} {clientName ? `• ${clientName}` : ''}
                        </button>
                      );
                    })}

                    {overflow > 0 && (
                      <button
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'left',
                          padding: '1px 4px',
                        }}
                        onClick={(e) => {
                          // show first overflow shift
                          handleChipClick(e, dayShifts[MAX_VISIBLE]);
                        }}
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      {!loading && (
        <div style={{ display: 'flex', gap: 20, marginTop: 16, alignItems: 'center' }}>
          {[
            { color: '#6366f1', label: 'Open' },
            { color: '#10b981', label: 'Confirmed' },
            { color: '#ef4444', label: 'Conflict Warning' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: l.color }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.label}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {shifts.length} shift{shifts.length !== 1 ? 's' : ''} loaded
          </div>
        </div>
      )}

      {/* Event Popover */}
      {selectedShift && anchorRect && (
        <EventPopover
          shift={selectedShift}
          anchorRect={anchorRect}
          onClose={() => { setSelectedShift(null); setAnchorRect(null); }}
          onSmartMatch={handleSmartMatch}
          onDelete={async (id) => {
            await apiRequest(`/roster/shifts/${id}`, { method: 'DELETE' });
            setSelectedShift(null);
            setAnchorRect(null);
            fetchShifts();
          }}
          isAdmin={isAdmin}
        />
      )}

      {/* Smart Match Modal */}
      {smartMatchShift && (
        <SmartMatchModal
          shiftId={smartMatchShift.id}
          shiftTitle={`${smartMatchShift.client_requirement?.client?.name || 'Shift'} (${smartMatchShift.client_requirement?.shift_date || ''})`}
          onClose={() => setSmartMatchShift(null)}
          onAssigned={fetchShifts}
        />
      )}

      {/* Create Shift Modal */}
      {createDate && (
        <ShiftCreateModal
          defaultDate={createDate}
          onClose={() => setCreateDate(null)}
          onCreated={() => { setCreateDate(null); fetchShifts(); }}
        />
      )}
    </div>

  );
};
