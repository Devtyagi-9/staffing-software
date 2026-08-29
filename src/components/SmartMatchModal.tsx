import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';

interface SmartMatchModalProps {
  shiftId: string;
  shiftTitle: string;
  onClose: () => void;
  onAssigned: () => void;
}

export const SmartMatchModal: React.FC<SmartMatchModalProps> = ({
  shiftId,
  shiftTitle,
  onClose,
  onAssigned,
}) => {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiRequest(`/matching/suggest/${shiftId}`)
      .then((res) => {
        setCandidates(res.candidates || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [shiftId]);

  const handleAssign = async (workerId: string) => {
    setAssigningId(workerId);
    setWarningMsg(null);
    try {
      const res = await apiRequest('/roster/assign', {
        method: 'POST',
        body: JSON.stringify({ shift_id: shiftId, worker_id: workerId }),
      });
      if (res.has_conflict_warning) {
        setWarningMsg(res.warning_message);
        setTimeout(() => {
          onAssigned();
          onClose();
        }, 2000);
      } else {
        onAssigned();
        onClose();
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 18, color: 'var(--text-main)' }}>🤖 Smart Candidate Recommendations</h3>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Two-Phase Match Algorithm for <strong style={{ color: 'var(--primary)' }}>{shiftTitle}</strong>
            </div>
          </div>
          <button onClick={onClose} className="btn-secondary" style={{ padding: '4px 10px' }}>✕</button>
        </div>

        {warningMsg && (
          <div style={{ background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', color: '#92400e', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            ⚠️ {warningMsg}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Running 2-phase matching algorithm...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {candidates.map((c) => (
              <div
                key={c.worker_id}
                style={{
                  background: c.passed_phase1 ? '#ffffff' : '#fff8f8',
                  border: `1.5px solid ${c.passed_phase1 ? 'var(--border-color)' : '#fca5a5'}`,
                  borderRadius: 10,
                  padding: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-main)' }}>{c.name}</span>
                    {c.passed_phase1 ? (
                      <span className="badge badge-confirmed">Phase 1 PASS</span>
                    ) : (
                      <span className="badge badge-danger">Phase 1 FAIL</span>
                    )}
                    {c.passed_phase1 && (
                      <span style={{ background: '#6366f1', color: 'white', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                        Score: {c.total_score}/100
                      </span>
                    )}
                  </div>

                  {!c.passed_phase1 && (
                    <div style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>
                      ❌ Failure Reasons: {c.phase1_failures.join(' • ')}
                    </div>
                  )}

                  {c.passed_phase1 && (
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>📍 Proximity: <strong>{c.breakdown.proximity_km} km</strong> ({c.breakdown.proximity_score} pts)</span>
                      <span>⏱️ 7d Hours: <strong>{c.breakdown.utilization_hours}h</strong> ({c.breakdown.utilization_score} pts)</span>
                      <span>⭐ Reliability: <strong>{Math.round(c.breakdown.reliability_rate * 100)}%</strong> ({c.breakdown.reliability_score} pts)</span>
                    </div>
                  )}
                </div>

                <div>
                  <button
                    disabled={assigningId === c.worker_id}
                    onClick={() => handleAssign(c.worker_id)}
                    className={c.passed_phase1 ? 'btn-primary' : 'btn-secondary'}
                    style={{ fontSize: 13, padding: '8px 14px' }}
                  >
                    {assigningId === c.worker_id ? 'Assigning...' : 'Assign Worker'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
