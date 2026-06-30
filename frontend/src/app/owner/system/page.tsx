'use client';

import { useEffect, useState, useRef } from 'react';
import ownerApi from '@/lib/ownerApi';
import {
  Activity,
  Database,
  Users,
  CheckCircle2,
  Cpu,
  Terminal,
  RefreshCw,
  Search,
  HardDrive,
  Check,
  Server
} from 'lucide-react';

interface HealthData {
  status: string;
  mongo: string;
  mongo_version: string;
  owner_count: number;
  diagnostics: {
    os: string;
    os_release: string;
    architecture: string;
    python_version: string;
    process_id: number;
  };
  disk: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    percent_used: number;
  };
  syslog: Array<{
    line: string;
    level: string;
    action: string;
    timestamp: string;
  }>;
  timestamp: string;
}

export default function OwnerSystemHealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveRefresh, setLiveRefresh] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'INFO' | 'WARN'>('ALL');
  
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const loadData = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const [h, m] = await Promise.all([
        ownerApi.get<HealthData>('/platform/system-health'),
        ownerApi.get('/platform/metrics'),
      ]);
      setHealth(h.data);
      setMetrics(m.data);
    } catch (e) {
      console.error('Failed to query system diagnostics', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadData();
  }, []);

  // Live Tail Poller
  useEffect(() => {
    if (!liveRefresh) return;
    const interval = setInterval(() => {
      loadData(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [liveRefresh]);

  // Scroll terminal logs container to the bottom on update
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [health?.syslog]);

  if (isLoading) {
    return <div className="text-slate-500 text-sm p-6">Checking system…</div>;
  }

  // Filter logs by search term and severity level
  const filteredLogs = (health?.syslog || []).filter((log) => {
    const matchesSearch = log.line.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = levelFilter === 'ALL' || log.level === levelFilter;
    return matchesSearch && matchesLevel;
  });

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">System Diagnostics</h1>
          <p className="text-sm text-slate-500 mt-1">Monitor real-time OS states, MongoDB metrics, and tail console event logs.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Tail Toggle */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-sm text-xs font-bold text-slate-600">
            <span className={`w-2 h-2 rounded-full ${liveRefresh ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'}`} />
            <span>Live Tail</span>
            <input
              type="checkbox"
              checked={liveRefresh}
              onChange={(e) => setLiveRefresh(e.target.checked)}
              className="ml-1 h-4 w-7 rounded-full bg-slate-200 border-transparent text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-amber-500"
            />
          </div>

          <button
            onClick={() => loadData()}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Diagnostics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <HealthCard
          icon={Database}
          title="MongoDB Engine"
          status={health?.mongo === 'up' ? 'operational' : 'down'}
          detail={health?.mongo === 'up' ? `Version ${health.mongo_version}` : 'Connectivity Error'}
          accent={health?.mongo === 'up' ? 'emerald' : 'rose'}
        />
        <HealthCard
          icon={Server}
          title="Server Host OS"
          status="operational"
          detail={`${health?.diagnostics.os} (${health?.diagnostics.os_release})`}
          accent="emerald"
        />
        <HealthCard
          icon={Cpu}
          title="Python runtime"
          status="operational"
          detail={`Python v${health?.diagnostics.python_version} [PID: ${health?.diagnostics.process_id}]`}
          accent="emerald"
        />
        <HealthCard
          icon={CheckCircle2}
          title="Tenants Onboarded"
          status="operational"
          detail={`${metrics?.tenants?.total ?? 0} total active`}
          accent="indigo"
        />
      </div>

      {/* Secondary Row: Disk storage & Diagnostics Metadata */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Disk Space Allocation */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Disk Storage Allocation</h3>
              <p className="text-xs text-slate-500 mt-0.5">Partition footprint details</p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
              <span>Partition Load</span>
              <span>{health?.disk.percent_used}% Used</span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${health?.disk.percent_used ?? 0}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs border-t border-slate-50">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Space</span>
              <span className="font-extrabold text-slate-700 mt-0.5 block">{health?.disk.total_gb} GB</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Used Space</span>
              <span className="font-extrabold text-slate-700 mt-0.5 block">{health?.disk.used_gb} GB</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Free Space</span>
              <span className="font-extrabold text-slate-700 mt-0.5 block">{health?.disk.free_gb} GB</span>
            </div>
          </div>
        </div>

        {/* Diagnostic parameters */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Environment Architecture</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium text-slate-700">
            <div>
              <span className="text-slate-400 block font-bold text-[10px] uppercase">CPU Core Arch</span>
              <span className="font-bold text-slate-900 mt-1 block">{health?.diagnostics.architecture}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-bold text-[10px] uppercase">Super admins</span>
              <span className="font-bold text-slate-900 mt-1 block">{health?.owner_count} configured</span>
            </div>
            <div>
              <span className="text-slate-400 block font-bold text-[10px] uppercase">System Latency</span>
              <span className="font-bold text-emerald-600 mt-1 block flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Optimal
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-bold text-[10px] uppercase">Last Inspected</span>
              <span className="font-bold text-slate-500 mt-1 block">
                {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal Log Console */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[520px]">
        {/* Terminal Header controls */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2 text-emerald-400">
            <Terminal className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider font-mono">System Live Event logs</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Filter buttons */}
            <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px] font-mono">
              {(['ALL', 'INFO', 'WARN'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setLevelFilter(filter)}
                  className={`px-2.5 py-1.5 rounded-md font-bold transition-all ${
                    levelFilter === filter
                      ? 'bg-slate-800 text-emerald-400'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Search filter input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter syslog terminal..."
                className="bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all font-mono w-full sm:w-[220px]"
              />
            </div>
          </div>
        </div>

        {/* Terminal Logs stream area */}
        <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1.5 selection:bg-emerald-900 selection:text-emerald-200">
          {filteredLogs.length === 0 ? (
            <div className="text-slate-600 text-center py-12">
              No matching log records found in buffer.
            </div>
          ) : (
            filteredLogs.map((log, idx) => (
              <div
                key={idx}
                className={`py-0.5 transition-colors ${
                  log.level === 'WARN' ? 'text-amber-400/90 hover:bg-amber-900/10' : 'text-emerald-400/80 hover:bg-emerald-950/15'
                }`}
              >
                {log.line}
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}

function HealthCard({
  icon: Icon,
  title,
  status,
  detail,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  status: string;
  detail: string;
  accent: 'emerald' | 'rose' | 'indigo';
}) {
  const ACCENT: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
    rose: 'bg-rose-500/10 text-rose-600 border border-rose-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl ${ACCENT[accent]} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-sm font-extrabold text-slate-900 mt-0.5">{status}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500 leading-normal border-t border-slate-50 pt-2.5 mt-1">{detail}</p>
    </div>
  );
}
