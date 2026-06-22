'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { Attendance } from '@/types';
import {
  MapPin, Clock, LogIn, LogOut, History, Calendar, AlertCircle,
  Loader2, ShieldAlert, ShieldCheck, Timer, RefreshCw, Sun, Umbrella, Star
} from 'lucide-react';
import { formatDateTime, formatPreciseDateTime, formatDate, cn, ensureUTC } from '@/lib/utils';
import { DashboardSkeleton } from '@/components/SkeletonLoaders';

// ─── Types ────────────────────────────────────────────────────────────────────

function generateFingerprint(): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) { ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.fillText('fingerprint', 2, 2); }
  const raw = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height, screen.colorDepth, new Date().getTimezoneOffset(), canvas.toDataURL()].join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) { const c = raw.charCodeAt(i); hash = ((hash << 5) - hash) + c; hash |= 0; }
  return Math.abs(hash).toString(36);
}

interface GeofenceStatus {
  geofence_configured: boolean;
  policy: string;
  within_geofence: boolean;
  distance_meters: number | null;
  radius_meters: number | null;
  min_session_minutes?: number;
}

interface RegularizationRequest {
  id: string;
  attendance_id: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: string;
  comments: string | null;
  created_at: string;
}

interface CalendarSummary {
  attendance_logs: Attendance[];
  regularized_dates: string[];
  regularizations_detail: {
    id: string;
    date: string;
    requested_check_in: string | null;
    requested_check_out: string | null;
    reason: string;
    comments: string | null;
  }[];
  leave_dates: {
    id: string;
    start: string;
    end: string;
    leave_type: string;
    reason: string;
    comments: string | null;
  }[];
  holiday_dates: { date: string; name: string }[];
  work_days: string[];
  work_start_time: string;
}

// ─── Unified list row type ────────────────────────────────────────────────────
type ListRowType = 'attendance' | 'regularized' | 'leave' | 'holiday';
interface UnifiedRow {
  type: ListRowType;
  date: string; // YYYY-MM-DD for sorting
  displayDate: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status?: string;
  flags?: string[];
  isAutoClosed?: boolean;
  locationIn?: { lat: number; lng: number } | null;
  locationDriftKm?: number | null;
  addressIn?: string | null;
  label: string;
  sublabel?: string;
  badgeColor: string;
  badgeBg: string;
  badgeBorder: string;
  icon: React.ReactNode;
  reason?: string;
  comments?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const LEAVE_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  casual: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200', label: 'Casual Leave' },
  sick: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'Sick Leave' },
  earned: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'Earned Leave' },
  loss_of_pay: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Loss of Pay' },
  work_from_home: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', label: 'Work From Home' },
};

const getFlagLabel = (flag: string): string => {
  if (flag === 'outside_geofence') return '📍 Outside Office Zone';
  if (flag === 'outside_geofence_checkout') return '📍 Checkout Outside Zone';
  if (flag === 'device_changed') return '📱 Device Changed';
  if (flag === 'off_hours_checkin') return '🌙 Off-Hours Check-in';
  if (flag === 'suspicious_coordinates') return '⚠️ Suspicious GPS';
  if (flag === 'short_session') return '⏱️ Short Session';
  if (flag === 'auto_closed') return '🔄 Auto-Closed';
  if (flag.startsWith('location_drift_')) return `📏 ${flag.replace('location_drift_', 'Drift: ')}`;
  return flag;
};

// ─── Build unified list from all data sources ─────────────────────────────────
function buildUnifiedRows(summary: CalendarSummary | null, rawHistory: Attendance[]): UnifiedRow[] {
  const rows: UnifiedRow[] = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const logs = summary?.attendance_logs ?? rawHistory;
  const regularizedSet = new Set(summary?.regularized_dates ?? []);

  // Attendance logs
  for (const log of logs) {
    const checkInDate = new Date(ensureUTC(log.check_in));
    if (checkInDate < thirtyDaysAgo) continue;
    const dateKey = `${checkInDate.getFullYear()}-${String(checkInDate.getMonth() + 1).padStart(2, '0')}-${String(checkInDate.getDate()).padStart(2, '0')}`;
    const isReg = regularizedSet.has(dateKey);

    if (isReg) {
      rows.push({
        type: 'regularized',
        date: dateKey,
        displayDate: formatDate(log.check_in),
        checkIn: log.check_in,
        checkOut: log.check_out ?? null,
        flags: log.flags ?? [],
        isAutoClosed: log.is_auto_closed,
        locationIn: log.location_in ?? null,
        locationDriftKm: log.location_drift_km ?? null,
        addressIn: log.address_in ?? null,
        label: 'Regularized',
        sublabel: 'Approved correction counted as present',
        badgeColor: 'text-blue-700',
        badgeBg: 'bg-blue-50',
        badgeBorder: 'border-blue-200',
        icon: <Star className="w-3.5 h-3.5 text-blue-500" />,
      });
    } else {
      rows.push({
        type: 'attendance',
        date: dateKey,
        displayDate: formatDate(log.check_in),
        checkIn: log.check_in,
        checkOut: log.check_out ?? null,
        status: log.status,
        flags: log.flags ?? [],
        isAutoClosed: log.is_auto_closed,
        locationIn: log.location_in ?? null,
        locationDriftKm: log.location_drift_km ?? null,
        addressIn: log.address_in ?? null,
        label: log.status?.toUpperCase() ?? 'PRESENT',
        badgeColor: log.status === 'present' ? 'text-emerald-600' : 'text-amber-600',
        badgeBg: log.status === 'present' ? 'bg-emerald-50' : 'bg-amber-50',
        badgeBorder: log.status === 'present' ? 'border-emerald-100' : 'border-amber-100',
        icon: <LogIn className="w-3.5 h-3.5 text-emerald-500" />,
      });
    }
  }

  // Approved leaves (expand date range into individual rows)
  if (summary?.leave_dates) {
    for (const leave of summary.leave_dates) {
      const leaveStyle = LEAVE_COLORS[leave.leave_type] ?? { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200', label: 'Leave' };
      const start = new Date(leave.start + 'T00:00:00');
      const end = new Date(leave.end + 'T00:00:00');
      const cur = new Date(start);
      while (cur <= end) {
        if (cur >= thirtyDaysAgo) {
          const dateKey = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
          // Don't duplicate if an attendance log already covers this day
          const alreadyCovered = rows.some(r => r.date === dateKey);
          if (!alreadyCovered) {
            rows.push({
              type: 'leave',
              date: dateKey,
              displayDate: cur.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
              label: leaveStyle.label,
              sublabel: leave.reason,
              badgeColor: leaveStyle.text,
              badgeBg: leaveStyle.bg,
              badgeBorder: leaveStyle.border,
              icon: <Umbrella className="w-3.5 h-3.5 text-pink-500" />,
              reason: leave.reason,
              comments: leave.comments,
            });
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  }

  // Holidays
  if (summary?.holiday_dates) {
    for (const h of summary.holiday_dates) {
      if (new Date(h.date + 'T00:00:00') >= thirtyDaysAgo) {
        const alreadyCovered = rows.some(r => r.date === h.date);
        if (!alreadyCovered) {
          rows.push({
            type: 'holiday',
            date: h.date,
            displayDate: new Date(h.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            label: 'Holiday',
            sublabel: h.name,
            badgeColor: 'text-violet-700',
            badgeBg: 'bg-violet-50',
            badgeBorder: 'border-violet-200',
            icon: <Sun className="w-3.5 h-3.5 text-violet-500" />,
          });
        }
      }
    }
  }

  // Sort newest first
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<Attendance[]>([]);
  const [currentSession, setCurrentSession] = useState<Attendance | null>(null);
  const [corrections, setCorrections] = useState<RegularizationRequest[]>([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [geofenceStatus, setGeofenceStatus] = useState<GeofenceStatus | null>(null);
  const [sessionTimer, setSessionTimer] = useState('');
  const [canCheckout, setCanCheckout] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [calendarSummary, setCalendarSummary] = useState<CalendarSummary | null>(null);

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/attendance/me');
      setHistory(res.data);
      const active = res.data.find((a: Attendance) => !a.check_out);
      setCurrentSession(active || null);
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
      setError('Failed to load attendance history.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCalendarSummary = useCallback(async () => {
    try {
      const res = await api.get('/attendance/my-calendar-summary');
      setCalendarSummary(res.data);
    } catch (err) {
      console.error('Failed to fetch calendar summary:', err);
    }
  }, []);

  const checkGeofence = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await api.get('/attendance/geofence-status', { params: { lat, lng } });
      setGeofenceStatus(res.data);
    } catch (err) {
      console.error('Failed to check geofence:', err);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
    fetchCalendarSummary();
    loadCorrections();
    const handleUpdate = () => { fetchAttendance(); fetchCalendarSummary(); };
    window.addEventListener('attendanceUpdated', handleUpdate);
    return () => window.removeEventListener('attendanceUpdated', handleUpdate);
  }, [fetchAttendance, fetchCalendarSummary]);

  useEffect(() => {
    if (!currentSession) { setSessionTimer(''); setCanCheckout(true); return; }
    const updateTimer = () => {
      const start = new Date(ensureUTC(currentSession.check_in)).getTime();
      const diffSec = Math.floor((Date.now() - start) / 1000);
      if (diffSec < 0) { setSessionTimer('00:00:00'); return; }
      const hrs = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      setSessionTimer(`${pad(hrs)}:${pad(mins)}:${pad(secs)}`);
      const minMinutes = geofenceStatus?.min_session_minutes || 0;
      setCanCheckout((diffSec / 60) >= minMinutes);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentSession, geofenceStatus]);

  const loadCorrections = async () => {
    try {
      setCorrectionsLoading(true);
      const res = await api.get('/regularization/my');
      setCorrections(res.data);
    } catch (err) {
      console.error('Failed to fetch correction audits:', err);
    } finally {
      setCorrectionsLoading(false);
    }
  };

  const handleAction = async (type: 'check-in' | 'check-out') => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setActionLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc);
        await checkGeofence(loc.lat, loc.lng);
        try {
          const res = await api.post(`/attendance/${type}`, {
            lat: loc.lat,
            lng: loc.lng,
            remarks: type === 'check-in' ? 'Regular Check-in' : 'Regular Check-out',
            device_fingerprint: generateFingerprint(),
          });
          if (type === 'check-in') setCurrentSession(res.data);
          else setCurrentSession(null);
          fetchAttendance();
          fetchCalendarSummary();
          window.dispatchEvent(new Event('attendanceUpdated'));
        } catch (err: any) {
          setError(err.response?.data?.detail || `Failed to ${type}.`);
        } finally {
          setActionLoading(false);
        }
      },
      (geoError) => {
        console.error('Location error:', geoError.code, geoError.message);
        setActionLoading(false);
        switch (geoError.code) {
          case geoError.PERMISSION_DENIED:
            setError('Location permission denied. Please allow location access in your browser settings to use attendance.');
            break;
          case geoError.POSITION_UNAVAILABLE:
            setError('Location unavailable. Please check your device GPS settings and try again.');
            break;
          case geoError.TIMEOUT:
            setError('Location request timed out. Please check your internet connection and try again.');
            break;
          default:
            setError('Unable to get your location. Please try again.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const unifiedRows = buildUnifiedRows(calendarSummary, history);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Attendance Tracking</h1>
        <p className="text-muted-foreground text-sm mt-1">Punch in/out with your live location</p>
      </div>

      {/* Geofence Status Banner */}
      {geofenceStatus && geofenceStatus.geofence_configured && (
        <div className={cn(
          "rounded-2xl p-4 border flex items-center gap-4 transition-all",
          geofenceStatus.within_geofence
            ? "bg-emerald-50/50 border-emerald-200 text-emerald-700"
            : "bg-amber-50/50 border-amber-200 text-amber-700"
        )}>
          {geofenceStatus.within_geofence
            ? <ShieldCheck className="w-8 h-8 text-emerald-500 shrink-0" />
            : <ShieldAlert className="w-8 h-8 text-amber-500 shrink-0" />}
          <div className="flex-1">
            <p className="text-sm font-bold">
              {geofenceStatus.within_geofence ? 'Inside Office Zone' : 'Outside Office Zone'}
            </p>
            <p className="text-xs opacity-75 mt-0.5">
              {geofenceStatus.distance_meters !== null && (
                <>You are <strong>{geofenceStatus.distance_meters < 1000 ? `${Math.round(geofenceStatus.distance_meters)}m` : `${(geofenceStatus.distance_meters / 1000).toFixed(1)}km`}</strong> from office
                  {' '}(allowed: {geofenceStatus.radius_meters}m radius)
                  {geofenceStatus.policy === 'strict' && !geofenceStatus.within_geofence && (
                    <> — <strong>Check-in blocked</strong></>
                  )}</>
              )}
            </p>
          </div>
          <div className={cn(
            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
            geofenceStatus.within_geofence
              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
              : "bg-amber-100 text-amber-700 border-amber-200"
          )}>
            {geofenceStatus.policy}
          </div>
        </div>
      )}

      {/* Main Action Card */}
      <div className="glass rounded-2xl p-8 border border-border shadow-sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3 text-indigo-600">
              <Clock className="w-6 h-6" />
              <span className="text-xl font-semibold">
                {currentSession ? 'Currently Logged In' : 'Logged Out'}
              </span>
            </div>

            {currentSession && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Checked in at:</p>
                  <p className="text-2xl font-bold">{formatPreciseDateTime(currentSession.check_in)}</p>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                  <Timer className="w-5 h-5 text-indigo-500" />
                  <div>
                    <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Session Duration</p>
                    <p className="text-lg font-mono font-bold text-indigo-700">{sessionTimer}</p>
                  </div>
                  {!canCheckout && (
                    <div className="ml-auto text-[10px] font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 uppercase tracking-wider">
                      Min {geofenceStatus?.min_session_minutes || 30}min required
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentSession && currentSession.flags && currentSession.flags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {currentSession.flags.map((flag, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    {getFlagLabel(flag)}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-slate-50 p-3 rounded-lg border border-slate-100">
              <MapPin className="w-4 h-4 text-indigo-500" />
              {location
                ? <span>Location captured: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
                : <span>Fetching live location...</span>}
            </div>
          </div>

          <div className="shrink-0">
            {!currentSession ? (
              <button
                onClick={() => handleAction('check-in')}
                disabled={actionLoading || !location || (geofenceStatus?.policy === 'strict' && geofenceStatus?.geofence_configured && !geofenceStatus?.within_geofence)}
                className="btn btn-primary w-48 h-48 rounded-full flex flex-col items-center justify-center gap-2 text-lg shadow-lg hover:scale-105 transition-transform disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : <LogIn className="w-10 h-10" />}
                <span>Punch In</span>
              </button>
            ) : (
              <button
                onClick={() => handleAction('check-out')}
                disabled={actionLoading || !location || !canCheckout}
                className={cn(
                  "btn text-white w-48 h-48 rounded-full flex flex-col items-center justify-center gap-2 text-lg shadow-lg hover:scale-105 transition-transform disabled:opacity-50",
                  canCheckout ? "bg-red-500 hover:bg-red-600" : "bg-slate-400 cursor-not-allowed"
                )}
              >
                {actionLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : <LogOut className="w-10 h-10" />}
                <span>{canCheckout ? 'Punch Out' : 'Wait...'}</span>
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Calendar View Card */}
      <div className="glass rounded-2xl p-6 border border-border shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-500" />
            <h2 className="font-semibold text-slate-800">Attendance Calendar (Last 3 Months)</h2>
          </div>
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-bold">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Present</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Regularized</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Late</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" /> Absent</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-pink-500 inline-block" /> Leave</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-violet-500 inline-block" /> Holiday</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {[2, 1, 0].map((monthOffset) => {
            const now = new Date();
            // Use day=1 to avoid overflow: e.g. May 31 - 1 month = April 31 → rolls to May 1
            const date = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
            return (
              <MonthCalendar
                key={monthOffset}
                year={date.getFullYear()}
                month={date.getMonth()}
                history={calendarSummary?.attendance_logs ?? history}
                regularizedDates={calendarSummary?.regularized_dates ?? []}
                leaveDates={calendarSummary?.leave_dates ?? []}
                holidayDates={calendarSummary?.holiday_dates ?? []}
                workDays={calendarSummary?.work_days ?? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']}
                workStartTime={calendarSummary?.work_start_time ?? '09:00'}
              />
            );
          })}
        </div>
      </div>

      {/* ── Unified Recent Logs Table ── */}
      <div className="glass rounded-2xl overflow-hidden border border-border shadow-sm">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-500" />
            <h2 className="font-semibold">Daily Log</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-4 h-4" />
            Last 30 days · includes leaves, holidays &amp; regularizations
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Type / Status</th>
                <th className="px-6 py-4">In Time</th>
                <th className="px-6 py-4">Out Time</th>
                <th className="px-6 py-4">Notes / Flags</th>
                <th className="px-6 py-4 text-right">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {unifiedRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No logs found for the last 30 days.
                  </td>
                </tr>
              )}
              {unifiedRows.map((row, i) => (
                <tr
                  key={`${row.type}-${row.date}-${i}`}
                  className={cn(
                    "hover:bg-slate-50/50 transition-colors",
                    row.type === 'holiday' && "bg-violet-50/20",
                    row.type === 'leave' && "bg-pink-50/20",
                    row.type === 'regularized' && "bg-blue-50/20 border-l-2 border-l-blue-400",
                    row.isAutoClosed && "bg-amber-50/30",
                    (row.flags && row.flags.length > 0) && row.type === 'attendance' && "border-l-2 border-l-amber-400",
                  )}
                >
                  {/* Date */}
                  <td className="px-6 py-4 font-medium whitespace-nowrap">{row.displayDate}</td>

                  {/* Status badge */}
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                      row.badgeBg, row.badgeColor, row.badgeBorder
                    )}>
                      {row.icon}
                      {row.label}
                    </span>
                    {row.sublabel && (
                      <p className="text-[11px] text-slate-400 mt-0.5 max-w-[180px] truncate">{row.sublabel}</p>
                    )}
                  </td>

                  {/* In Time */}
                  <td className="px-6 py-4">
                    {row.checkIn ? (
                      <div className="flex items-center gap-2">
                        <LogIn className="w-3.5 h-3.5 text-emerald-500" />
                        {formatDateTime(row.checkIn)}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Out Time */}
                  <td className="px-6 py-4">
                    {row.checkOut ? (
                      <div className="flex items-center gap-2">
                        <LogOut className={`w-3.5 h-3.5 ${row.isAutoClosed ? 'text-amber-500' : 'text-rose-500'}`} />
                        {formatDateTime(row.checkOut)}
                        {row.isAutoClosed && (
                          <span className="text-[9px] font-black text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">AUTO</span>
                        )}
                      </div>
                    ) : row.type === 'attendance' && !row.checkOut ? (
                      <span className="text-amber-500 font-medium text-xs">Active Session</span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Notes / Flags */}
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {/* Attendance flags */}
                      {(row.flags && row.flags.length > 0) && row.flags.map((flag, fi) => (
                        <span key={fi} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                          {getFlagLabel(flag)}
                        </span>
                      ))}
                      {/* Leave/holiday reason */}
                      {(row.type === 'leave' || row.type === 'holiday' || row.type === 'regularized') && row.reason && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] text-slate-500 italic max-w-[200px] truncate">
                          {row.reason}
                        </span>
                      )}
                      {row.comments && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] text-slate-400 italic max-w-[200px] truncate">
                          💬 {row.comments}
                        </span>
                      )}
                      {(!row.flags || row.flags.length === 0) && !row.reason && !row.comments && (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </div>
                  </td>

                  {/* Location */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end gap-1">
                      {row.locationIn ? (
                        <a
                          href={`https://www.google.com/maps?q=${row.locationIn.lat},${row.locationIn.lng}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-indigo-500 hover:text-indigo-700 hover:underline text-xs font-bold transition-colors"
                          title={row.addressIn || `${row.locationIn.lat.toFixed(5)}, ${row.locationIn.lng.toFixed(5)}`}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Map View</span>
                        </a>
                      ) : (
                        <div className="flex items-center gap-1 text-slate-300 text-xs cursor-not-allowed" title="No GPS data captured">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>—</span>
                        </div>
                      )}
                      {row.locationDriftKm !== null && row.locationDriftKm !== undefined && (
                        <span className={cn("text-[9px] font-bold", row.locationDriftKm > 5 ? "text-rose-500" : "text-slate-400")}>
                          Drift: {row.locationDriftKm}km
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Correction Audits Section ── */}
      <div className="glass rounded-2xl p-6 border border-border shadow-sm mt-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-800">Correction Audits</h2>
          <button onClick={loadCorrections} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-650 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {correctionsLoading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : corrections.length === 0 ? (
          <div className="text-center py-8 text-slate-400">No correction audits found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 text-muted-foreground font-medium border-b border-border">
                <tr>
                  <th className="py-3 px-4">Requested In</th>
                  <th className="py-3 px-4">Requested Out</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {corrections.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2 px-4 text-xs">
                      {c.requested_check_in ? formatDateTime(c.requested_check_in) : '—'}
                    </td>
                    <td className="py-2 px-4 text-xs">
                      {c.requested_check_out ? formatDateTime(c.requested_check_out) : '—'}
                    </td>
                    <td className="py-2 px-4 text-xs text-slate-600 max-w-xs truncate">{c.reason}</td>
                    <td className="py-2 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${c.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          c.status === 'verified' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            c.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>{c.status}</span>
                    </td>
                    <td className="py-2 px-4 text-xs text-slate-450 italic max-w-xs truncate">{c.comments || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Month Calendar Component ─────────────────────────────────────────────────

function MonthCalendar({
  year, month, history,
  regularizedDates = [],
  leaveDates = [],
  holidayDates = [],
  workDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  workStartTime = '09:00'
}: {
  year: number;
  month: number;
  history: Attendance[];
  regularizedDates?: string[];
  leaveDates?: { start: string; end: string; leave_type: string }[];
  holidayDates?: { date: string; name: string }[];
  workDays?: string[];
  workStartTime?: string;
}) {
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const today = new Date();

  // Work day lookup
  const workDayNames = new Set(workDays.map(d => d.toLowerCase()));
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const isCompanyWorkDay = (date: Date) => workDayNames.has(dayNames[date.getDay()]);

  // Regularized set
  const regularizedSet = new Set(regularizedDates);

  // Holiday map: date -> name
  const holidayMap = new Map<string, string>();
  for (const h of holidayDates) holidayMap.set(h.date, h.name);

  // Leave map: date -> leave_type
  const leaveDateMap = new Map<string, string>();
  for (const leave of leaveDates) {
    const start = new Date(leave.start + 'T00:00:00');
    const end = new Date(leave.end + 'T00:00:00');
    const cur = new Date(start);
    while (cur <= end) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      leaveDateMap.set(key, leave.leave_type);
      cur.setDate(cur.getDate() + 1);
    }
  }

  const stats = { working: 0, present: 0, late: 0, absent: 0, holiday: 0, leave: 0, regularized: 0 };
  const days = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const isWorkDay = isCompanyWorkDay(date);
    const isFuture = date > today;
    const isPastOrToday = date <= today;
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    const isHoliday = holidayMap.has(dateKey);
    const holidayName = holidayMap.get(dateKey);
    const isRegularized = regularizedSet.has(dateKey);
    const leaveType = leaveDateMap.get(dateKey);

    if (isWorkDay && isPastOrToday && !isHoliday) stats.working++;

    const logs = history.filter(log => {
      const logDate = new Date(ensureUTC(log.check_in));
      return logDate.getFullYear() === year && logDate.getMonth() === month && logDate.getDate() === d;
    });

    type DayStatus = 'present' | 'regularized' | 'late' | 'absent' | 'holiday' | 'leave' | 'weekend' | 'none' | 'no_data';
    let status: DayStatus = 'none';
    let symbol = '';
    let colorClass = '';
    let tooltipText = '';

    if (isHoliday) {
      // Holiday always wins — shown in purple regardless of attendance
      status = 'holiday'; symbol = 'H'; colorClass = 'bg-violet-500 text-white';
      tooltipText = holidayName ?? 'Holiday';
      if (isPastOrToday) stats.holiday++;
    } else if (logs.length > 0) {
      const firstLog = logs[logs.length - 1];
      const checkInTime = new Date(ensureUTC(firstLog.check_in)).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
      });
      if (isRegularized) {
        status = 'regularized'; symbol = 'R'; colorClass = 'bg-blue-500 text-white';
        tooltipText = 'Regularized — counted as Present';
        stats.present++; stats.regularized++;
      } else if (checkInTime > workStartTime) {
        status = 'late'; symbol = 'L'; colorClass = 'bg-amber-500 text-white';
        stats.late++; stats.present++;
      } else {
        status = 'present'; symbol = 'P'; colorClass = 'bg-emerald-500 text-white';
        stats.present++;
      }
    } else if (isRegularized) {
      status = 'regularized'; symbol = 'R'; colorClass = 'bg-blue-500 text-white';
      tooltipText = 'Regularized — counted as Present';
      stats.present++; stats.regularized++;
    } else if (leaveType && isWorkDay && isPastOrToday) {
      status = 'leave'; symbol = 'Lv'; colorClass = 'bg-pink-500 text-white';
      tooltipText = `${LEAVE_COLORS[leaveType]?.label ?? 'Leave'}`;
      stats.leave++;
    } else if (isWorkDay && isPastOrToday) {
      status = 'no_data'; symbol = '-'; colorClass = 'bg-slate-200 text-slate-500';
      tooltipText = 'No attendance data';
    } else if (!isWorkDay) {
      status = 'weekend'; colorClass = 'bg-slate-100 text-slate-400';
    }

    days.push({ day: d, status, symbol, colorClass, isFuture, tooltipText });
  }

  return (
    <div className="flex flex-col">
      <h3 className="text-center font-bold text-slate-700 mb-4">{monthName}</h3>
      <div className="grid grid-cols-7 gap-1 mb-6">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={`${d}-${i}`} className="text-center text-[10px] font-black text-slate-400 py-1">{d}</div>
        ))}
        {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
        {days.map((d) => (
          <div
            key={d.day}
            className={cn(
              "aspect-square flex flex-col items-center justify-center rounded-lg text-[10px] relative cursor-default",
              d.colorClass,
              d.isFuture && "opacity-20"
            )}
            title={d.tooltipText || undefined}
          >
            <span className="font-bold">{d.day}</span>
            {d.symbol && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white text-slate-900 border border-slate-200 flex items-center justify-center font-black scale-75">
                {d.symbol}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="space-y-1.5 bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
        <StatRow label="Working Days" value={stats.working} color="text-slate-600" />
        <StatRow label="Present" value={stats.present - stats.late - stats.regularized} color="text-emerald-600" />
        <StatRow label="Regularized" value={stats.regularized} color="text-blue-600" />
        <StatRow label="Late" value={stats.late} color="text-amber-600" />
        <StatRow label="Absent" value={stats.absent} color="text-rose-600" />
        <StatRow label="Holidays" value={stats.holiday} color="text-violet-600" />
        <StatRow label="Leaves" value={stats.leave} color="text-pink-600" />
      </div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-[11px] font-medium">
      <span className="text-slate-500">{label}</span>
      <span className={cn("font-bold", color)}>{value}</span>
    </div>
  );
}
