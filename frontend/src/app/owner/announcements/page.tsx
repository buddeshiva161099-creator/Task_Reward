'use client';

import { useEffect, useState } from 'react';
import ownerApi from '@/lib/ownerApi';
import { Megaphone, Trash2, Info, AlertTriangle, ShieldAlert, CheckCircle, Upload, X as ClearIcon, Paperclip } from 'lucide-react';

interface Announcement {
  id: string;
  message: string;
  banner_type: string;
  image_url?: string;
  created_at: string;
}

export default function AnnouncementsPage() {
  const [activeAnnouncements, setActiveAnnouncements] = useState<Announcement[]>([]);
  const [message, setMessage] = useState('');
  const [bannerType, setBannerType] = useState('info');
  const [imageUrl, setImageUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchActiveAnnouncements = async () => {
    try {
      const res = await ownerApi.get<Announcement[]>('/auth/announcements');
      setActiveAnnouncements(res.data || []);
    } catch (e) {
      console.error('Failed to load active announcements', e);
    }
  };

  useEffect(() => {
    fetchActiveAnnouncements();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await ownerApi.post<{ file_url: string }>('/platform/announcement/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImageUrl(res.data.file_url);
    } catch (err) {
      console.error(err);
      alert('Failed to upload file. Please ensure it is under 5MB.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsLoading(true);
    setSuccessMsg('');
    try {
      await ownerApi.post('/platform/announcement', {
        message: message.trim(),
        banner_type: bannerType,
        image_url: imageUrl || null
      });
      setSuccessMsg('Announcement successfully broadcasted system-wide!');
      setMessage('');
      setImageUrl('');
      fetchActiveAnnouncements();
    } catch (e) {
      console.error(e);
      alert('Failed to broadcast announcement.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm('Are you sure you want to remove this announcement?')) return;
    setIsLoading(true);
    try {
      await ownerApi.delete(`/platform/announcement/${id}`);
      setSuccessMsg('Announcement successfully removed.');
      fetchActiveAnnouncements();
    } catch (e) {
      console.error(e);
      alert('Failed to delete announcement.');
    } finally {
      setIsLoading(false);
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
          <Megaphone className="w-6 h-6 text-amber-500" />
          Global Announcements
        </h1>
        <p className="text-sm text-slate-500 mt-1">Broadcast high-visibility alert banners to every user dashboard across the platform.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editor Form */}
        <form onSubmit={handleBroadcast} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 lg:col-span-5 h-fit">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Broadcast Composer</h2>
          
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase">Alert Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Scheduled database maintenance on Sunday at 2:00 AM UTC. Please log out before then."
              rows={4}
              maxLength={500}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all shadow-inner"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Alert Level</label>
              <select
                value={bannerType}
                onChange={(e) => setBannerType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all cursor-pointer shadow-sm"
              >
                <option value="info">Info (Amber Overlay)</option>
                <option value="warning">Warning (Dark Warning Alert)</option>
                <option value="danger">Emergency (Crimson Risk Warning)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase block">Banner File / Doc</label>
              <div className="relative">
                <input
                  type="file"
                  onChange={handleImageUpload}
                  disabled={isUploading}
                  className="hidden"
                  id="announcement-file-upload"
                />
                <label
                  htmlFor="announcement-file-upload"
                  className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 border-dashed rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isUploading ? 'Uploading...' : 'Choose File'}
                </label>
              </div>
            </div>
          </div>

          {/* Form Image / Doc Preview */}
          {imageUrl && (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-2 flex items-center gap-3">
              {isImage(imageUrl) ? (
                <img
                  src={imageUrl}
                  alt="Banner preview"
                  className="w-12 h-12 object-cover rounded-lg border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                  <Paperclip className="w-5 h-5 text-indigo-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Uploaded Banner Media</span>
                <span className="text-[11px] text-slate-600 truncate block font-mono">{imageUrl.split('/').pop()}</span>
              </div>
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors"
                aria-label="Remove file"
              >
                <ClearIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || isUploading}
              className="w-full px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-900/10 transition-all disabled:opacity-50"
            >
              Broadcast Message
            </button>
          </div>

          {successMsg && (
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 flex items-center gap-2 text-emerald-800 text-xs">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 animate-pulse" />
              <span>{successMsg}</span>
            </div>
          )}
        </form>

        {/* Live Preview Panel */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 lg:col-span-7 flex flex-col">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Active Broadcasts Stack</h2>
          
          {activeAnnouncements.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3 flex-1">
              <Megaphone className="w-8 h-8 text-slate-300 animate-pulse" />
              <div>
                <p className="text-xs font-bold text-slate-700">No Active Announcements</p>
                <p className="text-[11px] text-slate-400 mt-0.5">There are currently no active global announcements broadcasted.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 overflow-y-auto max-h-[520px] pr-1 pt-1">
              {activeAnnouncements.map((ann, idx) => (
                <div key={ann.id} className="relative bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeleteAnnouncement(ann.id)}
                    className="absolute top-4 right-4 p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors shadow-sm"
                    title="Remove Announcement"
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
                      <span className="text-slate-400 text-[10px] uppercase font-bold">Attached Document / Banner:</span>
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
                              Download Document
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-4 items-center text-[10px] border-t border-slate-200/60 pt-3">
                    <div>
                      <span className="text-slate-400 uppercase font-bold block">Alert Level:</span>
                      <span className={`inline-block mt-1 uppercase text-[9px] font-extrabold tracking-wider px-2 py-0.5 rounded border ${
                        ann.banner_type === 'danger' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        ann.banner_type === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                        'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}>
                        {ann.banner_type}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 uppercase font-bold block">Broadcasted At:</span>
                      <span className="block font-mono text-slate-500 mt-1">
                        {new Date(ann.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block mb-2">Live UI Preview:</span>
                    <div className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between border shadow-sm ${
                      ann.banner_type === 'danger' ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white border-rose-600' :
                      ann.banner_type === 'warning' ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-600' :
                      'bg-gradient-to-r from-slate-800 to-slate-900 text-amber-300 border-slate-950'
                    }`}>
                      <div className="flex items-center gap-2">
                        {ann.image_url ? (
                          isImage(ann.image_url) ? (
                            <img
                              src={ann.image_url}
                              alt="banner icon"
                              className="w-6 h-6 object-cover rounded-md border border-white/20 shrink-0"
                            />
                          ) : (
                            <Paperclip className="w-4 h-4 text-white shrink-0" />
                          )
                        ) : (
                          ann.banner_type === 'danger' ? <ShieldAlert className="w-4 h-4 text-white shrink-0 animate-bounce" /> :
                          ann.banner_type === 'warning' ? <AlertTriangle className="w-4 h-4 text-white shrink-0" /> :
                          <Info className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <span>{ann.message}</span>
                      </div>
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
