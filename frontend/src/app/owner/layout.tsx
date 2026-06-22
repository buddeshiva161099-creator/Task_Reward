'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useOwnerAuth } from '@/contexts/OwnerAuthContext';
import {
  LayoutDashboard,
  Building2,
  LogOut,
  Crown,
  ScrollText,
  Activity,
  ChevronRight,
  Menu,
  X as CloseIcon,
  Key,
} from 'lucide-react';
import ChangePasswordModal from '@/components/ChangePasswordModal';

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { owner, isLoading, logout } = useOwnerAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const isLogin = pathname === '/owner/login';

  useEffect(() => {
    if (!isLoading && !owner && !isLogin) {
      router.push('/owner/login');
    }
  }, [owner, isLoading, isLogin, router]);

  if (isLogin) {
    return <>{children}</>;
  }

  if (isLoading || !owner) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  const navItems = [
    { href: '/owner/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/owner/tenants', label: 'Tenants', icon: Building2 },
    { href: '/owner/audit', label: 'Audit Log', icon: ScrollText },
    { href: '/owner/system', label: 'System Health', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`
        w-64 bg-slate-900 text-slate-200 flex flex-col fixed h-full z-50 transition-transform duration-300
        lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
      >
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-900/40">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-sm text-white">Platform Owner</h1>
              <p className="text-[10px] text-amber-300 uppercase tracking-wider font-semibold">Super Admin Panel</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-amber-400' : ''}`} />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-amber-400" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-sm font-semibold">
              {owner.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{owner.name}</p>
              <p className="text-xs text-slate-400 truncate">{owner.email}</p>
            </div>
          </div>
          <button
            onClick={() => setShowChangePassword(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors mb-1"
          >
            <Key className="w-3.5 h-3.5" />
            Change Password
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 lg:ml-64 min-h-screen">
        <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-lg lg:hidden transition-colors"
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Application Owner Console</h2>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">SaaS Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
              <Crown className="w-3 h-3" />
              Owner
            </span>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-900 leading-none">{owner.name}</p>
              <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-tighter font-semibold">{owner.email}</p>
            </div>
          </div>
        </header>
        <div className="p-6 lg:p-8">{children}</div>
      </main>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} force={!!owner?.must_change_password} />}
    </div>
  );
}
