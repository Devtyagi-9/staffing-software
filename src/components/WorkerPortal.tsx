import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';

export const WorkerPortal = () => {
  const { user } = useAuth();
  const [shifts, setShifts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Availability state
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('17:00');
  const [isAvailable, setIsAvailable] = useState(true);

  const fetchWorkerData = () => {
    setLoading(true);
    apiRequest('/roster/shifts')
      .then((res) => {
        const allShifts = res.shifts || [];
        // Filter shifts where this worker is assigned
        if (user?.linked_worker_id) {
          const myShifts = allShifts.filter((s: any) =>
            s.assignments?.some((a: any) => a.worker_id === user.linked_worker_id)
          );
          setShifts(myShifts);
        } else {
          setShifts(allShifts);
        }
      })
      .catch((err) => console.error(err));

    apiRequest('/attendance/logs')
      .then((res) => {
        setLogs(res || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchWorkerData();
  }, [user?.linked_worker_id]);

  const handleClockIn = async (assignmentId: string, clientLat: number, clientLng: number) => {
    try {
      const res = await apiRequest('/attendance/clock-in', {
        method: 'POST',
        body: JSON.stringify({
          assignment_id: assignmentId,
          lat: clientLat,
          lng: clientLng,
        }),
      });
      alert(`Clock In Successful! Geofence Status: ${res.geofencePassed ? 'PASSED (Within 150m)' : 'FAILED'}. Distance: ${res.distanceMeters}m`);
      fetchWorkerData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleClockOut = async (timeLogId: string, clientLat: number, clientLng: number) => {
    try {
      const res = await apiRequest('/attendance/clock-out', {
        method: 'POST',
        body: JSON.stringify({
          time_log_id: timeLogId,
          lat: clientLat,
          lng: clientLng,
        }),
      });
      alert(`Clock Out Successful! Geofence Status: ${res.geofencePassed ? 'PASSED' : 'FAILED'}. Distance: ${res.distanceMeters}m`);
      fetchWorkerData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveAvailability = async (e: any) => {
    e.preventDefault();
    if (!user?.linked_worker_id) return alert('Select a worker role first!');
    try {
      await apiRequest(`/workers/${user.linked_worker_id}/availabilities`, {
        method: 'POST',
        body: JSON.stringify({
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          is_available: isAvailable,
        }),
      });
      alert('Availability rule updated!');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: 'var(--text-main)' }}>📱 Worker Mobile Portal</h2>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Logged in as: <strong style={{ color: '#34d399' }}>{user?.worker_name || user?.email}</strong>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Assigned Shifts & Attendance */}
        <div className="card">
          <h3 style={{ fontSize: 18, color: 'var(--text-main)', marginBottom: 12 }}>📅 My Assigned Shifts & Geofenced Clock-In</h3>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Loading shifts...</div>
          ) : shifts.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No upcoming shifts assigned to you yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {shifts.map((shift) => {
                const client = shift.client_requirement?.client;
                const assignment = shift.assignments?.find((a: any) => !user?.linked_worker_id || a.worker_id === user.linked_worker_id);
                const timeLog = assignment?.time_logs?.[0];

                return (
                  <div
                    key={shift.id}
                    style={{
                      background: '#f0f4ff',
                      border: '1px solid var(--border-color)',
                      borderRadius: 10,
                      padding: 16,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>
                        {client?.name}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)', marginTop: 2 }}>
                        {shift.client_requirement?.shift_date} ({shift.client_requirement?.start_time} - {shift.client_requirement?.end_time})
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        📍 Location: {client?.address_line} (Lat: {client?.lat}, Lng: {client?.lng})
                      </div>

                      {timeLog && (
                        <div style={{ marginTop: 8, fontSize: 12 }}>
                          <span className={`badge ${timeLog.geofence_passed ? 'badge-confirmed' : 'badge-danger'}`}>
                            {timeLog.geofence_passed ? '✅ Geofence Passed (<150m)' : '❌ Outside Geofence'}
                          </span>
                          <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
                            Status: <strong>{timeLog.status.toUpperCase()}</strong>
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      {!timeLog ? (
                        <button
                          onClick={() => handleClockIn(assignment.id, client.lat, client.lng)}
                          className="btn-emerald"
                          style={{ fontSize: 13 }}
                        >
                          📍 Clock In (Geofenced)
                        </button>
                      ) : !timeLog.clock_out_at ? (
                        <button
                          onClick={() => handleClockOut(timeLog.id, client.lat, client.lng)}
                          className="btn-rose"
                          style={{ fontSize: 13 }}
                        >
                          ⏹️ Clock Out
                        </button>
                      ) : (
                        <span className="badge badge-completed" style={{ padding: '6px 12px' }}>
                          Shift Completed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Self-Service Availability Editor */}
        <div className="card">
          <h3 style={{ fontSize: 18, color: 'var(--text-main)', marginBottom: 12 }}>⚙️ Availability Self-Service</h3>
          <form onSubmit={handleSaveAvailability} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Recurring Day of Week:</label>
              <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }}>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
                <option value={0}>Sunday</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Start Time:</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>End Time:</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-main)' }}>
                <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
                Available for Shift Assignments
              </label>
            </div>

            <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
              Save Availability Rule
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
