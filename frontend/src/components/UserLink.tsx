import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Mail, Trophy, ClipboardList, CheckCircle2, Clock, Play, AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Skeleton } from './Skeleton';

interface EmployeeStats {
  user: {
    name: string;
    email: string;
    reward_points: number;
    role: string;
  };
  tasks: {
    total: number;
    completed: number;
    completed_late: number;
    pending: number;
    in_progress: number;
    overdue: number;
  };
  attendance_status: 'present' | 'absent';
}

interface UserLinkProps {
  id: string;
  name: string;
  email?: string;
  reward_points?: number;
  role?: string;
  avatarClassName?: string;
  textClassName?: string;
  showAvatar?: boolean;
}

export default function UserLink({
  id, name, email, reward_points, role,
  avatarClassName = "w-7 h-7",
  textClassName = "text-sm font-medium",
  showAvatar = true
}: UserLinkProps) {
  const [isAbove, setIsAbove] = useState(false);
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchStats = async () => {
    if (stats || loading) return;
    setLoading(true);
    try {
      const res = await api.get(`/admin/employees/${id}/stats`);
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch hover stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMouseEnter = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setIsAbove(spaceBelow < 400);
    }
    fetchStats();
  };

  return (
    <div 
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      className="group relative inline-flex items-center gap-2"
    >
      <Link
        href={`/admin/employees/detail?id=${id}`}
        className="flex items-center gap-2 hover:text-indigo-600 transition-colors"
      >
        {showAvatar && (
          <div className={`${avatarClassName} rounded-full bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold shadow-sm group-hover:shadow-md transition-all`}>
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className={textClassName}>{name}</span>
      </Link>

      {/* Popover */}
      <div className={`
        absolute left-0 w-[380px] p-0 bg-white border border-slate-200 shadow-[0_30px_90px_-15px_rgba(0,0,0,0.3)] rounded-[2rem] 
        opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[100] pointer-events-none 
        scale-95 group-hover:scale-100 overflow-hidden
        ${isAbove ? 'bottom-full mb-4 origin-bottom-left' : 'top-full mt-3 origin-top-left'}
      `}>
        {loading && !stats ? (
          <div className="p-8 space-y-6">
            <div className="flex items-center gap-4">
              <Skeleton className="w-14 h-14 rounded-2xl" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
              <Skeleton className="h-32 rounded-3xl" />
            </div>
          </div>
        ) : stats ? (
          <div className="flex flex-col">
            {/* Header */}
            <div className="p-6 pb-0 flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-indigo-100">
                  {stats.user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-lg leading-tight">{stats.user.name}</h4>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-500 font-black mt-1">
                    {stats.user.role.replace('_', ' ')}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                  stats.attendance_status === 'present' 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                    : 'bg-rose-50 text-rose-600 border-rose-100'
                }`}>
                  {stats.attendance_status}
                </span>
                <span className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">Today</span>
              </div>
            </div>

            <div className="p-6 grid grid-cols-2 gap-6">
              {/* Task List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  <span>Task Overview</span>
                  <span className="text-slate-900">{stats.tasks.total} Total</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between group/item">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-emerald-50 flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      </div>
                      <span className="text-xs font-bold text-slate-600">On Time</span>
                    </div>
                    <span className="text-xs font-black text-emerald-600">{stats.tasks.completed}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-amber-50 flex items-center justify-center">
                        <Clock className="w-3 h-3 text-amber-500" />
                      </div>
                      <span className="text-xs font-bold text-slate-600">Late</span>
                    </div>
                    <span className="text-xs font-black text-amber-600">{stats.tasks.completed_late}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center">
                        <Play className="w-3 h-3 text-blue-500" />
                      </div>
                      <span className="text-xs font-bold text-slate-600">In Progress</span>
                    </div>
                    <span className="text-xs font-black text-blue-600">{stats.tasks.in_progress}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-slate-50 flex items-center justify-center">
                        <ClipboardList className="w-3 h-3 text-slate-400" />
                      </div>
                      <span className="text-xs font-bold text-slate-600">Pending</span>
                    </div>
                    <span className="text-xs font-black text-slate-400">{stats.tasks.pending}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-rose-50 flex items-center justify-center">
                        <AlertCircle className="w-3 h-3 text-rose-500" />
                      </div>
                      <span className="text-xs font-bold text-slate-600">Overdue</span>
                    </div>
                    <span className="text-xs font-black text-rose-600">{stats.tasks.overdue}</span>
                  </div>
                </div>
              </div>

              {/* Points Box */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-3xl p-5 border border-slate-200/50 flex flex-col items-center justify-center text-center relative overflow-hidden group/points">
                <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full -mr-10 -mt-10 blur-2xl" />
                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Points Achieved</h5>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-4xl font-black text-slate-900 leading-none">{stats.user.reward_points}</span>
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shadow-lg shadow-amber-200/50 mt-2">
                    <Trophy className="w-5 h-5 text-amber-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50/80 p-4 flex justify-center border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em]">View Full Profile</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs font-bold italic">
            Unable to load employee details.
          </div>
        )}
      </div>
    </div>
  );
}
