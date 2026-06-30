'use client';

import { useEffect, useState } from 'react';
import ownerApi from '@/lib/ownerApi';
import { Megaphone, Trash2, Shield, Paperclip, AlertTriangle, ShieldAlert, Info } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  domain: string;
  tenant_status: string;
}

interface Announcement {
  id: string;
  message: string;
  banner_type: string;
  image_url?: string;
  created_at: string;
}

export default function PlatformOwnerTenantAnnouncementsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoadingTenants, setIsLoadingTenants] = useState(true);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Fetch tenants list
  useEffect(() => {
    const fetchTenantsList = async () => {
      try {
        const res = await ownerApi.get<{ items: Tenant[]; total: number }>('/platform/tenants?limit=200');
        const list = res.data.items || [];
        setTenants(list);
        if (list.length > 0) {
          setSelectedTenantId(list[0].id);
        }
      } catch (e) {
        console.error('Failed to load tenants list', e);
      } finally {
        setIsLoadingTenants(false);
      }
    };
    fetchTenantsList();
  }, []);

  // 2. Fetch announcements for selected tenant
  const fetchTenantAnnouncements = async () => {
    if (!selectedTenantId) return;
    setIsLoadingAnnouncements(true);
    try {
      const res = await ownerApi.get<Announcement[]>(`/platform/tenant-announcements?tenant_id=${selectedTenantId}`);
      setAnnouncements(res.data || []);
    } catch (e) {
      console.error('Failed to load tenant announcements', e);
      setAnnouncements([]);
    } finally {
      setIsLoadingAnnouncements(false);
    }
  };

  useEffect(() => {
    fetchTenantAnnouncements();
  }, [selectedTenantId]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tenant announcement?')) return;
    try {
      await ownerApi.delete(`/platform/tenant-announcements/${id}`);
      setSuccessMsg('Announcement successfully removed.');
      fetchTenantAnnouncements();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      console.error('Failed to delete announcement', e);
      alert('Failed to delete announcement.');
    }
  };

  const isImage = (url?: string) => {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url.toLowerCase());
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <Shield className="w-6 h-6 text-indigo-600" />
          Tenants Announcements Audit
        </h1>
        <p className="text-sm text-slate-500 mt-1">Select any tenant to view, inspect, or delete announcements published by their internal HR/Admin teams.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        {/* Tenant Dropdown Selector */}
        <div className="space-y-1.5 max-w-md">
          <label className="text-xs font-bold text-slate-500 uppercase block">Filter by Tenant Company</label>
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            disabled={isLoadingTenants}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer shadow-sm disabled:opacity-60"
          >
            {isLoadingTenants ? (
              <option>Loading tenants...</option>
            ) : tenants.length === 0 ? (
              <option>No tenants found</option>
            ) : (
              tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.domain})
                </option>
              ))
            )}
          </select>
        </div>

        {successMsg && (
          <div className="bg-emerald-50 text-emerald-800 text-xs px-4 py-3 rounded-xl border border-emerald-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
            {successMsg}
          </div>
        )}

        {/* Announcements List */}
        <div className="border-t border-slate-100 pt-6">
          <h2 className="text-sm font-bold text-slate-900 mb-4">Published Announcements Stack</h2>

          {isLoadingAnnouncements ? (
            <div className="py-16 text-center text-slate-400 text-xs animate-pulse">
              Loading selected tenant announcements...
            </div>
          ) : announcements.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <Megaphone className="w-8 h-8 text-slate-300" />
              <div>
                <p className="text-xs font-bold text-slate-700">No announcements found</p>
                <p className="text-[11px] text-slate-400 mt-0.5">This tenant has not published any internal announcements.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {announcements.map((ann, idx) => (
                <div key={ann.id} className="relative bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                  {/* Delete Button */}
                  <button
                    onClick={() => handleDelete(ann.id)}
                    className="absolute top-4 right-4 p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors shadow-sm"
                    title="Remove Tenant Announcement"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="flex gap-4">
                    <div className="space-y-1 flex-1">
                      <span className="text-slate-400 text-[10px] uppercase font-bold">Message #{idx + 1}:</span>
                      <p className="text-xs text-slate-700 font-semibold leading-relaxed pr-8">
                        {ann.message}
                      </p>
                    </div>
                  </div>

                  {ann.image_url && (
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px] uppercase font-bold">Attached Document / Asset:</span>
                      {isImage(ann.image_url) ? (
                        <div className="mt-1.5 rounded-xl overflow-hidden border border-slate-200 max-h-32 max-w-sm">
                          <img
                            src={ann.image_url}
                            alt="Broadcast Media"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="mt-1.5 flex items-center gap-2 max-w-sm border border-slate-200 bg-white p-3 rounded-xl">
                          <Paperclip className="w-5 h-5 text-indigo-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] text-slate-700 font-bold block truncate">{ann.image_url.split('/').pop()}</span>
                            <a
                              href={ann.image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-indigo-600 hover:underline font-bold block mt-0.5"
                            >
                              Download Attachment
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-4 items-center text-[10px] border-t border-slate-200/60 pt-3">
                    <div>
                      <span className="text-slate-400 uppercase font-bold block">Severity:</span>
                      <span className={`inline-block mt-1 uppercase text-[9px] font-extrabold tracking-wider px-2 py-0.5 rounded border ${
                        ann.banner_type === 'danger' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        ann.banner_type === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                        'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}>
                        {ann.banner_type}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 uppercase font-bold block">Published:</span>
                      <span className="block font-mono text-slate-500 mt-1">
                        {new Date(ann.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
