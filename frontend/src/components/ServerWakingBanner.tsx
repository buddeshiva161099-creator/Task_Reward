'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

export default function ServerWakingBanner() {
  const [isWaking, setIsWaking] = useState(false);

  useEffect(() => {
    const handleEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ waking: boolean }>;
      setIsWaking(customEvent.detail.waking);
    };

    window.addEventListener('server-waking-up', handleEvent);
    return () => window.removeEventListener('server-waking-up', handleEvent);
  }, []);

  if (!isWaking) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md transition-opacity duration-300">
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl border border-indigo-500/30 text-center relative overflow-hidden">
        {/* Animated Background Gradients */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-4 animate-pulse">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>
        
        <h3 className="text-xl font-bold tracking-tight">System is Waking Up</h3>
        <p className="text-sm text-indigo-200 mt-2">
          We are provisioning a secure environment container. This normally takes 30-45 seconds when the server has been inactive.
        </p>
        
        {/* Premium Progress Bar */}
        <div className="w-full bg-slate-800/80 h-2 rounded-full mt-6 overflow-hidden border border-slate-700/50">
          <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 h-full rounded-full animate-waking-progress" style={{ width: '100%' }} />
        </div>
        
        <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-indigo-350 font-medium">
          <Sparkles className="w-3.5 h-3.5 animate-spin-slow" />
          <span>Hold tight, we will redirect you automatically</span>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes waking-progress-bar {
            0% { width: 0%; }
            100% { width: 100%; }
          }
          @keyframes spin-slow {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .animate-waking-progress {
            animation: waking-progress-bar 45s cubic-bezier(0.1, 0.8, 0.1, 1) forwards;
          }
          .animate-spin-slow {
            animation: spin-slow 8s linear infinite;
          }
        `}} />
      </div>
    </div>
  );
}
