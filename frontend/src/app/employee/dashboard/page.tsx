'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { timeAgo, formatPreciseDateTime, cn } from '@/lib/utils';
import {
  ClipboardList, CheckCircle2, Clock, AlertTriangle, Play,
  Trophy, Star, Activity, Filter, Calendar, TrendingUp
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import EmptyState from '@/components/EmptyState';
import AIInsightPanel from '@/components/AIInsightPanel';
import { DashboardSkeleton } from '@/components/SkeletonLoaders';

interface PerfMetrics {
  assigned_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  overdue_tasks: number;
  productivity_pct: number;
  performance_score: number;
}

export default function EmployeeDashboardPage() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

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
      const res = await api.get('/dashboard/employee', { params });
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (filterType !== 'custom') {
      fetchDashboard();
    }
  }, [filterType]);

  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDashboard();
  };

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  if (!data) {
    return <div className="text-center text-muted-foreground py-20">Failed to load dashboard.</div>;
  }

  const taskData = [
    { name: 'Completed', value: data.tasks.completed, color: '#10b981' },
    { name: 'Completed Late', value: data.tasks.completed_late, color: '#818cf8' },
    { name: 'Pending', value: data.tasks.pending, color: '#f59e0b' },
    { name: 'In Progress', value: data.tasks.in_progress, color: '#3b82f6' },
    { name: 'Overdue', value: data.tasks.overdue, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const completionRate = data.tasks.total > 0
    ? Math.round((data.tasks.completed / data.tasks.total) * 100)
    : 0;

  const perf: PerfMetrics = data.performance_tracking || {
    assigned_tasks: 0,
    completed_tasks: 0,
    pending_tasks: 0,
    overdue_tasks: 0,
    productivity_pct: 0.0,
    performance_score: 0.0
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-800">Welcome back, {data.user.name}! 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">Here&apos;s your current performance and compensation snapshot.</p>
      </div>

      {/* AI Intelligence Insights Section */}
      <AIInsightPanel />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Reward Points Card */}
        <div className="glass rounded-xl p-6 bg-gradient-to-r from-yellow-50/60 to-amber-50/60 border border-yellow-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 mb-1 font-bold uppercase tracking-wider">Your Reward Points</p>
              <p className="text-4xl font-extrabold text-yellow-600">{data.user.reward_points}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-yellow-100 flex items-center justify-center border border-yellow-250">
              <Trophy className="w-7 h-7 text-yellow-600" />
            </div>
          </div>
          <p className="text-xs text-slate-400 font-bold mt-4">
            Earn rewards by completing tasks on time!
          </p>
        </div>

        {/* Monthly Task Efficiency Card */}
        <div className="glass rounded-xl p-6 bg-gradient-to-r from-indigo-50/60 to-blue-50/60 border border-indigo-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 mb-1 font-bold uppercase tracking-wider">Monthly Task Efficiency</p>
              <p className="text-4xl font-extrabold text-indigo-600">{data.efficiency_rate ?? 0}%</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center border border-indigo-250">
              <Activity className="w-7 h-7 text-indigo-600" />
            </div>
          </div>
          <div className="mt-4 space-y-1">
            <div className="w-full bg-indigo-100 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${data.efficiency_rate ?? 0}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 font-bold flex justify-between pt-1">
              <span>{data.completed_this_month ?? 0} of {data.due_this_month ?? 0} tasks completed this month</span>
              <span className="text-indigo-600 font-black">
                {data.efficiency_rate >= 80 ? '⭐ Elite Performer' :
                 data.efficiency_rate >= 65 ? '📈 Strong Pace' :
                 data.due_this_month === 0 ? 'Idle' : '⚠️ Action Required'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Date Filter & Task Performance Tracking Panel */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-850">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-indigo-800">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-base font-extrabold">My Task Performance Tracking</h2>
              <p className="text-[10px] text-indigo-300">Detailed stats on your completed tasks, productivity rates, and timeliness.</p>
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Tasks', value: data.tasks.total, icon: ClipboardList, color: 'from-purple-600 to-violet-500' },
          { label: 'Completed', value: data.tasks.completed, icon: CheckCircle2, color: 'from-emerald-600 to-green-500' },
          { label: 'Completed Late', value: data.tasks.completed_late, icon: Clock, color: 'from-indigo-600 to-blue-500' },
          { label: 'Overdue', value: data.tasks.overdue, icon: AlertTriangle, color: 'from-red-600 to-rose-500' },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="stat-card glass rounded-xl p-4 border border-slate-100 shadow-sm bg-white hover:scale-[1.02] transition-transform">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-slate-800">{card.value}</p>
              <p className="text-xs text-slate-500 mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task Progress / Status Distribution */}
        <div className="glass rounded-2xl p-8 border border-slate-200/60 shadow-xl shadow-slate-200/20 bg-white">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Star className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Task Performance</h2>
                <p className="text-[10px] text-slate-450 font-bold uppercase tracking-widest">Status Distribution</p>
              </div>
            </div>
          </div>

          {taskData.length > 0 ? (
            <div className="space-y-10">
              <div className="relative flex justify-center py-6">
                <div className="w-80 h-80">
                  {mounted && (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                      <PieChart>
                        <Pie
                          data={taskData}
                          cx="50%"
                          cy="50%"
                          innerRadius={110}
                          outerRadius={145}
                          paddingAngle={10}
                          dataKey="value"
                          stroke="none"
                          cornerRadius={15}
                        >
                          {taskData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-6xl font-black text-slate-800 tracking-tighter">{completionRate}%</p>
                    <p className="text-[12px] font-black text-slate-455 uppercase tracking-widest mt-2">Success Rate</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { name: 'Completed', value: data.tasks.completed, color: '#10b981', bg: 'bg-emerald-50/50' },
                  { name: 'Pending', value: data.tasks.pending, color: '#f59e0b', bg: 'bg-amber-50/50' },
                  { name: 'In Progress', value: data.tasks.in_progress, color: '#3b82f6', bg: 'bg-blue-50/50' },
                  { name: 'Overdue', value: data.tasks.overdue, color: '#ef4444', bg: 'bg-rose-50/50' },
                  { name: 'Late', value: data.tasks.completed_late, color: '#818cf8', bg: 'bg-indigo-50/50' },
                ].map((item) => (
                  <div key={item.name} className={cn("p-3 rounded-xl border border-slate-100 transition-all hover:shadow-md hover:shadow-slate-100", item.bg)}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full shadow-sm" style={{ background: item.color }} />
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{item.name}</span>
                    </div>
                    <p className="text-lg font-black text-slate-800">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title="No tasks recorded" description="Assigned work will appear here once you start." icon={ClipboardList} />
          )}
        </div>

        {/* Recent Activity */}
        <div className="glass rounded-xl p-6 bg-white border border-slate-200/60 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-indigo-500" />
            <h2 className="font-semibold text-slate-800">Recent Activity</h2>
          </div>
          {data.recent_activity.length > 0 ? (
            <div className="space-y-3">
              {data.recent_activity.map((activity: any) => (
                <div key={activity.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-600">{activity.details || activity.action}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-slate-400">{formatPreciseDateTime(activity.timestamp)}</p>
                      <span className="text-[10px] text-indigo-500 font-bold">•</span>
                      <p className="text-[10px] text-indigo-500/80 font-bold uppercase tracking-tighter">{timeAgo(activity.timestamp)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No activity" description="Recent actions will show up here." variant="small" />
          )}
        </div>
      </div>
    </div>
  );
}
