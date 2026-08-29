import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';

export const RequirementApprovalQueue: React.FC = () => {
  const [requirements, setRequirements] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [clientId, setClientId] = useState('');
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('15:00');
  const [headcount, setHeadcount] = useState(2);
  const [selectedSkillId, setSelectedSkillId] = useState('');

  const fetchRequirements = () => {
    setLoading(true);
    apiRequest('/requirements')
      .then((res) => setRequirements(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRequirements();
    apiRequest('/clients').then((res) => setClients(res || []));
    apiRequest('/workers/skills/all').then((res) => setSkills(res || []));
  }, []);

  const handleCreateRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return alert('Please select a Client site');
    try {
      await apiRequest('/requirements', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          shift_date: shiftDate,
          start_time: startTime,
          end_time: endTime,
          headcount,
          skill_ids: selectedSkillId ? [selectedSkillId] : [],
        }),
      });
      fetchRequirements();
      alert('Requirement submitted! It is now queued for Admin Approval.');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await apiRequest(`/requirements/${id}/approve`, { method: 'POST' });
      alert(`Requirement Approved! Generated ${res.shifts?.length || 0} open shift slots.`);
      fetchRequirements();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await apiRequest(`/requirements/${id}/reject`, { method: 'POST' });
      fetchRequirements();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        {/* Authoring Form */}
        <div className="card">
          <h3 style={{ fontSize: 18, color: 'var(--text-main)', marginBottom: 12 }}>📝 Post New Client Requirement</h3>
          <form onSubmit={handleCreateRequirement} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Client Work Site:</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
                required
              >
                <option value="">-- Select Client --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.payer?.name})</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Shift Date:</label>
                <input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} style={{ width: '100%', marginTop: 4 }} required />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Headcount (Workers):</label>
                <input type="number" min="1" max="50" value={headcount} onChange={(e) => setHeadcount(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }} required />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Start Time:</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ width: '100%', marginTop: 4 }} required />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>End Time:</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ width: '100%', marginTop: 4 }} required />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Required Mandatory Skill:</label>
              <select value={selectedSkillId} onChange={(e) => setSelectedSkillId(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                <option value="">-- Any Skill / Unspecified --</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
              Submit Requirement to Approval Queue
            </button>
          </form>
        </div>

        {/* Approval Queue Table */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 18, color: 'var(--text-main)' }}>📋 Admin Requirement Approval Queue</h3>
            <button onClick={fetchRequirements} className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}>
              🔄 Refresh
            </button>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            * Hard Rule: No shifts are generated until an Admin approves the requirement. Re-approving is idempotent.
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Loading approval queue...</div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Client Site</th>
                  <th>Date & Time</th>
                  <th>Headcount</th>
                  <th>Skills Needed</th>
                  <th>Status</th>
                  <th>Admin Action</th>
                </tr>
              </thead>
              <tbody>
                {requirements.map((req) => (
                  <tr key={req.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{req.client?.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{req.client?.payer?.name}</div>
                    </td>
                    <td>
                      <div>{req.shift_date}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{req.start_time} - {req.end_time}</div>
                    </td>
                    <td style={{ fontWeight: 700 }}>{req.headcount} workers</td>
                    <td>
                      {req.requirement_skills?.map((rs: any) => (
                        <span key={rs.id} className="badge badge-open" style={{ fontSize: 10 }}>{rs.skill?.name}</span>
                      ))}
                    </td>
                    <td>
                      <span className={`badge badge-${req.status === 'shifts_generated' || req.status === 'approved' ? 'confirmed' : req.status === 'rejected' ? 'danger' : 'pending'}`}>
                        {req.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {req.status === 'pending_admin_approval' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleApprove(req.id)} className="btn-emerald" style={{ padding: '4px 8px', fontSize: 11 }}>
                            ✓ Approve
                          </button>
                          <button onClick={() => handleReject(req.id)} className="btn-rose" style={{ padding: '4px 8px', fontSize: 11 }}>
                            ✕ Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Approved / Generated</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
