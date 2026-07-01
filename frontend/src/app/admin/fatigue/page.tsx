'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Flame, ShieldAlert, RefreshCw, 
  Users, AlertTriangle, AlertCircle, Heart, 
  TrendingUp, ChevronDown, ChevronUp
} from 'lucide-react';
import { TableSkeleton } from '@/components/SkeletonLoaders';

interface Incident {
  type: string;
  text: string;
  severity: string;
}

interface FatigueEmployee {
  id: string;
  name: string;
  email: string;
  role: string;
  fatigue_score: number;
  risk_category: string;
  metrics: {
    total_overtime_hours: number;
    overtime_days: number;
    overtime_streak_days: number;
    late_arrivals: number;
    late_overdue_tasks: number;
    short_notice_leaves: number;
  };
  incidents: Incident[];
}

export default function FatigueDashboard() {
  const { user, isAdmin, isHR, isManager, isAssistantManager } = useAuth();
  const isManagementRole = isAdmin || isHR || isManager || isAssistantManager;

  const [data, setData] = useState<FatigueEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  const fetchFatigueData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/dashboard/fatigue');
      setData(res.data);
    } catch (err) {
      console.error('Failed to load fatigue prediction analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isManagementRole) {
      fetchFatigueData();
    }
  }, [isManagementRole]);

  if (!isManagementRole) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-white/40 backdrop-blur-md rounded-2xl border border-slate-200">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4 animate-bounce" />
        <h2 className="text-2xl font-black text-slate-800">Access Denied</h2>
        <p className="text-slate-500 mt-2">Only authorized administrators and managers can view attrition forecasting models.</p>
      </div>
    );
  }

  // Summary Metrics calculations
  const totalEmployees = data.length;
  const criticalCount = data.filter(e => e.risk_category === 'critical').length;
  const highCount = data.filter(e => e.risk_category === 'high').length;
  const averageFatigue = totalEmployees > 0 
    ? Math.round(data.reduce((sum, e) => sum + e.fatigue_score, 0) / totalEmployees) 
    : 0;

  const toggleExpand = (id: string) => {
    setExpandedEmployeeId(expandedEmployeeId === id ? null : id);
  };

  const getRiskCategoryClass = (category: string) => {
    switch (category) {
      case 'critical':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'high':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'medium':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  };

  const getProgressBarClass = (score: number) => {
    if (score >= 86) return 'bg-red-500';
    if (score >= 61) return 'bg-orange-500';
    if (score >= 31) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-800 flex items-center gap-3">
            <Flame className="w-8 h-8 text-rose-500 animate-pulse" />
            Burnout & Attrition Predictor
          </h1>
          <p className="text-slate-500 mt-1">
            Forecasting workforce turnover and exhaustion risks in real-time by correlating consecutive overtime hours, tasks delays, and late arrivals.
          </p>
        </div>
        <button 
          onClick={fetchFatigueData}
          disabled={loading}
          className="btn btn-secondary text-xs flex items-center gap-1.5 font-bold shadow-xs py-2 px-4 rounded-xl hover:bg-slate-100 bg-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Forecasting Models
        </button>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <>
          {/* Key Metrics cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1: Monitored */}
            <div className="glass rounded-3xl p-6 border border-slate-150/40 shadow-sm flex items-center gap-4 bg-white/40">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-650 flex items-center justify-center font-bold">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Monitored Headcount</span>
                <span className="text-2xl font-black text-slate-800">{totalEmployees}</span>
              </div>
            </div>

            {/* Card 2: Critical alerts */}
            <div className="glass rounded-3xl p-6 border border-slate-150/40 shadow-sm flex items-center gap-4 bg-white/40">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-650 flex items-center justify-center font-bold">
                <AlertTriangle className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Critical Risk Alerts</span>
                <span className="text-2xl font-black text-slate-800">{criticalCount}</span>
              </div>
            </div>

            {/* Card 3: High Risk */}
            <div className="glass rounded-3xl p-6 border border-slate-150/40 shadow-sm flex items-center gap-4 bg-white/40">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">High Burnout Risk</span>
                <span className="text-2xl font-black text-slate-800">{highCount}</span>
              </div>
            </div>

            {/* Card 4: Average index */}
            <div className="glass rounded-3xl p-6 border border-slate-150/40 shadow-sm flex items-center gap-4 bg-white/40">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-650 flex items-center justify-center font-bold">
                <Heart className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Average Fatigue Index</span>
                <span className="text-2xl font-black text-slate-800">{averageFatigue}%</span>
              </div>
            </div>
          </div>

          {/* List panel */}
          <div className="glass rounded-3xl border border-slate-150/40 shadow-sm overflow-hidden bg-white/40 p-6">
            <h3 className="font-extrabold text-slate-850 text-base mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Employee Fatigue Analysis Logs
            </h3>

            {totalEmployees === 0 ? (
              <div className="text-center text-slate-450 py-16">
                No active employee records found to forecast attrition trends.
              </div>
            ) : (
              <div className="space-y-4">
                {data.map((emp) => {
                  const isExpanded = expandedEmployeeId === emp.id;
                  return (
                    <div 
                      key={emp.id}
                      className="border border-slate-150/50 rounded-2xl overflow-hidden hover:border-slate-350 transition-all bg-white/60"
                    >
                      {/* Grid row main info */}
                      <div 
                        onClick={() => toggleExpand(emp.id)}
                        className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-4 min-w-[240px]">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-650 text-white flex items-center justify-center font-black text-sm">
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-slate-800">{emp.name}</h4>
                            <p className="text-xs text-slate-450 mt-0.5">{emp.email}</p>
                          </div>
                        </div>

                        {/* Progress Bar score tracker */}
                        <div className="flex-1 max-w-xs min-w-[160px]">
                          <div className="flex justify-between text-[10px] font-bold mb-1">
                            <span className="text-slate-400">Fatigue Index</span>
                            <span className="text-slate-700">{emp.fatigue_score}%</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${getProgressBarClass(emp.fatigue_score)}`}
                              style={{ width: `${emp.fatigue_score}%` }}
                            />
                          </div>
                        </div>

                        {/* Badges and dropdown trigger */}
                        <div className="flex items-center justify-between md:justify-end gap-4">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${getRiskCategoryClass(emp.risk_category)}`}>
                            {emp.risk_category}
                          </span>
                          
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-slate-450" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-450" />
                          )}
                        </div>
                      </div>

                      {/* Expandable details */}
                      {isExpanded && (
                        <div className="px-6 pb-6 pt-2 border-t border-slate-100 bg-slate-50/20 space-y-4">
                          {/* Metrics counters grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <div className="bg-white border border-slate-150/40 p-3.5 rounded-xl text-center">
                              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Overtime Days</span>
                              <span className="text-base font-black text-slate-800 mt-1 block">{emp.metrics.overtime_days} days</span>
                            </div>
                            <div className="bg-white border border-slate-150/40 p-3.5 rounded-xl text-center">
                              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Overtime Hours</span>
                              <span className="text-base font-black text-slate-800 mt-1 block">{emp.metrics.total_overtime_hours} hrs</span>
                            </div>
                            <div className="bg-white border border-slate-150/40 p-3.5 rounded-xl text-center">
                              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consecutive Overtime Streak</span>
                              <span className="text-base font-black text-slate-800 mt-1 block">{emp.metrics.overtime_streak_days} days</span>
                            </div>
                            <div className="bg-white border border-slate-150/40 p-3.5 rounded-xl text-center">
                              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Late Arrivals</span>
                              <span className="text-base font-black text-slate-800 mt-1 block">{emp.metrics.late_arrivals}</span>
                            </div>
                            <div className="bg-white border border-slate-150/40 p-3.5 rounded-xl text-center">
                              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Late/Overdue Tasks</span>
                              <span className="text-base font-black text-slate-800 mt-1 block">{emp.metrics.late_overdue_tasks}</span>
                            </div>
                            <div className="bg-white border border-slate-150/40 p-3.5 rounded-xl text-center">
                              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Short-Notice Leaves</span>
                              <span className="text-base font-black text-slate-800 mt-1 block">{emp.metrics.short_notice_leaves}</span>
                            </div>
                          </div>

                          {/* Specific Incident log timelines */}
                          <div className="space-y-2">
                            <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Burnout Indicators (Timeline)</h5>
                            {emp.incidents.length === 0 ? (
                              <p className="text-xs text-slate-450 italic">No fatigue indicators or stress metrics triggered in the last 30 days.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {emp.incidents.map((inc, index) => (
                                  <div 
                                    key={index}
                                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-slate-150/30 text-xs text-slate-650"
                                  >
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                                    <p className="flex-1 leading-normal font-medium">{inc.text}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
