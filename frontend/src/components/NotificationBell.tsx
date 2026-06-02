'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Bell, Check, Trash2, Clock, CheckCircle2, ClipboardList, Info, X, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'task_assigned' | 'task_completed' | 'system' | 'chat';
  is_read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data.items);
      setUnreadCount(response.data.unread_count);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications(true);
    const interval = setInterval(() => fetchNotifications(false), 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    if (notification.type === 'chat') {
      const isShareAdmin = window.location.pathname.startsWith('/admin');
      window.location.href = isShareAdmin ? '/admin/chat' : '/employee/chat';
    }
    setIsOpen(false);
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const deleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
      // Re-fetch to get correct unread count or just update local state
      fetchNotifications();
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'task_assigned': return <ClipboardList className="w-4 h-4 text-indigo-500" />;
      case 'task_completed': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'chat': return <MessageSquare className="w-4 h-4 text-blue-500" />;
      default: return <Info className="w-4 h-4 text-amber-500" />;
    }
  };

  const getBg = (type: string) => {
    switch (type) {
      case 'task_assigned': return 'bg-indigo-50';
      case 'task_completed': return 'bg-emerald-50';
      case 'chat': return 'bg-blue-50';
      default: return 'bg-amber-50';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "p-2.5 rounded-xl transition-all relative group hover:bg-slate-100",
          isOpen && "bg-slate-100"
        )}
      >
        <Bell className={cn(
          "w-5 h-5 text-slate-500 transition-colors group-hover:text-indigo-600",
          isOpen && "text-indigo-600"
        )} />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-4 h-4 bg-rose-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white animate-in zoom-in duration-300">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 mt-3 w-80 sm:w-96 glass-strong rounded-2xl shadow-2xl z-50 border border-white/40 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 bg-white/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Notifications</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{unreadCount} Unread Alerts</p>
              </div>
              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsRead}
                  className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                >
                  Mark all as read
                </button>
              )}
            </div>

            {/* Content */}
            <div className="max-h-[400px] overflow-y-auto bg-white/30 backdrop-blur-sm">
              {loading ? (
                <div className="divide-y divide-slate-50">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="p-4 flex gap-4">
                      <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="flex justify-between">
                          <Skeleton className="h-4 w-1/2 rounded" />
                          <Skeleton className="h-3 w-12 rounded" />
                        </div>
                        <Skeleton className="h-3 w-3/4 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-12 px-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
                    <Bell className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-wide">No notifications yet</p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">We'll alert you when something happens</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        "p-4 hover:bg-white/60 transition-colors cursor-pointer group/item relative",
                        !notification.is_read && "bg-indigo-50/30"
                      )}
                    >
                      <div className="flex gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                          getBg(notification.type)
                        )}>
                          {getIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h4 className={cn(
                              "text-sm tracking-tight",
                              notification.is_read ? "font-bold text-slate-700" : "font-black text-slate-900"
                            )}>
                              {notification.title}
                            </h4>
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {notification.message}
                          </p>
                        </div>
                        
                        <button 
                          onClick={(e) => deleteNotification(e, notification.id)}
                          className="opacity-0 group-hover/item:opacity-100 p-1.5 hover:bg-rose-50 hover:text-rose-500 rounded-lg text-slate-300 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {!notification.is_read && (
                        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-full" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-center">
              <button 
                onClick={() => setIsOpen(false)}
                className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
