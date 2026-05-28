'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  isHR: boolean;
  isManager: boolean;
  isAssistantManager: boolean;
  isEmployee: boolean;
  isHRTeam: boolean;
  isTaskTeam: boolean;
  canManageAttendance: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setIsLoading(false);
        return;
      }
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { access_token, user: userData } = response.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
    } catch (error) {
      console.error('Login failed:', error);
      throw error; // Re-throw to let the UI component show an error message
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/login';
  };

  const role = user?.role;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAdmin: role === 'admin',
        isHR: role === 'hr_manager' || role === 'assistant_hr_manager',
        isManager: role === 'manager',
        isAssistantManager: role === 'assistant_manager',
        isEmployee: role === 'employee',
        isHRTeam: role === 'admin' || role === 'hr_manager' || role === 'assistant_hr_manager',
        isTaskTeam: role === 'admin' || role === 'manager' || role === 'assistant_manager',
        canManageAttendance: role === 'admin' || role === 'hr_manager' || role === 'assistant_hr_manager',
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
