'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { User, BusinessUnit, BusinessUnitList, Company } from '@/types';

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
  businessUnits: BusinessUnit[];
  businessUnitsLoading: boolean;
  activeBusinessUnitId: string | null;
  setActiveBusinessUnitId: (id: string | null) => void;
  refreshBusinessUnits: () => Promise<void>;
  companies: Company[];
  companiesLoading: boolean;
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string | null) => void;
  refreshCompanies: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_BU_KEY = 'active_business_unit_id';
const ACTIVE_COMPANY_KEY = 'active_company_id';
const ALL_SENTINEL = 'all';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [businessUnitsLoading, setBusinessUnitsLoading] = useState(false);
  const [activeBusinessUnitId, setActiveBusinessUnitIdState] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);

  const setActiveBusinessUnitId = useCallback((id: string | null) => {
    setActiveBusinessUnitIdState(id);
    if (id) {
      localStorage.setItem(ACTIVE_BU_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_BU_KEY);
    }
  }, []);

  const setActiveCompanyId = useCallback((id: string | null) => {
    setActiveCompanyIdState(id);
    if (id) {
      localStorage.setItem(ACTIVE_COMPANY_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_COMPANY_KEY);
    }
  }, []);

  const refreshBusinessUnits = useCallback(async () => {
    if (!user || !user.tenant_id) {
      setBusinessUnits([]);
      return;
    }
    setBusinessUnitsLoading(true);
    try {
      const res = await api.get<BusinessUnitList>('/business-units');
      setBusinessUnits(res.data.items || []);
    } catch {
      setBusinessUnits([]);
    } finally {
      setBusinessUnitsLoading(false);
    }
  }, [user]);

  const refreshCompanies = useCallback(async () => {
    if (!user || !user.tenant_id) {
      setCompanies([]);
      return;
    }
    setCompaniesLoading(true);
    try {
      const res = await api.get<Company[]>('/companies');
      setCompanies(res.data || []);
    } catch {
      setCompanies([]);
    } finally {
      setCompaniesLoading(false);
    }
  }, [user]);

  const fetchUser = useCallback(async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch {
      localStorage.removeItem('user');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (user && user.tenant_id) {
      refreshCompanies();
      refreshBusinessUnits();
    } else {
      setCompanies([]);
      setBusinessUnits([]);
    }
  }, [user, refreshCompanies, refreshBusinessUnits]);

  useEffect(() => {
    const storedBu = localStorage.getItem(ACTIVE_BU_KEY);
    if (storedBu) {
      setActiveBusinessUnitIdState(storedBu);
    } else if (user?.business_unit_id) {
      setActiveBusinessUnitIdState(user.business_unit_id);
    }
  }, [user]);

  useEffect(() => {
    const storedCo = localStorage.getItem(ACTIVE_COMPANY_KEY);
    if (storedCo === ALL_SENTINEL) {
      setActiveCompanyIdState(null);
    } else if (storedCo) {
      setActiveCompanyIdState(storedCo);
    } else if (user?.primary_company_id) {
      setActiveCompanyIdState(user.primary_company_id);
      localStorage.setItem(ACTIVE_COMPANY_KEY, user.primary_company_id);
    }
  }, [user]);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user: userData } = response.data;
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout failed:', error);
    }
    localStorage.removeItem('user');
    localStorage.removeItem(ACTIVE_BU_KEY);
    localStorage.removeItem(ACTIVE_COMPANY_KEY);
    setUser(null);
    setBusinessUnits([]);
    setCompanies([]);
    setActiveBusinessUnitIdState(null);
    setActiveCompanyIdState(null);
    window.location.href = '/login';
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...updates } : prev);
  }, []);

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
        businessUnits,
        businessUnitsLoading,
        activeBusinessUnitId,
        setActiveBusinessUnitId,
        refreshBusinessUnits,
        companies,
        companiesLoading,
        activeCompanyId,
        setActiveCompanyId,
        refreshCompanies,
        login,
        logout,
        updateUser,
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
