const API_BASE = '/api';

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('staffing_jwt_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Unauthorized
    localStorage.removeItem('staffing_jwt_token');
    localStorage.removeItem('staffing_user');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP error ${response.status}`);
  }

  return data;
}

export async function createShift(payload: any) {
  return apiRequest('/roster/shifts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
