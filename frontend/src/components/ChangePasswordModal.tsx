'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { X, Lock, ShieldCheck, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ChangePasswordModalProps {
  onClose: () => void;
  force?: boolean;
}

export default function ChangePasswordModal({ onClose, force }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters long');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccess(true);
      setTimeout(() => {
        localStorage.removeItem('user');
        window.location.href = '/login';
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={force ? undefined : onClose}>
      <div 
        className="modal-content max-w-md overflow-hidden relative" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
        
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Security</h2>
              <p className="text-xs text-slate-400 font-medium">Update your account password</p>
            </div>
          </div>
          {!force && (
            <button 
              onClick={onClose} 
              className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {success ? (
          <div className="py-8 text-center animate-in zoom-in duration-300">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Success!</h3>
            <p className="text-sm text-slate-500">Your password has been updated.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Current Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input pl-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input pl-10"
                  placeholder="Min. 10 characters"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input pl-10"
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              {!force && (
                <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                  Cancel
                </button>
              )}
              <button 
                type="submit" 
                disabled={loading} 
                className="btn btn-primary flex-1 shadow-lg shadow-indigo-100"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
