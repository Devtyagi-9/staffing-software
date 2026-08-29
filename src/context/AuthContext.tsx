import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from '../api/client';

export interface UserState {
  id: string;
  agency_id: string;
  agency_name: string;
  default_currency: string;
  email: string;
  role: 'admin' | 'coordinator' | 'worker' | 'payer_readonly';
  linked_worker_id?: string | null;
  worker_name?: string | null;
}

interface AuthContextType {
  user: UserState | null;
  token: string | null;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserState | null>(() => {
    const saved = localStorage.getItem('staffing_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('staffing_jwt_token');
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (token) {
      apiRequest('/auth/me')
        .then((res) => {
          setUser(res.user);
          localStorage.setItem('staffing_user', JSON.stringify(res.user));
        })
        .catch(() => {
          logout();
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (email: string, password = 'Password123!') => {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('staffing_jwt_token', data.token);
    localStorage.setItem('staffing_user', JSON.stringify(data.user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('staffing_jwt_token');
    localStorage.removeItem('staffing_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
