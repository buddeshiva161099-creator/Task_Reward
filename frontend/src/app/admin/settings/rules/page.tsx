'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Company } from '@/types';
import { Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardSkeleton } from '@/components/SkeletonLoaders';

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function RulesSettingsPage() {
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [companiesList, setCompaniesList] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form State
  const [workDays, setWorkDays] = useState<string[]>([]);
  const [workType, setWorkType] = useState('fixed');
  const [startTime, setStartTime] = useState('09:30 AM');
  const [endTime, setEndTime] = useState('06:30 PM');
  const [cutOutTime, setCutOutTime] = useState('10:00 AM');
  const [flexibleHours, setFlexibleHours] = useState(8);

  // Leave Limits State
  const [sickLeaveLimit, setSickLeaveLimit] = useState(0);
  const [earnedLeaveLimit, setEarnedLeaveLimit] = useState(0);
  const [casualLeaveLimit, setCasualLeaveLimit] = useState(12);
  const [maxPaidCasualLeavesPerMonth, setMaxPaidCasualLeavesPerMonth] = useState(1);

  // Points & Rules State
  const [priorityPoints, setPriorityPoints] = useState({
    critical: 10.0,
    high: 5.0,
    medium: 3.0,
    regular: 1.0,
    low: 1.0
  });
  const [delayPenalties, setDelayPenalties] = useState({
    on_time: 1.0,
    "1_day_late": 0.75,
    "2_days_late": 0.50,
    "3_days_late": 0.25,
    "4_plus_days_late": 0.0
  });
  const [earlyMultiplier, setEarlyMultiplier] = useState(1.1);
  const [qualityMultipliers, setQualityMultipliers] = useState({
    rework: 0.8,
    standard: 1.0,
    exemplary: 1.2
  });
  const [attendancePoints, setAttendancePoints] = useState({
    present: 1.0,
    late_under_30: 0.75,
    late_over_30: 0.5,
    excused: 0.0,
    unexcused: -1.0,
    overtime: 1.25
  });
  const [attendanceBonusThreshold, setAttendanceBonusThreshold] = useState(95.0);
  const [attendanceBonusPercentage, setAttendanceBonusPercentage] = useState(5.0);
  const [performancePoolPercentage, setPerformancePoolPercentage] = useState(25.0);

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        let res = await api.get('/companies');
        let data = res.data;
        if (data.length === 0) {
          // Auto-create a default company if empty
          try {
            const createRes = await api.post('/companies', {
              name: 'Default Company',
              description: 'Automatically created default company settings.',
            });
            data = [createRes.data];
          } catch (createErr) {
            console.error('Failed to auto-create default company:', createErr);
            setError('No company configuration exists. Failed to auto-create default company.');
            setLoading(false);
            return;
          }
        }
        
        setCompaniesList(data);
        
        // Find the company for the current user
        const myCompany = data.find((c: Company) => c.id === user?.company_id) || data[0];
        if (myCompany) {
          setCompany(myCompany);
          setWorkDays(myCompany.work_days);
          setWorkType(myCompany.work_type || 'fixed');
          setStartTime(myCompany.work_start_time || '09:30 AM');
          setEndTime(myCompany.work_end_time || '06:30 PM');
          setCutOutTime(myCompany.cut_out_time || '10:00 AM');
          setFlexibleHours(myCompany.flexible_hours || 8);
          
          if (myCompany.task_priority_points) setPriorityPoints(myCompany.task_priority_points);
          if (myCompany.delay_penalties) setDelayPenalties(myCompany.delay_penalties);
          if (myCompany.early_completion_multiplier !== undefined) setEarlyMultiplier(myCompany.early_completion_multiplier);
          if (myCompany.quality_multipliers) setQualityMultipliers(myCompany.quality_multipliers);
          if (myCompany.attendance_points) setAttendancePoints(myCompany.attendance_points);
          if (myCompany.attendance_bonus_threshold !== undefined) setAttendanceBonusThreshold(myCompany.attendance_bonus_threshold);
          if (myCompany.attendance_bonus_percentage !== undefined) setAttendanceBonusPercentage(myCompany.attendance_bonus_percentage);
          if (myCompany.performance_incentive_pool_percentage !== undefined) setPerformancePoolPercentage(myCompany.performance_incentive_pool_percentage);
          if (myCompany.sick_leave_limit !== undefined) setSickLeaveLimit(myCompany.sick_leave_limit);
          if (myCompany.earned_leave_limit !== undefined) setEarnedLeaveLimit(myCompany.earned_leave_limit);
          if (myCompany.casual_leave_limit !== undefined) setCasualLeaveLimit(myCompany.casual_leave_limit);
          if (myCompany.max_paid_casual_leaves_per_month !== undefined) setMaxPaidCasualLeavesPerMonth(myCompany.max_paid_casual_leaves_per_month);
        }
      } catch (err) {
        console.error('Failed to fetch company:', err);
        setError('Failed to load settings.');
      } finally {
        setLoading(false);
      }
    };
    fetchCompany();
  }, [user]);

  const handleSave = async () => {
    if (!company) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const res = await api.put(`/companies/${company.id}`, {
        work_days: workDays,
        work_type: workType,
        work_start_time: startTime,
        work_end_time: endTime,
        cut_out_time: cutOutTime,
        flexible_hours: flexibleHours,
        task_priority_points: priorityPoints,
        delay_penalties: delayPenalties,
        early_completion_multiplier: earlyMultiplier,
        quality_multipliers: qualityMultipliers,
        attendance_points: attendancePoints,
        attendance_bonus_threshold: attendanceBonusThreshold,
        attendance_bonus_percentage: attendanceBonusPercentage,
        performance_incentive_pool_percentage: performancePoolPercentage,
        sick_leave_limit: sickLeaveLimit,
        earned_leave_limit: earnedLeaveLimit,
        casual_leave_limit: casualLeaveLimit,
        max_paid_casual_leaves_per_month: maxPaidCasualLeavesPerMonth
      });

      const updatedCompany = res.data;
      setCompany(updatedCompany);
      setCompaniesList(prev => prev.map(c => c.id === company.id ? updatedCompany : c));

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      setError(err.response?.data?.detail || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    setWorkDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-center py-2 border-y border-indigo-100 bg-indigo-50/30">
        <h1 className="text-sm font-black tracking-[0.2em] text-slate-900 uppercase">Rules & Points Framework</h1>
      </div>

      <div className="glass rounded-2xl p-8 border border-border shadow-sm space-y-8">
        {/* Company Selector Dropdown */}
        {companiesList.length > 0 && (
          <div className="flex items-center justify-between p-4 bg-indigo-50/40 rounded-xl border border-indigo-100/50 mb-6">
            <div className="flex items-center gap-3">
              <label className="text-xs font-black tracking-wider text-slate-500 uppercase">Managing Rules for:</label>
              <select
                value={company?.id || ''}
                onChange={(e) => {
                  const selected = companiesList.find(c => c.id === e.target.value);
                  if (selected) {
                    setCompany(selected);
                    setWorkDays(selected.work_days);
                    setWorkType(selected.work_type || 'fixed');
                    setStartTime(selected.work_start_time || '09:30 AM');
                    setEndTime(selected.work_end_time || '06:30 PM');
                    setCutOutTime(selected.cut_out_time || '10:00 AM');
                    setFlexibleHours(selected.flexible_hours || 8);
                    
                    if (selected.task_priority_points) setPriorityPoints(selected.task_priority_points);
                    if (selected.delay_penalties) setDelayPenalties(selected.delay_penalties);
                    if (selected.early_completion_multiplier !== undefined) setEarlyMultiplier(selected.early_completion_multiplier);
                    if (selected.quality_multipliers) setQualityMultipliers(selected.quality_multipliers);
                    if (selected.attendance_points) setAttendancePoints(selected.attendance_points);
                    if (selected.attendance_bonus_threshold !== undefined) setAttendanceBonusThreshold(selected.attendance_bonus_threshold);
                    if (selected.attendance_bonus_percentage !== undefined) setAttendanceBonusPercentage(selected.attendance_bonus_percentage);
                    if (selected.performance_incentive_pool_percentage !== undefined) setPerformancePoolPercentage(selected.performance_incentive_pool_percentage);
                    if (selected.sick_leave_limit !== undefined) setSickLeaveLimit(selected.sick_leave_limit);
                    if (selected.earned_leave_limit !== undefined) setEarnedLeaveLimit(selected.earned_leave_limit);
                    if (selected.casual_leave_limit !== undefined) setCasualLeaveLimit(selected.casual_leave_limit);
                    if (selected.max_paid_casual_leaves_per_month !== undefined) setMaxPaidCasualLeavesPerMonth(selected.max_paid_casual_leaves_per_month);
                  }
                }}
                className="text-sm font-bold text-slate-800 border border-slate-200 rounded-lg py-1.5 px-3 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {companiesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="text-[10px] font-medium text-indigo-600/70 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5">
              ID: {company?.id}
            </div>
          </div>
        )}

        {/* Section 1: Work Timings and Schedule */}
        <div>
          <h2 className="text-md font-extrabold text-slate-800 border-b pb-2 mb-4 uppercase tracking-wider text-xs">1. Work Timings & Schedule</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Weekly Off */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Weekly Off</label>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="p-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400">
                  Select days
                </div>
                <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                  {DAYS.map(day => (
                    <label key={day} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                      <input 
                        type="checkbox" 
                        checked={workDays.includes(day)}
                        onChange={() => toggleDay(day)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700 font-medium">{day}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Timing Type */}
            <div className="space-y-4 pt-8">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                  workType === 'fixed' ? "border-indigo-600" : "border-slate-300 group-hover:border-indigo-400"
                )}>
                  {workType === 'fixed' && <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />}
                </div>
                <input 
                  type="radio" 
                  className="hidden" 
                  name="workType" 
                  value="fixed" 
                  checked={workType === 'fixed'}
                  onChange={() => setWorkType('fixed')}
                />
                <span className="text-sm font-bold text-slate-700">Fixed Timing</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                  workType === 'flexible' ? "border-indigo-600" : "border-slate-300 group-hover:border-indigo-400"
                )}>
                  {workType === 'flexible' && <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />}
                </div>
                <input 
                  type="radio" 
                  className="hidden" 
                  name="workType" 
                  value="flexible" 
                  checked={workType === 'flexible'}
                  onChange={() => setWorkType('flexible')}
                />
                <span className="text-sm font-bold text-slate-700">Flexible Timing</span>
              </label>
            </div>

            {/* Fixed Inputs */}
            {workType === 'fixed' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Office Start Time</label>
                  <input 
                    type="text" 
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    placeholder="9:30 AM"
                    className="input text-sm border border-slate-200 rounded-lg p-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Office End Time</label>
                  <input 
                    type="text" 
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    placeholder="6:30 PM"
                    className="input text-sm border border-slate-200 rounded-lg p-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Office Cut Out Time</label>
                  <input 
                    type="text" 
                    value={cutOutTime}
                    onChange={(e) => setCutOutTime(e.target.value)}
                    placeholder="10:00 AM"
                    className="input text-sm border border-slate-200 rounded-lg p-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">No Of Hours</label>
                <select 
                  value={flexibleHours}
                  onChange={(e) => setFlexibleHours(parseInt(e.target.value))}
                  className="input text-sm border border-slate-200 rounded-lg p-2.5 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                >
                  {[6, 7, 8, 9, 10, 11, 12].map(h => (
                    <option key={h} value={h}>{h} Hours</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Task Priority Reward Points */}
        <div>
          <h2 className="text-md font-extrabold text-slate-800 border-b pb-2 mb-4 uppercase tracking-wider text-xs">2. Task Priority Reward Points</h2>
          <div className="grid grid-cols-5 gap-4">
            {Object.keys(priorityPoints).map((key) => (
              <div key={key} className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{key}</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={priorityPoints[key as keyof typeof priorityPoints]}
                  onChange={(e) => setPriorityPoints({
                    ...priorityPoints,
                    [key]: parseFloat(e.target.value) || 0
                  })}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Delay Penalties & Early Completion */}
        <div>
          <h2 className="text-md font-extrabold text-slate-800 border-b pb-2 mb-4 uppercase tracking-wider text-xs">3. Delay Penalties & Timeliness</h2>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">On-Time</label>
              <input 
                type="number" step="0.05"
                value={delayPenalties.on_time}
                onChange={(e) => setDelayPenalties({...delayPenalties, on_time: parseFloat(e.target.value) || 0})}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">1 Day Late</label>
              <input 
                type="number" step="0.05"
                value={delayPenalties["1_day_late" as keyof typeof delayPenalties]}
                onChange={(e) => setDelayPenalties({...delayPenalties, "1_day_late": parseFloat(e.target.value) || 0})}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">2 Days Late</label>
              <input 
                type="number" step="0.05"
                value={delayPenalties["2_days_late" as keyof typeof delayPenalties]}
                onChange={(e) => setDelayPenalties({...delayPenalties, "2_days_late": parseFloat(e.target.value) || 0})}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">3 Days Late</label>
              <input 
                type="number" step="0.05"
                value={delayPenalties["3_days_late" as keyof typeof delayPenalties]}
                onChange={(e) => setDelayPenalties({...delayPenalties, "3_days_late": parseFloat(e.target.value) || 0})}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">4+ Days Late</label>
              <input 
                type="number" step="0.05"
                value={delayPenalties["4_plus_days_late" as keyof typeof delayPenalties]}
                onChange={(e) => setDelayPenalties({...delayPenalties, "4_plus_days_late": parseFloat(e.target.value) || 0})}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Early Bonus (24h+)</label>
              <input 
                type="number" step="0.05"
                value={earlyMultiplier}
                onChange={(e) => setEarlyMultiplier(parseFloat(e.target.value) || 0)}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Quality Modifiers & Attendance Points */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-md font-extrabold text-slate-800 border-b pb-2 mb-4 uppercase tracking-wider text-xs">4. Quality Modifiers</h2>
            <div className="grid grid-cols-3 gap-4">
              {Object.keys(qualityMultipliers).map((key) => (
                <div key={key} className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{key}</label>
                  <input 
                    type="number" step="0.05"
                    value={qualityMultipliers[key as keyof typeof qualityMultipliers]}
                    onChange={(e) => setQualityMultipliers({
                      ...qualityMultipliers,
                      [key]: parseFloat(e.target.value) || 0
                    })}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-md font-extrabold text-slate-800 border-b pb-2 mb-4 uppercase tracking-wider text-xs">5. Attendance Status Points</h2>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Present</label>
                <input 
                  type="number" step="0.1" value={attendancePoints.present}
                  onChange={(e) => setAttendancePoints({...attendancePoints, present: parseFloat(e.target.value) || 0})}
                  className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Late &lt; 30m</label>
                <input 
                  type="number" step="0.1" value={attendancePoints.late_under_30}
                  onChange={(e) => setAttendancePoints({...attendancePoints, late_under_30: parseFloat(e.target.value) || 0})}
                  className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Late &gt; 30m</label>
                <input 
                  type="number" step="0.1" value={attendancePoints.late_over_30}
                  onChange={(e) => setAttendancePoints({...attendancePoints, late_over_30: parseFloat(e.target.value) || 0})}
                  className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Excused Leave</label>
                <input 
                  type="number" step="0.1" value={attendancePoints.excused}
                  onChange={(e) => setAttendancePoints({...attendancePoints, excused: parseFloat(e.target.value) || 0})}
                  className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Unexcused</label>
                <input 
                  type="number" step="0.1" value={attendancePoints.unexcused}
                  onChange={(e) => setAttendancePoints({...attendancePoints, unexcused: parseFloat(e.target.value) || 0})}
                  className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Overtime</label>
                <input 
                  type="number" step="0.1" value={attendancePoints.overtime}
                  onChange={(e) => setAttendancePoints({...attendancePoints, overtime: parseFloat(e.target.value) || 0})}
                  className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 5: Attendance Bonuses & Performance Incentive Pools */}
        <div>
          <h2 className="text-md font-extrabold text-slate-800 border-b pb-2 mb-4 uppercase tracking-wider text-xs">6. Payroll & Performance Incentive Pools</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Attendance Bonus Threshold %</label>
              <input 
                type="number" step="1.0"
                value={attendanceBonusThreshold}
                onChange={(e) => setAttendanceBonusThreshold(parseFloat(e.target.value) || 0)}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Attendance Bonus %</label>
              <input 
                type="number" step="0.5"
                value={attendanceBonusPercentage}
                onChange={(e) => setAttendanceBonusPercentage(parseFloat(e.target.value) || 0)}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Performance Pool Percentage %</label>
              <input 
                type="number" step="1.0"
                value={performancePoolPercentage}
                onChange={(e) => setPerformancePoolPercentage(parseFloat(e.target.value) || 0)}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Section 7: Leave Allocation Rules */}
        <div>
          <h2 className="text-md font-extrabold text-slate-800 border-b pb-2 mb-4 uppercase tracking-wider text-xs">7. Leave Allocation Rules</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Casual Leave Limit (Annual)</label>
              <input 
                type="number" step="1"
                value={casualLeaveLimit}
                onChange={(e) => setCasualLeaveLimit(parseInt(e.target.value) || 0)}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Sick Leave Limit (Annual)</label>
              <input 
                type="number" step="1"
                value={sickLeaveLimit}
                onChange={(e) => setSickLeaveLimit(parseInt(e.target.value) || 0)}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Earned Leave Limit (Annual)</label>
              <input 
                type="number" step="1"
                value={earnedLeaveLimit}
                onChange={(e) => setEarnedLeaveLimit(parseInt(e.target.value) || 0)}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Max Paid Casual Leaves Per Month</label>
              <input 
                type="number" step="1"
                value={maxPaidCasualLeavesPerMonth}
                onChange={(e) => setMaxPaidCasualLeavesPerMonth(parseInt(e.target.value) || 0)}
                className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Configured annual limits are synchronized with employee leave balances. Casual leaves exceeding the monthly limit (e.g. 1 per month) are processed as unpaid Loss of Pay (LOP) leaves during payroll generation.
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-center pt-4 border-t border-slate-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-slate-900 text-white px-10 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg animate-pulse"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save framework configurations
          </button>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            Settings saved successfully!
          </div>
        )}
      </div>
    </div>
  );
}
