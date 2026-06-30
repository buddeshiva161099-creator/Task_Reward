'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Megaphone, Info, AlertTriangle, ShieldAlert, Paperclip, Globe, Shield } from 'lucide-react';

interface Announcement {
  id: string;
  message: string;
  banner_type: string;
  image_url?: string;
  tenant_id?: string;
  created_at: string;
}

export default function EmployeeAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const res = await api.get<Announcement[]>('/auth/announcements/tenant');
        setAnnouncements(res.data || []);
      } catch (e) {
        console.error('Failed to load announcements feed', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAnnouncements();
  }, []);

  const isImage = (url?: string) => {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url.toLowerCase());
  };

  return (
    <div className="space-y-6 max-w-4xl p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-indigo-600" />
          Announcements Hub
        </h1>
        <p className="text-sm text-slate-500 mt-1">Keep track of corporate broadcasts, safety protocols, and daily alerts.</p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-slate-500 text-sm animate-pulse">
          Loading announcements stack...
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-3">
          <Megaphone className="w-8 h-8 text-slate-300" />
          <div>
            <p className="text-xs font-bold text-slate-700">No active announcements</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Check back later for system notifications.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann, idx) => {
            const isGlobal = !ann.tenant_id;
            return (
              <div key={ann.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm hover:shadow-md transition-shadow relative">
                <div className="flex gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isGlobal ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">
                          <Globe className="w-2.5 h-2.5" />
                          Platform Owner Broadcast
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md">
                          <Shield className="w-2.5 h-2.5" />
                          Internal Company Alert
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                      {ann.message}
                    </p>
                  </div>
                </div>

                {ann.image_url && (
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Attached Resource:</span>
                    {isImage(ann.image_url) ? (
                      <div className="mt-1.5 rounded-xl overflow-hidden border border-slate-200 max-h-32 max-w-sm">
                        <img
                          src={ann.image_url}
                          alt="Broadcast File"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="mt-1.5 flex items-center gap-2 max-w-sm border border-slate-200 bg-slate-50 p-3 rounded-xl">
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

                <div className="flex flex-wrap gap-4 items-center text-[10px] border-t border-slate-100 pt-3">
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
            );
          })}
        </div>
      )}
    </div>
  );
}
