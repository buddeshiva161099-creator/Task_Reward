'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import ownerApi from '@/lib/ownerApi';
import { PlatformOwner } from '@/types';

interface OwnerAuthContextType {
  owner: PlatformOwner | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const OwnerAuthContext = createContext<OwnerAuthContextType | undefined>(undefined);

export function OwnerAuthProvider({ children }: { children: React.ReactNode }) {
  const [owner, setOwner] = useState<PlatformOwner | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOwner = useCallback(async () => {
    try {
      const response = await ownerApi.get('/platform/me');
      setOwner(response.data);
    } catch {
      localStorage.removeItem('platform_owner');
      setOwner(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOwner();
  }, [fetchOwner]);

  const login = async (email: string, password: string) => {
    const response = await ownerApi.post('/platform/auth/login', { email, password });
    const { owner: ownerData } = response.data;
    localStorage.setItem('platform_owner', JSON.stringify(ownerData));
    setOwner(ownerData);
  };

  const logout = useCallback(async () => {
    try {
      // Clear cookies on backend
      await ownerApi.post('/auth/logout');
    } catch (error) {
      console.error('Logout failed:', error);
    }
    localStorage.removeItem('platform_owner');
    setOwner(null);
    window.location.href = '/owner/login';
  }, []);

  return (
    <OwnerAuthContext.Provider value={{ owner, isLoading, login, logout }}>
      {children}
    </OwnerAuthContext.Provider>
  );
}

export function useOwnerAuth() {
  const context = useContext(OwnerAuthContext);
  if (context === undefined) {
    throw new Error('useOwnerAuth must be used within an OwnerAuthProvider');
  }
  return context;
}
