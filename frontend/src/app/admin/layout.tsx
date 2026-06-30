'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Users, ClipboardList, FileBarChart,
  Trophy, LogOut, Zap, ChevronRight, Building2, MapPin, Menu, X as CloseIcon,
  Settings, Calendar, Clock, DollarSign, Trash2, MessageSquare, Briefcase, Megaphone
} from 'lucide-react';
import { useState } from 'react';
import GlobalSearch from '@/components/GlobalSearch';
import NotificationBell from '@/components/NotificationBell';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { Key } from 'lucide-react';
import AIAssistant from '@/components/AIAssistant';
import { Skeleton } from '@/components/Skeleton';
import ScopeSwitcher from '@/components/ScopeSwitcher';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAdmin, isHR, isManager, isAssistantManager, isHRTeam, isTaskTeam, logout, activeBusinessUnitId, activeCompanyId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const isManagementRole = isAdmin || isHR || isManager || isAssistantManager;
  const canAccess = isManagementRole;

  const navItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    { href: '/admin/employees', label: 'Employees', icon: Users, visible: isHRTeam || isManager || isAssistantManager },
    { href: '/admin/companies', label: 'Companies', icon: Building2, visible: isHRTeam },
    { href: '/admin/tasks', label: 'Tasks', icon: ClipboardList, visible: isTaskTeam },
    { href: '/admin/attendance', label: 'Attendance Logs', icon: MapPin, visible: isHRTeam },
    { href: '/admin/leaves', label: 'Leaves', icon: Calendar, visible: isManagementRole },
    { href: '/admin/regularization', label: 'Regularizations', icon: Clock, visible: isManagementRole },
    { href: '/admin/payroll', label: 'Payroll Engine', icon: DollarSign, visible: isHRTeam },
    { href: '/admin/reports', label: 'Reports', icon: FileBarChart, visible: true },
    { href: '/admin/leaderboard', label: 'Leaderboard', icon: Trophy, visible: true },
    { href: '/admin/announcements', label: 'Announcements', icon: Megaphone, visible: true },
    { href: '/admin/chat', label: 'Chat Collaboration', icon: MessageSquare, visible: true },
    { href: '/employee/dashboard', label: 'Employee Portal', icon: Users, visible: true },
  ].filter(item => item.visible);

  useEffect(() => {
    if (!isLoading && (!user || !canAccess)) {
      router.push('/login');
    }
  }, [user, isLoading, canAccess, router]);

  useEffect(() => {
    if (user?.must_change_password) {
      setShowChangePassword(true);
    }
  }, [user]);

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
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{user.role.replace('_', ' ')} Panel</p>
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
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
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
      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col">
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
            <ScopeSwitcher />
            <NotificationBell />
            {/* Settings Dropdown */}
            <div className="relative group">
              <button className="p-2 hover:bg-slate-100 rounded-full transition-colors relative" aria-label="Open settings">
                <Settings className="w-5 h-5 text-slate-500" />
              </button>
              <div className="absolute right-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-2 w-48">
                  {(isAdmin || isHR || isManager) && (
                    <Link 
                      href="/admin/settings/rules" 
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                    >
                      <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <Zap className="w-3.5 h-3.5" />
                      </div>
                      Rules
                    </Link>
                  )}
                  <Link 
                    href="/admin/settings/holidays" 
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <Calendar className="w-3.5 h-3.5" />
                    </div>
                    Holidays
                  </Link>
                  <Link
                    href="/admin/settings/categories"
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <ClipboardList className="w-3.5 h-3.5" />
                    </div>
                    Categories
                  </Link>
                  <Link
                    href="/admin/settings/business-units"
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                    Business Units
                  </Link>
                  {(isAdmin || isHR) && (
                    <Link
                      href="/admin/companies"
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                    >
                      <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <Briefcase className="w-3.5 h-3.5" />
                      </div>
                      Companies
                    </Link>
                  )}
                  {isHRTeam && (
                    <Link 
                      href="/admin/settings/deleted-employees" 
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                    >
                      <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <Trash2 className="w-3.5 h-3.5" />
                      </div>
                      Deleted Employees
                    </Link>
                  )}
                  <button 
                    onClick={() => setShowChangePassword(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-lg bg-rose-50 flex items-center justify-center">
                      <Key className="w-3.5 h-3.5" />
                    </div>
                    Password
                  </button>
                </div>
              </div>
            </div>
            <div className="h-8 w-px bg-border mx-1" />
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-900 leading-none">{user.name}</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tighter font-black">{user.role}</p>
            </div>
          </div>
        </header>

        <div
          className="p-6 lg:p-8"
          key={`${activeCompanyId || 'all'}:${activeBusinessUnitId || 'all'}`}
        >
          {children}
        </div>
      </main>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} force={!!user?.must_change_password} />}
      <AIAssistant />
    </div>
  );
}
