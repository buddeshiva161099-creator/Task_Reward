'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Attendance } from '@/types';
import { MapPin, LogIn, LogOut, Loader2, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AttendanceToggle() {
  const [currentSession, setCurrentSession] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'capturing' | 'saving' | 'success' | 'error'>('idle');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/attendance/me');
      const active = res.data.find((a: Attendance) => !a.check_out);
      setCurrentSession(active || null);
    } catch (err) {
      console.error('Failed to fetch attendance status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    
    // Listen for updates from other components
    const handleUpdate = () => fetchStatus();
    window.addEventListener('attendanceUpdated', handleUpdate);
    
    return () => window.removeEventListener('attendanceUpdated', handleUpdate);
  }, [fetchStatus]);

  const startAction = () => {
    setIsOpen(true);
    setStatus('capturing');
    setError(null);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(loc);
          performAction(loc);
        },
        (geoError) => {
          console.error('Location error:', geoError.code, geoError.message);
          switch (geoError.code) {
            case geoError.PERMISSION_DENIED:
              setError('Location permission denied. Please allow access in browser settings.');
              break;
            case geoError.POSITION_UNAVAILABLE:
              setError('Location unavailable. Check your GPS settings.');
              break;
            case geoError.TIMEOUT:
              setError('Location timed out. Check your connection.');
              break;
            default:
              setError('Unable to get location.');
          }
          setStatus('error');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    } else {
      setError('Geolocation not supported.');
      setStatus('error');
    }
  };

  const performAction = async (loc: { lat: number; lng: number }) => {
    setStatus('saving');
    const type = currentSession ? 'check-out' : 'check-in';
    try {
      const res = await api.post(`/attendance/${type}`, {
        lat: loc.lat,
        lng: loc.lng,
        remarks: `Quick ${type === 'check-in' ? 'Check-in' : 'Check-out'}`
      });
      
      if (type === 'check-in') {
        setCurrentSession(res.data);
      } else {
        setCurrentSession(null);
      }
      
      setStatus('success');
      
      // Auto close after 1.5s
      setTimeout(() => {
        setIsOpen(false);
        setStatus('idle');
      }, 1500);

      // Dispatch event to notify other components (like Attendance page)
      window.dispatchEvent(new Event('attendanceUpdated'));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Action failed.');
      setStatus('error');
    }
  };

  if (loading) return null;

  const isCheckedIn = !!currentSession;

  return (
    <>
      <button
        onClick={startAction}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95",
          isCheckedIn 
            ? "bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100" 
            : "bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100"
        )}
      >
        {isCheckedIn ? <LogOut className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
        <span className="hidden sm:inline">{isCheckedIn ? 'Punch Out' : 'Punch In'}</span>
      </button>

      {/* Dialog Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            {status === 'capturing' && (
              <>
                <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                  <MapPin className="w-8 h-8 text-indigo-500 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Capturing Location</h3>
                <p className="text-slate-500 mt-2 text-sm">Please wait while we verify your coordinates...</p>
              </>
            )}

            {status === 'saving' && (
              <>
                <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">{isCheckedIn ? 'Punching Out...' : 'Punching In...'}</h3>
                <p className="text-slate-500 mt-2 text-sm">Securing your session data...</p>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                {/* Note: currentSession is updated AFTER the API call, but we use the state at the start of the action to determine text */}
                <h3 className="text-xl font-bold text-slate-900">Successfully {!isCheckedIn ? 'Punched In' : 'Punched Out'}</h3>
                <p className="text-slate-500 mt-2 text-sm">Have a great {!isCheckedIn ? 'productive day' : 'rest of your day'}!</p>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mb-4">
                  <X className="w-8 h-8 text-rose-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Action Failed</h3>
                <p className="text-rose-500 mt-2 text-sm">{error}</p>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="mt-6 btn btn-primary w-full"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
