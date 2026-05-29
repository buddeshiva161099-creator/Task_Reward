'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { Employee, Task, Company } from '@/types';
import StatusChart from '@/components/StatusChart';
import EmptyState from '@/components/EmptyState';
import {
  formatDate, formatDateTime, getStatusColor, getStatusLabel,
  getPriorityColor, timeAgo, formatPreciseDateTime, ensureUTC
} from '@/lib/utils';
import {
  Mail, Calendar, Trophy, CheckCircle2, Clock, AlertCircle,
  ClipboardList, Activity, ArrowLeft, Plus, UserX, UserCheck,
  MessageSquarePlus, Play, Trash2, ChevronUp, Send,
  Eye, EyeOff, Copy, ShieldCheck, X, Phone, PhoneCall, Pencil, Award, Power, Lock, User, Shield, Building, Tag, Briefcase, Wallet, MapPin, LogIn, LogOut
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';

function EmployeeProfileContent() {
  const { user, isHRTeam, isAdmin, isManager, isAssistantManager } = useAuth();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Salary Structure Setup States
  const [salaryStructure, setSalaryStructure] = useState<any>(null);
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [showStructureModal, setShowStructureModal] = useState(false);
  const [structBasic, setStructBasic] = useState(0);
  const [structHra, setStructHra] = useState(0);
  const [structSpecial, setStructSpecial] = useState(0);
  const [structPf, setStructPf] = useState(0);
  const [structEsi, setStructEsi] = useState(0);
  const [structTax, setStructTax] = useState(0);

  // Create task modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTask, setNewTask] = useState({
    work_description: '', priority: 'medium', deadline: '', company_id: '',
  });

  // Remarks state
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [submittingRemark, setSubmittingRemark] = useState(false);

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);

  // Attendance History Modal
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('showAttendance') === 'true') {
      setShowAttendanceModal(true);
    }
  }, []);

  // View Task Modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);

  const openViewModal = (task: Task) => {
    setViewingTask(task);
    setShowViewModal(true);
  };

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const [empRes, statsRes, tasksRes, companiesRes, categoriesRes, allUsersRes] = await Promise.all([
        api.get(`/admin/employees/${id}`),
        api.get(`/admin/employees/${id}/stats`),
        api.get(`/tasks?employee_id=${id}`),
        api.get('/companies'),
        api.get('/categories'),
        api.get('/admin/employees/all-users')
      ]);
      setEmployee(empRes.data);
      setStats(statsRes.data);
      setTasks(tasksRes.data);
      setCompanies(companiesRes.data);
      setCategories(categoriesRes.data);
      setAllUsers(allUsersRes.data);

      try {
        const structRes = await api.get(`/payroll/structure/${id}`);
        setSalaryStructure(structRes.data);
        setStructBasic(structRes.data.basic || 0);
        setStructHra(structRes.data.hra || 0);
        setStructSpecial(structRes.data.special_allowance || 0);
        setStructPf(structRes.data.pf_deduction || 0);
        setStructEsi(structRes.data.esi_deduction || 0);
        setStructTax(structRes.data.tax_deduction || 0);
      } catch (err) {
        console.log('No salary structure configured for this employee yet.');
        setSalaryStructure(null);
      }
    } catch (err: any) {
      console.error('Failed to fetch employee data:', err);
      setError(err.response?.data?.detail || 'Failed to load employee profile');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Edit Task Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [updatingTask, setUpdatingTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const handleEditTask = (task: Task) => {
    const date = new Date(task.deadline);
    const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditingTask({ ...task, deadline: localDateTime });
    setShowEditModal(true);
  };

  // Edit Profile Modal
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [editEmployeeData, setEditEmployeeData] = useState<any>(null);

  const handleEditProfile = () => {
    if (!employee) return;
    setEditEmployeeData({
      name: employee.name,
      email: employee.email,
      mobile: employee.mobile || '',
      alternate_mobile: employee.alternate_mobile || '',
      role: employee.role,
      reward_points: employee.reward_points,
      is_active: employee.is_active,
      password: '',
      reporting_manager_id: employee.reporting_manager_id || '',
      hr_reporting_manager_id: (employee as any).hr_reporting_manager_id || '',
    });
    setShowEditProfileModal(true);
  };

  const handleSaveStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await api.post('/payroll/structure', {
        user_id: id,
        basic: structBasic,
        hra: structHra,
        special_allowance: structSpecial,
        pf_deduction: structPf,
        esi_deduction: structEsi,
        tax_deduction: structTax,
      });
      alert('Salary structure saved successfully!');
      setShowStructureModal(false);
      
      // Reload structure
      const structRes = await api.get(`/payroll/structure/${id}`);
      setSalaryStructure(structRes.data);
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to save salary structure.');
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !editEmployeeData) return;
    setUpdatingProfile(true);
    try {
      // Filter out empty password to avoid 422 validation error (min_length=6)
      const payload = { ...editEmployeeData };
      if (!payload.password || payload.password.trim() === '') {
        delete payload.password;
      }

      await api.put(`/admin/employees/${id}`, payload);
      setShowEditProfileModal(false);
      fetchData();
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      alert(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    setUpdatingTask(true);
    try {
      const payload = {
        work_description: editingTask.work_description,
        priority: editingTask.priority,
        deadline: new Date(editingTask.deadline).toISOString(),
        company_id: editingTask.company_id || undefined,
        category_ids: editingTask.category_ids,
        assigned_to: editingTask.assigned_to,
      };
      await api.put(`/tasks/${editingTask.id}`, payload);
      setShowEditModal(false);
      setEditingTask(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update task');
    } finally {
      setUpdatingTask(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleActive = async () => {
    if (!employee) return;
    try {
      await api.put(`/admin/employees/${employee.id}`, { is_active: !employee.is_active });
      fetchData();
    } catch (err) {
      console.error('Failed to update employee status:', err);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!employee) return;
    if (!confirm('Are you sure you want to delete this employee? This will soft-delete them.')) return;
    try {
      await api.delete(`/admin/employees/${employee.id}`);
      router.push('/admin/employees');
    } catch (err) {
      console.error('Failed to delete employee:', err);
      alert('Failed to delete employee');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const payload = {
        ...newTask,
        assigned_to: id,
        deadline: new Date(newTask.deadline).toISOString(),
        company_id: newTask.company_id || undefined,
      };
      await api.post('/tasks', payload);
      setShowCreateModal(false);
      setNewTask({ work_description: '', priority: 'medium', deadline: '', company_id: '' });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusUpdate = async (taskId: string, newStatus: string) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
      fetchData();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      fetchData();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleAddRemark = async (taskId: string) => {
    if (!remarkText.trim()) return;
    setSubmittingRemark(true);
    try {
      await api.put(`/tasks/${taskId}`, { remarks: remarkText.trim() });
      setRemarkText('');
      fetchData();
    } catch (err) {
      console.error('Failed to add remark:', err);
    } finally {
      setSubmittingRemark(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold">Employee Not Found</h2>
        <p className="text-muted-foreground mt-2">{error || 'No ID provided'}</p>
        <button onClick={() => router.back()} className="btn btn-secondary mt-6">
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {showAttendanceModal ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Attendance Calendar View */}
          <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setShowAttendanceModal(false)}
                  className="p-3 hover:bg-slate-100 rounded-2xl transition-all text-slate-500 hover:text-indigo-600 hover:scale-110 active:scale-95"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center shadow-lg shadow-emerald-100/50">
                  <Calendar className="w-8 h-8 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-900">
                    {employee.name}
                    <span className={`badge ${employee.is_active ? 'badge-success' : 'badge-danger'} text-xs font-bold`}>
                      {employee.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </h2>
                  <div className="text-sm text-slate-400 font-bold uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Attendance Calendar - Last 3 Months Review
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Select Year</span>
                    <select
                      className="select h-12 w-28 text-sm font-bold rounded-xl border-2 border-slate-100 hover:border-indigo-500 transition-all shadow-sm"
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                    >
                      {[2024, 2025, 2026, 2027].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Select Month</span>
                    <select
                      className="select h-12 w-40 text-sm font-bold rounded-xl border-2 border-slate-100 hover:border-indigo-500 transition-all shadow-sm"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    >
                      {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                        <option key={m} value={i}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => setShowAttendanceModal(false)}
                  className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center text-slate-500 transition-all hover:rotate-90"
                  title="Close Calendar"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="glass rounded-3xl p-8 border border-slate-100">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-12 lg:gap-16">
                {[2, 1, 0].map((offset) => {
                  const date = new Date(selectedYear, selectedMonth, 1);
                  date.setMonth(date.getMonth() - offset);
                  return (
                    <MonthCalendar
                      key={offset}
                      year={date.getFullYear()}
                      month={date.getMonth()}
                      history={stats?.attendance_history_detailed || []}
                    />
                  );
                })}
              </div>

              {/* Detailed Attendance Logs Table */}
              {stats?.attendance_history_detailed && stats.attendance_history_detailed.filter((e: any) => e.status === 'present').length > 0 && (
                <div className="mt-10 border-t border-slate-100 pt-8">
                  <h4 className="font-bold text-slate-700 text-base mb-5 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-indigo-500" />
                    Attendance Log Details (Last 90 Days)
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 text-xs font-bold uppercase tracking-wider">
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Login (IST)</th>
                          <th className="py-3 px-4">Logout (IST)</th>
                          <th className="py-3 px-4">Duration</th>
                          <th className="py-3 px-4 text-center">Map</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {stats.attendance_history_detailed
                          .filter((e: any) => e.status === 'present')
                          .slice(0, 30)
                          .map((e: any, i: number) => {
                            const checkInDate = e.check_in ? new Date(ensureUTC(e.check_in)) : null;
                            const checkOutDate = e.check_out ? new Date(ensureUTC(e.check_out)) : null;
                            const durationMs = checkInDate && checkOutDate ? checkOutDate.getTime() - checkInDate.getTime() : null;
                            const durationHrs = durationMs ? Math.floor(durationMs / 3600000) : null;
                            const durationMins = durationMs ? Math.floor((durationMs % 3600000) / 60000) : null;
                            const mapUrl = e.location_in ? `https://www.google.com/maps?q=${e.location_in.lat},${e.location_in.lng}` : null;
                            return (
                              <tr key={i} className={cn("hover:bg-slate-50/50 transition-colors", e.is_regularized && "bg-violet-50/30")}>
                                <td className="py-3 px-4 font-medium text-slate-800 text-xs">
                                  {checkInDate ? checkInDate.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—'}
                                  {e.is_regularized && <span className="ml-1.5 text-[9px] font-black text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full border border-violet-100">REG</span>}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                                    <LogIn className="w-3 h-3" />
                                    {checkInDate ? checkInDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—'}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  {checkOutDate ? (
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600">
                                      <LogOut className="w-3 h-3" />
                                      {checkOutDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                                    </div>
                                  ) : (
                                    <span className="text-amber-500 text-xs font-bold">Active</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-500 font-medium">
                                  {durationHrs !== null ? `${durationHrs}h ${durationMins}m` : '—'}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {mapUrl ? (
                                    <a
                                      href={mapUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-indigo-500 hover:text-indigo-700 text-xs font-bold hover:underline"
                                      title={e.address_in || 'View on Google Maps'}
                                    >
                                      <MapPin className="w-3.5 h-3.5" />
                                      <span>View</span>
                                    </a>
                                  ) : (
                                    <span className="text-slate-200 text-xs">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-in fade-in duration-500 space-y-8">
          {/* Top Navigation & Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-3 text-slate-900">
                  {employee.name}
                  <span className={`badge ${employee.is_active ? 'badge-success' : 'badge-danger'} text-xs font-bold`}>
                    {employee.is_active ? 'Active' : 'Inactive'}
                  </span>
                </h1>
                <p className="text-slate-500 text-sm font-medium">Employee Profile & Productivity Metrics</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleActive}
                className={`btn ${employee.is_active ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}
              >
                {employee.is_active ? <><UserX className="w-4 h-4" /> Deactivate</> : <><UserCheck className="w-4 h-4" /> Activate</>}
              </button>
              <button
                onClick={handleEditProfile}
                className="btn bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm"
              >
                <Pencil className="w-4 h-4" /> Edit Details
              </button>
              {(isHRTeam || isAdmin) && (
                <button
                  onClick={() => setShowStructureModal(true)}
                  className="btn bg-white border-slate-200 text-indigo-600 hover:bg-indigo-50 shadow-sm"
                >
                  <Wallet className="w-4 h-4 text-indigo-500" /> Salary Structure
                </button>
              )}
              {isHRTeam && (
                <button
                  onClick={handleDeleteEmployee}
                  className="btn btn-danger"
                >
                  <Trash2 className="w-4 h-4" /> Delete Employee
                </button>
              )}
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary shadow-lg shadow-indigo-100"
              >
                <Plus className="w-4 h-4" /> Assign Work
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* 1. Profile Card */}
            <div className="glass rounded-2xl p-6 relative overflow-hidden border border-slate-100 flex flex-col h-full">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center text-white text-xl font-bold shadow-xl shadow-indigo-200">
                  {employee.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800">{employee.name}</h3>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-500 font-black mt-0.5">
                    {employee.role.replace('_', ' ')}
                  </p>
                </div>
              </div>

              <div className="space-y-3 flex-1">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                  <span className="text-xs text-slate-500 flex items-center gap-2 font-medium">
                    <Mail className="w-3.5 h-3.5 text-indigo-400" /> Email
                  </span>
                  <span className="text-xs font-bold text-slate-700 truncate max-w-[140px]">{employee.email}</span>
                </div>

                {employee.mobile && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                    <span className="text-xs text-slate-500 flex items-center gap-2 font-medium">
                      <Phone className="w-3.5 h-3.5 text-emerald-400" /> Mobile
                    </span>
                    <span className="text-xs font-bold text-slate-700">{employee.mobile}</span>
                  </div>
                )}

                {employee.alternate_mobile && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                    <span className="text-xs text-slate-500 flex items-center gap-2 font-medium">
                      <PhoneCall className="w-3.5 h-3.5 text-blue-400" /> Alt Mobile
                    </span>
                    <span className="text-xs font-bold text-slate-700">{employee.alternate_mobile}</span>
                  </div>
                )}

                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/50 border border-amber-100">
                  <span className="text-xs text-amber-600 flex items-center gap-2 font-bold">
                    <Trophy className="w-4 h-4" /> Rewards
                  </span>
                  <span className="text-xs font-black text-amber-600">{employee.reward_points} pts</span>
                </div>

                {(isHRTeam || isAdmin) && (
                  salaryStructure ? (
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                        <span>Salary Structure</span>
                        <button 
                          onClick={() => setShowStructureModal(true)} 
                          className="text-indigo-650 hover:text-indigo-750 text-[11px]"
                        >
                          Edit
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-semibold bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>Basic: ₹{salaryStructure.basic?.toLocaleString('en-IN')}</div>
                        <div>HRA: ₹{salaryStructure.hra?.toLocaleString('en-IN')}</div>
                        <div>Allowance: ₹{salaryStructure.special_allowance?.toLocaleString('en-IN')}</div>
                        <div className="text-indigo-650 font-bold col-span-2 border-t pt-1 mt-1 flex justify-between">
                          <span>Gross Salary:</span>
                          <span>₹{salaryStructure.gross_salary?.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                      <p className="text-[11px] text-slate-400 font-bold italic mb-2">No Salary Structure Configured</p>
                      <button 
                        onClick={() => setShowStructureModal(true)} 
                        className="text-xs font-bold text-indigo-650 bg-indigo-50 hover:bg-indigo-100/80 px-3 py-2 rounded-xl border border-indigo-100 transition-colors w-full"
                      >
                        Configure Structure
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* 2. Monthly Task Efficiency Card */}
            <div className="glass rounded-2xl p-6 relative overflow-hidden border border-slate-100 flex flex-col h-full shadow-sm hover:shadow-md transition-shadow">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
              <div className="flex items-center gap-2 mb-6">
                <Trophy className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-slate-800">Monthly Efficiency</h3>
              </div>

              <div className="flex-grow flex flex-col items-center justify-center text-center">
                <div className="relative w-28 h-28 flex items-center justify-center mb-4">
                  {/* Outer circle track */}
                  <svg className="absolute w-full h-full transform -rotate-90">
                    <circle
                      cx="56"
                      cy="56"
                      r="48"
                      className="stroke-slate-100"
                      strokeWidth="8"
                      fill="transparent"
                    />
                    <circle
                      cx="56"
                      cy="56"
                      r="48"
                      className={cn(
                        "transition-all duration-1000 ease-out",
                        stats?.efficiency_rate >= 80 ? "stroke-emerald-500" :
                        stats?.efficiency_rate >= 60 ? "stroke-indigo-500" : "stroke-rose-500"
                      )}
                      strokeWidth="8"
                      fill="transparent"
                      strokeDasharray={2 * Math.PI * 48}
                      strokeDashoffset={2 * Math.PI * 48 * (1 - (stats?.efficiency_rate ?? 0) / 100)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <span className="text-3xl font-black text-slate-800 tracking-tighter">
                        {stats?.efficiency_rate ?? 0}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 w-full mt-2">
                  <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider w-fit mx-auto border bg-slate-50 text-slate-600">
                    {stats?.efficiency_rate >= 80 ? '⭐ Elite Performer' :
                     stats?.efficiency_rate >= 65 ? '📈 Strong Pace' :
                     stats?.due_this_month === 0 ? '💤 Idle' : '⚠️ Attention Required'}
                  </div>
                  <p className="text-xs text-slate-400 font-bold tracking-tight mt-1">
                    {stats?.completed_this_month ?? 0} of {stats?.due_this_month ?? 0} tasks completed this month
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Task Status Distribution */}
            <div className="glass rounded-2xl p-6 border border-slate-100 flex flex-col h-full shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-6">
                <Activity className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-slate-800">Task Status Distribution</h3>
              </div>

              {stats?.tasks?.total > 0 ? (
                <div className="flex flex-col gap-6 flex-1">
                  <div className="flex justify-center items-center h-40">
                    <StatusChart
                      data={[
                        { name: 'Completed', value: stats.tasks.completed - stats.tasks.completed_late, color: '#10b981' },
                        { name: 'Late', value: stats.tasks.completed_late, color: '#818cf8' },
                        { name: 'In Progress', value: stats.tasks.in_progress, color: '#3b82f6' },
                        { name: 'Pending', value: stats.tasks.pending, color: '#f59e0b' },
                        { name: 'Overdue', value: stats.tasks.overdue, color: '#ef4444' },
                      ].filter(d => d.value > 0)}
                      total={stats.tasks.total}
                      completed={stats.tasks.completed}
                      size={140}
                    />
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100/50">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Completed</p>
                      </div>
                      <p className="text-lg font-black text-slate-800 leading-none">{stats.tasks.completed - stats.tasks.completed_late}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100/50">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Late</p>
                      </div>
                      <p className="text-lg font-black text-slate-800 leading-none">{stats.tasks.completed_late}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100/50">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">In Progress</p>
                      </div>
                      <p className="text-lg font-black text-slate-800 leading-none">{stats.tasks.in_progress}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100/50">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Pending</p>
                      </div>
                      <p className="text-lg font-black text-slate-800 leading-none">{stats.tasks.pending}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100/50">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Overdue</p>
                      </div>
                      <p className="text-lg font-black text-slate-800 leading-none">{stats.tasks.overdue}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState title="No task metrics" description="This employee hasn't been assigned any work yet." variant="small" className="flex-1" />
              )}
            </div>

            {/* 4. Priority Distribution */}
            <div className="glass rounded-2xl p-6 border border-slate-100 flex flex-col h-full shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-6">
                <ShieldCheck className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-slate-800">Priority Distribution</h3>
              </div>

              {mounted && stats?.priority_distribution ? (
                <div className="h-[220px] w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%" debounce={100}>
                    <BarChart
                      data={[
                        { name: 'Critical', value: stats.priority_distribution.critical, color: '#8b5cf6' },
                        { name: 'High', value: stats.priority_distribution.high, color: '#f59e0b' },
                        { name: 'Medium', value: stats.priority_distribution.medium, color: '#3b82f6' },
                        { name: 'Regular', value: stats.priority_distribution.regular, color: '#ef4444' },
                      ]}
                      margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                      barSize={45}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fontWeight: 600, fill: '#64748b' }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fontWeight: 600, fill: '#cbd5e1' }}
                      />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white/95 backdrop-blur-md p-3 rounded-xl shadow-xl border border-slate-100">
                                <p className="text-[10px] font-black uppercase text-slate-400 mb-1">{data.name}</p>
                                <p className="text-lg font-black text-slate-800">{data.value} <span className="text-xs font-bold text-slate-400">Tasks</span></p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {[
                          { name: 'Critical', color: '#8b5cf6' },
                          { name: 'High', color: '#f59e0b' },
                          { name: 'Medium', color: '#3b82f6' },
                          { name: 'Regular', color: '#ef4444' },
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="No priority data" description="Assigned tasks will show up here." variant="small" className="flex-1" icon={ShieldCheck} />
              )}
            </div>
          </div>

          {/* Attendance History Row */}
          <div className="glass rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-32 -mt-32" />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Attendance Tracker</h3>
                  <p className="text-xs text-slate-400 font-medium">Monitoring activity for the last 5 business days</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-white/50 p-2 rounded-2xl border border-slate-100 shadow-inner">
                  {stats?.attendance_history?.map((day: any, i: number) => (
                    <div
                      key={i}
                      className={cn(
                        "w-10 h-10 rounded-xl flex flex-col items-center justify-center text-[8px] font-black transition-transform hover:scale-110",
                        day.status === 'present' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-rose-500 text-white shadow-lg shadow-rose-100'
                      )}
                      title={`${day.status.toUpperCase()} - ${formatDate(day.date)}`}
                    >
                      <span className="opacity-60">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }).charAt(0)}</span>
                      <span className="text-[12px]">{day.status === 'present' ? 'P' : 'A'}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setShowAttendanceModal(true)}
                  className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all hover:scale-105"
                  title="Full Attendance Calendar"
                >
                  <Calendar className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">

            <div className="glass rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
                <h3 className="font-bold flex items-center gap-2 text-slate-800">
                  <ClipboardList className="w-5 h-5 text-indigo-500" /> Work Assignments
                </h3>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total: {tasks.length} items</span>
              </div>

              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-16 text-center">S.No</th>
                      <th className="min-w-[150px]">Company Name</th>
                      <th className="min-w-[300px]">Work Description</th>
                      <th>Priority</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Deadline</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task, index) => (
                      <Suspense key={task.id} fallback={<tr><td colSpan={6}>Loading...</td></tr>}>
                        <tr key={task.id} className="group hover:bg-slate-50 transition-colors">
                          <td className="text-center font-mono text-xs text-slate-400">{(index + 1).toString().padStart(2, '0')}</td>
                          <td>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${task.company_name === 'Personal / Internal' ? 'text-slate-400' : 'text-indigo-500'}`}>
                              {task.company_name}
                            </span>
                          </td>
                          <td>
                            <div
                              className="cursor-pointer group/desc max-w-lg"
                              onClick={() => openViewModal(task)}
                            >
                              <p className="font-medium text-slate-800 leading-relaxed text-sm line-clamp-2 group-hover/desc:text-indigo-600 transition-colors">
                                {task.work_description}
                              </p>
                            </div>
                          </td>
                          <td>
                            <span className={`text-[10px] font-black uppercase tracking-wider ${getPriorityColor(task.priority)}`}>
                              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                            </span>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {task.category_names && task.category_names.length > 0 ? (
                                task.category_names.map((cat, i) => (
                                  <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-bold border border-indigo-100 whitespace-nowrap">
                                    {cat}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-300 italic font-medium">None</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="flex flex-col gap-1">
                              <span className={`badge ${getStatusColor(task.status)} text-[10px] font-bold w-fit`}>
                                {getStatusLabel(task.status).charAt(0).toUpperCase() + getStatusLabel(task.status).slice(1)}
                              </span>
                              {task.completed_at && (
                                <span className="text-[9px] text-emerald-600 font-bold italic">
                                  Done: {formatDateTime(task.completed_at)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="text-xs text-slate-500 font-medium whitespace-nowrap">
                            {formatDateTime(task.deadline)}
                          </td>
                          <td>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {task.status === 'pending' && (
                                <button onClick={() => handleStatusUpdate(task.id, 'in_progress')} className="p-2 hover:bg-indigo-50 rounded-lg transition-colors" title="Start">
                                  <Play className="w-4 h-4 text-indigo-500" />
                                </button>
                              )}
                              {(task.status === 'pending' || task.status === 'in_progress' || task.status === 'overdue') && (
                                <button onClick={() => handleStatusUpdate(task.id, 'completed')} className="p-2 hover:bg-emerald-50 rounded-lg transition-colors" title="Complete">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                </button>
                              )}
                              <button onClick={() => handleEditTask(task)} className="p-2 hover:bg-amber-50 rounded-lg transition-colors" title="Edit">
                                <Pencil className="w-4 h-4 text-amber-500" />
                              </button>
                              <button onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)} className="p-2 hover:bg-violet-50 rounded-lg transition-colors" title="Remarks">
                                <MessageSquarePlus className="w-4 h-4 text-violet-500" />
                              </button>
                              <button onClick={() => handleDeleteTask(task.id)} className="p-2 hover:bg-rose-50 rounded-lg transition-colors" title="Delete">
                                <Trash2 className="w-4 h-4 text-rose-500" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedTask === task.id && (
                          <tr key={`${task.id}-remarks`}>
                            <td colSpan={6} className="!p-0 border-none">
                              <div className="bg-slate-50/50 p-6 border-y border-slate-100">
                                <div className="flex items-center gap-2 mb-4">
                                  <MessageSquarePlus className="w-4 h-4 text-indigo-600" />
                                  <h4 className="text-sm font-bold text-slate-800">Remarks History</h4>
                                  <button onClick={() => setExpandedTask(null)} className="ml-auto p-1.5 hover:bg-slate-200 rounded-lg transition-colors">
                                    <ChevronUp className="w-4 h-4 text-slate-500" />
                                  </button>
                                </div>
                                <div className="space-y-3 mb-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                  {task.remarks.length > 0 ? (
                                    task.remarks.map((r, i) => (
                                      <div key={i} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-xs font-bold text-indigo-600">{r.user_name}</span>
                                          <span className="text-[10px] text-slate-400 font-medium">{timeAgo(r.timestamp)}</span>
                                        </div>
                                        <p className="text-sm text-slate-700 leading-relaxed">{r.text}</p>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">
                                      <p className="text-xs text-slate-400 font-medium italic">No communication logs for this work item.</p>
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={remarkText}
                                    onChange={(e) => setRemarkText(e.target.value)}
                                    className="input flex-1 h-11"
                                    placeholder="Type a remark or update..."
                                  />
                                  <button onClick={() => handleAddRemark(task.id)} disabled={submittingRemark || !remarkText.trim()} className="btn btn-primary h-11 px-6">
                                    {submittingRemark ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Send className="w-4 h-4 mr-2" /> Send</>}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Suspense>
                    ))}
                    {tasks.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-20 bg-white">
                          <div className="max-w-xs mx-auto">
                            <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                            <p className="text-slate-500 font-bold">No assignments yet</p>
                            <button onClick={() => setShowCreateModal(true)} className="btn btn-ghost text-indigo-600 text-xs mt-3 font-bold">
                              <Plus className="w-3.5 h-3.5 mr-1" /> Assign Work
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                  <ClipboardList className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Assign Work</h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">Member: {employee.name}</p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateTask} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Work Description</label>
                <textarea
                  value={newTask.work_description}
                  onChange={(e) => setNewTask({ ...newTask, work_description: e.target.value })}
                  className="input min-h-32 resize-none text-base p-4"
                  placeholder="Clearly describe the work requirements..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Client / Company</label>
                <select
                  value={newTask.company_id}
                  onChange={(e) => setNewTask({ ...newTask, company_id: e.target.value })}
                  className="select h-11"
                >
                  <option value="">Personal / Internal</option>
                  {companies.map((comp) => (
                    <option key={comp.id} value={comp.id}>{comp.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as Task['priority'] })}
                    className="select h-11"
                  >
                    <option value="regular">Regular</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Deadline</label>
                  <input
                    type="datetime-local"
                    value={newTask.deadline}
                    onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                    className="input h-11"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary flex-1 h-12 rounded-2xl font-bold border-slate-200 text-slate-500">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn btn-primary flex-1 h-12 rounded-2xl font-bold shadow-xl shadow-indigo-100 bg-indigo-600 hover:bg-indigo-700">
                  {creating ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><Plus className="w-5 h-5 mr-2" /> Assign Work</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Task Modal */}
      {showViewModal && viewingTask && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                  <ClipboardList className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Work Details</h2>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-0.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    Reference: {viewingTask.id.slice(-8).toUpperCase()}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowViewModal(false)} className="w-12 h-12 rounded-2xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:text-slate-600 border border-transparent hover:border-slate-200">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">Description</h3>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">{viewingTask.work_description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                  <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" /> Priority
                  </h3>
                  <span className={`text-sm font-black uppercase ${getPriorityColor(viewingTask.priority)}`}>{viewingTask.priority}</span>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                  <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 flex items-center gap-1.5">
                    <Activity className="w-3 h-3" /> Status
                  </h3>
                  <span className={`badge ${getStatusColor(viewingTask.status)} font-bold`}>{getStatusLabel(viewingTask.status)}</span>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                  <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" /> Deadline
                  </h3>
                  <span className="text-sm font-bold text-slate-700">{formatDateTime(viewingTask.deadline)}</span>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                  <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 flex items-center gap-1.5">
                    <Building className="w-3 h-3" /> Client
                  </h3>
                  <span className="text-sm font-bold text-indigo-600">{viewingTask.company_name}</span>
                </div>
              </div>

              {/* Categories */}
              {viewingTask.category_names && viewingTask.category_names.length > 0 && (
                <div className="p-4 rounded-2xl bg-indigo-50/30 border border-indigo-100/50">
                  <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 flex items-center gap-1.5">
                    <Tag className="w-3 h-3" /> Categories
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {viewingTask.category_names.map((cat, i) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold border border-indigo-100">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {viewingTask.completed_at && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-700">Completed Successfully</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-600">{formatPreciseDateTime(viewingTask.completed_at)}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowViewModal(false)}
                  className="btn btn-primary w-full h-14 rounded-2xl font-black text-sm uppercase tracking-widest bg-slate-900 hover:bg-slate-800 shadow-xl shadow-slate-200"
                >
                  Close Assignment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {showEditModal && editingTask && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-100">
                  <Pencil className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Edit Assignment</h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">Reference: {editingTask.id.slice(-8).toUpperCase()}</p>
                </div>
              </div>
              <button onClick={() => setShowEditModal(false)} className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleUpdateTask} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Work Description</label>
                <textarea
                  value={editingTask.work_description}
                  onChange={(e) => setEditingTask({ ...editingTask, work_description: e.target.value })}
                  className="input min-h-32 resize-none text-base p-4"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Client / Company</label>
                <select
                  value={editingTask.company_id || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, company_id: e.target.value })}
                  className="select h-11"
                >
                  <option value="">Personal / Internal</option>
                  {companies.map((comp) => (
                    <option key={comp.id} value={comp.id}>{comp.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Priority</label>
                  <select
                    value={editingTask.priority}
                    onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value as Task['priority'] })}
                    className="select h-11"
                  >
                    <option value="regular">Regular</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Deadline</label>
                  <input
                    type="datetime-local"
                    value={editingTask.deadline}
                    onChange={(e) => setEditingTask({ ...editingTask, deadline: e.target.value })}
                    className="input h-11"
                    required
                  />
                </div>
              </div>

              {/* Category Selection */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                  <Tag className="w-3.5 h-3.5 text-indigo-500" />
                  Categories
                </label>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="max-h-32 overflow-y-auto p-2 custom-scrollbar grid grid-cols-2 gap-1">
                    {categories.filter(c => c.is_active).map((cat: any) => {
                      const isSelected = (editingTask.category_ids || []).includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            const current = editingTask.category_ids || [];
                            const next = isSelected ? current.filter(id => id !== cat.id) : [...current, cat.id];
                            setEditingTask({ ...editingTask, category_ids: next });
                          }}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 rounded-lg text-[10px] font-bold transition-all",
                            isSelected ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "bg-slate-50 text-slate-500 border border-transparent hover:bg-slate-100"
                          )}
                        >
                          {cat.name}
                          {isSelected && <CheckCircle2 className="w-3 h-3" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-secondary flex-1 h-12 rounded-xl border-slate-200">
                  Cancel
                </button>
                <button type="submit" disabled={updatingTask} className="btn btn-primary bg-amber-600 hover:bg-amber-700 flex-1 h-12 rounded-xl shadow-xl shadow-amber-100">
                  {updatingTask ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>Save Changes</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditProfileModal && editEmployeeData && (
        <div className="modal-overlay" onClick={() => setShowEditProfileModal(false)}>
          <div className="modal-content max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                  <UserCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Update Profile</h2>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-0.5">Editing: {employee.name}</p>
                </div>
              </div>
              <button onClick={() => setShowEditProfileModal(false)} className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">Full Name</label>
                  <div className="relative group">
                    <div className="input-icon-container">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={editEmployeeData.name}
                      onChange={(e) => setEditEmployeeData({ ...editEmployeeData, name: e.target.value })}
                      className="input input-with-icon h-12 rounded-2xl"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">Email Address</label>
                  <div className="relative group">
                    <div className="input-icon-container">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={editEmployeeData.email}
                      onChange={(e) => setEditEmployeeData({ ...editEmployeeData, email: e.target.value })}
                      className="input input-with-icon h-12 rounded-2xl"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">Mobile Number</label>
                  <div className="relative group">
                    <div className="input-icon-container">
                      <Phone className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={editEmployeeData.mobile}
                      onChange={(e) => setEditEmployeeData({ ...editEmployeeData, mobile: e.target.value })}
                      className="input input-with-icon h-12 rounded-2xl"
                      placeholder="Primary contact"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">Alt Mobile</label>
                  <div className="relative group">
                    <div className="input-icon-container">
                      <PhoneCall className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={editEmployeeData.alternate_mobile}
                      onChange={(e) => setEditEmployeeData({ ...editEmployeeData, alternate_mobile: e.target.value })}
                      className="input input-with-icon h-12 rounded-2xl"
                      placeholder="Secondary contact"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">Reward Points</label>
                  <div className="relative group">
                    <div className="input-icon-container">
                      <Award className="w-4 h-4" />
                    </div>
                    <input
                      type="number"
                      value={editEmployeeData.reward_points}
                      onChange={(e) => setEditEmployeeData({ ...editEmployeeData, reward_points: parseInt(e.target.value) })}
                      className="input input-with-icon h-12 rounded-2xl font-bold text-indigo-600"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">Account Status</label>
                  <div className="relative group">
                    <div className="input-icon-container">
                      <Power className="w-4 h-4" />
                    </div>
                    <select
                      value={editEmployeeData.is_active.toString()}
                      onChange={(e) => setEditEmployeeData({ ...editEmployeeData, is_active: e.target.value === 'true' })}
                      className="select input-with-icon h-12 rounded-2xl"
                    >
                      <option value="true">Active Account</option>
                      <option value="false">Inactive / Suspended</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 space-y-4 my-4">
                <div className="text-[10px] font-black uppercase text-indigo-500 tracking-wider mb-2">
                  Reporting Requirements for "{editEmployeeData.role.replace(/_/g, ' ').toUpperCase()}"
                </div>

                {/* Rule 1: Employee must select Assistant Manager & Assistant HR Manager */}
                {editEmployeeData.role === 'employee' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Assistant Manager Partner</label>
                      <select
                        value={editEmployeeData.reporting_manager_id}
                        onChange={(e) => setEditEmployeeData({ ...editEmployeeData, reporting_manager_id: e.target.value })}
                        className="select h-11 rounded-xl border-slate-200 bg-white"
                        required
                      >
                        <option value="">-- Choose Assistant Manager --</option>
                        {allUsers.filter(u => u.role === 'assistant_manager' && u.id !== employee.id).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Assistant HR Manager Partner</label>
                      <select
                        value={editEmployeeData.hr_reporting_manager_id}
                        onChange={(e) => setEditEmployeeData({ ...editEmployeeData, hr_reporting_manager_id: e.target.value })}
                        className="select h-11 rounded-xl border-slate-200 bg-white"
                        required
                      >
                        <option value="">-- Choose Asst HR Manager --</option>
                        {allUsers.filter(u => u.role === 'assistant_hr_manager' && u.id !== employee.id).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Rule 2: Assistant Manager: Must select Manager, Optional HR Manager */}
                {editEmployeeData.role === 'assistant_manager' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Reporting Manager (Manager) *</label>
                      <select
                        value={editEmployeeData.reporting_manager_id}
                        onChange={(e) => setEditEmployeeData({ ...editEmployeeData, reporting_manager_id: e.target.value })}
                        className="select h-11 rounded-xl border-slate-200 bg-white"
                        required
                      >
                        <option value="">-- Choose Manager --</option>
                        {allUsers.filter(u => u.role === 'manager' && u.id !== employee.id).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">HR Manager Link (Optional)</label>
                      <select
                        value={editEmployeeData.hr_reporting_manager_id}
                        onChange={(e) => setEditEmployeeData({ ...editEmployeeData, hr_reporting_manager_id: e.target.value })}
                        className="select h-11 rounded-xl border-slate-200 bg-white"
                      >
                        <option value="">-- Choose HR Manager --</option>
                        {allUsers.filter(u => u.role === 'hr_manager' && u.id !== employee.id).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Rule 3: Assistant HR Manager: Must select HR Manager, Optional Manager */}
                {editEmployeeData.role === 'assistant_hr_manager' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Reporting HR Manager (HR Manager) *</label>
                      <select
                        value={editEmployeeData.hr_reporting_manager_id}
                        onChange={(e) => setEditEmployeeData({ ...editEmployeeData, hr_reporting_manager_id: e.target.value })}
                        className="select h-11 rounded-xl border-slate-200 bg-white"
                        required
                      >
                        <option value="">-- Choose HR Manager --</option>
                        {allUsers.filter(u => u.role === 'hr_manager' && u.id !== employee.id).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Manager Link (Optional)</label>
                      <select
                        value={editEmployeeData.reporting_manager_id}
                        onChange={(e) => setEditEmployeeData({ ...editEmployeeData, reporting_manager_id: e.target.value })}
                        className="select h-11 rounded-xl border-slate-200 bg-white"
                      >
                        <option value="">-- Choose Manager --</option>
                        {allUsers.filter(u => u.role === 'manager' && u.id !== employee.id).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {(editEmployeeData.role === 'manager' || editEmployeeData.role === 'hr_manager' || editEmployeeData.role === 'admin') && (
                  <p className="text-xs text-muted-foreground italic">This role is top-level and does not require hierarchical reporting assignments.</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">Employment Role</label>
                  <div className="relative group">
                    <div className="input-icon-container">
                      <Shield className="w-4 h-4" />
                    </div>
                    <select
                      value={editEmployeeData.role}
                      onChange={(e) => setEditEmployeeData({ ...editEmployeeData, role: e.target.value })}
                      className="select input-with-icon h-12 rounded-2xl"
                    >
                      <option value="employee">Employee</option>
                      <option value="admin">Admin</option>
                      <option value="hr_manager">HR Manager</option>
                      <option value="assistant_hr_manager">Assistant HR Manager</option>
                      <option value="manager">Manager</option>
                      <option value="assistant_manager">Assistant Manager</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">Change Password</label>
                  <div className="relative group">
                    <div className="input-icon-container">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={editEmployeeData.password}
                      onChange={(e) => setEditEmployeeData({ ...editEmployeeData, password: e.target.value })}
                      className="input input-with-icon pr-12 h-12 rounded-2xl"
                      placeholder="........................"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowEditProfileModal(false)} className="btn btn-secondary flex-1 h-14 rounded-2xl font-bold border-slate-200 text-slate-500">
                  Cancel
                </button>
                <button type="submit" disabled={updatingProfile} className="btn btn-primary flex-1 h-14 rounded-2xl font-bold shadow-xl shadow-indigo-100 bg-indigo-600 hover:bg-indigo-700">
                  {updatingProfile ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                  ) : (
                    <>Update Profile</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary Structure Modal */}
      {showStructureModal && (
        <div className="modal-overlay" onClick={() => setShowStructureModal(false)}>
          <div className="modal-content max-w-xl bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-100 p-6 md:p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Salary Structure Setup</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-0.5">Employee: {employee?.name}</p>
                </div>
              </div>
              <button onClick={() => setShowStructureModal(false)} className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveStructure} className="space-y-5">
              <div className="text-[11px] font-black uppercase text-indigo-500 tracking-wider mb-2">Earnings Breakdown (Monthly)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Basic Salary (₹)</label>
                  <input
                    type="number"
                    value={structBasic}
                    onChange={(e) => setStructBasic(parseFloat(e.target.value) || 0)}
                    className="input h-12 rounded-2xl font-bold text-slate-700 border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">HRA (₹)</label>
                  <input
                    type="number"
                    value={structHra}
                    onChange={(e) => setStructHra(parseFloat(e.target.value) || 0)}
                    className="input h-12 rounded-2xl font-bold text-slate-700 border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Allowance (₹)</label>
                  <input
                    type="number"
                    value={structSpecial}
                    onChange={(e) => setStructSpecial(parseFloat(e.target.value) || 0)}
                    className="input h-12 rounded-2xl font-bold text-slate-700 border-slate-200"
                    required
                  />
                </div>
              </div>

              <div className="text-[11px] font-black uppercase text-rose-500 tracking-wider mb-2 mt-4">Deductions Breakdown (Monthly)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">PF Deduction (₹)</label>
                  <input
                    type="number"
                    value={structPf}
                    onChange={(e) => setStructPf(parseFloat(e.target.value) || 0)}
                    className="input h-12 rounded-2xl font-bold text-slate-700 border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">ESI Deduction (₹)</label>
                  <input
                    type="number"
                    value={structEsi}
                    onChange={(e) => setStructEsi(parseFloat(e.target.value) || 0)}
                    className="input h-12 rounded-2xl font-bold text-slate-700 border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2 ml-1">Income Tax (₹)</label>
                  <input
                    type="number"
                    value={structTax}
                    onChange={(e) => setStructTax(parseFloat(e.target.value) || 0)}
                    className="input h-12 rounded-2xl font-bold text-slate-700 border-slate-200"
                    required
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 mt-4">
                <div>Gross Earnings: <span className="text-indigo-600 text-sm font-black ml-1">₹{(structBasic + structHra + structSpecial).toLocaleString('en-IN')}</span></div>
                <div>Total Deductions: <span className="text-rose-600 text-sm font-black ml-1">₹{(structPf + structEsi + structTax).toLocaleString('en-IN')}</span></div>
                <div>Net Salary: <span className="text-emerald-600 text-sm font-black ml-1">₹{Math.max(0, (structBasic + structHra + structSpecial) - (structPf + structEsi + structTax)).toLocaleString('en-IN')}</span></div>
              </div>

              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowStructureModal(false)} className="btn btn-secondary flex-1 h-14 rounded-2xl font-bold border-slate-200 text-slate-500">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1 h-14 rounded-2xl font-bold shadow-xl bg-indigo-600 hover:bg-indigo-700 text-white">
                  Save Structure
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthCalendar({ year, month, history }: { year: number, month: number, history: any[] }) {
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const today = new Date();
  const days = [];

  let stats = {
    workingDays: 0,
    present: 0,
    late: 0,
    absent: 0,
    holidays: 0,
    leaves: 0
  };

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isFuture = date > today;

    const record = history.find((h: any) => {
      const hDate = new Date(h.date);
      return hDate.getFullYear() === year && hDate.getMonth() === month && hDate.getDate() === d;
    });

    let status = record?.status || (isFuture ? 'none' : (isWeekend ? 'weekend' : 'absent'));

    if (!isWeekend && !isFuture) {
      stats.workingDays++;
      if (status === 'present') stats.present++;
      else if (status === 'late') stats.late++;
      else if (status === 'absent') stats.absent++;
      else if (status === 'holiday') stats.holidays++;
      else if (status === 'leave') stats.leaves++;
    }

    let colorClass = 'bg-slate-50 text-slate-400';
    let symbol = '';

    if (status === 'present') {
      colorClass = 'bg-emerald-500 text-white shadow-lg shadow-emerald-100';
      symbol = 'P';
    } else if (status === 'late') {
      colorClass = 'bg-amber-500 text-white shadow-lg shadow-amber-100';
      symbol = 'L';
    } else if (status === 'absent') {
      colorClass = 'bg-rose-500 text-white shadow-lg shadow-rose-100';
      symbol = 'A';
    } else if (status === 'holiday') {
      colorClass = 'bg-indigo-500 text-white';
      symbol = 'H';
    } else if (isWeekend) {
      colorClass = 'bg-slate-100 text-slate-300';
    }

    // Build tooltip
    let tooltip = `${status.toUpperCase()}`;
    if (record?.check_in) {
      const ci = new Date(ensureUTC(record.check_in));
      tooltip += `\nIn: ${ci.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`;
    }
    if (record?.check_out) {
      const co = new Date(ensureUTC(record.check_out));
      tooltip += `\nOut: ${co.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`;
    }
    if (record?.is_regularized) {
      tooltip += `\n[Regularized]`;
    }

    days.push({ day: d, status, symbol, colorClass, isFuture, record, tooltip });
  }

  return (
    <div className="flex flex-col">
      <h3 className="text-center font-black text-xl text-slate-800 mb-8">{monthName}</h3>

      <div className="grid grid-cols-7 gap-2 mb-8">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-black text-slate-300 py-2">{d}</div>
        ))}
        {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
        {days.map(d => (
          <div
            key={d.day}
            className={cn(
              "aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-black relative transition-all group cursor-default",
              d.colorClass,
              d.isFuture && "opacity-20"
            )}
            title={d.tooltip}
          >
            <span className="text-[10px] opacity-40 absolute top-1 left-1.5">{d.day}</span>
            {d.symbol && (
              <span className="text-sm mt-1">{d.symbol}</span>
            )}
            {d.record?.is_regularized && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-violet-500 border border-white" title="Regularized" />
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2 pt-6 border-t border-slate-100">
        {[
          { label: 'Working Days', value: stats.workingDays, color: 'text-slate-600' },
          { label: 'Present', value: stats.present, color: 'text-emerald-600' },
          { label: 'Late', value: stats.late, color: 'text-amber-600' },
          { label: 'Absent', value: stats.absent, color: 'text-rose-600' },
          { label: 'Holidays', value: stats.holidays, color: 'text-indigo-600' },
          { label: 'Leaves', value: stats.leaves, color: 'text-violet-600' },
        ].map((s, i) => (
          <div key={i} className="flex items-center justify-between px-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</span>
            <span className={cn("text-sm font-black", s.color)}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EmployeeProfilePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <EmployeeProfileContent />
    </Suspense>
  );
}

