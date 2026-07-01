'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { X, Image, Palette, Camera, Loader2, Sparkles } from 'lucide-react';

interface PersonalizationModalProps {
  onClose: () => void;
}

const THEMES = [
  { id: 'light', name: 'Slate Minimal (Light)', desc: 'Linear & Vercel inspired clean theme', colors: ['bg-slate-100', 'bg-indigo-600'], dark: false },
  { id: 'dark', name: 'Slate Minimal (Dark)', desc: 'GitHub & Linear midnight dark mode', colors: ['bg-slate-900', 'bg-indigo-500'], dark: true },
  { id: 'mint', name: 'Emerald Mint', desc: 'Shopify inspired fresh sage green tones', colors: ['bg-emerald-50/50', 'bg-emerald-600'], dark: false },
  { id: 'sunset', name: 'Solar Amber', desc: 'Notion Warm Mode inspired cozy orange', colors: ['bg-orange-50/50', 'bg-orange-600'], dark: false },
  { id: 'ocean', name: 'Oceanic Navy', desc: 'Slack & Zoom inspired tech navy & cyan', colors: ['bg-slate-950', 'bg-cyan-500'], dark: true },
  { id: 'purple', name: 'Aura Purple', desc: 'Discord & Stripe inspired neon purple', colors: ['bg-violet-950', 'bg-purple-500'], dark: true },
  { id: 'cyberpunk', name: 'Cyberpunk Crimson', desc: 'Synthwave neon pink & crimson vibes', colors: ['bg-purple-950', 'bg-pink-500'], dark: true },
  { id: 'forest', name: 'Nordic Forest', desc: 'Deep spruce green & clean mint', colors: ['bg-emerald-950', 'bg-teal-400'], dark: true },
  { id: 'rosegold', name: 'Rose Gold Luxury', desc: 'Clean cream with rose coral accents', colors: ['bg-rose-50', 'bg-rose-450'], dark: false }
];

const FONTS = [
  { id: 'inter', name: 'Inter (Sans-Serif)', desc: 'Clean, neutral, and highly readable default UI font' },
  { id: 'roboto', name: 'Roboto (Google Material)', desc: 'Geometric structural font, extremely clear' },
  { id: 'outfit', name: 'Outfit (Sleek Geometric)', desc: 'Rounded, elegant and modern look' },
  { id: 'mono', name: 'JetBrains Mono (Console)', desc: 'Sleek developer console coding font style' },
  { id: 'serif', name: 'Playfair Display (Serif)', desc: 'Classic, editorial serif typography' }
];

export default function PersonalizationModal({ onClose }: PersonalizationModalProps) {
  const { user, updateUser } = useAuth();
  const [selectedTheme, setSelectedTheme] = useState('light');
  const [selectedFont, setSelectedFont] = useState('inter');
  const [previewPic, setPreviewPic] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('app-theme') || 'light';
    setSelectedTheme(stored);
    const storedFont = localStorage.getItem('app-font') || 'inter';
    setSelectedFont(storedFont);
    if (user?.profile_picture) {
      setPreviewPic(user.profile_picture);
    }
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Photo must be smaller than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewPic(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPreviewPic(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      // 1. Save theme and font to local storage
      localStorage.setItem('app-theme', selectedTheme);
      localStorage.setItem('app-font', selectedFont);
      
      // Apply theme to document element
      document.documentElement.setAttribute('data-theme', selectedTheme);
      document.documentElement.setAttribute('data-font', selectedFont);
      if (selectedTheme === 'dark' || selectedTheme === 'cyberpunk' || selectedTheme === 'ocean' || selectedTheme === 'purple' || selectedTheme === 'forest') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      // 2. Save profile picture base64 string to backend
      await api.put('/auth/personalization', {
        profile_picture: previewPic,
      });

      // 3. Update auth state
      updateUser({ profile_picture: previewPic });

      setFeedback('Preferences saved successfully!');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error(err);
      alert('Failed to save personalization preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-indigo-650" />
            <h3 className="text-lg font-black text-slate-800">Personalized Settings</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 max-h-[70vh] custom-scrollbar text-slate-700">
          {feedback && (
            <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-bounce">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>{feedback}</span>
            </div>
          )}

          {/* Profile Picture Upload Section */}
          <div className="space-y-3">
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Profile Photo</label>
            <div className="flex items-center gap-4">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                {previewPic ? (
                  <img 
                    src={previewPic} 
                    alt="Preview" 
                    className="w-20 h-20 rounded-full object-cover border-2 border-indigo-100 shadow-inner group-hover:opacity-85 transition-opacity" 
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center text-white text-2xl font-black shadow-md">
                    {user?.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-0 bg-slate-900/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-5 h-5 text-white" />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                <div className="flex gap-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-all shadow-xs"
                  >
                    Upload Photo
                  </button>
                  {previewPic && (
                    <button 
                      onClick={handleRemovePhoto}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold rounded-lg transition-all border border-rose-100/50"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium">Supports JPG or PNG. Max size 2MB.</p>
              </div>
            </div>
          </div>

          {/* Theme Selection Section */}
          <div className="space-y-3">
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Select Application Theme</label>
            <div className="space-y-2">
              {THEMES.map((theme) => {
                const isSelected = selectedTheme === theme.id;
                return (
                  <div 
                    key={theme.id}
                    onClick={() => setSelectedTheme(theme.id)}
                    className={`flex items-center justify-between p-3.5 border rounded-2xl cursor-pointer hover:bg-slate-50 transition-all ${
                      isSelected 
                        ? 'border-indigo-500 bg-indigo-50/10 shadow-xs' 
                        : 'border-slate-150'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Theme Colors circles */}
                      <div className="flex -space-x-1 shrink-0">
                        <div className={`w-5 h-5 rounded-full border border-white ${theme.colors[0]}`} />
                        <div className={`w-5 h-5 rounded-full border border-white ${theme.colors[1]}`} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 leading-snug">{theme.name}</h4>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">{theme.desc}</p>
                      </div>
                    </div>
                    
                    {/* Radio circle */}
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-indigo-600' : 'border-slate-300'
                    }`}>
                      {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-indigo-650" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Font Selection Section */}
          <div className="space-y-3 mt-4 pt-4 border-t border-slate-100">
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Select Typography Style</label>
            <div className="space-y-2">
              {FONTS.map((font) => {
                const isSelected = selectedFont === font.id;
                return (
                  <div 
                    key={font.id}
                    onClick={() => setSelectedFont(font.id)}
                    className={`flex items-center justify-between p-3.5 border rounded-2xl cursor-pointer hover:bg-slate-50 transition-all ${
                      isSelected 
                        ? 'border-indigo-500 bg-indigo-50/10 shadow-xs' 
                        : 'border-slate-150'
                    }`}
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 leading-snug">{font.name}</h4>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">{font.desc}</p>
                    </div>
                    
                    {/* Radio circle */}
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-indigo-600' : 'border-slate-300'
                    }`}>
                      {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-indigo-650" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex justify-end gap-2 shrink-0 bg-slate-50/50">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-200"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-indigo-650 hover:bg-indigo-750 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            <span>Save Preferences</span>
          </button>
        </div>
      </div>
    </div>
  );
}
