'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Megaphone, Trash2, Info, AlertTriangle, ShieldAlert, CheckCircle, Upload, X as ClearIcon, Paperclip, Globe, Shield } from 'lucide-react';

interface Announcement {
  id: string;
  message: string;
  banner_type: string;
  image_url?: string;
  tenant_id?: string;
  created_at: string;
}

export default function TenantAdminAnnouncementsPage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [message, setMessage] = useState('');
  const [bannerType, setBannerType] = useState('info');
  const [imageUrl, setImageUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchAnnouncements = async () => {
    try {
      const res = await api.get<Announcement[]>('/auth/announcements/tenant');
      setAnnouncements(res.data || []);
    } catch (e) {
      console.error('Failed to load announcements feed', e);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post<{ file_url: string }>('/auth/announcements/tenant/upload', formData, {
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
      await api.post('/auth/announcements/tenant', {
        message: message.trim(),
        banner_type: bannerType,
        image_url: imageUrl || null
      });
      setSuccessMsg('Announcement successfully published to your tenant portal!');
      setMessage('');
      setImageUrl('');
      fetchAnnouncements();
    } catch (e) {
      console.error(e);
      alert('Failed to publish announcement.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    setIsLoading(true);
    try {
      await api.delete(`/auth/announcements/tenant/${id}`);
      setSuccessMsg('Announcement successfully removed.');
      fetchAnnouncements();
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
    <div className="space-y-8 max-w-5xl p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-indigo-600" />
          Announcements Hub
        </h1>
        <p className="text-sm text-slate-500 mt-1">View official global announcements or publish internal alerts isolated to your company.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Composer Form (Only Admin/HR/Manager can write) */}
        <form onSubmit={handleBroadcast} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 lg:col-span-5 h-fit">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Publish Internal Announcement</h2>
          
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase">Alert Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Friendly reminder: the monthly synchronization meeting starts at 10:00 AM."
              rows={4}
              maxLength={500}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Alert Severity</label>
              <select
                value={bannerType}
                onChange={(e) => setBannerType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer shadow-sm"
              >
                <option value="info">Info (Default overlay)</option>
                <option value="warning">Warning (Attention overlay)</option>
                <option value="danger">Danger (Emergency alert)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase block">Attach File / Doc</label>
              <div className="relative">
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                  id="tenant-announcement-file-upload"
                />
                <label
                  htmlFor="tenant-announcement-file-upload"
                  className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 border-dashed rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
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
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Attached Asset</span>
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
              className="w-full px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-900/10 transition-all disabled:opacity-50"
            >
              Publish Announcement
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
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Announcements Stack</h2>
          
          {announcements.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3 flex-1">
              <Megaphone className="w-8 h-8 text-slate-300 animate-pulse" />
              <div>
                <p className="text-xs font-bold text-slate-700">No Announcements</p>
                <p className="text-[11px] text-slate-400 mt-0.5">There are no global or local announcements to display.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 overflow-y-auto max-h-[550px] pr-1 pt-1">
              {announcements.map((ann, idx) => {
                const isGlobal = !ann.tenant_id;
                return (
                  <div key={ann.id} className="relative bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                    
                    {/* Delete Button (Only for own tenant announcements) */}
                    {!isGlobal && (
                      <button
                        onClick={() => handleDelete(ann.id)}
                        className="absolute top-4 right-4 p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors shadow-sm"
                        title="Remove Announcement"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <div className="flex gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
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
                        <p className="text-xs text-slate-700 font-semibold leading-relaxed pr-8">
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
