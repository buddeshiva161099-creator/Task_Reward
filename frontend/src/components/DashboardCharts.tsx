'use client';

import { 
  TrendingUp, Activity, Users, ClipboardList 
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { useState, useEffect } from 'react';
import StatusChart from './StatusChart';
import EmptyState from './EmptyState';

const COLORS = ['#8b5cf6', '#f59e0b', '#3b82f6', '#ef4444'];

interface DashboardChartsProps {
  stats: any;
}

export default function DashboardCharts({ stats }: DashboardChartsProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const taskStatusData = [
    { name: 'Completed', value: stats.tasks.completed - stats.tasks.completed_late, color: '#10b981' },
    { name: 'Late', value: stats.tasks.completed_late, color: '#818cf8' },
    { name: 'In Progress', value: stats.tasks.in_progress, color: '#3b82f6' },
    { name: 'Pending', value: stats.tasks.pending, color: '#f59e0b' },
    { name: 'Overdue', value: stats.tasks.overdue, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const priorityData = [
    { name: 'Critical', count: stats.priority_distribution.critical },
    { name: 'High', count: stats.priority_distribution.high },
    { name: 'Medium', count: stats.priority_distribution.medium },
    { name: 'Regular', count: stats.priority_distribution.regular },
  ];

  const attendanceData = [
    { name: 'Present', value: stats.attendance_today.present ?? 0, color: '#10b981' },
    { name: 'On Leave', value: stats.attendance_today.on_leave ?? 0, color: '#3b82f6' },
    { name: 'Absent', value: stats.attendance_today.absent ?? 0, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const attendanceBreakdown = [
    { name: 'Present', value: stats.attendance_today.present ?? 0, color: '#10b981' },
    { name: 'On Leave', value: stats.attendance_today.on_leave ?? 0, color: '#3b82f6' },
    { name: 'Absent', value: stats.attendance_today.absent ?? 0, color: '#ef4444' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      {/* Task Status Distribution */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
            <h2 className="font-semibold text-slate-800">Task Status Distribution</h2>
          </div>
        </div>
        {taskStatusData.length > 0 ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-full">
              {mounted && (
                <StatusChart 
                  data={taskStatusData} 
                  total={stats.tasks.total} 
                  completed={stats.tasks.completed}
                  size={180}
                />
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2 w-full">
              {taskStatusData.map((item) => (
                <div key={item.name} className="flex flex-col items-center p-2 min-w-[70px] rounded-xl bg-slate-50/50 border border-slate-100/50">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: item.color }} />
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider truncate">{item.name}</span>
                  </div>
                  <span className="text-sm font-black text-slate-800">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState title="No tasks recorded" description="Start assigning work to see metrics" variant="small" icon={ClipboardList} />
        )}
      </div>

      {/* Priority Distribution */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-indigo-500" />
          <h2 className="font-semibold text-slate-800">Priority Distribution</h2>
        </div>
        {mounted && (
          <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
            <BarChart data={priorityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  color: '#0f172a',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {priorityData.map((_, index) => (
                  <Cell key={`bar-${index}`} fill={COLORS[index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Attendance Today */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <Users className="w-5 h-5 text-indigo-500" />
          <h2 className="font-semibold text-slate-800">Attendance Today</h2>
        </div>
        
        <div className="flex flex-col items-center justify-center">
          <div className="h-[180px] w-full relative mb-4">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={attendanceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {attendanceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-900">
                {stats.attendance_today.total > 0 
                  ? Math.round((stats.attendance_today.present / stats.attendance_today.total) * 100) 
                  : 0}%
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Present</span>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2 w-full">
            {attendanceBreakdown.map((item) => (
              <div key={item.name} className="flex flex-col p-2.5 rounded-2xl bg-slate-50/50 border border-slate-100/50 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: item.color }} />
                  <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">{item.name}</span>
                </div>
                <span className="text-base font-black text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
