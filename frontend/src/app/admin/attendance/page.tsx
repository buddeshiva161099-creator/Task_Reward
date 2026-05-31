'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { Attendance } from '@/types';
import { 
  Search, Calendar, Filter, Users, Download, Loader2, ArrowRight, History, 
  Clock, ShieldAlert, AlertTriangle, AlertCircle, MapPin, LogIn, LogOut, ShieldCheck, Timer 
} from 'lucide-react';
import { cn, ensureUTC, formatDate, formatDateTime, formatTimeIST } from '@/lib/utils';
import Link from 'next/link';

interface AttendanceDayEntry {
  date: string;
  status: string;
  check_in?: string | null;
  check_out?: string | null;
  location_in?: { lat: number; lng: number } | null;
  location_out?: { lat: number; lng: number } | null;
  address_in?: string | null;
  address_out?: string | null;
  is_regularized?: boolean;
}

interface AttendanceSummary {
  user_id: string;
  user_name: string;
  user_email: string;
  reward_points: number;
  history: AttendanceDayEntry[];
}

export default function AttendanceManagementPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'team' | 'my'>('team');
  
  // Team attendance states
  const [summaries, setSummaries] = useState<AttendanceSummary[]>([]);
  const [allLogs, setAllLogs] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFlagged, setShowFlagged] = useState(false);

  // Personal attendance states
  const [personalHistory, setPersonalHistory] = useState<Attendance[]>([]);
  const [currentSession, setCurrentSession] = useState<Attendance | null>(null);
  const [personalLoading, setPersonalLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geofenceStatus, setGeofenceStatus] = useState<any>(null);
  const [sessionTimer, setSessionTimer] = useState('');
  const [canCheckout, setCanCheckout] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSummaries = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryRes, logsRes] = await Promise.all([
        api.get('/attendance/summary'),
        api.get('/attendance/all'),
      ]);
      setSummaries(summaryRes.data);
      setAllLogs(logsRes.data);
    } catch (err) {
      console.error('Failed to fetch attendance data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPersonalAttendance = useCallback(async () => {
    try {
      setPersonalLoading(true);
      const res = await api.get('/attendance/me');
      setPersonalHistory(res.data);
      const active = res.data.find((a: Attendance) => !a.check_out);
      setCurrentSession(active || null);
    } catch (err) {
      console.error('Failed to fetch personal attendance:', err);
      setPersonalError('Failed to load personal attendance history.');
    } finally {
      setPersonalLoading(false);
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
    if (activeTab === 'team') {
      fetchSummaries();
    }
  }, [activeTab, fetchSummaries]);

  useEffect(() => {
    if (activeTab === 'my') {
      fetchPersonalAttendance();
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setLocation(loc);
            checkGeofence(loc.lat, loc.lng);
          },
          (geoError) => {
            console.error('Location error:', geoError);
            setPersonalError('Location access is required to punch in/out.');
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      } else {
        setPersonalError('Geolocation is not supported by your browser.');
      }
    }
  }, [activeTab, fetchPersonalAttendance, checkGeofence]);

  useEffect(() => {
    if (currentSession && !currentSession.check_out) {
      const updateTimer = () => {
        const checkinTime = new Date(ensureUTC(currentSession.check_in)).getTime();
        const now = Date.now();
        const diffMs = now - checkinTime;
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        const seconds = Math.floor((diffMs % 60000) / 1000);
        setSessionTimer(`${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`);
        
        const minMinutes = geofenceStatus?.min_session_minutes || 30;
        const sessionMinutes = diffMs / 60000;
        setCanCheckout(sessionMinutes >= minMinutes);
      };
      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else {
      setSessionTimer('');
      setCanCheckout(true);
    }
  }, [currentSession, geofenceStatus]);

  const handlePersonalAction = async (type: 'check-in' | 'check-out') => {
    if (!location) {
      setPersonalError('Unable to get location. Please allow location access.');
      return;
    }
    try {
      setActionLoading(true);
      setPersonalError(null);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('fingerprint', 2, 2);
      }
      const raw = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        canvas.toDataURL(),
      ].join('|');
      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        const char = raw.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
      }
      const deviceFingerprint = Math.abs(hash).toString(36);

      const res = await api.post(`/attendance/${type}`, {
        lat: location.lat,
        lng: location.lng,
        remarks: type === 'check-in' ? 'Regular Check-in' : 'Regular Check-out',
        device_fingerprint: deviceFingerprint,
      });
      
      if (type === 'check-in') {
        setCurrentSession(res.data);
      } else {
        setCurrentSession(null);
      }
      fetchPersonalAttendance();
    } catch (err: any) {
      setPersonalError(err.response?.data?.detail || `Failed to ${type}.`);
    } finally {
      setActionLoading(false);
    }
  };

  const flaggedLogs = allLogs.filter(log => (log.flags && log.flags.length > 0) || log.is_auto_closed);

  const filteredSummaries = summaries.filter(s => {
    return (s.user_name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
           (s.user_email || '').toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getFlagLabel = (flag: string): string => {
    if (flag === 'outside_geofence') return '📍 Outside Zone';
    if (flag === 'outside_geofence_checkout') return '📍 Checkout Outside';
    if (flag === 'device_changed') return '📱 Device Changed';
    if (flag === 'off_hours_checkin') return '🌙 Off-Hours';
    if (flag === 'suspicious_coordinates') return '⚠️ Suspicious GPS';
    if (flag === 'short_session') return '⏱️ Short Session';
    if (flag === 'auto_closed') return '🔄 Auto-Closed';
    if (flag.startsWith('location_drift_')) return `📏 ${flag.replace('location_drift_', 'Drift: ')}`;
    return flag;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Attendance Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor and manage attendance logs</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('team')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'team'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Team Attendance Logs
        </button>
        <button
          onClick={() => setActiveTab('my')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'my'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          My Attendance
        </button>
      </div>

      {activeTab === 'team' ? (
        <>
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {flaggedLogs.length > 0 && (
                <button
                  onClick={() => setShowFlagged(!showFlagged)}
                  className={cn(
                    "btn flex items-center gap-2 h-11 rounded-xl font-bold text-sm transition-all",
                    showFlagged
                      ? "bg-amber-500 text-white shadow-lg shadow-amber-100 hover:bg-amber-600"
                      : "btn-secondary border-amber-200 text-amber-600 hover:bg-amber-50"
                  )}
                >
                  <ShieldAlert className="w-4 h-4" />
                  {flaggedLogs.length} Flagged
                </button>
              )}
            </div>
            <button className="btn btn-primary flex items-center gap-2 shadow-lg shadow-indigo-100 h-11 rounded-xl">
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>

          {/* Flagged Sessions Panel */}
          {showFlagged && flaggedLogs.length > 0 && (
            <div className="glass rounded-2xl border-2 border-amber-200 shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2">
              <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h2 className="font-bold text-amber-800">Flagged Attendance Sessions ({flaggedLogs.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-amber-50/50 text-amber-700 font-medium border-b border-amber-100">
                    <tr>
                      <th className="px-6 py-3">Employee</th>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Check-in</th>
                      <th className="px-6 py-3">Check-out</th>
                      <th className="px-6 py-3">Drift</th>
                      <th className="px-6 py-3">Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-50">
                    {flaggedLogs.slice(0, 20).map((log) => (
                      <tr key={log.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="px-6 py-3">
                          <div>
                            <p className="font-bold text-slate-800">{log.user_name || 'Unknown'}</p>
                            <p className="text-[10px] text-slate-400">{log.user_email}</p>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-slate-600 font-medium">
                          {formatDate(log.check_in)}
                        </td>
                        <td className="px-6 py-3 font-mono text-xs">
                          {formatTimeIST(log.check_in)}
                          {log.distance_from_office_in !== null && log.distance_from_office_in !== undefined && (
                            <span className={cn("block text-[9px] mt-0.5", log.distance_from_office_in > 500 ? "text-rose-500" : "text-slate-400")}>
                              {Math.round(log.distance_from_office_in)}m from office
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 font-mono text-xs">
                          {log.check_out ? (
                            <>
                              {formatTimeIST(log.check_out)}
                              {log.is_auto_closed && <span className="ml-1 text-[9px] font-black text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">AUTO</span>}
                            </>
                          ) : (
                            <span className="text-amber-500 font-bold">Active</span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          {log.location_drift_km !== null && log.location_drift_km !== undefined ? (
                            <span className={cn("font-bold text-xs", log.location_drift_km > 5 ? "text-rose-600" : "text-slate-500")}>
                              {log.location_drift_km} km
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex flex-wrap gap-1 max-w-[250px]">
                            {(log.flags || []).map((flag, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                                {getFlagLabel(flag)}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by employee name or email..."
                className="input pl-10 h-12 rounded-2xl"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100">
               <div className="flex-1 px-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                 Total Employees: {summaries.length}
               </div>
               <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="w-2 h-2 rounded-full bg-emerald-500" />
                 <span className="text-[10px] font-black text-slate-600">PRESENT</span>
                 <div className="w-2 h-2 rounded-full bg-rose-500 ml-2" />
                 <span className="text-[10px] font-black text-slate-600">ABSENT</span>
               </div>
            </div>
          </div>

          {/* Stats Summary */}
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Present', value: summaries.filter(s => s.history[s.history.length-1]?.status === 'present').length, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Total Absent', value: summaries.filter(s => s.history[s.history.length-1]?.status === 'absent').length, icon: Users, color: 'text-rose-600', bg: 'bg-rose-50' },
                  { label: 'Avg Attendance', value: `${summaries.length > 0 ? Math.round((summaries.filter(s => s.history[s.history.length-1]?.status === 'present').length / summaries.length) * 100) : 0}%`, icon: History, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                  { label: 'Flagged Today', value: flaggedLogs.filter(l => { const d = new Date(ensureUTC(l.check_in)).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); const t = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); return d === t; }).length, icon: ShieldAlert, color: 'text-amber-600', bg: 'bg-amber-50' },
                ].map((stat, i) => (
                  <div key={i} className="glass rounded-2xl p-6 border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", stat.bg)}>
                        <stat.icon className={cn("w-6 h-6", stat.color)} />
                      </div>
                      <div>
                        <p className="text-2xl font-black text-slate-800">{stat.value}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tracker List — with Login/Logout/Map columns */}
              <div className="space-y-4">
                {filteredSummaries.map((emp) => {
                  // Find today's entry (last in history after reverse)
                  const todayEntry = emp.history[emp.history.length - 1];
                  const hasCheckIn = todayEntry?.status === 'present' && todayEntry?.check_in;
                  const mapUrl = todayEntry?.location_in
                    ? `https://www.google.com/maps?q=${todayEntry.location_in.lat},${todayEntry.location_in.lng}`
                    : null;

                  return (
                  <div key={emp.user_id} className="glass rounded-2xl p-5 border border-slate-100 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5 hover:shadow-md transition-shadow group bg-white">
                    {/* Left: Name / Email */}
                    <div className="flex items-center gap-4 min-w-[200px]">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100 text-indigo-600 font-bold text-xl shadow-sm flex-shrink-0">
                        {emp.user_name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-800 leading-tight">{emp.user_name}</h3>
                          {todayEntry?.is_regularized && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100 uppercase">REG</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-medium">{emp.user_email}</p>
                      </div>
                    </div>

                    {/* Centre: Today Login / Logout / Map */}
                    <div className="flex flex-wrap items-center gap-4 flex-1">
                      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100 min-w-[120px]">
                        <LogIn className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <div>
                          <p className="text-[9px] font-black uppercase text-emerald-500 tracking-wider">Login</p>
                          <p className="text-xs font-bold text-slate-800">
                            {hasCheckIn
                              ? new Date(ensureUTC(todayEntry.check_in!)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                              : <span className="text-slate-300">—</span>}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 rounded-xl border border-rose-100 min-w-[120px]">
                        <LogOut className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                        <div>
                          <p className="text-[9px] font-black uppercase text-rose-400 tracking-wider">Logout</p>
                          <p className="text-xs font-bold text-slate-800">
                            {todayEntry?.check_out
                              ? new Date(ensureUTC(todayEntry.check_out)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                              : hasCheckIn ? <span className="text-amber-500 font-bold animate-pulse">Active</span> : <span className="text-slate-300">—</span>}
                          </p>
                        </div>
                      </div>

                      {/* Map Link */}
                      {mapUrl ? (
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-100 transition-colors group/map"
                          title={todayEntry?.address_in || 'View on Google Maps'}
                        >
                          <MapPin className="w-4 h-4 text-indigo-500 group-hover/map:text-indigo-700" />
                          <span className="text-xs font-bold text-indigo-600">Map View</span>
                        </a>
                      ) : hasCheckIn ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 opacity-50" title="No GPS data">
                          <MapPin className="w-4 h-4 text-slate-400" />
                          <span className="text-xs font-bold text-slate-400">No GPS</span>
                        </div>
                      ) : null}
                    </div>

                    {/* Right: Last 5 days bubbles + Calendar link */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 p-2 bg-slate-50/50 rounded-2xl border border-slate-100/50 shadow-inner">
                        {emp.history.map((day, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-1">
                            <span className="text-[8px] font-black text-slate-400 uppercase">
                              {new Date(ensureUTC(day.date)).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })}
                            </span>
                            <div
                              className={cn(
                                "w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-black transition-all hover:scale-110 shadow-md",
                                day.status === 'present'
                                  ? 'bg-emerald-500 text-white shadow-emerald-100'
                                  : 'bg-rose-500 text-white shadow-rose-100'
                              )}
                              title={`${day.status.toUpperCase()} — ${formatDate(day.date)}`}
                            >
                              {day.status === 'present' ? 'P' : 'A'}
                            </div>
                          </div>
                        ))}
                      </div>

                      <Link
                        href={`/admin/employees/detail?id=${emp.user_id}&showAttendance=true`}
                        className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95 flex-shrink-0"
                        title="Full Attendance Calendar"
                      >
                        <Calendar className="w-6 h-6" />
                      </Link>
                    </div>
                  </div>
                  );
                })}
                {filteredSummaries.length === 0 && (
                  <div className="p-20 text-center glass rounded-2xl border border-dashed border-slate-200">
                     <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                     <p className="text-slate-400 font-bold italic">No matching employees found.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        // My Attendance Tab
        <div className="space-y-6 max-w-4xl mx-auto">
          {personalError && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm font-semibold flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              <span>{personalError}</span>
            </div>
          )}

          {geofenceStatus && geofenceStatus.geofence_configured && (
            <div className={cn(
              "rounded-2xl p-4 border flex items-center gap-4 transition-all bg-white",
              geofenceStatus.within_geofence
                ? "bg-emerald-50/50 border-emerald-200 text-emerald-700"
                : "bg-amber-50/50 border-amber-200 text-amber-700"
            )}>
              {geofenceStatus.within_geofence ? (
                <ShieldCheck className="w-8 h-8 text-emerald-500 shrink-0" />
              ) : (
                <ShieldAlert className="w-8 h-8 text-amber-500 shrink-0" />
              )}
              <div className="flex-1">
                <p className="text-sm font-bold">
                  {geofenceStatus.within_geofence ? 'Inside Office Zone' : 'Outside Office Zone'}
                </p>
                <p className="text-xs opacity-75 mt-0.5">
                  {geofenceStatus.distance_meters !== null && (
                    <>You are <strong>{geofenceStatus.distance_meters < 1000 ? `${Math.round(geofenceStatus.distance_meters)}m` : `${(geofenceStatus.distance_meters / 1000).toFixed(1)}km`}</strong> from office{' '}
                    (allowed: {geofenceStatus.radius_meters}m radius)
                    {geofenceStatus.policy === 'strict' && !geofenceStatus.within_geofence && (
                      <> — <strong>Check-in blocked</strong></>
                    )}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="glass rounded-2xl p-8 border border-slate-200 shadow-sm bg-white">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex-1 space-y-4 w-full">
                <div className="flex items-center gap-3 text-indigo-600">
                  <Clock className="w-6 h-6" />
                  <span className="text-xl font-semibold">
                    {currentSession ? 'Currently Logged In' : 'Logged Out'}
                  </span>
                </div>
                
                {currentSession && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Checked in at</p>
                      <p className="text-lg font-bold">{formatDateTime(currentSession.check_in)}</p>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                      <Timer className="w-5 h-5 text-indigo-500 animate-pulse" />
                      <div>
                        <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Duration</p>
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

                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <MapPin className="w-4 h-4 text-indigo-500" />
                  {location ? (
                    <span>Location captured: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
                  ) : (
                    <span>Fetching live location...</span>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {!currentSession ? (
                  <button
                    onClick={() => handlePersonalAction('check-in')}
                    disabled={actionLoading || !location || (geofenceStatus?.policy === 'strict' && geofenceStatus?.geofence_configured && !geofenceStatus?.within_geofence)}
                    className="btn btn-primary w-40 h-40 rounded-full flex flex-col items-center justify-center gap-2 text-md shadow-lg hover:scale-105 transition-transform disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : <LogIn className="w-8 h-8" />}
                    <span>Punch In</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handlePersonalAction('check-out')}
                    disabled={actionLoading || !location || !canCheckout}
                    className={cn(
                      "btn text-white w-40 h-40 rounded-full flex flex-col items-center justify-center gap-2 text-md shadow-lg hover:scale-105 transition-transform disabled:opacity-50",
                      canCheckout ? "bg-red-500 hover:bg-red-650" : "bg-slate-400 cursor-not-allowed"
                    )}
                  >
                    {actionLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : <LogOut className="w-8 h-8" />}
                    <span>{canCheckout ? 'Punch Out' : 'Wait...'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Personal Logs History list */}
          <div className="glass rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-500" />
                My Recent Punch Logs
              </h2>
            </div>
            {personalLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {personalHistory.map((log) => (
                  <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-slate-850">
                        {new Date(ensureUTC(log.check_in)).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-4">
                        <span>Check-in: {formatTimeIST(log.check_in)}</span>
                        {log.check_out && (
                          <span>Check-out: {formatTimeIST(log.check_out)}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      {log.check_out ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">Completed</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-250 animate-pulse">Active Session</span>
                      )}
                    </div>
                  </div>
                ))}
                {personalHistory.length === 0 && (
                  <div className="p-10 text-center text-slate-400 font-medium italic">No attendance history found.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
