'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Task, Employee, Company, Category } from '@/types';
import UserLink from '@/components/UserLink';
import { formatDateTime, getStatusColor, getStatusLabel, getPriorityColor, timeAgo, formatPreciseDateTime, cn } from '@/lib/utils';
import {
  ClipboardList, Plus, Filter, X, CheckCircle2, Play, Trash2, Award,
  MessageSquarePlus, Building2, Send, ChevronUp, Search, Pencil, Eye,
  RefreshCcw, CalendarDays, Users2, Building, ChevronDown, Check, Tag, Clock
} from 'lucide-react';
import { TableSkeleton } from '@/components/SkeletonLoaders';

interface MultiSelectProps {
  label: string;
  icon: any;
  options: { id: string; name: string; subtext?: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

function MultiSelectDropdown({ label, icon: Icon, options, selectedIds, onChange, placeholder, disabled }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOptions = options.filter(opt =>
    opt.name.toLowerCase().includes(search.toLowerCase()) ||
    (opt.subtext && opt.subtext.toLowerCase().includes(search.toLowerCase()))
  );

  const selectedNames = options
    .filter(opt => selectedIds.includes(opt.id))
    .map(opt => opt.name);

  return (
    <div className="space-y-2 relative">
      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide">
        <Icon className="w-4 h-4 text-indigo-500" />
        {label}
      </label>

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 bg-white border rounded-xl transition-all text-left",
          isOpen ? "border-indigo-500 ring-2 ring-indigo-50" : "border-slate-200 hover:border-slate-300",
          disabled && "opacity-50 cursor-not-allowed bg-slate-50"
        )}
        disabled={disabled}
      >
        <div className="flex-1 truncate">
          {selectedNames.length > 0 ? (
            <span className="text-sm font-semibold text-slate-700">
              {selectedNames.join(', ')}
            </span>
          ) : (
            <span className="text-sm text-slate-400">{placeholder || 'Select items...'}</span>
          )}
        </div>
        <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto p-2 custom-scrollbar">
              {filteredOptions.length > 0 ? (
                filteredOptions.map(opt => {
                  const isSelected = selectedIds.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        const newIds = isSelected
                          ? selectedIds.filter(id => id !== opt.id)
                          : [...selectedIds, opt.id];
                        onChange(newIds);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left group",
                        isSelected ? "bg-indigo-50" : "hover:bg-slate-50"
                      )}
                    >
                      <div className="flex flex-col">
                        <span className={cn("text-xs font-bold", isSelected ? "text-indigo-600" : "text-slate-700")}>
                          {opt.name}
                        </span>
                        {opt.subtext && <span className="text-[10px] text-slate-400 font-medium">{opt.subtext}</span>}
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </button>
                  );
                })
              ) : (
                <div className="py-8 text-center text-[10px] text-slate-400 font-bold uppercase italic">No results found</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminTasksPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'team' | 'my' | 'recurring'>('team');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [recurringRules, setRecurringRules] = useState<any[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);

  const fetchRecurringRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const res = await api.get('/tasks/recurring-rules');
      setRecurringRules(res.data);
    } catch (err) {
      console.error('Failed to fetch recurring rules:', err);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const handleTogglePause = async (ruleId: string, currentStatus: string) => {
    try {
      if (currentStatus === 'paused') {
        await api.post(`/tasks/recurring-rules/${ruleId}/resume`);
      } else {
        await api.post(`/tasks/recurring-rules/${ruleId}/pause`);
      }
      fetchRecurringRules();
    } catch (err) {
      console.error('Failed to toggle pause on rule:', err);
    }
  };

  const handlePauseTemporarily = async (ruleId: string, duration: '3days' | '1week' | '2weeks') => {
    try {
      const params: any = {};
      if (duration === '3days') params.days = 3;
      if (duration === '1week') params.weeks = 1;
      if (duration === '2weeks') params.weeks = 2;
      await api.post(`/tasks/recurring-rules/${ruleId}/pause`, null, { params });
      fetchRecurringRules();
    } catch (err) {
      console.error('Failed to pause rule temporarily:', err);
    }
  };

  const handleTerminateRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to terminate this recurring task chain? This will stop future task generations.')) return;
    try {
      await api.delete(`/tasks/recurring-rules/${ruleId}`);
      fetchRecurringRules();
    } catch (err) {
      console.error('Failed to terminate rule:', err);
    }
  };

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [newTask, setNewTask] = useState({
    work_description: '',
    assigned_to_list: [] as string[],
    priority: 'medium' as Task['priority'],
    deadline: '',
    company_id_list: [] as string[],
    category_ids: [] as string[],
    for_all: false,
    is_recurrent: false
  });

  const [recurrence, setRecurrence] = useState({
    type: 'daily',
    interval: 1,
    weekdays: [] as number[],
    month_day: 1,
    end_type: 'never',
    end_value: ''
  });

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);

  // Remarks state
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [submittingRemark, setSubmittingRemark] = useState(false);

  // Complete confirmation modal
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [confirmingTask, setConfirmingTask] = useState<Task | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [completionRemark, setCompletionRemark] = useState('');
  const [qualityMultiplier, setQualityMultiplier] = useState(1.0);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.get('/tasks', { params: { all_tasks: true } });
      setTasks(res.data);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await api.get('/admin/employees');
      setEmployees(res.data);
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await api.get('/companies');
      setCompanies(res.data);
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data);
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchEmployees();
    fetchCompanies();
    fetchCategories();
    fetchRecurringRules();
  }, [fetchTasks, fetchEmployees, fetchCompanies, fetchCategories, fetchRecurringRules]);

  // Client-side filtering
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (activeTab === 'my') {
        if (task.assigned_to !== user?.id) return false;
      }
      if (searchQuery && !(task.work_description || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (statusFilter && task.status !== statusFilter) return false;
      if (priorityFilter && task.priority !== priorityFilter) return false;
      if (employeeFilter && task.assigned_to !== employeeFilter) return false;
      if (companyFilter && task.company_id !== companyFilter) return false;
      if (deadlineFrom && new Date(task.deadline) < new Date(deadlineFrom)) return false;
      if (deadlineTo) {
        const toDate = new Date(deadlineTo);
        toDate.setHours(23, 59, 59, 999);
        if (new Date(task.deadline) > toDate) return false;
      }
      return true;
    });
  }, [tasks, activeTab, user, searchQuery, statusFilter, priorityFilter, employeeFilter, companyFilter, deadlineFrom, deadlineTo]);

  const hasActiveFilters = searchQuery || statusFilter || priorityFilter || employeeFilter || companyFilter || deadlineFrom || deadlineTo;

  const clearAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setPriorityFilter('');
    setEmployeeFilter('');
    setCompanyFilter('');
    setDeadlineFrom('');
    setDeadlineTo('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const payload = {
        work_description: newTask.work_description,
        priority: newTask.priority,
        deadline: new Date(newTask.deadline).toISOString(),
        assigned_to_list: newTask.assigned_to_list,
        company_id_list: newTask.company_id_list,
        category_ids: newTask.category_ids,
        for_all: newTask.for_all,
        is_recurrent: newTask.is_recurrent,
        recurrence: newTask.is_recurrent ? recurrence : undefined
      };
      await api.post('/tasks', payload);
      setShowCreateModal(false);
      setNewTask({
        work_description: '',
        assigned_to_list: [],
        priority: 'medium',
        deadline: '',
        company_id_list: [],
        category_ids: [],
        for_all: false,
        is_recurrent: false
      });
      fetchTasks();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: any } } };
      const detail = axiosError.response?.data?.detail;
      if (typeof detail === 'string') {
        setError(detail);
      } else if (Array.isArray(detail)) {
        const messages = detail.map((e: any) => `${e.loc ? e.loc.join('.') : 'field'}: ${e.msg || 'error'}`).join(', ');
        setError(messages || 'Validation failed');
      } else {
        setError('Failed to create task');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    // Convert deadline to datetime-local format (YYYY-MM-DDThh:mm)
    const date = new Date(task.deadline);
    const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    setEditingTask({
      ...task,
      deadline: localDateTime
    });
    setShowEditModal(true);
  };

  const openViewModal = (task: Task) => {
    setViewingTask(task);
    setShowViewModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    setUpdating(true);
    setError('');
    try {
      const payload = {
        work_description: editingTask.work_description,
        priority: editingTask.priority,
        deadline: new Date(editingTask.deadline).toISOString(),
        company_id: editingTask.company_id || undefined,
        assigned_to: editingTask.assigned_to,
        category_ids: editingTask.category_ids,
      };
      await api.put(`/tasks/${editingTask.id}`, payload);
      setShowEditModal(false);
      setEditingTask(null);
      fetchTasks();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      setError(axiosError.response?.data?.detail || 'Failed to update task');
    } finally {
      setUpdating(false);
    }
  };

  const handleStatusUpdate = async (taskId: string, newStatus: string) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
      fetchTasks();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const openCompleteModal = (task: Task) => {
    setConfirmingTask(task);
    setIsConfirmed(false);
    setCompletionRemark('');
    setShowCompleteModal(true);
  };

  const confirmCompletion = async () => {
    if (!confirmingTask || !isConfirmed) return;
    try {
      const payload: any = {
        status: 'completed',
        quality_multiplier: qualityMultiplier
      };
      if (completionRemark.trim()) {
        payload.remarks = completionRemark.trim();
      }
      await api.put(`/tasks/${confirmingTask.id}`, payload);
      setShowCompleteModal(false);
      setConfirmingTask(null);
      setCompletionRemark('');
      setQualityMultiplier(1.0);
      fetchTasks();
    } catch (err) {
      console.error('Failed to complete task:', err);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      fetchTasks();
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
      fetchTasks();
    } catch (err) {
      console.error('Failed to add remark:', err);
    } finally {
      setSubmittingRemark(false);
    }
  };

  if (loading) {
    return <TableSkeleton cols={9} rows={10} />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Task Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Assign and track work across your team</p>
        </div>
        <button
          id="create-task-btn"
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4" />
          Assign Work
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('team')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'team'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Team Tasks
        </button>
        <button
          onClick={() => setActiveTab('my')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'my'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          My Tasks
        </button>
        <button
          onClick={() => setActiveTab('recurring')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'recurring'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Recurring Tasks
        </button>
      </div>

      {activeTab !== 'recurring' ? (
        <>
          {/* Search & Filters */}
          <div className="glass rounded-xl p-5 mb-6 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            id="task-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
            placeholder="Search work by description..."
          />
        </div>

        {/* Filter Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Status */}
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Status</label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="completed_late">Completed Late</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          {/* Priority */}
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Priority</label>
            <select
              id="filter-priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="select"
            >
              <option value="">All</option>
              <option value="regular">Regular</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          {/* Assigned To */}
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Assigned To</label>
            <select
              id="filter-employee"
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="select"
            >
              <option value="">All Employees</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          {/* Company */}
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Company</label>
            <select
              id="filter-company"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="select"
            >
              <option value="">All Companies</option>
              {companies.map((comp) => (
                <option key={comp.id} value={comp.id}>{comp.name}</option>
              ))}
            </select>
          </div>
          {/* Deadline From */}
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Deadline From</label>
            <input
              id="filter-deadline-from"
              type="date"
              value={deadlineFrom}
              onChange={(e) => setDeadlineFrom(e.target.value)}
              className="input"
            />
          </div>
          {/* Deadline To */}
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Deadline To</label>
            <input
              id="filter-deadline-to"
              type="date"
              value={deadlineTo}
              onChange={(e) => setDeadlineTo(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {/* Filter summary */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{filteredTasks.length}</span> of {tasks.length} work items
            </span>
          </div>
          {hasActiveFilters && (
            <button onClick={clearAllFilters} className="btn btn-ghost text-xs">
              <X className="w-3.5 h-3.5" /> Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* Tasks Table */}
      <div className="glass rounded-xl overflow-x-auto">
        <table className="data-table min-w-[1000px] lg:min-w-full">
          <thead>
            <tr>
              <th className="w-16">S.No</th>
              <th>Employee Name</th>
              <th>Company Name</th>
              <th>Category</th>
              <th>Work Description</th>
              <th>Work Priority</th>
              <th>Dead-line</th>
              <th>Completed At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task, index) => (
              <Fragment key={task.id}>
                <tr>
                  <td>
                    <span className="text-xs font-mono text-muted-foreground">{(index + 1).toString().padStart(2, '0')}</span>
                  </td>
                  <td>
                    {(() => {
                      const emp = employees.find(e => e.id === task.assigned_to);
                      return (
                        <UserLink
                          id={task.assigned_to}
                          name={task.assigned_to_name || 'Unknown'}
                          email={emp?.email}
                          reward_points={emp?.reward_points}
                          role={emp?.role}
                        />
                      );
                    })()}
                  </td>
                  <td>
                    <span className={`badge ${task.company_name === 'Personal / Internal' ? 'bg-slate-100 text-slate-500 border-slate-200' : 'badge-purple'}`}>
                      {task.company_name}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {task.category_names && task.category_names.length > 0 ? (
                        task.category_names.map((cat, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold border border-indigo-100 whitespace-nowrap">
                            {cat}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-300 italic font-medium">None</span>
                      )}
                    </div>
                  </td>
                  <td className="max-w-md">
                    <div
                      onClick={() => openViewModal(task)}
                      className="cursor-pointer hover:bg-slate-50 p-2 -m-2 rounded-lg transition-colors group"
                      title="Click to view full details"
                    >
                      <p className="text-sm text-slate-700 leading-relaxed line-clamp-2 group-hover:text-indigo-600">
                        {task.work_description}
                      </p>
                      {(task.work_description || '').length > 100 && (
                        <span className="text-[10px] text-indigo-400 font-bold uppercase mt-1 block">Read More...</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`font-medium text-sm capitalize ${getPriorityColor(task.priority || 'medium')}`}>
                      {(task.priority || 'medium').charAt(0).toUpperCase() + (task.priority || 'medium').slice(1)}
                    </span>
                  </td>
                  <td className="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(task.deadline)}</td>
                  <td className="text-sm text-muted-foreground whitespace-nowrap">
                    {task.completed_at ? (
                      <span className="text-green-600 font-medium">
                        {formatDateTime(task.completed_at)}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <span className={`badge ${getStatusColor(task.status)} mr-2`}>
                        {getStatusLabel(task.status).charAt(0).toUpperCase() + getStatusLabel(task.status).slice(1)}
                      </span>
                      {task.status === 'pending' && (
                        <button
                          onClick={() => handleStatusUpdate(task.id, 'in_progress')}
                          className="btn btn-ghost text-xs p-1.5"
                          title="Start"
                        >
                          <Play className="w-3.5 h-3.5 text-blue-400" />
                        </button>
                      )}
                      {(task.status === 'pending' || task.status === 'in_progress' || task.status === 'overdue') && (
                        <button
                          onClick={() => openCompleteModal(task)}
                          className="btn btn-ghost text-xs p-1.5"
                          title={task.status === 'overdue' ? 'Complete (no reward)' : 'Complete'}
                        >
                          <CheckCircle2 className={`w-3.5 h-3.5 ${task.status === 'overdue' ? 'text-amber-400' : 'text-green-400'}`} />
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                        className="btn btn-ghost text-xs p-1.5 relative"
                        title="Remarks"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5 text-purple-400" />
                        {(task.remarks || []).length > 0 && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-500 text-white text-[8px] flex items-center justify-center font-bold">
                            {(task.remarks || []).length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(task)}
                        className="btn btn-ghost text-xs p-1.5"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5 text-blue-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="btn btn-ghost text-xs p-1.5"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
                {/* Expanded Remarks Row */}
                {expandedTask === task.id && (
                  <tr key={`${task.id}-remarks`}>
                    <td colSpan={8} className="!p-0 border-none">
                      <div className="bg-slate-50/80 p-6 border-y border-slate-100 shadow-inner">
                        <div className="flex items-center gap-2 mb-4">
                          <MessageSquarePlus className="w-4 h-4 text-purple-600" />
                          <h4 className="text-sm font-bold text-slate-800">Communication & Remarks</h4>
                          <button
                            onClick={() => setExpandedTask(null)}
                            className="ml-auto btn btn-ghost text-xs p-1"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* Existing remarks */}
                        {(task.remarks || []).length > 0 ? (
                          <div className="space-y-3 mb-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {(task.remarks || []).map((r, i) => (
                              <div key={i} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-bold text-indigo-600">{r.user_name}</span>
                                  <div className="text-right">
                                    <p className="text-[10px] text-slate-400 leading-none font-medium">{formatPreciseDateTime(r.timestamp)}</p>
                                    <p className="text-[9px] text-indigo-400 font-bold mt-1 uppercase tracking-tighter">{timeAgo(r.timestamp)}</p>
                                  </div>
                                </div>
                                <p className="text-sm text-slate-700 leading-relaxed">{r.text}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl mb-4">
                            <p className="text-xs text-slate-400 font-medium italic text-muted-foreground">No remarks found for this work item.</p>
                          </div>
                        )}
                        {/* Add remark */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={expandedTask === task.id ? remarkText : ''}
                            onChange={(e) => setRemarkText(e.target.value)}
                            className="input flex-1 h-11"
                            placeholder="Type a remark or update..."
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleAddRemark(task.id);
                              }
                            }}
                          />
                          <button
                            onClick={() => handleAddRemark(task.id)}
                            disabled={submittingRemark || !remarkText.trim()}
                            className="btn btn-primary h-11 px-6"
                          >
                            {submittingRemark ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <><Send className="w-4 h-4 mr-2" /> Send</>
                            )}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filteredTasks.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-20 text-slate-400">
                  {hasActiveFilters ? 'No work items match the current filters' : 'No work assigned yet. Create your first task!'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  ) : (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Recurring Task Chains</h2>
        <button
          type="button"
          onClick={fetchRecurringRules}
          className="btn btn-ghost text-xs"
        >
          <RefreshCcw className="w-3.5 h-3.5 mr-1" /> Reload Rules
        </button>
      </div>

      {rulesLoading ? (
        <div className="text-center py-12 text-slate-400">Loading recurring rules...</div>
      ) : recurringRules.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl bg-white/50 animate-in fade-in">
          <RefreshCcw className="w-12 h-12 text-slate-300 mx-auto mb-3 animate-pulse" />
          <p className="text-slate-500 font-bold">No recurring task chains found</p>
          <p className="text-slate-400 text-xs mt-1">Create a recurring task via "Assign Work" to populate this view.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {recurringRules.map((rule) => {
            const nextRunDate = rule.next_run ? new Date(rule.next_run).toLocaleString() : 'N/A';
            const isPaused = rule.status === 'paused';
            
            return (
              <div key={rule.id} className="glass rounded-2xl p-6 border border-slate-100 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-base">{rule.name}</h3>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Every {rule.interval} {rule.recurrence_type}(s)
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      {rule.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                          Paused
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 font-medium line-clamp-3">
                    {rule.work_description}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs pt-2 font-bold text-slate-500">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase tracking-tight">Created At</span>
                      <span className="text-slate-700">{rule.created_at ? new Date(rule.created_at).toLocaleString() : 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase tracking-tight font-extrabold text-indigo-600">Next Run Date</span>
                      <span className="text-slate-700">{nextRunDate}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase tracking-tight">Occurrence Count</span>
                      <span className="text-slate-700">{rule.occurrence_count} spawned</span>
                    </div>
                  </div>
                  
                  {rule.weekdays && rule.weekdays.length > 0 && (
                    <div className="text-xs pt-1 font-bold text-slate-500">
                      <span className="text-[10px] text-slate-400 block uppercase tracking-tight">Scheduled Weekdays</span>
                      <span className="text-indigo-600">
                        {rule.weekdays.map((w) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][w]).join(', ')}
                      </span>
                    </div>
                  )}

                  {rule.paused_until_date && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-100/50 text-[11px] text-amber-700 font-bold flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      Paused until: {new Date(rule.paused_until_date).toLocaleString()}
                    </div>
                  )}

                  {rule.assignee_names && rule.assignee_names.length > 0 && (
                    <div className="text-xs pt-1">
                      <span className="text-[10px] text-slate-400 block uppercase tracking-tight">Assigned To</span>
                      <span className="text-slate-700 font-semibold">{rule.assignee_names.join(', ')}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleTogglePause(rule.id, rule.status)}
                    className={`btn text-xs px-4 py-2 h-9 rounded-lg ${
                      isPaused ? 'btn-primary' : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {isPaused ? 'Resume Rule' : 'Pause Rule'}
                  </button>

                  {!isPaused ? (
                    <div className="relative group">
                      <button type="button" className="btn btn-secondary text-xs px-4 py-2 h-9 rounded-lg">
                        Pause for...
                      </button>
                      <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-10 min-w-[120px] space-y-1">
                        <button
                          type="button"
                          onClick={() => handlePauseTemporarily(rule.id, '3days')}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-[11px] font-bold text-slate-600 rounded-lg"
                        >
                          3 Days
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePauseTemporarily(rule.id, '1week')}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-[11px] font-bold text-slate-600 rounded-lg"
                        >
                          1 Week
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePauseTemporarily(rule.id, '2weeks')}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-[11px] font-bold text-slate-600 rounded-lg"
                        >
                          2 Weeks
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => handleTerminateRule(rule.id)}
                    className="btn bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 text-xs px-4 py-2 h-9 rounded-lg ml-auto flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Terminate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <ClipboardList className="w-6 h-6 text-indigo-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Assign New Work</h2>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-medium">
                {error}
              </div>
            )}
            <form onSubmit={handleCreate} className="space-y-6">
              {/* Assignment Section */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Employees Dropdown */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        <Users2 className="w-3.5 h-3.5 text-indigo-500" />
                        Target Employees
                      </label>
                      <button
                        type="button"
                        onClick={() => setNewTask(prev => ({ ...prev, for_all: !prev.for_all }))}
                        className={cn(
                          "text-[9px] font-black px-2 py-0.5 rounded-full border transition-all uppercase tracking-tight",
                          newTask.for_all ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-400 border-slate-200 hover:border-indigo-300"
                        )}
                      >
                        {newTask.for_all ? 'Scope: ALL' : 'Scope: Specific'}
                      </button>
                    </div>

                    <MultiSelectDropdown
                      label=""
                      icon={() => null} // Icon already in header
                      options={employees.filter(e => e.is_active).map(e => ({ id: e.id, name: e.name, subtext: e.email }))}
                      selectedIds={newTask.assigned_to_list}
                      onChange={(ids) => setNewTask(prev => ({ ...prev, assigned_to_list: ids }))}
                      placeholder={newTask.for_all ? "Automatically assigned to all" : "Select employees..."}
                      disabled={newTask.for_all}
                    />
                  </div>

                  {/* Companies Dropdown */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        <Building className="w-3.5 h-3.5 text-indigo-500" />
                        Target Companies
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = companies.map(c => c.id);
                          const isAllSelected = newTask.company_id_list.length === allIds.length;
                          setNewTask(prev => ({
                            ...prev,
                            company_id_list: isAllSelected ? [] : allIds
                          }));
                        }}
                        className={cn(
                          "text-[9px] font-black px-2 py-0.5 rounded-full border transition-all uppercase tracking-tight",
                          newTask.company_id_list.length === companies.length && companies.length > 0
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-white text-slate-400 border-slate-200 hover:border-indigo-300"
                        )}
                      >
                        {newTask.company_id_list.length === companies.length && companies.length > 0 ? 'ALL SELECTED' : 'SELECT ALL'}
                      </button>
                    </div>
                    <MultiSelectDropdown
                      label=""
                      icon={() => null}
                      options={companies.map(c => ({ id: c.id, name: c.name }))}
                      selectedIds={newTask.company_id_list}
                      onChange={(ids) => setNewTask(prev => ({ ...prev, company_id_list: ids }))}
                      placeholder="Select companies..."
                    />
                  </div>
                </div>

                {newTask.for_all && (
                  <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-center gap-3 text-indigo-600 animate-in fade-in slide-in-from-top-1">
                    <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-tight">Broadcast mode: This task will be duplicated for every active employee.</span>
                  </div>
                )}
              </div>

              {/* Task Details */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Work Description</label>
                  <textarea
                    value={newTask.work_description}
                    onChange={(e) => setNewTask({ ...newTask, work_description: e.target.value })}
                    className="input min-h-24 resize-none text-sm p-4"
                    placeholder="Clearly describe the work to be performed..."
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Work Priority</label>
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
                    <label className={`block text-sm font-bold mb-2 uppercase tracking-wide ${newTask.is_recurrent ? 'text-slate-400' : 'text-slate-700'}`}>
                      Dead-line {newTask.is_recurrent && <span className="text-[10px] text-amber-500 font-bold tracking-tight">(SET VIA RECURRENCE)</span>}
                    </label>
                    <input
                      type="datetime-local"
                      value={newTask.is_recurrent ? '' : newTask.deadline}
                      onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                      className="input h-11 disabled:opacity-50 disabled:bg-slate-100"
                      disabled={newTask.is_recurrent}
                      required={!newTask.is_recurrent}
                    />
                  </div>
                </div>
              </div>

              {/* Category Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    <Tag className="w-3.5 h-3.5 text-indigo-500" />
                    Categories
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = categories.filter(c => c.is_active).map(c => c.id);
                      const isAllSelected = newTask.category_ids.length === allIds.length;
                      setNewTask(prev => ({
                        ...prev,
                        category_ids: isAllSelected ? [] : allIds
                      }));
                    }}
                    className={cn(
                      "text-[9px] font-black px-2 py-0.5 rounded-full border transition-all uppercase tracking-tight",
                      newTask.category_ids.length === categories.filter(c => c.is_active).length && categories.filter(c => c.is_active).length > 0
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white text-slate-400 border-slate-200 hover:border-indigo-300"
                    )}
                  >
                    {newTask.category_ids.length === categories.filter(c => c.is_active).length && categories.filter(c => c.is_active).length > 0 ? 'ALL SELECTED' : 'SELECT ALL'}
                  </button>
                </div>
                <MultiSelectDropdown
                  label=""
                  icon={() => null}
                  options={categories.filter(c => c.is_active).map(c => ({ id: c.id, name: c.name }))}
                  selectedIds={newTask.category_ids}
                  onChange={(ids) => setNewTask(prev => ({ ...prev, category_ids: ids }))}
                  placeholder="Select categories..."
                />
              </div>

              {/* Recurrence Section */}
              <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
                      <RefreshCcw className="w-6 h-6 text-indigo-600 animate-spin-slow" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Recurrent Schedule</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Auto-generate Tasks</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={newTask.is_recurrent}
                      onChange={(e) => setNewTask(prev => ({ ...prev, is_recurrent: e.target.checked }))}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {newTask.is_recurrent && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="bg-amber-50 border border-amber-100/50 rounded-xl p-3 text-xs text-amber-800 font-medium mb-2">
                      Please specify the first occurrence's deadline below. All subsequent recurrences will be scheduled relative to this date and time.
                    </div>
                    <div>
                      <label className="block text-xs font-black text-indigo-600 uppercase mb-2 tracking-wide">First Occurrence Deadline</label>
                      <input
                        type="datetime-local"
                        value={newTask.deadline}
                        onChange={(e) => setNewTask(prev => ({ ...prev, deadline: e.target.value }))}
                        className="input h-10 mb-2"
                        required={newTask.is_recurrent}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-black text-slate-500 uppercase mb-2 tracking-wide">Repeat Interval</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            value={recurrence.interval}
                            onChange={(e) => setRecurrence(prev => ({ ...prev, interval: parseInt(e.target.value) }))}
                            className="input h-10 w-20 text-center"
                          />
                          <select
                            value={recurrence.type}
                            onChange={(e) => setRecurrence(prev => ({ ...prev, type: e.target.value }))}
                            className="select h-10"
                          >
                            <option value="daily">Day(s)</option>
                            <option value="weekly">Week(s)</option>
                            <option value="monthly">Month(s)</option>
                          </select>
                        </div>
                      </div>

                      {recurrence.type === 'weekly' && (
                        <div>
                          <label className="block text-xs font-black text-slate-500 uppercase mb-2 tracking-wide">On Specific Days</label>
                          <div className="flex flex-wrap gap-1">
                            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => {
                              const val = idx;
                              const isSelected = recurrence.weekdays.includes(val);
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    const list = isSelected
                                      ? recurrence.weekdays.filter(d => d !== val)
                                      : [...recurrence.weekdays, val];
                                    setRecurrence(prev => ({ ...prev, weekdays: list }));
                                  }}
                                  className={cn(
                                    "w-8 h-8 rounded-lg text-[10px] font-black transition-all",
                                    isSelected ? "bg-indigo-600 text-white" : "bg-white text-slate-400 border border-slate-200"
                                  )}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="block text-xs font-black text-slate-500 uppercase mb-2 tracking-wide">End Condition</label>
                        <select
                          value={recurrence.end_type}
                          onChange={(e) => setRecurrence(prev => ({ ...prev, end_type: e.target.value }))}
                          className="select h-10"
                        >
                          <option value="never">Never</option>
                          <option value="count">After occurrences</option>
                          <option value="date">On specific date</option>
                        </select>
                      </div>
                      {recurrence.end_type !== 'never' && (
                        <div>
                          <label className="block text-xs font-black text-slate-500 uppercase mb-2 tracking-wide">
                            {recurrence.end_type === 'count' ? 'Limit (Occurrences)' : 'Termination Date'}
                          </label>
                          <input
                            type={recurrence.end_type === 'count' ? 'number' : 'date'}
                            value={recurrence.end_value}
                            onChange={(e) => setRecurrence(prev => ({ ...prev, end_value: e.target.value }))}
                            className="input h-10"
                            placeholder={recurrence.end_type === 'count' ? 'e.g. 10' : ''}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary flex-1 h-12 rounded-xl">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn btn-primary flex-1 h-12 rounded-xl shadow-xl shadow-indigo-100">
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
      {/* Edit Task Modal */}
      {showEditModal && editingTask && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Pencil className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Edit Task</h2>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleUpdate} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Work Description</label>
                <textarea
                  value={editingTask.work_description}
                  onChange={(e) => setEditingTask({ ...editingTask, work_description: e.target.value })}
                  className="input min-h-32 resize-none text-base p-4"
                  placeholder="Clearly describe the work to be performed..."
                  required
                />
              </div>

              {/* Assignment Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Employee Selection */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    <Users2 className="w-3.5 h-3.5 text-indigo-500" />
                    Assigned To
                  </label>
                  <select
                    value={editingTask.assigned_to}
                    onChange={(e) => setEditingTask({ ...editingTask, assigned_to: e.target.value })}
                    className="select h-11"
                    required
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                {/* Company Selection */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    <Building className="w-3.5 h-3.5 text-indigo-500" />
                    Target Company
                  </label>
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
              </div>

              {/* Task Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Work Priority</label>
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
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Dead-line</label>
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
                <MultiSelectDropdown
                  label=""
                  icon={() => null}
                  options={categories.filter(c => c.is_active).map(c => ({ id: c.id, name: c.name }))}
                  selectedIds={editingTask.category_ids || []}
                  onChange={(ids) => setEditingTask({ ...editingTask, category_ids: ids })}
                  placeholder="Select categories..."
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-secondary flex-1 h-12 rounded-xl border-slate-200">
                  Cancel
                </button>
                <button type="submit" disabled={updating} className="btn btn-primary flex-1 h-12 rounded-xl shadow-xl shadow-blue-100 !bg-blue-600 hover:!bg-blue-700 border-none">
                  {updating ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><Pencil className="w-4 h-4 mr-2" /> Update Task</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* View Task Details Modal */}
      {showViewModal && viewingTask && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                  <ClipboardList className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Work Details</h2>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-0.5">Reference: {viewingTask.id.slice(-6).toUpperCase()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${getStatusColor(viewingTask.status)}`}>
                  {getStatusLabel(viewingTask.status)}
                </span>
                <button onClick={() => setShowViewModal(false)} className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="space-y-8">
              {/* Description */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Work Description</label>
                <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100">
                  <p className="text-base text-slate-700 leading-relaxed whitespace-pre-wrap">{viewingTask.work_description}</p>
                </div>
              </div>

              {/* Grid info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <Users2 className="w-3 h-3" /> Assigned To
                  </label>
                  <p className="text-sm font-bold text-slate-800">{viewingTask.assigned_to_name}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <Building className="w-3 h-3" /> Company
                  </label>
                  <p className="text-sm font-bold text-slate-800">{viewingTask.company_name}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" /> Priority
                  </label>
                  <span className={`text-sm font-bold uppercase tracking-wide ${getPriorityColor(viewingTask.priority)}`}>
                    {viewingTask.priority}
                  </span>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <CalendarDays className="w-3 h-3" /> Deadline
                  </label>
                  <p className="text-sm font-bold text-slate-800">{formatDateTime(viewingTask.deadline)}</p>
                </div>
              </div>

              {/* Categories */}
              {viewingTask.category_names && viewingTask.category_names.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Tag className="w-3 h-3" /> Categories
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {viewingTask.category_names.map((cat, i) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold border border-indigo-100">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats/Dates */}
              <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                  Created: {formatDateTime(viewingTask.created_at)}
                </div>
                {viewingTask.completed_at && (
                  <div className="flex items-center gap-2 text-xs text-green-500 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Completed: {formatDateTime(viewingTask.completed_at)}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-10 flex gap-3">
              <button
                onClick={() => {
                  setShowViewModal(false);
                  handleEdit(viewingTask);
                }}
                className="btn btn-secondary flex-1 h-12 rounded-xl"
              >
                <Pencil className="w-4 h-4 mr-2" /> Edit Task
              </button>
              <button onClick={() => setShowViewModal(false)} className="btn btn-primary flex-1 h-12 rounded-xl">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Complete Confirmation Modal */}
      {showCompleteModal && confirmingTask && (
        <div className="modal-overlay" onClick={() => setShowCompleteModal(false)}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Complete Task</h2>
              </div>
              <button onClick={() => setShowCompleteModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Task Description</p>
                <p className="text-slate-700 font-medium leading-relaxed">{confirmingTask.work_description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Assigned To</p>
                  <span className="text-sm font-bold text-slate-700">{confirmingTask.assigned_to_name}</span>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Deadline</p>
                  <span className="text-sm font-bold text-slate-700">{formatDateTime(confirmingTask.deadline)}</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={(e) => setIsConfirmed(e.target.checked)}
                    className="w-5 h-5 mt-0.5 rounded-lg border-2 border-indigo-200 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="select-none">
                    <p className="text-sm font-bold text-indigo-900 group-hover:text-indigo-700 transition-colors">Are you sure?</p>
                    <p className="text-xs text-indigo-500/80 font-medium mt-0.5">Confirming that this task is fully completed as per requirements.</p>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">QA Quality Rating / Multiplier</label>
                <select
                  value={qualityMultiplier}
                  onChange={(e) => setQualityMultiplier(parseFloat(e.target.value) || 1.0)}
                  className="w-full text-sm border border-slate-200 rounded-xl p-2.5 bg-slate-50 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="1.0">Standard Performance (1.0x)</option>
                  <option value="1.2">Exemplary Performance (1.2x)</option>
                  <option value="0.8">Rework Required (0.8x)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Closing Remark (Optional)</label>
                <textarea
                  value={completionRemark}
                  onChange={(e) => setCompletionRemark(e.target.value)}
                  className="input min-h-20 resize-none p-3 text-sm"
                  placeholder="Any final notes about the completion..."
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCompleteModal(false)}
                  className="btn btn-secondary flex-1 h-12 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCompletion}
                  disabled={!isConfirmed}
                  className="btn btn-primary flex-1 h-12 rounded-xl shadow-xl shadow-emerald-100/50 disabled:opacity-50 disabled:grayscale"
                >
                  Complete Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


