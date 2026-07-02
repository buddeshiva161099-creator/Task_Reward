'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Shield, Sparkles, Eye, EyeOff, ArrowRight, Zap } from 'lucide-react';
import TalentFlowLogo from '@/components/TalentFlowLogo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      // Get user from localStorage after login
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      const isManagement = ['admin', 'manager', 'assistant_manager', 'hr_manager', 'assistant_hr_manager'].includes(userData.role);
      if (isManagement) {
        router.push('/admin/dashboard');
      } else {
        router.push('/employee/dashboard');
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      setError(axiosError.response?.data?.detail || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="gradient-bg min-h-screen flex items-center justify-center p-4 relative overflow-hidden">


      <div className="w-full max-w-md relative z-10">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white mb-4 glow-purple-strong shadow-lg p-2.5">
            <TalentFlowLogo size={48} />
          </div>
          <h1 className="text-3xl font-bold gradient-text">TalentFlow</h1>
          <p className="text-muted-foreground mt-2 text-sm">Unified HRM & Task Management</p>
        </div>

        {/* Login Card */}
        <div className="glass-strong rounded-2xl p-8 glow-purple-strong">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold">Sign In</h2>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2">
              <span className="text-red-500">⚠</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary w-full py-3 text-base"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <a
              href="https://task-reward-khtg.onrender.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-indigo-500 hover:text-indigo-650 bg-indigo-50/50 hover:bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-200 transition-colors w-full"
            >
              <Zap className="w-3.5 h-3.5 animate-pulse" />
              Start Backend Server (Cold Start)
            </a>
          </div>

          {/* Info */}
          <div className="mt-6 pt-5 border-t border-border">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
              <p>Complete tasks early to earn reward points and climb the leaderboard!</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          TaskReward © {new Date().getFullYear()} • Secure Authentication
        </p>
      </div>
    </div>
  );
}
