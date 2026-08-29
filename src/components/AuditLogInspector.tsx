import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';

export const AuditLogInspector: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [entityFilter, setEntityFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = () => {
    setLoading(true);
    const query = entityFilter ? `?entity_type=${entityFilter}` : '';
    apiRequest(`/config/audit-logs${query}`)
      .then((res) => setLogs(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
  }, [entityFilter]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, color: 'var(--text-main)' }}>🛡️ Audit Log Trail & Compliance Inspector</h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Immutable audit record of all mutations to Assignments, Wage Rates, Bill Rates, Invoices & Requirement Approvals
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
            <option value="">-- All Entity Mutations --</option>
            <option value="Assignment">Assignment</option>
            <option value="WageRate">WageRate</option>
            <option value="BillRate">BillRate</option>
            <option value="Invoice">Invoice</option>
            <option value="ClientRequirement">ClientRequirement</option>
            <option value="TimeLog">TimeLog</option>
          </select>
          <button onClick={fetchLogs} className="btn-secondary">🔄 Refresh Logs</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Loading audit records...</div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor / User</th>
                <th>Entity Type</th>
                <th>Entity ID</th>
                <th>Action</th>
                <th>Before / After Payload</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 600 }}>{log.actor?.email || 'System / Auto'}</td>
                  <td>
                    <span className="badge badge-open" style={{ fontSize: 11 }}>{log.entity_type}</span>
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{log.entity_id.substring(0, 8)}...</td>
                  <td style={{ fontWeight: 700, color: '#34d399' }}>{log.action}</td>
                  <td style={{ fontSize: 11, fontFamily: 'monospace', maxWidth: 300, overflow: 'hidden' }}>
                    {log.after_json || log.before_json || '{}'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
