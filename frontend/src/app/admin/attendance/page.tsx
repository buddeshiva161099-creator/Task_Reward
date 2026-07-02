'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { Attendance } from '@/types';
import { 
  Search, Calendar, Filter, Users, Download, Loader2, ArrowRight, History, 
  Clock, ShieldAlert, AlertTriangle, AlertCircle, MapPin, LogIn, LogOut, ShieldCheck, Timer, Eye
} from 'lucide-react';
import { cn, ensureUTC, formatDate, formatDateTime, formatTimeIST } from '@/lib/utils';
import { DashboardSkeleton, ListSkeleton } from '@/components/SkeletonLoaders';
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
  flags?: string[];
  is_auto_closed?: boolean;
  location_drift_km?: number | null;
  is_regularized?: boolean;
}

const getShiftDuration = (inStr: string, outStr: string) => {
  try {
    const diff = new Date(ensureUTC(outStr)).getTime() - new Date(ensureUTC(inStr)).getTime();
    if (isNaN(diff) || diff < 0) return '—';
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  } catch (e) {
    return '—';
  }
};

const getActiveDuration = (inStr: string) => {
  try {
    const diff = Date.now() - new Date(ensureUTC(inStr)).getTime();
    if (isNaN(diff) || diff < 0) return '—';
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  } catch (e) {
    return '—';
  }
};

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'absent'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showFlagged, setShowFlagged] = useState(false);
  const [exportYear, setExportYear] = useState<number>(new Date().getFullYear());
  const [exportMonth, setExportMonth] = useState<number>(new Date().getMonth());
  const formatTimeISTSafe = (timeStr?: string) => {
    if (!timeStr) return '—';
    try {
      return new Date(ensureUTC(timeStr)).toLocaleTimeString('en-US', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      });
    } catch (e) {
      return '—';
    }
  };
  const [exportLoading, setExportLoading] = useState<boolean>(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showReportViewer, setShowReportViewer] = useState(false);
  const [viewerData, setViewerData] = useState<any[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerWorkingDays, setViewerWorkingDays] = useState(26);
  const [viewerStartTime, setViewerStartTime] = useState('09:00');
  const [viewerEndTime, setViewerEndTime] = useState('18:00');
  const [viewerHalfDayMin, setViewerHalfDayMin] = useState(4.0);
  const [viewerFullDayMin, setViewerFullDayMin] = useState(8.0);

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

  const handleToggleSelectUser = (userId: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setSelectedUserIds(next);
  };

  const handleToggleSelectAll = () => {
    const allIds = filteredSummaries.map(s => s.user_id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedUserIds.has(id));
    if (allSelected) {
      const next = new Set(selectedUserIds);
      allIds.forEach(id => next.delete(id));
      setSelectedUserIds(next);
    } else {
      const next = new Set(selectedUserIds);
      allIds.forEach(id => next.add(id));
      setSelectedUserIds(next);
    }
  };

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
            console.warn('Silent load-time geolocation check failed:', geoError);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
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
    if (!navigator.geolocation) {
      setPersonalError('Geolocation is not supported by your browser.');
      return;
    }
    setActionLoading(true);
    setPersonalError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc);
        await checkGeofence(loc.lat, loc.lng);
        try {
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
            lat: loc.lat,
            lng: loc.lng,
            remarks: type === 'check-in' ? 'Regular Check-in' : 'Regular Check-out',
            device_fingerprint: deviceFingerprint,
          });
          
          if (type === 'check-in') {
            setCurrentSession(res.data);
          } else {
            setCurrentSession(null);
          }
          fetchPersonalAttendance();
          window.dispatchEvent(new Event('attendanceUpdated'));
        } catch (err: any) {
          setPersonalError(err.response?.data?.detail || `Failed to ${type}.`);
        } finally {
          setActionLoading(false);
        }
      },
      (geoError) => {
        console.error('Location error:', geoError);
        setActionLoading(false);
        switch (geoError.code) {
          case geoError.PERMISSION_DENIED:
            setPersonalError('Location permission denied. Please allow location access in your browser settings to use attendance.');
            break;
          case geoError.POSITION_UNAVAILABLE:
            setPersonalError('Location information is unavailable.');
            break;
          case geoError.TIMEOUT:
            setPersonalError('The request to get user location timed out.');
            break;
          default:
            setPersonalError('An unknown error occurred while retrieving location.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const flaggedLogs = allLogs.filter(log => (log.flags && log.flags.length > 0) || log.is_auto_closed);

  const filteredSummaries = summaries.filter(s => {
    const matchesSearch = (s.user_name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (s.user_email || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    const todayStatus = s.history[s.history.length - 1]?.status || 'absent';
    if (statusFilter === 'present' && todayStatus !== 'present') return false;
    if (statusFilter === 'absent' && todayStatus !== 'absent') return false;

    if (roleFilter !== 'all') {
      const role = (s as any).role || '';
      if (role !== roleFilter) return false;
    }
    return true;
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

  const handleExport = () => {
    try {
      const csvRows = [];
      csvRows.push(['Employee Name', 'Email', 'Role', 'Status', 'Check-in Time', 'Check-out Time'].join(','));
      
      for (const emp of filteredSummaries) {
        const todayEntry = emp.history[emp.history.length - 1];
        const hasCheckIn = todayEntry?.status === 'present' && todayEntry?.check_in;
        const checkInTime = hasCheckIn
          ? new Date(ensureUTC(todayEntry.check_in!)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
          : '—';
        const checkOutTime = todayEntry?.check_out
          ? new Date(ensureUTC(todayEntry.check_out)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
          : todayEntry?.status === 'present' ? 'Active' : '—';

        const row = [
          `"${emp.user_name || ''}"`,
          `"${emp.user_email || ''}"`,
          `"${(emp as any).role || ''}"`,
          `"${todayEntry?.status || 'absent'}"`,
          `"${checkInTime}"`,
          `"${checkOutTime}"`
        ];
        csvRows.push(row.join(','));
      }
      
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Team_Attendance_Report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export report:', err);
    }
  };

  const formatMonthYearShort = (year: number, month: number) => {
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${shortMonths[month]}-${String(year).slice(-2)}`;
  };

  const formatExportedDate = () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  };

  const formatDateDMY = (year: number, month: number, day: number) => {
    return `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
  };

  const formatTime12h = (timeStr: string | null | undefined) => {
    if (!timeStr) return '';
    try {
      const d = new Date(ensureUTC(timeStr));
      return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      });
    } catch (e) {
      return '';
    }
  };

  const handleExportMonthlyExcel = async () => {
    const idsToExport = selectedUserIds.size > 0 
      ? selectedUserIds 
      : new Set(filteredSummaries.map(s => s.user_id));

    if (idsToExport.size === 0) {
      alert('Please select at least one employee or clear filters.');
      return;
    }

    setExportLoading(true);
    try {
      const res = await api.get(`/attendance/monthly-summary?year=${exportYear}&month=${exportMonth}`);
      let allMonthlySummaries = [];
      let work_days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      let work_start_time = '09:00';
      let halfDayMin = 4.0;
      let fullDayMin = 8.0;
      if (res.data) {
        if (Array.isArray(res.data)) {
          allMonthlySummaries = res.data;
        } else {
          allMonthlySummaries = res.data.summaries || [];
          work_days = res.data.work_days || work_days;
          work_start_time = res.data.work_start_time || work_start_time;
          halfDayMin = res.data.half_day_min_hours !== undefined ? res.data.half_day_min_hours : 4.0;
          fullDayMin = res.data.full_day_min_hours !== undefined ? res.data.full_day_min_hours : 8.0;
        }
      }
      const exportList = allMonthlySummaries.filter((s: any) => idsToExport.has(s.user_id));
      
      if (exportList.length === 0) {
        alert('No attendance data available to export for selected employees in this month.');
        return;
      }
      
      const csvRows = [];
      csvRows.push([]);
      csvRows.push([]);
      csvRows.push(['', '', '', 'Monthly Attendance Matrix Report'].join(','));
      
      const monthYearShort = formatMonthYearShort(exportYear, exportMonth);
      csvRows.push(['', '', '', 'Month/Year:', monthYearShort].join(','));
      
      const exportedDateStr = formatExportedDate();
      csvRows.push(['', '', '', 'Exported On:', exportedDateStr].join(','));
      csvRows.push([]);
      
      const daysInMonth = new Date(exportYear, exportMonth + 1, 0).getDate();
      
      const dateHeaders = ['', '', ''];
      for (let d = 1; d <= daysInMonth; d++) {
        dateHeaders.push(`"${formatDateDMY(exportYear, exportMonth, d)}"`);
        dateHeaders.push('');
      }
      csvRows.push(dateHeaders.join(','));
      
      const colHeaders = ['Employee Name', 'Email', 'Role'];
      for (let d = 1; d <= daysInMonth; d++) {
        colHeaders.push('In');
        colHeaders.push('Out');
      }
      colHeaders.push('Total Working Days', 'Total Present', 'Total Absent', 'Late', 'Sanctioned Leaves', 'Unsanctioned Leaves');
      csvRows.push(colHeaders.join(','));
      
      const workDayNames = new Set((work_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']).map((d: string) => d.toLowerCase()));
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      
      for (const emp of exportList) {
        const row = [
          `"${emp.user_name || ''}"`,
          `"${emp.user_email || ''}"`,
          `"${emp.role || ''}"`
        ];
        
        let presentCount = 0;
        let absentCount = 0;
        let sanctionedLeaves = 0;
        let unsanctionedLeaves = 0;
        let lateCount = 0;
        let totalWorkingDays = 0;
        
        for (let d = 1; d <= daysInMonth; d++) {
          const entry = emp.history.find((h: any) => {
            if (!h.date) return false;
            const hDate = new Date(ensureUTC(h.date));
            return hDate.getDate() === d;
          });
          const status = entry?.status || 'absent';
          const isReg = entry?.is_regularized;
          
          const date = new Date(exportYear, exportMonth, d);
          const weekdayStr = dayNames[date.getDay()];
          const isWorkDay = workDayNames.has(weekdayStr);
          
          if (isWorkDay && status !== 'holiday') {
            totalWorkingDays++;
          }
          
          let checkInVal = '';
          let checkOutVal = '';
          
          let durationHours = 0.0;
          if (entry?.check_in && entry?.check_out) {
            const diff = new Date(ensureUTC(entry.check_out)).getTime() - new Date(ensureUTC(entry.check_in)).getTime();
            durationHours = diff / (1000 * 60 * 60);
          }

          if (status === 'holiday') {
            checkInVal = 'Holiday';
            checkOutVal = 'Holiday';
          } else if (isReg) {
            checkInVal = entry?.check_in ? formatTime12h(entry.check_in) : 'Reg';
            checkOutVal = entry?.check_out ? formatTime12h(entry.check_out) : 'Reg';
            presentCount += 1.0;
          } else if (status === 'leave') {
            checkInVal = 'Leave';
            checkOutVal = 'Leave';
            sanctionedLeaves += 1.0;
          } else if (!isWorkDay) {
            checkInVal = 'Off';
            checkOutVal = 'Off';
          } else if (status === 'half_day_absent' || (entry?.check_in && entry?.check_out && durationHours < halfDayMin)) {
            checkInVal = entry?.check_in ? formatTime12h(entry.check_in) : 'HD-A';
            checkOutVal = entry?.check_out ? formatTime12h(entry.check_out) : 'HD-A';
            unsanctionedLeaves += 1.0;
            absentCount += 1.0;
          } else if (status === 'half_day_present' || (entry?.check_in && entry?.check_out && durationHours < fullDayMin)) {
            checkInVal = entry?.check_in ? formatTime12h(entry.check_in) : 'HD-P';
            checkOutVal = entry?.check_out ? formatTime12h(entry.check_out) : 'HD-P';
            presentCount += 0.5;
            unsanctionedLeaves += 0.5;
            absentCount += 0.5;
          } else if (status === 'absent' || status === 'no_data') {
            checkInVal = 'Absent';
            checkOutVal = 'Absent';
            unsanctionedLeaves += 1.0;
            absentCount += 1.0;
          } else {
            presentCount += 1.0;
            checkInVal = entry?.check_in ? formatTime12h(entry.check_in) : '';
            checkOutVal = entry?.check_out ? formatTime12h(entry.check_out) : (entry?.check_in ? 'Active' : '');
            
            const isLate = status.includes('late');
            if (isLate) {
              lateCount++;
            }
          }
          
          row.push(`"${checkInVal}"`);
          row.push(`"${checkOutVal}"`);
        }
        
        const totalAbsent = sanctionedLeaves + unsanctionedLeaves;
        
        row.push(totalWorkingDays.toString());
        row.push(presentCount.toString());
        row.push(totalAbsent.toString());
        row.push(lateCount.toString());
        row.push(sanctionedLeaves.toString());
        row.push(unsanctionedLeaves.toString());
        csvRows.push(row.join(','));
      }
      
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Monthly_Attendance_Report_${exportYear}_${exportMonth + 1}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export monthly report:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportMonthlyPDF = async () => {
    const idsToExport = selectedUserIds.size > 0 
      ? selectedUserIds 
      : new Set(filteredSummaries.map(s => s.user_id));

    if (idsToExport.size === 0) {
      alert('Please select at least one employee or clear filters.');
      return;
    }

    setExportLoading(true);
    try {
      const res = await api.get(`/attendance/monthly-summary?year=${exportYear}&month=${exportMonth}`);
      let allMonthlySummaries = [];
      let work_days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      let work_start_time = '09:00';
      let halfDayMin = 4.0;
      let fullDayMin = 8.0;
      if (res.data) {
        if (Array.isArray(res.data)) {
          allMonthlySummaries = res.data;
        } else {
          allMonthlySummaries = res.data.summaries || [];
          work_days = res.data.work_days || work_days;
          work_start_time = res.data.work_start_time || work_start_time;
          halfDayMin = res.data.half_day_min_hours !== undefined ? res.data.half_day_min_hours : 4.0;
          fullDayMin = res.data.full_day_min_hours !== undefined ? res.data.full_day_min_hours : 8.0;
        }
      }
      const exportList = allMonthlySummaries.filter((s: any) => idsToExport.has(s.user_id));
      
      if (exportList.length === 0) {
        alert('No attendance data available to export for selected employees in this month.');
        return;
      }

      const daysInMonth = new Date(exportYear, exportMonth + 1, 0).getDate();
      const monthName = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][exportMonth];
      const exportedDateStr = formatExportedDate();

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow popups to generate the PDF report.');
        return;
      }

      const workDayNames = new Set((work_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']).map((d: string) => d.toLowerCase()));
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      const html = `
        <html>
          <head>
            <title>Monthly Attendance Report - ${monthName} ${exportYear}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #334155; }
              .header-box { width: 300px; margin: 0 auto 30px auto; border: 1px solid #cbd5e1; border-collapse: collapse; text-align: center; }
              .header-box td { border: 1px solid #cbd5e1; padding: 6px; font-size: 10px; font-weight: bold; }
              .header-title { background-color: #f8fafc; font-size: 12px !important; color: #1e1b4b; }
              table.main-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 7px; }
              table.main-table th, table.main-table td { border: 1px solid #cbd5e1; padding: 3px 4px; text-align: center; }
              table.main-table th { background-color: #f1f5f9; color: #334155; font-weight: bold; }
              .emp-info { text-align: left; font-weight: bold; background-color: #f8fafc; font-size: 8px; min-width: 80px; }
              .summary-col { background-color: #f1f5f9; font-weight: bold; font-size: 7px; }
              .status-p { background-color: #ecfdf5; color: #166534; font-weight: 505; }
              .status-a { background-color: #fef2f2; color: #991b1b; font-weight: 505; }
              .status-lv { background-color: #fdf2f8; color: #9d174d; font-weight: 505; }
              .status-h { background-color: #faf5ff; color: #5b21b6; font-weight: 505; }
              .status-r { background-color: #e0e7ff; color: #1e40af; font-weight: 505; }
              .status-w { background-color: #f8fafc; color: #64748b; }
              .status-hda { background-color: #fdf4ff; color: #86198f; font-weight: 505; }
              .status-hdp { background-color: #ecfeff; color: #155e75; font-weight: 505; }
              @media print {
                body { padding: 0; }
                @page { size: landscape; margin: 0.5cm; }
              }
            </style>
          </head>
          <body>
            <table class="header-box">
              <tr>
                <td colspan="2" class="header-title">Monthly Attendance Matrix Report</td>
              </tr>
              <tr>
                <td>Month/Year:</td>
                <td>${monthName.slice(0, 3)}-${String(exportYear).slice(-2)}</td>
              </tr>
              <tr>
                <td>Exported On:</td>
                <td>${exportedDateStr}</td>
              </tr>
            </table>

            <table class="main-table">
              <thead>
                <tr>
                  <th rowspan="2">Employee Name</th>
                  <th rowspan="2">Role</th>
                  ${Array.from({ length: daysInMonth }).map((_, i) => `<th colspan="2">${formatDateDMY(exportYear, exportMonth, i + 1)}</th>`).join('')}
                  <th colspan="6" class="summary-col">Totals</th>
                </tr>
                <tr>
                  ${Array.from({ length: daysInMonth }).map(() => `<th>In</th><th>Out</th>`).join('')}
                  <th class="summary-col">Total Working Days</th>
                  <th class="summary-col">Total Present</th>
                  <th class="summary-col">Total Absent</th>
                  <th class="summary-col">Late</th>
                  <th class="summary-col">Sanctioned Leaves</th>
                  <th class="summary-col">Unsanctioned Leaves</th>
                </tr>
              </thead>
              <tbody>
                ${exportList.map(emp => {
                  let present = 0.0, absent = 0.0, leaves = 0.0, late = 0, working = 0;
                  
                  const cells = Array.from({ length: daysInMonth }).map((_, idx) => {
                    const d = idx + 1;
                    const entry = emp.history.find((h: any) => {
                      if (!h.date) return false;
                      const hDate = new Date(ensureUTC(h.date));
                      return hDate.getDate() === d;
                    });
                    const status = entry?.status || 'absent';
                    const isReg = entry?.is_regularized;
                    
                    const date = new Date(exportYear, exportMonth, d);
                    const weekdayStr = dayNames[date.getDay()];
                    const isWorkDay = workDayNames.has(weekdayStr);
                    
                    if (isWorkDay && status !== 'holiday') {
                      working++;
                    }
                    
                    let inVal = '';
                    let outVal = '';
                    let classStr = '';
                    
                    let durationHours = 0.0;
                    if (entry?.check_in && entry?.check_out) {
                      const diff = new Date(ensureUTC(entry.check_out)).getTime() - new Date(ensureUTC(entry.check_in)).getTime();
                      durationHours = diff / (1000 * 60 * 60);
                    }

                    if (status === 'holiday') {
                      classStr = 'status-h';
                      inVal = 'Hol';
                      outVal = 'Hol';
                    } else if (isReg) {
                      classStr = 'status-r';
                      inVal = entry?.check_in ? formatTime12h(entry.check_in) : 'Reg';
                      outVal = entry?.check_out ? formatTime12h(entry.check_out) : 'Reg';
                      present += 1.0;
                    } else if (status === 'leave') {
                      classStr = 'status-lv';
                      inVal = 'Lv';
                      outVal = 'Lv';
                      leaves += 1.0;
                    } else if (!isWorkDay) {
                      classStr = 'status-w';
                      inVal = 'Off';
                      outVal = 'Off';
                    } else if (status === 'half_day_absent' || (entry?.check_in && entry?.check_out && durationHours < halfDayMin)) {
                      classStr = 'status-hda';
                      inVal = entry?.check_in ? formatTime12h(entry.check_in) : 'HD-A';
                      outVal = entry?.check_out ? formatTime12h(entry.check_out) : 'HD-A';
                      absent += 1.0;
                    } else if (status === 'half_day_present' || (entry?.check_in && entry?.check_out && durationHours < fullDayMin)) {
                      classStr = 'status-hdp';
                      inVal = entry?.check_in ? formatTime12h(entry.check_in) : 'HD-P';
                      outVal = entry?.check_out ? formatTime12h(entry.check_out) : 'HD-P';
                      present += 0.5;
                      absent += 0.5;
                    } else if (status === 'absent' || status === 'no_data') {
                      classStr = 'status-a';
                      inVal = 'Abs';
                      outVal = 'Abs';
                      absent += 1.0;
                    } else {
                      present += 1.0;
                      classStr = 'status-p';
                      inVal = entry?.check_in ? formatTime12h(entry.check_in) : '';
                      outVal = entry?.check_out ? formatTime12h(entry.check_out) : (entry?.check_in ? 'Act' : '');
                      
                      const isLate = status.includes('late');
                      if (isLate) {
                        late++;
                      }
                    }
                    
                    return `<td class="${classStr}">${inVal}</td><td class="${classStr}">${outVal}</td>`;
                  }).join('');
                  
                  const totalAbs = leaves + absent;
                  
                  return `
                    <tr>
                      <td class="emp-info">${emp.user_name}</td>
                      <td>${emp.role || 'employee'}</td>
                      ${cells}
                      <td class="summary-col">${working}</td>
                      <td class="summary-col">${present}</td>
                      <td class="summary-col">${totalAbs}</td>
                      <td class="summary-col">${late}</td>
                      <td class="summary-col">${leaves}</td>
                      <td class="summary-col">${absent}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              }
            </script>
          </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (err) {
      console.error('Failed to export PDF report:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const handleViewReport = async () => {
    setViewerLoading(true);
    setShowReportViewer(true);
    try {
      const res = await api.get(`/attendance/monthly-summary?year=${exportYear}&month=${exportMonth}`);
      let summariesList = [];
      let wDays = 26;
      let wStart = '09:00';
      let wEnd = '18:00';
      let halfDayMin = 4.0;
      let fullDayMin = 8.0;
      if (res.data) {
        if (Array.isArray(res.data)) {
          summariesList = res.data;
        } else {
          summariesList = res.data.summaries || [];
          wDays = res.data.work_days?.length || 26;
          wStart = res.data.work_start_time || '09:00';
          wEnd = res.data.work_end_time || '18:00';
          halfDayMin = res.data.half_day_min_hours !== undefined ? res.data.half_day_min_hours : 4.0;
          fullDayMin = res.data.full_day_min_hours !== undefined ? res.data.full_day_min_hours : 8.0;
        }
      }
      const idsToExport = selectedUserIds.size > 0 
        ? selectedUserIds 
        : new Set(filteredSummaries.map(s => s.user_id));
      const filtered = summariesList.filter((s: any) => idsToExport.has(s.user_id));
      setViewerData(filtered);
      setViewerWorkingDays(wDays);
      setViewerStartTime(wStart);
      setViewerEndTime(wEnd);
      setViewerHalfDayMin(halfDayMin);
      setViewerFullDayMin(fullDayMin);
    } catch (err) {
      console.error('Failed to load report for viewing:', err);
    } finally {
      setViewerLoading(false);
    }
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
          {/* Action & Export Control Panel */}
          <div className="glass rounded-3xl p-6 border border-slate-150/70 bg-gradient-to-br from-indigo-50/20 via-white to-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shadow-md shadow-indigo-100/50">
                <Download className="w-6 h-6 text-indigo-650" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Report & Export Center</h2>
                <p className="text-xs text-slate-400 font-medium">Export daily or complete monthly spreadsheets and PDF charts</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* Daily Export */}
              <button 
                onClick={handleExport}
                className="btn btn-secondary flex items-center gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm h-12 px-4 rounded-xl font-bold text-sm"
                title="Export today's logs for filtered employees"
              >
                <Download className="w-4 h-4" />
                Export Today's CSV
              </button>

              {/* Monthly Selector & Export Controls */}
              <div className="flex items-center gap-4 bg-slate-50 p-2.5 rounded-2xl border border-slate-200/60 shadow-inner flex-wrap">
                {/* Year Selection */}
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest pl-1">Year</span>
                  <select
                    className="select select-sm h-10 w-24 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    value={exportYear}
                    onChange={(e) => setExportYear(Number(e.target.value))}
                  >
                    {[2024, 2025, 2026, 2027].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                {/* Month Selection */}
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest pl-1">Month</span>
                  <select
                    className="select select-sm h-10 w-32 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    value={exportMonth}
                    onChange={(e) => setExportMonth(Number(e.target.value))}
                  >
                    {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                      <option key={m} value={i}>{m}</option>
                    ))}
                  </select>
                </div>
                {/* Employee Selection */}
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest pl-1">Employee</span>
                  <select
                    className="select select-sm h-10 w-48 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    value={selectedUserIds.size === 1 ? Array.from(selectedUserIds)[0] : (selectedUserIds.size === 0 ? 'all' : 'multiple')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'all') {
                        setSelectedUserIds(new Set());
                      } else if (val !== 'multiple') {
                        setSelectedUserIds(new Set([val]));
                      }
                    }}
                  >
                    <option value="all">All Employees</option>
                    {selectedUserIds.size > 1 && (
                      <option value="multiple" disabled>Multiple Selected ({selectedUserIds.size})</option>
                    )}
                    {summaries.map(emp => (
                      <option key={emp.user_id} value={emp.user_id}>{emp.user_name}</option>
                    ))}
                  </select>
                </div>

                {/* Export Options */}
                <div className="flex items-end gap-2 pt-4">
                  {/* View Report */}
                  <button 
                    onClick={handleViewReport}
                    className="btn btn-secondary flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-bold border-slate-200 text-slate-600 hover:bg-slate-100 shadow-sm animate-none"
                    title="View monthly report summary on screen"
                  >
                    <Eye className="w-4 h-4 text-slate-500" />
                    View
                  </button>

                  {/* Excel Export */}
                  <button 
                    onClick={handleExportMonthlyExcel}
                    disabled={exportLoading}
                    className={cn(
                      "btn btn-primary flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-150/40",
                      exportLoading && "opacity-50 cursor-wait"
                    )}
                    title="Export monthly attendance as Excel/CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Excel
                  </button>

                  {/* PDF Export */}
                  <button 
                    onClick={handleExportMonthlyPDF}
                    disabled={exportLoading}
                    className={cn(
                      "btn bg-rose-600 hover:bg-rose-750 text-white flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-bold shadow-md shadow-rose-150/40 border-0",
                      exportLoading && "opacity-50 cursor-wait"
                    )}
                    title="Export monthly attendance as PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PDF
                  </button>
                </div>
              </div>

              {/* Show Flagged Button if present */}
              {flaggedLogs.length > 0 && (
                <button
                  onClick={() => setShowFlagged(!showFlagged)}
                  className={cn(
                    "btn flex items-center gap-2 h-12 px-4 rounded-xl font-bold text-sm transition-all",
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
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
            <div className="flex items-center justify-start lg:justify-end gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200/50 w-fit lg:w-full lg:max-w-md lg:ml-auto">
              <button
                onClick={() => setStatusFilter('all')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all flex-1 text-center",
                  statusFilter === 'all'
                    ? "bg-white text-indigo-650 shadow-sm border border-slate-100"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                All ({summaries.length})
              </button>
              <button
                onClick={() => setStatusFilter('present')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 flex-1",
                  statusFilter === 'present'
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-100"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <div className={cn("w-1.5 h-1.5 rounded-full bg-emerald-500", statusFilter === 'present' && "bg-white")} />
                Present ({summaries.filter(s => s.history[s.history.length-1]?.status === 'present').length})
              </button>
              <button
                onClick={() => setStatusFilter('absent')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 flex-1",
                  statusFilter === 'absent'
                    ? "bg-rose-500 text-white shadow-md shadow-rose-100"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <div className={cn("w-1.5 h-1.5 rounded-full bg-rose-500", statusFilter === 'absent' && "bg-white")} />
                Absent ({summaries.filter(s => s.history[s.history.length-1]?.status === 'absent').length})
              </button>
            </div>
          </div>

          {/* Selection Roster Bar */}
          <div className="flex items-center justify-between bg-indigo-50/40 px-5 py-3 rounded-2xl border border-indigo-100/50">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filteredSummaries.length > 0 && filteredSummaries.every(s => selectedUserIds.has(s.user_id))}
                onChange={handleToggleSelectAll}
                className="w-4.5 h-4.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-indigo-900">Select All ({filteredSummaries.length} Filtered)</span>
            </label>
            <div className="text-xs font-bold text-slate-500">
              {selectedUserIds.size > 0 ? (
                <span className="text-indigo-600 font-extrabold">{selectedUserIds.size} Selected</span>
              ) : (
                <span>No Employees Selected (Exports Complete Roster)</span>
              )}
            </div>
          </div>

          {/* Role Filters */}
          <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-top-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2">Filter Role:</span>
            {[
              { id: 'all', label: 'All Roles', count: summaries.length },
              { id: 'admin', label: 'Admin', count: summaries.filter(s => (s as any).role === 'admin').length },
              { id: 'hr_manager', label: 'HR Manager', count: summaries.filter(s => (s as any).role === 'hr_manager').length },
              { id: 'assistant_hr_manager', label: 'Asst HR Manager', count: summaries.filter(s => (s as any).role === 'assistant_hr_manager').length },
              { id: 'manager', label: 'Manager', count: summaries.filter(s => (s as any).role === 'manager').length },
              { id: 'assistant_manager', label: 'Asst Manager', count: summaries.filter(s => (s as any).role === 'assistant_manager').length },
              { id: 'employee', label: 'Employee', count: summaries.filter(s => (s as any).role === 'employee').length },
            ].map((role) => (
              <button
                key={role.id}
                onClick={() => setRoleFilter(role.id)}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all border shadow-sm",
                  roleFilter === role.id
                    ? "bg-indigo-600 border-indigo-700 text-white shadow-indigo-150"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200/60 text-slate-600"
                )}
              >
                {role.label} <span className={cn(
                  "ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-black shadow-inner border",
                  roleFilter === role.id
                    ? "bg-indigo-700 text-indigo-100 border-indigo-800"
                    : "bg-white text-slate-500 border-slate-100"
                )}>{role.count}</span>
              </button>
            ))}
          </div>

          {/* Stats Summary */}
          {loading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="glass rounded-2xl p-6 border border-slate-100 shadow-sm h-24 animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-100" />
                      <div className="flex-1 space-y-2">
                        <div className="h-6 bg-slate-100 rounded w-1/2" />
                        <div className="h-3 bg-slate-50 rounded w-3/4" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <ListSkeleton count={5} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { 
                    label: 'Total Present', 
                    value: summaries.filter(s => s.history[s.history.length-1]?.status === 'present').length, 
                    icon: Users, 
                    gradient: 'from-emerald-50 to-teal-50/30 border-emerald-100/60', 
                    color: 'text-emerald-600', 
                    glow: 'shadow-emerald-100/30 hover:shadow-emerald-200/40' 
                  },
                  { 
                    label: 'Total Absent', 
                    value: summaries.filter(s => s.history[s.history.length-1]?.status === 'absent').length, 
                    icon: Users, 
                    gradient: 'from-rose-50 to-orange-50/30 border-rose-100/60', 
                    color: 'text-rose-600', 
                    glow: 'shadow-rose-100/30 hover:shadow-rose-200/40' 
                  },
                  { 
                    label: 'Avg Attendance', 
                    value: `${summaries.length > 0 ? Math.round((summaries.filter(s => s.history[s.history.length-1]?.status === 'present').length / summaries.length) * 100) : 0}%`, 
                    icon: History, 
                    gradient: 'from-indigo-50 to-violet-50/30 border-indigo-100/60', 
                    color: 'text-indigo-600', 
                    glow: 'shadow-indigo-100/30 hover:shadow-indigo-200/40' 
                  },
                  { 
                    label: 'Flagged Today', 
                    value: flaggedLogs.filter(l => { const d = new Date(ensureUTC(l.check_in)).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); const t = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); return d === t; }).length, 
                    icon: ShieldAlert, 
                    gradient: 'from-amber-50 to-yellow-50/30 border-amber-100/60', 
                    color: 'text-amber-600', 
                    glow: 'shadow-amber-100/30 hover:shadow-amber-200/40' 
                  },
                ].map((stat, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "bg-gradient-to-br rounded-2xl p-6 border shadow-sm transition-all duration-350 hover:-translate-y-1 cursor-default",
                      stat.gradient,
                      stat.glow
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white shadow-sm border border-slate-100/60">
                        <stat.icon className={cn("w-6 h-6", stat.color)} />
                      </div>
                      <div>
                        <p className="text-2xl font-black text-slate-800 leading-tight">{stat.value}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{stat.label}</p>
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

                  const totalDays = emp.history.length;
                  const presentDays = emp.history.filter(h => h.status === 'present').length;
                  const consistency = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
                  return (
                    <div key={emp.user_id} className="glass rounded-2xl p-5 border border-slate-100 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5 hover:shadow-md transition-shadow group bg-white">
                      {/* Left: Name / Email */}
                      <div className="flex items-center gap-4 min-w-[200px]">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.has(emp.user_id)}
                          onChange={() => handleToggleSelectUser(emp.user_id)}
                          className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer flex-shrink-0"
                        />
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
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className={cn(
                              "text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border tracking-wide uppercase",
                              consistency >= 80 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                                : consistency >= 50
                                ? "bg-amber-50 text-amber-700 border-amber-100"
                                : "bg-rose-50 text-rose-700 border-rose-100"
                            )}>
                              🔥 {consistency}% Consistency
                            </span>
                            {emp.history.length >= 5 && emp.history.every(h => h.status === 'present') && (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-indigo-650 text-white shadow-sm shadow-indigo-150 tracking-wide uppercase flex items-center gap-0.5 animate-bounce">
                                ⭐ 5-Day Streak
                              </span>
                            )}
                          </div>
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

                      {/* Shift Work Hours Duration */}
                      {hasCheckIn && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50/50 rounded-xl border border-indigo-100 min-w-[120px]">
                          <Timer className="w-3.5 h-3.5 text-indigo-650 flex-shrink-0" />
                          <div>
                            <p className="text-[9px] font-black uppercase text-indigo-500 tracking-wider">Duration</p>
                            <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                              {todayEntry.check_out 
                                ? getShiftDuration(todayEntry.check_in!, todayEntry.check_out)
                                : getActiveDuration(todayEntry.check_in!)}
                              {!todayEntry.check_out && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                              )}
                            </p>
                          </div>
                        </div>
                      )}

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

                      {/* Security warnings & Auto-Close alert badges */}
                      {todayEntry?.is_auto_closed && (
                        <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-black">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Auto-Closed
                        </span>
                      )}
                      {(todayEntry?.flags || []).map((flag: string, idx: number) => (
                        <span key={idx} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-black">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> {getFlagLabel(flag)}
                        </span>
                      ))}
                    </div>

                    {/* Right: Last 5 days bubbles + Calendar link */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 p-2 bg-slate-50/50 rounded-2xl border border-slate-100/50 shadow-inner">
                        {emp.history.map((day, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-1">
                            <span className="text-[8px] font-black text-slate-400 uppercase">
                              {new Date(ensureUTC(day.date)).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })}
                            </span>
                            <div className="relative group/day">
                              <div
                                className={cn(
                                  "w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-black transition-all hover:scale-110 shadow-md cursor-help",
                                  day.status === 'present'
                                    ? 'bg-emerald-500 text-white shadow-emerald-100'
                                    : 'bg-rose-500 text-white shadow-rose-100'
                                )}
                              >
                                {day.status === 'present' ? 'P' : 'A'}
                              </div>
                              {/* Custom Interactive Tooltip */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-48 hidden group-hover/day:flex flex-col bg-slate-900 text-white rounded-xl p-3 text-[10px] font-bold shadow-2xl z-20 pointer-events-none transition-all border border-slate-700/35 animate-in fade-in zoom-in-95 duration-150">
                                <p className="font-extrabold text-indigo-300 border-b border-slate-700/50 pb-1 mb-1 whitespace-nowrap text-center">
                                  {new Date(ensureUTC(day.date)).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}
                                </p>
                                <p className="flex justify-between mt-1">
                                  <span className="text-slate-400">Status:</span>
                                  <span className={cn(day.status === 'present' ? "text-emerald-400" : "text-rose-400")}>
                                    {day.status.toUpperCase()}
                                  </span>
                                </p>
                                {day.status === 'present' && (
                                  <>
                                    <p className="flex justify-between mt-1">
                                      <span className="text-slate-400">Login:</span>
                                      <span className="font-mono text-slate-100">{day.check_in ? formatTimeIST(day.check_in) : '—'}</span>
                                    </p>
                                    <p className="flex justify-between mt-1">
                                      <span className="text-slate-400">Logout:</span>
                                      <span className="font-mono text-slate-100">{day.check_out ? formatTimeIST(day.check_out) : 'Active'}</span>
                                    </p>
                                  </>
                                )}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45 border-r border-b border-slate-700/35" />
                              </div>
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

              <div className="shrink-0 relative">
                {currentSession && !currentSession.check_out && canCheckout && (
                  <span className="absolute inset-0 rounded-full bg-red-400/35 animate-ping duration-1000 scale-105 pointer-events-none" />
                )}
                {!currentSession ? (
                  <button
                    onClick={() => handlePersonalAction('check-in')}
                    disabled={actionLoading || !location || (geofenceStatus?.policy === 'strict' && geofenceStatus?.geofence_configured && !geofenceStatus?.within_geofence)}
                    className="btn btn-primary w-40 h-40 rounded-full flex flex-col items-center justify-center gap-2 text-md shadow-lg hover:scale-105 transition-transform disabled:opacity-50 relative z-10"
                  >
                    {actionLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : <LogIn className="w-8 h-8" />}
                    <span>Punch In</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handlePersonalAction('check-out')}
                    disabled={actionLoading || !location || !canCheckout}
                    className={cn(
                      "btn text-white w-40 h-40 rounded-full flex flex-col items-center justify-center gap-2 text-md shadow-lg hover:scale-105 transition-transform disabled:opacity-50 relative z-10",
                      canCheckout ? "bg-red-500 hover:bg-red-600 shadow-red-200/50" : "bg-slate-400 cursor-not-allowed"
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
              <ListSkeleton count={5} />
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
      {showReportViewer && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-6xl w-full border border-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-white border-b border-indigo-100/60 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-indigo-650" />
                  Monthly Attendance Summary Matrix
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Viewing period: {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][exportMonth]} {exportYear}
                </p>
              </div>
              <button 
                onClick={() => setShowReportViewer(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center shadow-sm border border-slate-200/50 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-auto flex-1">
              {viewerLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                  <p className="text-sm font-semibold text-slate-500">Compiling monthly stats...</p>
                </div>
              ) : viewerData.length === 0 ? (
                <div className="py-12 text-center text-slate-450 italic">No attendance data compiled for selection.</div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Modal Legend */}
                  <div className="p-3 bg-slate-50 border border-slate-150 rounded-2xl flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold text-slate-550 justify-center">
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-emerald-100 text-emerald-850 border border-emerald-255 flex items-center justify-center font-black">P</span> Present</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-amber-100 text-amber-850 border border-amber-255 flex items-center justify-center font-black">L</span> Late Login</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-orange-100 text-orange-850 border border-orange-255 flex items-center justify-center font-black">E</span> Early Checkout</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-orange-100 text-orange-850 border border-orange-255 flex items-center justify-center font-black">L/E</span> Late & Early</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-cyan-100 text-cyan-855 border border-cyan-255 flex items-center justify-center font-black">HD-P</span> Half Day Present</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-fuchsia-100 text-fuchsia-850 border border-fuchsia-255 flex items-center justify-center font-black">HD-A</span> Half Day Absent</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-rose-100 text-rose-850 border border-rose-255 flex items-center justify-center font-black">A</span> Absent</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-pink-100 text-pink-850 border border-pink-255 flex items-center justify-center font-black">Lv</span> Leave</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-indigo-100 text-indigo-850 border border-indigo-255 flex items-center justify-center font-black">R</span> Regularized</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-violet-100 text-violet-850 border border-violet-255 flex items-center justify-center font-black">H</span> Holiday</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-slate-50 text-slate-450 border border-slate-200 flex items-center justify-center font-black">W</span> Weekend</span>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-2xl max-w-full">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
                          <th className="sticky left-0 bg-slate-50 z-20 p-4 border-r border-slate-200 min-w-[180px]">Employee Info</th>
                          {Array.from({ length: new Date(exportYear, exportMonth + 1, 0).getDate() }).map((_, i) => (
                            <th key={i + 1} className="p-1 text-center text-[10px] min-w-[36px]">{i + 1}</th>
                          ))}
                          <th className="p-4 text-center min-w-[80px]">Working</th>
                          <th className="p-4 text-center min-w-[80px]">Present</th>
                          <th className="p-4 text-center min-w-[80px]">Absent</th>
                          <th className="p-4 text-center min-w-[80px]">Late</th>
                          <th className="p-4 text-center min-w-[80px]">Leaves</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 text-sm text-slate-800">
                        {viewerData.map((emp) => {
                          let presentCount = 0.0;
                          let absentCount = 0.0;
                          let leaveCount = 0.0;
                          let lateCount = 0;
                          let workingDays = 0;
                          
                          const daysInMonth = new Date(exportYear, exportMonth + 1, 0).getDate();
                          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                          
                          const dailyCells = Array.from({ length: daysInMonth }).map((_, idx) => {
                            const d = idx + 1;
                            const entry = emp.history.find((h: any) => {
                              if (!h.date) return false;
                              const hDate = new Date(ensureUTC(h.date));
                              return hDate.getDate() === d;
                            });
                            
                            const status = entry?.status || 'absent';
                            const checkInStr = entry?.check_in;
                            const checkOutStr = entry?.check_out;
                            const isReg = entry?.is_regularized;
                            
                            const dateObj = new Date(exportYear, exportMonth, d);
                            const weekdayStr = dayNames[dateObj.getDay()];
                            const isWorkDay = weekdayStr !== 'sunday' && weekdayStr !== 'saturday'; // fallback
                            const isFuture = dateObj > new Date();

                            // Calculate worked duration
                            let durationHours = 0.0;
                            if (checkInStr && checkOutStr) {
                              const diff = new Date(ensureUTC(checkOutStr)).getTime() - new Date(ensureUTC(checkInStr)).getTime();
                              durationHours = diff / (1000 * 60 * 60);
                            }

                            if (isWorkDay && status !== 'holiday') {
                              workingDays++;
                            }

                            // Calculate status block parameters
                            let symbol = '—';
                            let colorClass = 'bg-slate-50 text-slate-350 border-slate-100';
                            let tooltipText = 'Future Date';

                            if (isFuture) {
                              symbol = '—';
                              colorClass = 'bg-slate-50 text-slate-200 border-slate-100';
                              tooltipText = 'Future Date';
                            } else if (status === 'holiday') {
                              symbol = 'H';
                              colorClass = 'bg-violet-100 text-violet-850 border-violet-200';
                              tooltipText = `Public Holiday: ${entry?.holiday_name || 'Holiday'}`;
                            } else if (isReg) {
                              symbol = 'R';
                              colorClass = 'bg-indigo-100 text-indigo-850 border-indigo-200';
                              tooltipText = `Regularized (Present). In: ${formatTimeISTSafe(checkInStr)} | Out: ${checkOutStr ? formatTimeISTSafe(checkOutStr) : 'Active'}`;
                              presentCount += 1.0;
                            } else if (status === 'leave') {
                              symbol = 'Lv';
                              colorClass = 'bg-pink-100 text-pink-855 border-pink-200';
                              tooltipText = `Sanctioned Leave: ${entry?.leave_type || 'Leave'}`;
                              leaveCount += 1.0;
                            } else if (!isWorkDay) {
                              symbol = 'W';
                              colorClass = 'bg-slate-50 text-slate-400 border-slate-150';
                              tooltipText = 'Weekly Off';
                            } else if (status === 'half_day_absent' || (checkInStr && checkOutStr && durationHours < viewerHalfDayMin)) {
                              symbol = 'HD-A';
                              colorClass = 'bg-fuchsia-100 text-fuchsia-850 border-fuchsia-200';
                              tooltipText = `Half Day Absent: Worked ${durationHours.toFixed(1)} hrs (Below threshold ${viewerHalfDayMin} hrs). In: ${formatTimeISTSafe(checkInStr)} | Out: ${formatTimeISTSafe(checkOutStr)}`;
                              absentCount += 1.0;
                            } else if (status === 'half_day_present' || (checkInStr && checkOutStr && durationHours < viewerFullDayMin)) {
                              symbol = 'HD-P';
                              colorClass = 'bg-cyan-100 text-cyan-855 border-cyan-200';
                              tooltipText = `Half Day Present: Worked ${durationHours.toFixed(1)} hrs (Below threshold ${viewerFullDayMin} hrs). In: ${formatTimeISTSafe(checkInStr)} | Out: ${formatTimeISTSafe(checkOutStr)}`;
                              presentCount += 0.5;
                              absentCount += 0.5;
                            } else if (status === 'absent' || status === 'no_data') {
                              symbol = 'A';
                              colorClass = 'bg-rose-100 text-rose-850 border-rose-200';
                              tooltipText = 'Absent / Unsanctioned Leave';
                              absentCount += 1.0;
                            } else {
                              presentCount += 1.0;
                              const isLate = status.includes('late');
                              const isEarlyOut = status.includes('early') || (entry?.flags && entry.flags.includes('early_checkout'));
                              
                              if (isLate && isEarlyOut) {
                                symbol = 'L/E';
                                colorClass = 'bg-orange-100 text-orange-850 border-orange-200';
                                tooltipText = `Late Login & Early Out: Worked ${durationHours.toFixed(1)} hrs. In: ${formatTimeISTSafe(checkInStr)} | Out: ${checkOutStr ? formatTimeISTSafe(checkOutStr) : 'Active'}`;
                              } else if (isLate) {
                                symbol = 'L';
                                colorClass = 'bg-amber-100 text-amber-850 border-amber-200';
                                tooltipText = `Late Login: Worked ${durationHours.toFixed(1)} hrs. In: ${formatTimeISTSafe(checkInStr)} | Out: ${checkOutStr ? formatTimeISTSafe(checkOutStr) : 'Active'}`;
                                lateCount++;
                              } else if (isEarlyOut) {
                                symbol = 'E';
                                colorClass = 'bg-orange-100 text-orange-800 border-orange-200';
                                tooltipText = `Early Checkout: Worked ${durationHours.toFixed(1)} hrs. In: ${formatTimeISTSafe(checkInStr)} | Out: ${formatTimeISTSafe(checkOutStr)}`;
                              } else {
                                symbol = 'P';
                                colorClass = 'bg-emerald-100 text-emerald-850 border-emerald-200';
                                tooltipText = `Present: Worked ${durationHours.toFixed(1)} hrs. In: ${formatTimeISTSafe(checkInStr)} | Out: ${checkOutStr ? formatTimeISTSafe(checkOutStr) : 'Active'}`;
                              }
                            }

                            return (
                              <td key={d} className="p-1 text-center font-bold text-[10px]">
                                <div 
                                  className={cn("w-6 h-6 rounded-md flex items-center justify-center border font-black cursor-help transition-all hover:scale-110 shadow-sm", colorClass)}
                                  title={tooltipText}
                                >
                                  {symbol}
                                </div>
                              </td>
                            );
                          });

                          return (
                            <tr key={emp.user_id} className="hover:bg-slate-50/50 group">
                              <td className="sticky left-0 bg-white group-hover:bg-slate-50/50 z-10 p-4 border-r border-slate-200 min-w-[180px] shadow-sm">
                                <div className="font-semibold text-slate-800 leading-tight">{emp.user_name}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">{emp.user_email}</div>
                                <div className="text-[9px] font-black uppercase text-indigo-650 tracking-wider mt-1">{emp.role || 'employee'}</div>
                              </td>
                              {dailyCells}
                              <td className="p-4 text-center font-semibold text-slate-700">{workingDays}</td>
                              <td className="p-4 text-center text-emerald-650 font-bold">{presentCount}</td>
                              <td className="p-4 text-center text-rose-650 font-bold">{absentCount}</td>
                              <td className="p-4 text-center text-amber-600 font-bold">{lateCount}</td>
                              <td className="p-4 text-center text-pink-650 font-bold">{leaveCount}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button 
                onClick={handleExportMonthlyExcel}
                disabled={viewerLoading || exportLoading}
                className="btn btn-primary flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold shadow-md shadow-indigo-150/40"
              >
                <Download className="w-3.5 h-3.5" />
                Download Excel
              </button>
              <button 
                onClick={handleExportMonthlyPDF}
                disabled={viewerLoading || exportLoading}
                className="btn bg-rose-600 hover:bg-rose-750 text-white flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold border-0 shadow-md shadow-rose-150/40"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </button>
              <button 
                onClick={() => setShowReportViewer(false)}
                className="btn btn-secondary h-10 px-4 rounded-xl text-xs font-bold border-slate-200 text-slate-600 hover:bg-slate-100 shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
