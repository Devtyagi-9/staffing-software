import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';

export const LaborConfigEditor: React.FC = () => {
  const [maxDailyHours, setMaxDailyHours] = useState(10);
  const [maxWeeklyHours, setMaxWeeklyHours] = useState(38);
  const [minRestHours, setMinRestHours] = useState(10);
  const [geofenceRadius, setGeofenceRadius] = useState(150);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest('/config/labor')
      .then((res) => {
        if (res) {
          setMaxDailyHours(res.max_daily_hours);
          setMaxWeeklyHours(res.max_weekly_hours);
          setMinRestHours(res.min_rest_hours);
          setGeofenceRadius(res.geofence_radius_meters);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/config/labor', {
        method: 'PUT',
        body: JSON.stringify({
          max_daily_hours: maxDailyHours,
          max_weekly_hours: maxWeeklyHours,
          min_rest_hours: minRestHours,
          geofence_radius_meters: geofenceRadius,
        }),
      });
      alert('Labor Compliance Configuration Updated!');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 650 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: 'var(--text-main)' }}>⚙️ Labor Compliance & Geofence Configuration</h2>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Editable agency rules enforced during Phase 1 candidate matching and attendance clocking
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Loading rules...</div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>Maximum Daily Hours per Worker (Hours):</label>
              <input type="number" step="0.5" value={maxDailyHours} onChange={(e) => setMaxDailyHours(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }} required />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Candidate matching Phase 1 blocks workers exceeding this daily limit.</div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>Maximum Weekly Hours per Worker (Hours):</label>
              <input type="number" step="0.5" value={maxWeeklyHours} onChange={(e) => setMaxWeeklyHours(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }} required />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Australia standard labor default is 38.0 hours/week.</div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>Minimum Mandatory Rest Period Between Shifts (Hours):</label>
              <input type="number" step="0.5" value={minRestHours} onChange={(e) => setMinRestHours(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }} required />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Ensures minimum rest hours between consecutive assignments.</div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>Geofence Radius Threshold (Meters):</label>
              <input type="number" value={geofenceRadius} onChange={(e) => setGeofenceRadius(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }} required />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Radius for clock-in/out coordinate validation (Default: 150m).</div>
            </div>

            <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
              Save Labor Rules
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
