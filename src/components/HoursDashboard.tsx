import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';

export const HoursDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = () => {
    setLoading(true);
    Promise.all([
      apiRequest('/attendance/dashboard-stats'),
      apiRequest('/attendance/logs'),
    ])
      .then(([statsRes, logsRes]) => {
        setStats(statsRes);
        setLogs(logsRes || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleApproveLog = async (id: string) => {
    try {
      await apiRequest(`/attendance/logs/${id}/approve`, { method: 'POST' });
      alert('TimeLog Approved!');
      fetchDashboardData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddAdjustment = async (id: string, originalHours: number) => {
    const reason = prompt('Enter adjustment reason (e.g. Overtime correction, Break deduction):', 'Correction for unpaid break');
    if (!reason) return;
    const correctedStr = prompt('Enter corrected total hours:', String(originalHours - 0.5));
    if (!correctedStr) return;

    try {
      await apiRequest(`/attendance/logs/${id}/adjustments`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          original_hours: originalHours,
          corrected_hours: Number(correctedStr),
        }),
      });
      alert('TimeLog Adjustment Recorded! (Will apply as credit/debit on next invoice)');
      fetchDashboardData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: 'var(--text-main)' }}>⏱️ Hours & Scheduled vs Actual Variance Dashboard</h2>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Real-time timesheet approval workflow, overtime metrics, and time log adjustments
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading analytics...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Scheduled Hours</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-main)', marginTop: 4 }}>
                {stats?.summary?.total_scheduled_hours || 0} hrs
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Actual Hours Logged</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {stats?.summary?.total_actual_hours || 0} hrs
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Scheduled vs Actual Variance</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: (stats?.summary?.variance_hours || 0) >= 0 ? '#fbbf24' : '#6366f1', marginTop: 4 }}>
                {(stats?.summary?.variance_hours || 0) > 0 ? `+${stats?.summary?.variance_hours}` : stats?.summary?.variance_hours || 0} hrs
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Overtime Hours ({'>'}8h)</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f87171', marginTop: 4 }}>
                {stats?.summary?.total_overtime_hours || 0} hrs
              </div>
            </div>
          </div>

          {/* TimeLogs Table */}
          <div className="card">
            <h3 style={{ fontSize: 18, color: 'var(--text-main)', marginBottom: 12 }}>📋 Timesheet Approvals & Adjustments</h3>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Client Site</th>
                  <th>Clock In / Clock Out</th>
                  <th>Geofence</th>
                  <th>Hours</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const worker = log.assignment?.worker;
                  const client = log.assignment?.shift?.client_requirement?.client;

                  const clockIn = new Date(log.clock_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const clockOut = log.clock_out_at
                    ? new Date(log.clock_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'In Progress';

                  const duration = log.clock_out_at
                    ? (new Date(log.clock_out_at).getTime() - new Date(log.clock_in_at).getTime()) / (1000 * 60 * 60)
                    : 8;

                  return (
                    <tr key={log.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{worker?.name}</td>
                      <td>{client?.name}</td>
                      <td>
                        {clockIn} → {clockOut}
                      </td>
                      <td>
                        <span className={`badge ${log.geofence_passed ? 'badge-confirmed' : 'badge-danger'}`}>
                          {log.geofence_passed ? 'PASS (<150m)' : 'FAIL'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {Math.round(duration * 10) / 10}h
                        {log.adjustments?.length > 0 && (
                          <span style={{ fontSize: 11, color: '#d97706', marginLeft: 4 }}>
                            (Adjusted to {log.adjustments[log.adjustments.length - 1].corrected_hours}h)
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge badge-${log.status === 'billed' ? 'completed' : log.status === 'approved' ? 'confirmed' : 'pending'}`}>
                          {log.status.toUpperCase()}
                        </span>
                        {log.billed_at && (
                          <div style={{ fontSize: 10, color: '#a7f3d0' }}>🔒 Billed (Immutable)</div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {log.status === 'pending_approval' && (
                            <button onClick={() => handleApproveLog(log.id)} className="btn-emerald" style={{ padding: '4px 8px', fontSize: 11 }}>
                              Approve
                            </button>
                          )}
                          <button
                            onClick={() => handleAddAdjustment(log.id, duration)}
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: 11 }}
                          >
                            + Adjust Hours
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
