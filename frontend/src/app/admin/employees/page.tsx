'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Employee } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import UserLink from '@/components/UserLink';
import { formatDate } from '@/lib/utils';
import {
  Users, Plus, Search, UserCheck, UserX, Trophy, X, Mail, Lock, User, Eye, EyeOff, Shield, Briefcase, Loader2, UserPlus, Phone, PhoneCall, Trash2, Edit2, Check, Copy, ArrowRight, ArrowLeft, Calendar, MapPin, Layers, Wallet
} from 'lucide-react';
import Link from 'next/link';
import { TableSkeleton } from '@/components/SkeletonLoaders';

export default function EmployeesPage() {
  const { user, isHRTeam, isAdmin, isManager, isAssistantManager, businessUnits } = useAuth();
  const isManagementOnly = (isManager || isAssistantManager) && !isHRTeam;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allUsers, setAllUsers] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 4-Step MNC Wizard State for Create
  const [activeStep, setActiveStep] = useState(1);
  const [newEmployee, setNewEmployee] = useState({
    name: '', email: '', password: '', role: 'employee',
    mobile: '', alternate_mobile: '',
    reporting_manager_id: '', hr_reporting_manager_id: '',
    // visual MNC details
    job_title: '', department: '', branch: '', identity_card_type: '', emergency_contact: '',
    hiring_date: new Date().toISOString().split('T')[0],
    hiring_company: '', business_unit_id: ''
  });

  // Edit Modal Credentials & Password states
  const [editForm, setEditForm] = useState({
    name: '', email: '', mobile: '', alternate_mobile: '',
    is_active: true, reward_points: 0,
    role: 'employee',
    reporting_manager_id: '', hr_reporting_manager_id: '',
    business_unit_id: ''
  });
  const [showRawPassword, setShowRawPassword] = useState(false);
  const [changePasswordChecked, setChangePasswordChecked] = useState(false);
  const [newPasswordVal, setNewPasswordVal] = useState('');

  // Salary structure states inside Edit Modal
  const [structBasic, setStructBasic] = useState(0);
  const [structHra, setStructHra] = useState(0);
  const [structSpecial, setStructSpecial] = useState(0);
  const [structPf, setStructPf] = useState(0);
  const [structEsi, setStructEsi] = useState(0);
  const [structTax, setStructTax] = useState(0);

  // Welcome / Onboarding Credentials Card State
  const [welcomeCredentials, setWelcomeCredentials] = useState<{
    name: string;
    email: string;
    password: string;
    role: string;
  } | null>(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  // Role Pill Filter State
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await api.get('/admin/employees');
      setEmployees(res.data);
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllUsers = useCallback(async () => {
    try {
      const res = await api.get('/admin/employees/all-users');
      setAllUsers(res.data);
    } catch (err) {
      console.error('Failed to fetch all users:', err);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
    fetchAllUsers();
  }, [fetchEmployees, fetchAllUsers]);

  // Read URL query parameters to pre-select filters
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const roleParam = searchParams.get('role');
    if (roleParam) {
      setSelectedRoleFilter(roleParam);
      // Clean query parameters from URL silently
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const editId = searchParams.get('edit');
    if (editId && employees.length > 0) {
      const emp = employees.find(e => e.id === editId);
      if (emp) {
        openEdit(emp);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [employees]);

  // Dynamic welcome email generator
  const handleNameChange = (nameVal: string) => {
    const formattedName = nameVal.trim().toLowerCase().replace(/\s+/g, '.');
    const autoEmail = formattedName ? `${formattedName}@company.com` : '';
    setNewEmployee(prev => ({
      ...prev,
      name: nameVal,
      email: autoEmail
    }));
  };

  const formatApiError = (err: unknown, fallbackMessage: string) => {
    const axiosError = err as { response?: { data?: any } };
    const detail = axiosError.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item?.msg) return item.msg;
          if (item?.message) return item.message;
          return JSON.stringify(item);
        })
        .join(' | ');
    }
    if (detail && typeof detail === 'object') {
      return detail.message || JSON.stringify(detail);
    }
    return fallbackMessage;
  };

  // Secure password generator
  const generateTempPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pass = 'Temp@';
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewEmployee(prev => ({ ...prev, password: pass }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    // Prepare payload
    const payload: Record<string, any> = {
      name: newEmployee.name,
      email: newEmployee.email,
      password: newEmployee.password,
      role: newEmployee.role,
      mobile: newEmployee.mobile,
      alternate_mobile: newEmployee.alternate_mobile || undefined,
      reporting_manager_id: newEmployee.reporting_manager_id || undefined,
      hr_reporting_manager_id: newEmployee.hr_reporting_manager_id || undefined,
      business_unit_id: newEmployee.business_unit_id || undefined,
      identity_card_type: newEmployee.identity_card_type || undefined,
      emergency_contact: newEmployee.emergency_contact || undefined,
      job_title: newEmployee.job_title || undefined,
      department: newEmployee.department || undefined,
      branch: newEmployee.branch || undefined,
      hiring_date: newEmployee.hiring_date || undefined,
      hiring_company: newEmployee.hiring_company || undefined,
    };
    if (isManagementOnly && user) {
      payload.reporting_manager_id = user.id;
      payload.role = 'employee';
    }

    try {
      await api.post('/admin/employees', payload);
      
      // Store details to trigger the welcome credentials card modal
      setWelcomeCredentials({
        name: payload.name,
        email: payload.email,
        password: payload.password,
        role: payload.role
      });
      
      setShowCreateModal(false);
      setShowWelcomeModal(true);
      
      // Reset State
      setNewEmployee({
        name: '', email: '', password: '', role: 'employee',
        mobile: '', alternate_mobile: '',
        reporting_manager_id: '', hr_reporting_manager_id: '',
        job_title: '', department: '', branch: '', identity_card_type: '', emergency_contact: '',
        hiring_date: new Date().toISOString().split('T')[0],
        hiring_company: '', business_unit_id: ''
      });
      setActiveStep(1);
      
      fetchEmployees();
      fetchAllUsers();
    } catch (err: unknown) {
      setError(formatApiError(err, 'Failed to create employee'));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = async (emp: any) => {
    setEditEmployee(emp);
    setEditForm({
      name: emp.name,
      email: emp.email,
      mobile: emp.mobile || '',
      alternate_mobile: emp.alternate_mobile || '',
      is_active: emp.is_active,
      reward_points: emp.reward_points || 0,
      role: emp.role || 'employee',
      reporting_manager_id: emp.reporting_manager_id || '',
      hr_reporting_manager_id: emp.hr_reporting_manager_id || '',
      business_unit_id: emp.business_unit_id || '',
    });
    setChangePasswordChecked(false);
    setNewPasswordVal('');
    setShowRawPassword(false);
    setShowEditModal(true);

    // Fetch salary structure
    setStructBasic(0);
    setStructHra(0);
    setStructSpecial(0);
    setStructPf(0);
    setStructEsi(0);
    setStructTax(0);
    try {
      const structRes = await api.get(`/payroll/structure/${emp.id}`);
      setStructBasic(structRes.data.basic || 0);
      setStructHra(structRes.data.hra || 0);
      setStructSpecial(structRes.data.special_allowance || 0);
      setStructPf(structRes.data.pf_deduction || 0);
      setStructEsi(structRes.data.esi_deduction || 0);
      setStructTax(structRes.data.tax_deduction || 0);
    } catch (err) {
      console.log('No salary structure configured for this employee yet.');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEmployee) return;
    setSaving(true);
    setError('');

    // Replicate step-3 organizational validation checks before calling update
    const isHrOrAdmin = isHRTeam || isAdmin;
    if (isHrOrAdmin) {
      if (editForm.role === 'employee' && (!editForm.reporting_manager_id || !editForm.hr_reporting_manager_id)) {
        setError('An Employee must be assigned to both an Assistant Manager and an Assistant HR Partner.');
        setSaving(false);
        return;
      }
      if (editForm.role === 'assistant_manager' && !editForm.reporting_manager_id) {
        setError('An Assistant Manager must be assigned to a Manager Partner.');
        setSaving(false);
        return;
      }
      if (editForm.role === 'assistant_hr_manager' && !editForm.hr_reporting_manager_id) {
        setError('An Assistant HR Manager must be assigned to an HR Manager Partner.');
        setSaving(false);
        return;
      }
    }

    const payload: Record<string, any> = { ...editForm };
    if (changePasswordChecked && newPasswordVal) {
      payload.password = newPasswordVal;
    }

    try {
      await api.put(`/admin/employees/${editEmployee.id}`, payload);
      
      // If HR/Admin, also save the Salary Structure
      if (isHRTeam || isAdmin) {
        try {
          await api.post('/payroll/structure', {
            user_id: editEmployee.id,
            basic: structBasic,
            hra: structHra,
            special_allowance: structSpecial,
            pf_deduction: structPf,
            esi_deduction: structEsi,
            tax_deduction: structTax,
          });
        } catch (sErr) {
          console.error('Failed to save salary structure:', sErr);
        }
      }

      // If password was updated, trigger credentials share dialog
      if (changePasswordChecked && newPasswordVal) {
        setWelcomeCredentials({
          name: editForm.name,
          email: editForm.email,
          password: newPasswordVal,
          role: editForm.role
        });
        setShowWelcomeModal(true);
      }

      setShowEditModal(false);
      fetchEmployees();
    } catch (err: unknown) {
      setError(formatApiError(err, 'Failed to update employee'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (emp: Employee) => {
    try {
      await api.put(`/admin/employees/${emp.id}`, { is_active: !emp.is_active });
      fetchEmployees();
    } catch (err) {
      console.error('Failed to update employee:', err);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('Are you sure you want to soft-delete this employee?')) return;
    try {
      await api.delete(`/admin/employees/${id}`);
      fetchEmployees();
      fetchAllUsers();
    } catch (err) {
      console.error('Failed to delete employee:', err);
    }
  };

  const copyWelcomeCredentials = () => {
    if (!welcomeCredentials) return;
    const body = `Hello ${welcomeCredentials.name},

Welcome to the team! Here are your corporate login credentials for TaskTracker:

Role: ${welcomeCredentials.role.replace(/_/g, ' ').toUpperCase()}
Corporate Email: ${welcomeCredentials.email}
Temporary Password: ${welcomeCredentials.password}

Login Link: ${window.location.origin}/login

Please log in and update your password immediately upon first authentication.

Best Regards,
HR Operations & Management`;
    
    navigator.clipboard.writeText(body);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 2000);
  };

  const filtered = employees.filter(
    (e) =>
      (selectedRoleFilter === 'all' || e.role === selectedRoleFilter) &&
      (e.name.toLowerCase().includes(search.toLowerCase()) ||
       e.email.toLowerCase().includes(search.toLowerCase()))
  );

  const getRoleBadge = (role: string) => {
    const badges: Record<string, string> = {
      admin: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      hr_manager: 'bg-purple-100 text-purple-700 border-purple-200',
      assistant_hr_manager: 'bg-violet-100 text-violet-700 border-violet-200',
      manager: 'bg-blue-100 text-blue-700 border-blue-200',
      assistant_manager: 'bg-sky-100 text-sky-700 border-sky-200',
      employee: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    };
    return badges[role] || 'bg-slate-100 text-slate-700 border-slate-200';
  };

  if (loading) {
    return <TableSkeleton cols={6} rows={8} />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">
            {isManagementOnly ? 'My Team Members' : 'Employees'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isManagementOnly
              ? `Manage members assigned to you (${filtered.length} members)`
              : 'Manage team members, hierarchy reporting, and corporate credentials'}
          </p>
        </div>
        <button
          id="create-employee-btn"
          onClick={() => {
            setShowCreateModal(true);
            setActiveStep(1);
            generateTempPassword();
          }}
          className="btn btn-primary shadow-lg shadow-indigo-100"
        >
          <Plus className="w-4 h-4" />
          Add {isManagementOnly ? 'Team Member' : 'Employee'}
        </button>
      </div>

      {/* Role Pill Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: 'all', label: 'All Personnel', count: allUsers.length },
          { id: 'employee', label: 'Employees', count: allUsers.filter(u => u.role === 'employee').length },
          { id: 'manager', label: 'Managers', count: allUsers.filter(u => u.role === 'manager').length },
          { id: 'assistant_manager', label: 'Asst Managers', count: allUsers.filter(u => u.role === 'assistant_manager').length },
          { id: 'hr_manager', label: 'HR Managers', count: allUsers.filter(u => u.role === 'hr_manager').length },
          { id: 'assistant_hr_manager', label: 'Asst HR Managers', count: allUsers.filter(u => u.role === 'assistant_hr_manager').length },
        ].map((pill) => (
          <button
            key={pill.id}
            onClick={() => setSelectedRoleFilter(pill.id)}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 border flex items-center gap-2 ${
              selectedRoleFilter === pill.id
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>{pill.label}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              selectedRoleFilter === pill.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
            }`}>
              {pill.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="glass rounded-xl p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
            placeholder="Search employees by name or email..."
          />
        </div>
      </div>

      {/* Employee Table */}
      <div className="glass rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[800px] lg:min-w-full">
          <thead className="bg-slate-50 text-muted-foreground font-medium border-b border-border">
            <tr>
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Rewards</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Joined</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((emp) => (
              <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <UserLink
                    id={emp.id}
                    name={emp.name}
                    email={emp.email}
                    reward_points={emp.reward_points}
                    role={emp.role}
                  />
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getRoleBadge(emp.role)}`}>
                    {emp.role.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1 text-yellow-600 font-semibold">
                    <Trophy className="w-3.5 h-3.5" />
                    {emp.reward_points}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${emp.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                    {emp.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 text-muted-foreground text-xs">{formatDate(emp.created_at)}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/employees/detail?id=${emp.id}`}
                      className="btn btn-secondary text-xs px-3 py-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </Link>
                    <button
                      onClick={() => openEdit(emp)}
                      className="btn btn-secondary text-xs px-3 py-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(emp)}
                      className={`btn text-xs px-3 py-1.5 ${emp.is_active ? 'btn-danger' : 'btn-secondary'}`}
                    >
                      {emp.is_active ? (
                        <><UserX className="w-3.5 h-3.5" /> Deactivate</>
                      ) : (
                        <><UserCheck className="w-3.5 h-3.5" /> Activate</>
                      )}
                    </button>
                    {/* Only HR team can delete */}
                    {isHRTeam && (
                      <button
                        onClick={() => handleDeleteEmployee(emp.id)}
                        className="btn btn-danger text-xs px-3 py-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  {search ? 'No matching members found' : 'No team members yet. Add your first one!'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 4-Step Create Onboarding Modal */}
      {showCreateModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content max-w-2xl bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 md:p-8">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                    <UserPlus className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Onboard New Personnel</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-0.5">MNC-grade Onboarding Flow</p>
                  </div>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Stepper Progress */}
              <div className="flex items-center justify-between mb-10 px-2">
                {[
                  { step: 1, label: 'Profile', icon: User },
                  { step: 2, label: 'Job Placement', icon: Briefcase },
                  { step: 3, label: 'Hierarchy', icon: Layers },
                  { step: 4, label: 'Security & Access', icon: Lock }
                ].map((s, idx) => (
                  <div key={s.step} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center relative">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                        activeStep === s.step
                          ? 'bg-indigo-600 text-white border-indigo-600 ring-4 ring-indigo-100 scale-110 shadow-lg'
                          : activeStep > s.step
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-white text-slate-400 border-slate-200'
                      }`}>
                        {activeStep > s.step ? <Check className="w-5 h-5 animate-scale-up" /> : <s.icon className="w-4 h-4" />}
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 mt-2.5 text-center hidden md:block">
                        {s.label}
                      </span>
                    </div>
                    {idx < 3 && (
                      <div className={`h-1 flex-1 mx-4 rounded transition-all duration-500 ${
                        activeStep > s.step ? 'bg-emerald-500' : 'bg-slate-200'
                      }`} />
                    )}
                  </div>
                ))}
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-bold flex items-center gap-2">
                  <X className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-6">
                {/* STEP 1: Personal Profile */}
                {activeStep === 1 && (
                  <div className="space-y-5 animate-slide-in">
                    <div className="border-l-4 border-indigo-500 pl-3 py-1">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Personal Details</h3>
                      <p className="text-[10px] text-slate-400">Capture candidate's legal documents and contact metadata</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Full Legal Name</label>
                        <div className="relative">
                          <div className="input-icon-container"><User className="w-4 h-4" /></div>
                          <input
                            type="text"
                            value={newEmployee.name}
                            onChange={(e) => handleNameChange(e.target.value)}
                            className="input input-with-icon h-12 rounded-2xl border-slate-200"
                            placeholder="Johnathan Doe"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Identity Document / Passport</label>
                        <div className="relative">
                          <div className="input-icon-container"><Shield className="w-4 h-4" /></div>
                          <input
                            type="text"
                            value={newEmployee.identity_card_type}
                            onChange={(e) => setNewEmployee({ ...newEmployee, identity_card_type: e.target.value })}
                            className="input input-with-icon h-12 rounded-2xl border-slate-200"
                            placeholder="AA-89027-C"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Mobile Number</label>
                        <div className="relative">
                          <div className="input-icon-container"><Phone className="w-4 h-4" /></div>
                          <input
                            type="text"
                            value={newEmployee.mobile}
                            onChange={(e) => setNewEmployee({ ...newEmployee, mobile: e.target.value })}
                            className="input input-with-icon h-12 rounded-2xl border-slate-200"
                            placeholder="+91 9876543210"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Alternate Phone</label>
                        <div className="relative">
                          <div className="input-icon-container"><PhoneCall className="w-4 h-4" /></div>
                          <input
                            type="text"
                            value={newEmployee.alternate_mobile}
                            onChange={(e) => setNewEmployee({ ...newEmployee, alternate_mobile: e.target.value })}
                            className="input input-with-icon h-12 rounded-2xl border-slate-200"
                            placeholder="Family member phone"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Emergency Contact Details</label>
                      <input
                        type="text"
                        value={newEmployee.emergency_contact}
                        onChange={(e) => setNewEmployee({ ...newEmployee, emergency_contact: e.target.value })}
                        className="input h-12 rounded-2xl border-slate-200"
                        placeholder="Jane Doe (Wife) - +91 9999988888"
                      />
                    </div>

                    <div className="flex justify-end pt-6 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          if (newEmployee.name.trim() && newEmployee.mobile.trim()) {
                            setActiveStep(2);
                            setError('');
                          } else {
                            setError('Legal Name and Mobile Number are required to proceed.');
                          }
                        }}
                        className="btn btn-primary h-12 rounded-xl font-bold flex items-center gap-2 px-6"
                      >
                        Next: Job Details
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2: Job Placement */}
                {activeStep === 2 && (
                  <div className="space-y-5 animate-slide-in">
                    <div className="border-l-4 border-indigo-500 pl-3 py-1">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Job & Position Assignment</h3>
                      <p className="text-[10px] text-slate-400">Specify operational division, corporate job levels, and branches</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Official Job Designation</label>
                        <div className="relative">
                          <div className="input-icon-container"><Briefcase className="w-4 h-4" /></div>
                          <input
                            type="text"
                            value={newEmployee.job_title}
                            onChange={(e) => setNewEmployee({ ...newEmployee, job_title: e.target.value })}
                            className="input input-with-icon h-12 rounded-2xl border-slate-200"
                            placeholder="Senior Staff Engineer (L5)"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Department / Team</label>
                        <div className="relative">
                          <div className="input-icon-container"><Layers className="w-4 h-4" /></div>
                          <input
                            type="text"
                            value={newEmployee.department}
                            onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                            className="input input-with-icon h-12 rounded-2xl border-slate-200"
                            placeholder="Cloud Platform Services"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Office Branch Location</label>
                        <div className="relative">
                          <div className="input-icon-container"><MapPin className="w-4 h-4" /></div>
                          <input
                            type="text"
                            value={newEmployee.branch}
                            onChange={(e) => setNewEmployee({ ...newEmployee, branch: e.target.value })}
                            className="input input-with-icon h-12 rounded-2xl border-slate-200"
                            placeholder="Sunnyvale HQ (SF Bay)"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Hiring / Start Date</label>
                        <div className="relative">
                          <div className="input-icon-container"><Calendar className="w-4 h-4" /></div>
                          <input
                            type="date"
                            value={newEmployee.hiring_date}
                            onChange={(e) => setNewEmployee({ ...newEmployee, hiring_date: e.target.value })}
                            className="input input-with-icon h-12 rounded-2xl border-slate-200"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between pt-6 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setActiveStep(1)}
                        className="btn btn-secondary h-12 rounded-xl font-bold flex items-center gap-2 px-6"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveStep(3)}
                        className="btn btn-primary h-12 rounded-xl font-bold flex items-center gap-2 px-6"
                      >
                        Next: Hierarchy
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: Organizational Hierarchy */}
                {activeStep === 3 && (
                  <div className="space-y-5 animate-slide-in">
                    <div className="border-l-4 border-indigo-500 pl-3 py-1">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Reporting & Governance</h3>
                      <p className="text-[10px] text-slate-400">Map organizational hierarchy rules and select partners</p>
                    </div>

                    {isHRTeam ? (
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">System Role Designation</label>
                        <div className="relative">
                          <div className="input-icon-container"><Shield className="w-4 h-4" /></div>
                          <select
                            value={newEmployee.role}
                            onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })}
                            className="select input-with-icon h-12 rounded-2xl border-slate-200"
                            required
                          >
                            <option value="employee">Employee (standard)</option>
                            {isAdmin && <option value="admin">Admin</option>}
                            <option value="hr_manager">HR Manager</option>
                            <option value="assistant_hr_manager">Assistant HR Manager</option>
                            <option value="manager">Manager</option>
                            <option value="assistant_manager">Assistant Manager</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">System Role</label>
                        <div className="h-12 rounded-2xl border border-slate-100 bg-slate-50/50 flex items-center px-4 text-sm text-slate-500 font-semibold">
                          Employee (Reporting to your division)
                        </div>
                      </div>
                    )}

                    {isHRTeam && businessUnits.length > 0 && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Business Unit Assignment</label>
                        <div className="relative">
                          <div className="input-icon-container"><Layers className="w-4 h-4" /></div>
                          <select
                            value={newEmployee.business_unit_id}
                            onChange={(e) => setNewEmployee({ ...newEmployee, business_unit_id: e.target.value })}
                            className="select input-with-icon h-12 rounded-2xl border-slate-200"
                          >
                            <option value="">-- Default (Tenant HQ) --</option>
                            {businessUnits.map((bu) => (
                              <option key={bu.id} value={bu.id}>{bu.name} ({bu.type})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Strict Hierarchy Selection Dropdowns */}
                    <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 space-y-4">
                      <div className="text-[10px] font-black uppercase text-indigo-500 tracking-wider mb-2">
                        Reporting Requirements for "{newEmployee.role.replace(/_/g, ' ').toUpperCase()}"
                      </div>

                      {/* Rule 1: Employee must select Assistant Manager & Assistant HR Manager */}
                      {newEmployee.role === 'employee' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Assistant Manager Partner</label>
                            <select
                              value={newEmployee.reporting_manager_id}
                              onChange={(e) => setNewEmployee({ ...newEmployee, reporting_manager_id: e.target.value })}
                              className="select h-11 rounded-xl border-slate-200 bg-white"
                              required
                            >
                              <option value="">-- Choose Assistant Manager --</option>
                              {allUsers.filter(u => u.role === 'assistant_manager').map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Assistant HR Manager Partner</label>
                            <select
                              value={newEmployee.hr_reporting_manager_id}
                              onChange={(e) => setNewEmployee({ ...newEmployee, hr_reporting_manager_id: e.target.value })}
                              className="select h-11 rounded-xl border-slate-200 bg-white"
                              required
                            >
                              <option value="">-- Choose Asst HR Manager --</option>
                              {allUsers.filter(u => u.role === 'assistant_hr_manager').map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Rule 2: Assistant Manager: Must select Manager, Optional HR Manager */}
                      {newEmployee.role === 'assistant_manager' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Reporting Manager (Manager) *</label>
                            <select
                              value={newEmployee.reporting_manager_id}
                              onChange={(e) => setNewEmployee({ ...newEmployee, reporting_manager_id: e.target.value })}
                              className="select h-11 rounded-xl border-slate-200 bg-white"
                              required
                            >
                              <option value="">-- Choose Manager --</option>
                              {allUsers.filter(u => u.role === 'manager').map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">HR Manager Link (Optional)</label>
                            <select
                              value={newEmployee.hr_reporting_manager_id}
                              onChange={(e) => setNewEmployee({ ...newEmployee, hr_reporting_manager_id: e.target.value })}
                              className="select h-11 rounded-xl border-slate-200 bg-white"
                            >
                              <option value="">-- Choose HR Manager --</option>
                              {allUsers.filter(u => u.role === 'hr_manager').map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Rule 3: Assistant HR Manager: Must select HR Manager, Optional Manager */}
                      {newEmployee.role === 'assistant_hr_manager' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Reporting HR Manager (HR Manager) *</label>
                            <select
                              value={newEmployee.hr_reporting_manager_id}
                              onChange={(e) => setNewEmployee({ ...newEmployee, hr_reporting_manager_id: e.target.value })}
                              className="select h-11 rounded-xl border-slate-200 bg-white"
                              required
                            >
                              <option value="">-- Choose HR Manager --</option>
                              {allUsers.filter(u => u.role === 'hr_manager').map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Manager Link (Optional)</label>
                            <select
                              value={newEmployee.reporting_manager_id}
                              onChange={(e) => setNewEmployee({ ...newEmployee, reporting_manager_id: e.target.value })}
                              className="select h-11 rounded-xl border-slate-200 bg-white"
                            >
                              <option value="">-- Choose Manager --</option>
                              {allUsers.filter(u => u.role === 'manager').map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {(newEmployee.role === 'manager' || newEmployee.role === 'hr_manager' || newEmployee.role === 'admin') && (
                        <p className="text-xs text-muted-foreground italic">This role is top-level and does not require hierarchical reporting assignments.</p>
                      )}
                    </div>

                    <div className="flex justify-between pt-6 border-t border-slate-100">
                      <button
                         type="button"
                         onClick={() => setActiveStep(2)}
                         className="btn btn-secondary h-12 rounded-xl font-bold flex items-center gap-2 px-6"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // Validate if they selected the required dropdowns before going to step 4
                          if (newEmployee.role === 'employee' && (!newEmployee.reporting_manager_id || !newEmployee.hr_reporting_manager_id)) {
                            setError('Please select both an Assistant Manager and an Assistant HR Partner to enforce organizational hierarchy rules.');
                            return;
                          }
                          if (newEmployee.role === 'assistant_manager' && !newEmployee.reporting_manager_id) {
                            setError('Please select a Reporting Manager (Manager Partner).');
                            return;
                          }
                          if (newEmployee.role === 'assistant_hr_manager' && !newEmployee.hr_reporting_manager_id) {
                            setError('Please select a Reporting HR Manager.');
                            return;
                          }
                          setError('');
                          setActiveStep(4);
                        }}
                        className="btn btn-primary h-12 rounded-xl font-bold flex items-center gap-2 px-6"
                      >
                        Next: System Access
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 4: Credentials Provisioning */}
                {activeStep === 4 && (
                  <div className="space-y-5 animate-slide-in">
                    <div className="border-l-4 border-indigo-500 pl-3 py-1">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">System Credentials & Identity</h3>
                      <p className="text-[10px] text-slate-400">Generate credentials and complete corporate IT provisioning</p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Corporate Email Address</label>
                      <div className="relative">
                        <div className="input-icon-container"><Mail className="w-4 h-4" /></div>
                        <input
                          type="email"
                          value={newEmployee.email}
                          onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                          className="input input-with-icon h-12 rounded-2xl border-slate-200"
                          placeholder="john.doe@company.com"
                          required
                        />
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-1 ml-1">Auto-generated based on legal name. Feel free to modify.</p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Temporary Security Password</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <div className="input-icon-container"><Lock className="w-4 h-4" /></div>
                          <input
                            type={showRawPassword ? 'text' : 'password'}
                            value={newEmployee.password}
                            onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                            className="input input-with-icon h-12 rounded-2xl border-slate-200 font-mono"
                            placeholder="Enter password"
                            required
                            minLength={6}
                          />
                          <button
                            type="button"
                            onClick={() => setShowRawPassword(!showRawPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600"
                          >
                            {showRawPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={generateTempPassword}
                          className="btn btn-secondary h-12 px-4 rounded-2xl text-xs font-bold whitespace-nowrap bg-slate-100 hover:bg-slate-200 border-none"
                        >
                          Auto Generate
                        </button>
                      </div>
                      <p className="text-[9px] text-indigo-500 font-semibold mt-1 ml-1">Share this temporary credential securely during onboarding; it will not be stored in plain text.</p>
                    </div>

                    <div className="flex justify-between pt-6 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setActiveStep(3)}
                        className="btn btn-secondary h-12 rounded-xl font-bold flex items-center gap-2 px-6"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={creating}
                        className="btn btn-primary h-12 rounded-xl font-bold shadow-xl shadow-indigo-100 bg-indigo-600 hover:bg-indigo-700 flex items-center gap-2 px-8"
                      >
                        {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" /> Complete Onboarding</>}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal with credentials viewing and password resets */}
      {showEditModal && editEmployee && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowEditModal(false)}>
          <div className="modal-content max-w-xl bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 md:p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                    <Edit2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Edit Corporate Profile</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-0.5">{editEmployee.name}</p>
                  </div>
                </div>
                <button onClick={() => setShowEditModal(false)} className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-bold flex items-center gap-2">
                  <X className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleEdit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Full Legal Name</label>
                    <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="input h-12 rounded-2xl border-slate-200" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Email Address</label>
                    <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="input h-12 rounded-2xl border-slate-200" required />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Mobile Number</label>
                    <input type="text" value={editForm.mobile} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })} className="input h-12 rounded-2xl border-slate-200" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Alternate Phone</label>
                    <input type="text" value={editForm.alternate_mobile} onChange={(e) => setEditForm({ ...editForm, alternate_mobile: e.target.value })} className="input h-12 rounded-2xl border-slate-200" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Operational Status</label>
                    <select value={editForm.is_active ? 'active' : 'inactive'} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === 'active' })} className="select h-12 rounded-2xl border-slate-200">
                      <option value="active">Active (Onboarded)</option>
                      <option value="inactive">Inactive (Deactivated)</option>
                    </select>
                  </div>
                  {isHRTeam && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Reward Points</label>
                      <input type="number" value={editForm.reward_points} onChange={(e) => setEditForm({ ...editForm, reward_points: parseFloat(e.target.value) || 0 })} className="input h-12 rounded-2xl border-slate-200" min="0" step="0.1" />
                    </div>
                  )}
                </div>

                {(isHRTeam || isAdmin) && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">System Role Designation</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Shield className="w-4 h-4" /></div>
                        <select
                          value={editForm.role}
                          onChange={(e) => {
                            const newRole = e.target.value;
                            setEditForm({
                              ...editForm,
                              role: newRole,
                              reporting_manager_id: '',
                              hr_reporting_manager_id: ''
                            });
                          }}
                          className="select pl-10 h-12 rounded-2xl border-slate-200 w-full"
                          required
                        >
                          <option value="employee">Employee (standard)</option>
                          {isAdmin && <option value="admin">Admin</option>}
                          <option value="hr_manager">HR Manager</option>
                          <option value="assistant_hr_manager">Assistant HR Manager</option>
                          <option value="manager">Manager</option>
                          <option value="assistant_manager">Assistant Manager</option>
                        </select>
                      </div>
                    </div>

                    {businessUnits.length > 0 && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Business Unit Assignment</label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Layers className="w-4 h-4" /></div>
                          <select
                            value={editForm.business_unit_id}
                            onChange={(e) => setEditForm({ ...editForm, business_unit_id: e.target.value })}
                            className="select pl-10 h-12 rounded-2xl border-slate-200 w-full"
                          >
                            <option value="">-- Default (Tenant HQ) --</option>
                            {businessUnits.map((bu) => (
                              <option key={bu.id} value={bu.id}>{bu.name} ({bu.type})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Strict Hierarchy Selection Dropdowns for Edit */}
                    <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 space-y-4">
                      <div className="text-[10px] font-black uppercase text-indigo-500 tracking-wider mb-2">
                        Reporting Requirements for "{editForm.role.replace(/_/g, ' ').toUpperCase()}"
                      </div>

                      {/* Rule 1: Employee must select Assistant Manager & Assistant HR Manager */}
                      {editForm.role === 'employee' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Assistant Manager Partner</label>
                            <select
                              value={editForm.reporting_manager_id}
                              onChange={(e) => setEditForm({ ...editForm, reporting_manager_id: e.target.value })}
                              className="select h-11 rounded-xl border-slate-200 bg-white"
                              required
                            >
                              <option value="">-- Choose Assistant Manager --</option>
                              {allUsers.filter(u => u.role === 'assistant_manager' && u.id !== editEmployee.id).map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Assistant HR Manager Partner</label>
                            <select
                              value={editForm.hr_reporting_manager_id}
                              onChange={(e) => setEditForm({ ...editForm, hr_reporting_manager_id: e.target.value })}
                              className="select h-11 rounded-xl border-slate-200 bg-white"
                              required
                            >
                              <option value="">-- Choose Asst HR Manager --</option>
                              {allUsers.filter(u => u.role === 'assistant_hr_manager' && u.id !== editEmployee.id).map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Rule 2: Assistant Manager: Must select Manager, Optional HR Manager */}
                      {editForm.role === 'assistant_manager' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Reporting Manager (Manager) *</label>
                            <select
                              value={editForm.reporting_manager_id}
                              onChange={(e) => setEditForm({ ...editForm, reporting_manager_id: e.target.value })}
                              className="select h-11 rounded-xl border-slate-200 bg-white"
                              required
                            >
                              <option value="">-- Choose Manager --</option>
                              {allUsers.filter(u => u.role === 'manager' && u.id !== editEmployee.id).map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">HR Manager Link (Optional)</label>
                            <select
                              value={editForm.hr_reporting_manager_id}
                              onChange={(e) => setEditForm({ ...editForm, hr_reporting_manager_id: e.target.value })}
                              className="select h-11 rounded-xl border-slate-200 bg-white"
                            >
                              <option value="">-- Choose HR Manager --</option>
                              {allUsers.filter(u => u.role === 'hr_manager' && u.id !== editEmployee.id).map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Rule 3: Assistant HR Manager: Must select HR Manager, Optional Manager */}
                      {editForm.role === 'assistant_hr_manager' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Reporting HR Manager (HR Manager) *</label>
                            <select
                              value={editForm.hr_reporting_manager_id}
                              onChange={(e) => setEditForm({ ...editForm, hr_reporting_manager_id: e.target.value })}
                              className="select h-11 rounded-xl border-slate-200 bg-white"
                              required
                            >
                              <option value="">-- Choose HR Manager --</option>
                              {allUsers.filter(u => u.role === 'hr_manager' && u.id !== editEmployee.id).map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Manager Link (Optional)</label>
                            <select
                              value={editForm.reporting_manager_id}
                              onChange={(e) => setEditForm({ ...editForm, reporting_manager_id: e.target.value })}
                              className="select h-11 rounded-xl border-slate-200 bg-white"
                            >
                              <option value="">-- Choose Manager --</option>
                              {allUsers.filter(u => u.role === 'manager' && u.id !== editEmployee.id).map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {(editForm.role === 'manager' || editForm.role === 'hr_manager' || editForm.role === 'admin') && (
                        <p className="text-xs text-muted-foreground italic">This role is top-level and does not require hierarchical reporting assignments.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Salary Structure Editing Section */}
                {(isHRTeam || isAdmin) && (
                  <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 space-y-4">
                    <div className="text-[10px] font-black uppercase text-indigo-500 tracking-wider mb-2 flex items-center gap-2">
                      <Wallet className="w-3.5 h-3.5" /> Salary Structure Configuration
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Basic Salary (₹)</label>
                        <input
                          type="number"
                          value={structBasic}
                          onChange={(e) => setStructBasic(parseFloat(e.target.value) || 0)}
                          className="input h-10 rounded-xl border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">HRA (₹)</label>
                        <input
                          type="number"
                          value={structHra}
                          onChange={(e) => setStructHra(parseFloat(e.target.value) || 0)}
                          className="input h-10 rounded-xl border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Allowance (₹)</label>
                        <input
                          type="number"
                          value={structSpecial}
                          onChange={(e) => setStructSpecial(parseFloat(e.target.value) || 0)}
                          className="input h-10 rounded-xl border-slate-200"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">PF Deduction (₹)</label>
                        <input
                          type="number"
                          value={structPf}
                          onChange={(e) => setStructPf(parseFloat(e.target.value) || 0)}
                          className="input h-10 rounded-xl border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">ESI Deduction (₹)</label>
                        <input
                          type="number"
                          value={structEsi}
                          onChange={(e) => setStructEsi(parseFloat(e.target.value) || 0)}
                          className="input h-10 rounded-xl border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Income Tax (₹)</label>
                        <input
                          type="number"
                          value={structTax}
                          onChange={(e) => setStructTax(parseFloat(e.target.value) || 0)}
                          className="input h-10 rounded-xl border-slate-200"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 bg-slate-100 p-2.5 rounded-xl border border-slate-200 mt-2">
                      <span>Gross: ₹{(structBasic + structHra + structSpecial).toLocaleString('en-IN')}</span>
                      <span>Deductions: ₹{(structPf + structEsi + structTax).toLocaleString('en-IN')}</span>
                      <span>Net: ₹{Math.max(0, (structBasic + structHra + structSpecial) - (structPf + structEsi + structTax)).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                )}

                {/* Corporate Credentials View & Password Reset Sub-Drawer */}
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">IT Account & System Password</h4>
                      <p className="text-[10px] text-slate-400">View or modify login credentials for onboarding handover</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-[10px] text-emerald-700">
                    Existing passwords are never displayed or stored in plain text. Use the reset option below to issue a new temporary password when access needs to be recovered.
                  </div>

                  {/* Checkbox for Changing Password */}
                  <label className="flex items-center gap-2.5 mt-3 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={changePasswordChecked}
                      onChange={(e) => setChangePasswordChecked(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span className="text-xs font-bold text-slate-700">Change Security Password</span>
                  </label>

                  {/* Change Password Input Field */}
                  {changePasswordChecked && (
                    <div className="space-y-2.5 p-3 rounded-xl border border-indigo-100 bg-indigo-50/20 animate-slide-in">
                      <label className="block text-[9px] font-bold uppercase text-indigo-500 tracking-widest">New Security Password</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newPasswordVal}
                          onChange={(e) => setNewPasswordVal(e.target.value)}
                          className="input h-10 rounded-xl border-indigo-100 bg-white font-mono text-xs flex-1"
                          placeholder="Min. 6 chars"
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
                            let pass = 'Temp@';
                            for (let i = 0; i < 8; i++) {
                              pass += chars.charAt(Math.floor(Math.random() * chars.length));
                            }
                            setNewPasswordVal(pass);
                          }}
                          className="btn btn-secondary h-10 px-3 rounded-xl border-slate-200 bg-white text-xs font-bold"
                        >
                          Auto
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-6">
                  <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-secondary flex-1 h-14 rounded-2xl font-bold">Cancel</button>
                  <button type="submit" disabled={saving} className="btn btn-primary flex-1 h-14 rounded-2xl font-bold shadow-lg shadow-indigo-100 bg-indigo-600 hover:bg-indigo-700">
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" /> Save Changes</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Corporate Welcome Credentials Card Modal */}
      {showWelcomeModal && welcomeCredentials && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 1000 }} onClick={() => setShowWelcomeModal(false)}>
          <div className="modal-content max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden p-6 text-center" onClick={(e) => e.stopPropagation()}>
            
            {/* Header / Success Indicator */}
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-4 animate-scale-up">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Onboarding Credentials Generated</h2>
            <p className="text-xs text-muted-foreground mt-1">Credentials recorded successfully in secure directory</p>

            {/* Premium Handover Card Preview */}
            <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 text-white rounded-2xl p-6 my-6 text-left shadow-lg relative overflow-hidden font-sans border border-indigo-950/20 select-none">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-teal-500/10 rounded-full blur-xl pointer-events-none" />
              
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-extrabold text-sm tracking-widest uppercase bg-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20 inline-block">
                    {welcomeCredentials.role.replace(/_/g, ' ')}
                  </h3>
                </div>
                <div className="text-[10px] font-black uppercase text-indigo-300 tracking-widest">TaskTracker ID</div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-[8px] uppercase tracking-widest text-indigo-300/80 font-bold">FullName</div>
                  <div className="font-extrabold text-base tracking-tight">{welcomeCredentials.name}</div>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-widest text-indigo-300/80 font-bold">Corporate Access Email</div>
                  <div className="font-mono text-xs truncate select-all">{welcomeCredentials.email}</div>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-widest text-indigo-300/80 font-bold">Temporary Security Password</div>
                  <div className="font-mono text-xs select-all text-yellow-300 font-bold tracking-wider bg-white/10 px-2 py-1 rounded inline-block">
                    {welcomeCredentials.password}
                  </div>
                </div>
              </div>
            </div>

            {/* Instruction Callout */}
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-left flex gap-2.5 text-xs text-amber-800 mb-6">
              <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Handover instructions: </span>
                Copy this corporate credentials package and share it securely with the new employee. They will be prompted to change their password upon first access.
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={() => setShowWelcomeModal(false)}
                className="btn btn-secondary flex-1 h-12 font-bold text-xs"
              >
                Close
              </button>
              <button 
                type="button" 
                onClick={copyWelcomeCredentials}
                className="btn btn-primary flex-1 h-12 font-bold text-xs bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100 flex items-center justify-center gap-1.5"
              >
                {copiedCredentials ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCredentials ? 'Copied to Clipboard' : 'Copy Onboarding Package'}</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
