'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { timeAgo } from '@/lib/utils';
import UserLink from '@/components/UserLink';
import {
  Users, ClipboardList, CheckCircle2, Clock, AlertTriangle,
  Trophy, Activity, Award, Star, Play, UserCheck, Edit2, 
  Calendar, BarChart2, TrendingUp, Filter, Sparkles
} from 'lucide-react';
import Link from 'next/link';
import AIInsightPanel from '@/components/AIInsightPanel';
import { DashboardSkeleton, CardSkeleton } from '@/components/SkeletonLoaders';
import { Skeleton } from '@/components/Skeleton';

const DashboardCharts = dynamic(() => import('@/components/DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[400px]" />
      ))}
    </div>
  )
});

interface PerfMetrics {
  assigned_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  overdue_tasks: number;
  productivity_pct: number;
  performance_score: number;
}

export default function AdminDashboard() {
  const { user, isManager, isAssistantManager, isHRTeam, isAdmin } = useAuth();
  const isManagementOnly = (isManager || isAssistantManager || isHRTeam) && !isAdmin;

  const [stats, setStats] = useState<any | null>(null);
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Performance Filter States
  const [filterType, setFilterType] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const params: any = { filter_type: filterType };
      if (filterType === 'custom' && customStart && customEnd) {
        params.start_date = customStart;
        params.end_date = customEnd;
      }
      const res = await api.get('/dashboard/admin', { params });
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (filterType !== 'custom') {
      fetchDashboard();
    }
  }, [filterType]);

  useEffect(() => {
    // For managers: also fetch their team members
    if (isManagementOnly) {
      api.get('/admin/employees').then(res => {
        setTeamMembers(res.data);
        setTeamCount(res.data.length);
      }).catch(() => {});
    }
  }, [isManagementOnly]);

  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDashboard();
  };

  if (loading && !stats) {
    return <DashboardSkeleton />;
  }

  if (!stats) {
    return <div className="text-center text-muted-foreground py-20">Failed to load dashboard data.</div>;
  }

  const roleLabel = isAdmin ? 'Admin' : isHRTeam ? 'HR' : isManager ? 'Manager' : 'Assistant Manager';

  const baseCards = [
    { label: 'Total Tasks', value: stats.tasks.total, icon: ClipboardList, color: 'from-blue-600 to-cyan-500' },
    { label: 'Completed on Time', value: stats.tasks.completed, icon: CheckCircle2, color: 'from-emerald-600 to-green-500' },
    { label: 'Completed Late', value: stats.tasks.completed_late, icon: Clock, color: 'from-indigo-600 to-blue-500' },
    { label: 'Pending', value: stats.tasks.pending, icon: Clock, color: 'from-amber-600 to-yellow-500' },
    { label: 'In Progress', value: stats.tasks.in_progress, icon: Play, color: 'from-blue-500 to-indigo-500' },
    { label: 'Overdue', value: stats.tasks.overdue, icon: AlertTriangle, color: 'from-red-600 to-rose-500' },
    { label: 'Points Achieved', value: stats.total_rewards_given, icon: Trophy, color: 'from-pink-600 to-rose-400' },
  ];

  const employeeCards = isManagementOnly
    ? [{ label: 'My Team', value: teamCount ?? '...', icon: UserCheck, color: 'from-teal-600 to-emerald-500', link: '/admin/employees' }]
    : [];

  const statCards = [...employeeCards, ...baseCards];

  const getStats = (roleKey: string) => {
    const defaultStats = { total: 0, present: 0, absent: 0 };
    if (!stats.employees.role_counts) {
      if (roleKey === 'total_all_inclusive') {
        return {
          total: stats.employees.total,
          present: stats.attendance_today?.present || 0,
          absent: stats.attendance_today?.absent || 0
        };
      }
      return defaultStats;
    }
    const val = stats.employees.role_counts[roleKey as keyof typeof stats.employees.role_counts];
    if (typeof val === 'number') {
      return { total: val, present: 0, absent: 0 };
    }
    return val || defaultStats;
  };

  const perf: PerfMetrics = stats.performance_tracking || {
    assigned_tasks: 0,
    completed_tasks: 0,
    pending_tasks: 0,
    overdue_tasks: 0,
    productivity_pct: 0.0,
    performance_score: 0.0
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-800">{roleLabel} Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isManagementOnly
              ? `Welcome back, ${user?.name}. Here's your team's metrics and operations summary.`
              : "Comprehensive overview of your organization's tasks, performance, and headcounts."}
          </p>
        </div>
      </div>

      {/* AI Intelligence Insights Section */}
      <AIInsightPanel />

      {/* Date Filter & Task Performance Tracking Panel */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-850">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-indigo-800">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-base font-extrabold">Task Performance & Productivity Tracking</h2>
              <p className="text-[10px] text-indigo-300">Target metrics derived from task completion timelines and deadlines.</p>
            </div>
          </div>
          
          <form onSubmit={handleApplyCustomDates} className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-indigo-900/60 p-1 rounded-xl border border-indigo-750">
              <span className="text-[10px] font-bold px-2 text-indigo-300 uppercase flex items-center gap-1">
                <Filter className="w-3 h-3" />
                Filter Cycle
              </span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs font-bold bg-slate-900 border-none text-white rounded-lg px-3 py-1.5 focus:outline-none cursor-pointer"
              >
                <option value="month">Current Month</option>
                <option value="quarter">Current Quarter</option>
                <option value="year">Current Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {filterType === 'custom' && (
              <div className="flex items-center gap-2 bg-indigo-900/60 p-1 rounded-xl border border-indigo-750">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="text-xs bg-slate-900 border-none text-white rounded-lg px-2 py-1.5 focus:outline-none"
                  required
                />
                <span className="text-[10px] font-bold text-indigo-300">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="text-xs bg-slate-900 border-none text-white rounded-lg px-2 py-1.5 focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors"
                >
                  Apply
                </button>
              </div>
            )}
          </form>
        </div>

        {/* 6 Core Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 pt-6">
          <div className="bg-slate-850/50 p-4 rounded-xl border border-slate-800">
            <span className="block text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Assigned Tasks</span>
            <span className="text-2xl font-black mt-1 block">{perf.assigned_tasks}</span>
          </div>
          <div className="bg-slate-850/50 p-4 rounded-xl border border-slate-800">
            <span className="block text-[9px] text-emerald-400 font-extrabold uppercase tracking-wider">Completed Tasks</span>
            <span className="text-2xl font-black mt-1 block text-emerald-350">{perf.completed_tasks}</span>
          </div>
          <div className="bg-slate-850/50 p-4 rounded-xl border border-slate-800">
            <span className="block text-[9px] text-amber-400 font-extrabold uppercase tracking-wider">Pending Tasks</span>
            <span className="text-2xl font-black mt-1 block text-amber-350">{perf.pending_tasks}</span>
          </div>
          <div className="bg-slate-850/50 p-4 rounded-xl border border-slate-800">
            <span className="block text-[9px] text-rose-400 font-extrabold uppercase tracking-wider">Overdue Tasks</span>
            <span className="text-2xl font-black mt-1 block text-rose-350">{perf.overdue_tasks}</span>
          </div>
          <div className="bg-slate-850/50 p-4 rounded-xl border border-slate-800 relative overflow-hidden group">
            <span className="block text-[9px] text-indigo-400 font-extrabold uppercase tracking-wider">Productivity Rate</span>
            <span className="text-2xl font-black mt-1 block text-indigo-300">{perf.productivity_pct}%</span>
            {/* Visual Indicator Progress Bar */}
            <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
              <div className="bg-indigo-450 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, perf.productivity_pct)}%` }} />
            </div>
          </div>
          <div className="bg-slate-850/50 p-4 rounded-xl border border-slate-800 relative overflow-hidden group">
            <span className="block text-[9px] text-teal-400 font-extrabold uppercase tracking-wider">Performance Score</span>
            <span className="text-2xl font-black mt-1 block text-teal-350">{perf.performance_score}%</span>
            {/* Visual Indicator Progress Bar */}
            <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
              <div className="bg-teal-400 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, perf.performance_score)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Headcount & Organizational Roles Section */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-500" />
          Headcount & Organizational Roles
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Employees', stats: getStats('employee'), color: 'from-purple-600 to-violet-500', role: 'employee' },
            { label: 'Total Managers', stats: getStats('manager'), color: 'from-blue-600 to-indigo-500', role: 'manager' },
            { label: 'Total Asst Managers', stats: getStats('assistant_manager'), color: 'from-cyan-600 to-blue-500', role: 'assistant_manager' },
            { label: 'Total HR Managers', stats: getStats('hr_manager'), color: 'from-pink-600 to-rose-500', role: 'hr_manager' },
            { label: 'Total Asst HR Managers', stats: getStats('assistant_hr_manager'), color: 'from-emerald-600 to-teal-500', role: 'assistant_hr_manager' },
            { label: 'Grand Total Headcount', stats: getStats('total_all_inclusive'), color: 'from-orange-600 to-amber-500', role: 'all', isHighlight: true },
          ].map((card) => {
            return (
              <Link 
                href={`/admin/employees?role=${card.role}`} 
                key={card.label}
                className="block hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
              >
                <div className={`glass rounded-xl p-5 border border-slate-100/50 shadow-sm relative overflow-hidden h-full flex flex-col justify-between ${
                  card.isHighlight ? 'bg-gradient-to-br from-indigo-500/5 to-teal-500/5 ring-1 ring-indigo-500/20' : 'bg-white/40'
                }`}>
                  {card.isHighlight && (
                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-gradient-to-br from-indigo-500/10 to-teal-500/10 rounded-full blur-xl pointer-events-none" />
                  )}
                  <div>
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center mb-3 shadow-md`}>
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <p className="text-3xl font-extrabold text-slate-800 tracking-tight">{card.stats.total ?? <Skeleton className="h-8 w-12 inline-block" />}</p>
                  </div>

                  <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100/50 text-[10px] font-bold">
                    <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50/60 px-1.5 py-0.5 rounded-full border border-emerald-100/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Pres: {card.stats.present}</span>
                    </div>
                    <div className="flex items-center gap-1 text-rose-600 bg-rose-50/60 px-1.5 py-0.5 rounded-full border border-rose-100/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                      <span>Abs: {card.stats.absent}</span>
                    </div>
                  </div>

                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-2.5">{card.label}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Operational & Performance Metrics Section */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-indigo-500" />
          {isManagementOnly ? 'My Team & Task Metrics' : 'Operational & Performance Metrics'}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            const content = (
              <div className="stat-card glass rounded-xl p-4 hover:shadow-md transition-all h-full flex flex-col justify-between hover:scale-[1.02]">
                <div>
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center mb-3`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{card.value}</p>
                </div>
                <p className="text-xs text-slate-500 mt-1">{card.label}</p>
              </div>
            );
            return (
              <div key={card.label}>
                {'link' in card && card.link ? (
                  <Link href={card.link} className="block h-full">{content}</Link>
                ) : content}
              </div>
            );
          })}
        </div>
      </div>

      {/* Charts Row - Dynamically Loaded */}
      <DashboardCharts stats={stats} />

      {/* My Team Members Section (For Managers/Assistant Managers) */}
      {isManagementOnly && teamMembers.length > 0 && (
        <div className="glass rounded-xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br from-indigo-500/10 to-teal-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              <div>
                <h2 className="font-semibold text-slate-800 text-lg">My Team Members</h2>
                <p className="text-xs text-slate-500">Quick management access for your direct reports</p>
              </div>
            </div>
            <Link 
              href="/admin/employees" 
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 px-3 py-1.5 rounded-lg transition-all"
            >
              Manage All
            </Link>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {teamMembers.map((member) => (
              <div 
                key={member.id} 
                className="relative flex flex-col p-4 rounded-xl border border-slate-100 bg-white/40 backdrop-blur-sm hover:bg-white/80 hover:shadow-md hover:scale-[1.02] transition-all duration-300 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-teal-400 flex items-center justify-center text-white font-bold text-sm shadow-sm select-none">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                      {member.name}
                    </h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                      {member.role.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-50/50">
                  <div className="flex items-center gap-1 text-yellow-600 text-xs font-semibold">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>{member.reward_points ?? 0} pts</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                    member.is_active 
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                      : 'bg-red-50 text-red-600 border-red-100'
                  }`}>
                    {member.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <Link
                  href={`/admin/employees?edit=${member.id}`}
                  className="mt-3 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-200 bg-slate-50/50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 text-xs font-semibold transition-all"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Quick Edit
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leaderboard */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-yellow-400" />
            <h2 className="font-semibold text-slate-800">Top Performers</h2>
          </div>
          {stats.leaderboard.length > 0 ? (
            <div className="space-y-3">
              {stats.leaderboard.map((emp: any, i: number) => (
                <div key={emp.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i === 0 ? 'bg-yellow-50 text-yellow-600 border border-yellow-200' :
                    i === 1 ? 'bg-slate-50 text-slate-600 border border-slate-200' :
                    i === 2 ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                    'bg-slate-50 text-slate-500 border border-slate-100'
                  }`}>
                    {i < 3 ? <Star className="w-4 h-4" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <UserLink
                      id={emp.id}
                      name={emp.name}
                      email={emp.email}
                      reward_points={emp.reward_points}
                      role="employee"
                      showAvatar={false}
                    />
                    <p className="text-xs text-slate-500 truncate">{emp.email}</p>
                  </div>
                  <div className="flex items-center gap-1 text-sm font-semibold text-yellow-400">
                    <Trophy className="w-3.5 h-3.5" />
                    {emp.reward_points}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm text-center py-10">No data yet</p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-indigo-500" />
            <h2 className="font-semibold text-slate-800">Recent Activity</h2>
          </div>
          {stats.recent_activity.length > 0 ? (
            <div className="space-y-3">
              {stats.recent_activity.map((activity: any) => (
                <div key={activity.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <UserLink
                        id={activity.user_id}
                        name={activity.user_name}
                        showAvatar={false}
                        textClassName="text-sm font-bold text-slate-900"
                      />
                      {' '}
                      <span className="text-slate-500">{activity.details || activity.action}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{timeAgo(activity.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm text-center py-10">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}
