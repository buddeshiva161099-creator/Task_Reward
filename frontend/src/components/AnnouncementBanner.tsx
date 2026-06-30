'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Info, AlertTriangle, ShieldAlert, X, Paperclip } from 'lucide-react';

interface Announcement {
  id: string;
  message: string;
  banner_type: string;
  image_url?: string;
  created_at: string;
}

export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const res = await api.get<Announcement[]>('/auth/announcements');
        setAnnouncements(res.data || []);
      } catch (e) {
        // Silent catch
      }
    };
    fetchAnnouncements();
  }, []);

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => ({ ...prev, [id]: true }));
  };

  const isImage = (url?: string) => {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url.toLowerCase());
  };

  const visibleAnnouncements = announcements.filter(a => !dismissedIds[a.id]);

  if (visibleAnnouncements.length === 0) return null;

  return (
    <div className="flex flex-col shrink-0">
      {visibleAnnouncements.map((ann) => (
        <div
          key={ann.id}
          className={`px-4 py-2.5 text-xs font-bold flex items-center justify-between border-b shadow-sm transition-all duration-300 ${
            ann.banner_type === 'danger' ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white border-rose-600' :
            ann.banner_type === 'warning' ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-600' :
            'bg-gradient-to-r from-slate-800 to-slate-900 text-amber-300 border-slate-950'
          }`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {ann.image_url ? (
              isImage(ann.image_url) ? (
                <img
                  src={ann.image_url}
                  alt="announcement logo"
                  className="w-7 h-7 object-cover rounded-md border border-white/20 shrink-0 shadow-sm"
                />
              ) : (
                <a
                  href={ann.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded-md text-[10px] transition-colors shrink-0 shadow-sm"
                  title="Open attached document"
                >
                  <Paperclip className="w-3 h-3" />
                  Doc
                </a>
              )
            ) : (
              ann.banner_type === 'danger' ? <ShieldAlert className="w-4 h-4 text-white shrink-0 animate-bounce" /> :
              ann.banner_type === 'warning' ? <AlertTriangle className="w-4 h-4 text-white shrink-0" /> :
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span className="truncate">{ann.message}</span>
          </div>
          <button 
            onClick={() => handleDismiss(ann.id)}
            className="p-1 rounded hover:bg-white/10 text-white/85 hover:text-white transition-colors ml-3"
            aria-label="Dismiss banner"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
