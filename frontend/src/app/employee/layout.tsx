'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, ClipboardList, LogOut, Zap, ChevronRight, Trophy, MapPin, Menu, BarChart, Calendar, Clock, DollarSign, MessageSquare
} from 'lucide-react';
import { useState } from 'react';
import GlobalSearch from '@/components/GlobalSearch';
import NotificationBell from '@/components/NotificationBell';
import AttendanceToggle from '@/components/AttendanceToggle';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { Key } from 'lucide-react';
import AIAssistant from '@/components/AIAssistant';
import { Skeleton } from '@/components/Skeleton';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAdmin, isHR, isManager, isAssistantManager, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const isManagementRole = isAdmin || isHR || isManager || isAssistantManager;

  const navItems = [
    { href: '/employee/dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    { href: '/employee/attendance', label: 'Attendance', icon: MapPin, visible: true },
    { href: '/employee/tasks', label: 'My Tasks', icon: ClipboardList, visible: true },
    { href: '/employee/leaves', label: 'Leaves PTO', icon: Calendar, visible: true },
    { href: '/employee/regularization', label: 'Corrections', icon: Clock, visible: true },
    { href: '/employee/payroll', label: 'My Payslips', icon: DollarSign, visible: true },
    { href: '/employee/reports', label: 'Reports', icon: BarChart, visible: true },
    { href: '/employee/chat', label: 'Chat Collaboration', icon: MessageSquare, visible: true },
    { href: '/admin/dashboard', label: 'Management Panel', icon: Zap, visible: isManagementRole },
  ].filter(item => item.visible);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="flex h-screen bg-slate-50">
        <Skeleton className="w-64 h-full rounded-none" />
        <div className="flex-1 flex flex-col">
          <Skeleton className="h-16 w-full rounded-none" />
          <div className="p-8 space-y-6">
            <Skeleton className="h-12 w-1/4" />
            <div className="grid grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
            </div>
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        w-64 glass-strong flex flex-col fixed h-full z-50 transition-transform duration-300
        lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-sm gradient-text">TaskReward</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{user.role.replace('_', ' ')} Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'active bg-indigo-50 text-indigo-700'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-indigo-600' : ''}`} />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-indigo-500" />}
              </Link>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center text-white text-sm font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <div className="flex items-center gap-1 text-xs text-yellow-600">
                <Trophy className="w-3 h-3" />
                {user.reward_points} pts
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="btn btn-ghost w-full text-xs justify-start"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 min-h-screen">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-white/50 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-lg lg:hidden transition-colors"
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-4">
            <AttendanceToggle />
            <NotificationBell />
            <div className="relative group">
              <button className="p-2 hover:bg-slate-100 rounded-full transition-colors relative" aria-label="Open settings">
                <Key className="w-5 h-5 text-slate-500" />
              </button>
              <div className="absolute right-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-2 w-48">
                  <button 
                    onClick={() => setShowChangePassword(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-lg bg-rose-50 flex items-center justify-center">
                      <Key className="w-3.5 h-3.5" />
                    </div>
                    Change Password
                  </button>
                </div>
              </div>
            </div>
            <div className="h-8 w-px bg-border mx-1" />
            <div className="flex items-center gap-2 text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-900 leading-none">{user.name}</p>
              <div className="flex items-center gap-1 justify-end mt-1">
                <Trophy className="w-2.5 h-2.5 text-yellow-500" />
                <span className="text-[10px] text-yellow-600 font-bold">{user.reward_points} pts</span>
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
      <AIAssistant />
    </div>
  );
}
