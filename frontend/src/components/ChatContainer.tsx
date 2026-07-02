'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { formatTimeIST } from '@/lib/utils';
import {
  MessageSquare, Users, User, Plus, Settings, Search, Paperclip, Send,
  Trash2, X, Trophy, Calendar, ClipboardList, Check, ArrowDown,
  Loader2, Download, Image as ImageIcon, FileText, CheckCheck, Eye
} from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from './Skeleton';

interface ChatUser {
  id: string;
  name: string;
  email: string;
  role: string;
  last_active?: string;
  last_message_text?: string;
  last_message_time?: string;
  unread_count?: number;
}

interface ChatGroup {
  id: string;
  name: string;
  members: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  last_message_text?: string;
  last_message_time?: string;
  unread_count?: number;
}

interface TaskDetails {
  id: string;
  work_description: string;
  status: string;
  priority: string;
  deadline?: string;
}

interface Message {
  id: string;
  group_id?: string;
  sender_id: string;
  sender_name: string;
  recipient_id?: string;
  text: string;
  type: string; // "text", "file", "task", "tip"
  attachment_url?: string;
  attachment_name?: string;
  task_card_id?: string;
  task_details?: TaskDetails;
  tip_points?: number;
  deleted_for_everyone: boolean;
  created_at: string;
}

interface TaskListItem {
  id: string;
  work_description: string;
  status: string;
  priority: string;
  deadline?: string;
}

export default function ChatContainer() {
  const { user } = useAuth();
  
  // Lists
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myTasks, setMyTasks] = useState<TaskListItem[]>([]);
  
  // Selection
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ChatGroup | null>(null);
  
  // Search & Inputs
  const [searchTerm, setSearchTerm] = useState('');
  const [msgText, setMsgText] = useState('');
  const [searchHistoryQuery, setSearchHistoryQuery] = useState('');
  const [isSearchingHistory, setIsSearchingHistory] = useState(false);
  
  // Modals / Dropdowns
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showTaskSelector, setShowTaskSelector] = useState(false);
  
  // Group creation & editing fields
  const [groupName, setGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  
  // Tip fields
  const [tipPoints, setTipPoints] = useState<number>(10);
  const [tipMsg, setTipMsg] = useState('');
  const [tipLoading, setTipLoading] = useState(false);
  
  // Loading & States
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  
  // References
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const canManageGroups = user && user.role !== 'employee';

  // --- Data Fetching ---

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/chat/users');
      setUsers(res.data);
    } catch (err) {
      console.error('Failed to load chat users:', err);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await api.get('/chat/groups');
      setGroups(res.data);
    } catch (err) {
      console.error('Failed to load chat groups:', err);
    }
  }, []);

  const fetchMyTasks = useCallback(async () => {
    try {
      const res = await api.get('/tasks');
      setMyTasks(res.data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }, []);

  const fetchHistory = useCallback(async (isPolling = false) => {
    if (!selectedUser && !selectedGroup) return;
    if (!isPolling) setLoadingHistory(true);
    try {
      const url = '/chat/history';
      const params: any = {};
      if (selectedGroup) {
        params.group_id = selectedGroup.id;
      } else if (selectedUser) {
        params.recipient_id = selectedUser.id;
      }
      if (searchHistoryQuery.trim()) {
        params.q = searchHistoryQuery.trim();
      }
      
      const res = await api.get(url, { params });
      setMessages(res.data);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedUser, selectedGroup, searchHistoryQuery]);

  // Heartbeat & Online Status loop
  useEffect(() => {
    if (!user) return;
    
    // Initial fetch
    fetchUsers();
    fetchGroups();
    fetchMyTasks();

    // Pulse heartbeat immediately and then every 30s
    api.post('/chat/presence/heartbeat').catch(() => {});
    const heartbeatInterval = setInterval(() => {
      api.post('/chat/presence/heartbeat').catch(() => {});
      fetchUsers(); // refresh online/last_active presence status
    }, 30000);

    return () => clearInterval(heartbeatInterval);
  }, [user, fetchUsers, fetchGroups, fetchMyTasks]);

  // Load history when active contact/group or keyword search query changes
  useEffect(() => {
    fetchHistory();
  }, [selectedUser, selectedGroup, searchHistoryQuery, fetchHistory]);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for new messages every 4 seconds
  useEffect(() => {
    const poller = setInterval(() => {
      fetchUsers();
      fetchGroups();
      if (selectedUser || selectedGroup) {
        fetchHistory(true);
      }
    }, 4000);

    return () => clearInterval(poller);
  }, [selectedUser, selectedGroup, fetchHistory, fetchUsers, fetchGroups]);

  // Notification Logic
  const previousUnreadRefs = useRef<Record<string, number>>({});

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    let playedSound = false;

    // Check users for new unread messages
    users.forEach(u => {
      const prev = previousUnreadRefs.current[u.id] || 0;
      const current = u.unread_count || 0;
      if (current > prev) {
        if (selectedUser?.id !== u.id) {
          if (!playedSound) { playNotificationSound(); playedSound = true; }
          showDesktopNotification(u.name, u.last_message_text || 'Sent a new message');
        }
      }
      previousUnreadRefs.current[u.id] = current;
    });

    // Check groups for new unread messages
    groups.forEach(g => {
      const prev = previousUnreadRefs.current[g.id] || 0;
      const current = g.unread_count || 0;
      if (current > prev) {
        if (selectedGroup?.id !== g.id) {
          if (!playedSound) { playNotificationSound(); playedSound = true; }
          showDesktopNotification(g.name, g.last_message_text || 'New message in group');
        }
      }
      previousUnreadRefs.current[g.id] = current;
    });
  }, [users, groups, selectedUser, selectedGroup]);

  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
      console.warn("Audio play failed", e);
    }
  };

  const showDesktopNotification = (title: string, body: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  };

  // --- Handlers ---

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!msgText.trim()) return;

    try {
      const payload: any = {
        text: msgText.trim(),
        type: 'text'
      };
      if (selectedGroup) {
        payload.group_id = selectedGroup.id;
      } else if (selectedUser) {
        payload.recipient_id = selectedUser.id;
      }

      await api.post('/chat/messages', payload);
      setMsgText('');
      fetchHistory();
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await api.post('/chat/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const { url, name } = uploadRes.data;

      const payload: any = {
        text: `Shared file: ${name}`,
        type: 'file',
        attachment_url: url,
        attachment_name: name
      };

      if (selectedGroup) {
        payload.group_id = selectedGroup.id;
      } else if (selectedUser) {
        payload.recipient_id = selectedUser.id;
      }

      await api.post('/chat/messages', payload);
      fetchHistory();
    } catch (err) {
      console.error('Failed to upload file:', err);
      alert('File upload failed.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleShareTask = async (task: TaskListItem) => {
    try {
      const payload: any = {
        text: `Attached Task: ${task.work_description}`,
        type: 'task',
        task_card_id: task.id
      };

      if (selectedGroup) {
        payload.group_id = selectedGroup.id;
      } else if (selectedUser) {
        payload.recipient_id = selectedUser.id;
      }

      await api.post('/chat/messages', payload);
      setShowTaskSelector(false);
      fetchHistory();
    } catch (err) {
      console.error('Failed to share task:', err);
    }
  };

  const handleSendTip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (tipPoints <= 0) return;

    setTipLoading(true);
    try {
      await api.post('/chat/tip', {
        recipient_id: selectedUser.id,
        points: tipPoints,
        message: tipMsg.trim() || `Gifted +${tipPoints} appreciation points!`
      });

      setShowTipModal(false);
      setTipMsg('');
      setTipPoints(10);
      fetchHistory();
      alert(`Successfully sent ${tipPoints} points!`);
    } catch (err: any) {
      console.error('Failed to tip points:', err);
      alert(err.response?.data?.detail || 'Failed to send points.');
    } finally {
      setTipLoading(false);
    }
  };

  const handleDeleteMessage = async (messageId: string, deleteType: 'me' | 'everyone') => {
    if (deleteType === 'everyone' && !confirm('Are you sure you want to delete this message for everyone?')) return;
    
    try {
      await api.delete(`/chat/messages/${messageId}`, {
        params: { delete_type: deleteType }
      });
      fetchHistory();
    } catch (err: any) {
      console.error('Failed to delete message:', err);
      alert(err.response?.data?.detail || 'Failed to delete message.');
    }
  };

  // --- Group Creation & Management ---

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    try {
      const res = await api.post('/chat/groups', {
        name: groupName.trim(),
        members: selectedGroupMembers
      });

      setShowCreateGroup(false);
      setGroupName('');
      setSelectedGroupMembers([]);
      fetchGroups();
      
      // select the newly created group
      const newGroup = res.data.group;
      setSelectedUser(null);
      setSelectedGroup({
        id: newGroup.id,
        name: newGroup.name,
        members: newGroup.members,
        created_by: user!.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to create group:', err);
      alert('Failed to create group.');
    }
  };

  const handleUpdateGroupMembers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;

    try {
      await api.put(`/chat/groups/${selectedGroup.id}`, {
        members: selectedGroupMembers
      });
      setShowGroupSettings(false);
      fetchGroups();
      alert('Group members updated successfully.');
    } catch (err) {
      console.error('Failed to update group members:', err);
      alert('Failed to update group.');
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;
    if (!confirm(`Are you sure you want to delete group "${selectedGroup.name}"? This will permanently redact all conversation history.`)) return;

    try {
      await api.delete(`/chat/groups/${selectedGroup.id}`);
      setShowGroupSettings(false);
      setSelectedGroup(null);
      fetchGroups();
    } catch (err) {
      console.error('Failed to delete group:', err);
      alert('Failed to delete group.');
    }
  };

  const openGroupSettings = () => {
    if (!selectedGroup) return;
    setGroupName(selectedGroup.name);
    setSelectedGroupMembers(selectedGroup.members);
    setShowGroupSettings(true);
  };

  const toggleGroupMemberSelection = (userId: string) => {
    setSelectedGroupMembers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // --- Cues & Indicators Helpers ---

  const isUserOnline = (lastActiveIso?: string) => {
    if (!lastActiveIso) return false;
    const diff = Date.now() - new Date(lastActiveIso).getTime();
    return diff < 120000; // active within last 2 minutes
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-indigo-50 border-indigo-100 text-indigo-700';
      case 'hr_manager': return 'bg-emerald-50 border-emerald-100 text-emerald-700';
      case 'assistant_hr_manager': return 'bg-teal-50 border-teal-100 text-teal-700';
      case 'manager': return 'bg-amber-50 border-amber-100 text-amber-700';
      case 'assistant_manager': return 'bg-orange-50 border-orange-100 text-orange-700';
      default: return 'bg-slate-50 border-slate-150 text-slate-600';
    }
  };

  // --- Unified Filtering & Sorting ---
  const unifiedList = [
    ...users.map(u => ({ ...u, isGroup: false })),
    ...groups.map(g => ({ ...g, isGroup: true }))
  ].filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (!item.isGroup && (item as ChatUser).email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  unifiedList.sort((a, b) => {
    const timeA = new Date(a.last_message_time || '1970-01-01T00:00:00Z').getTime();
    const timeB = new Date(b.last_message_time || '1970-01-01T00:00:00Z').getTime();
    return timeB - timeA;
  });

  return (
    <div className="flex h-[calc(100vh-12rem)] glass rounded-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      
      {/* SIDEBAR */}
      <aside className="w-80 border-r border-border flex flex-col bg-slate-50/50">
        
        {/* Search */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search chat..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-9 h-10 text-xs border border-slate-200 rounded-xl"
            />
          </div>
        </div>

        {/* Directory List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="flex items-center justify-between px-2 py-1 mb-2">
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Recent Chats</span>
            {canManageGroups && (
              <button
                onClick={() => setShowCreateGroup(true)}
                className="p-1 hover:bg-slate-200 rounded-lg text-indigo-600 transition-colors"
                title="Create Group"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {unifiedList.map((item) => {
            const isGroup = item.isGroup;
            const active = isGroup ? selectedGroup?.id === item.id : selectedUser?.id === item.id;
            const online = !isGroup && isUserOnline((item as ChatUser).last_active);
            const unreadCount = item.unread_count || 0;
            
            return (
              <button
                key={`${isGroup ? 'group' : 'user'}-${item.id}`}
                onClick={() => {
                  if (isGroup) {
                    setSelectedGroup(item as ChatGroup);
                    setSelectedUser(null);
                    // Immediately clear badge in local state
                    setGroups(prev => prev.map(g =>
                      g.id === item.id ? { ...g, unread_count: 0 } : g
                    ));
                    // Persist to backend in background
                    api.post('/chat/read', { group_id: item.id }).catch(() => {});
                  } else {
                    setSelectedUser(item as ChatUser);
                    setSelectedGroup(null);
                    // Immediately clear badge in local state
                    setUsers(prev => prev.map(u =>
                      u.id === item.id ? { ...u, unread_count: 0 } : u
                    ));
                    // Persist to backend in background
                    api.post('/chat/read', { sender_id: item.id }).catch(() => {});
                  }
                }}
                className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all duration-300 relative group overflow-hidden ${
                  active ? 'bg-white shadow-sm border border-slate-200 ring-1 ring-indigo-500/10' : 'hover:bg-slate-100/80 hover:shadow-sm border border-transparent'
                }`}
              >
                {active && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                )}
                
                <div className="relative flex-shrink-0">
                  {isGroup ? (
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 shadow-inner border border-white">
                      <Users className="w-5 h-5 text-slate-500 group-hover:text-indigo-600 transition-colors" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-lg shadow-md border border-indigo-400/30">
                      {item.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {online && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full shadow-sm" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <p className={`font-bold text-[13px] truncate tracking-tight ${active ? 'text-indigo-900' : 'text-slate-800'}`}>
                      {item.name}
                    </p>
                  </div>
                  
                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between items-center gap-2">
                      <p className={`text-[11px] truncate flex-1 ${unreadCount > 0 ? 'font-bold text-slate-700' : 'text-slate-500'}`}>
                        {item.last_message_text || (isGroup ? 'No messages yet' : 'Start a conversation')}
                      </p>
                      {unreadCount > 0 && (
                        <span className="bg-indigo-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full flex items-center justify-center min-w-[1.25rem] shadow-sm animate-in zoom-in">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    {item.last_message_time && (
                      <span className={`text-[9px] font-medium ${unreadCount > 0 ? 'text-indigo-500' : 'text-slate-400'}`}>
                        {formatTimeIST(item.last_message_time)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          
          {unifiedList.length === 0 && (
            <div className="text-center py-10 px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <Search className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-xs font-bold text-slate-600">No conversations found</p>
              <p className="text-[10px] text-slate-400 mt-1">Try searching for a different name</p>
            </div>
          )}
        </div>
      </aside>

      {/* CHAT MAIN SECTION */}
      <main className="flex-1 flex flex-col bg-white">
        
        {selectedUser || selectedGroup ? (
          <>
            {/* CHAT HEADER */}
            <header className="h-16 border-b border-border px-6 flex items-center justify-between bg-slate-50/20">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm">
                  {selectedUser ? selectedUser.name.charAt(0).toUpperCase() : <Users className="w-4 h-4" />}
                </div>
                <div>
                  <h2 className="font-bold text-sm text-slate-800 leading-none">
                    {selectedUser ? selectedUser.name : selectedGroup?.name}
                  </h2>
                  <p className="text-[10px] text-indigo-600 mt-1 font-bold">
                    {selectedUser 
                      ? (selectedUser.role === 'admin' ? 'System Administrator' :
                         selectedUser.role === 'hr_manager' ? 'HR Manager' :
                         selectedUser.role === 'assistant_hr_manager' ? 'Assistant HR Manager' :
                         selectedUser.role === 'manager' ? 'Manager' :
                         selectedUser.role === 'assistant_manager' ? 'Assistant Manager' :
                         selectedUser.role === 'employee' ? 'Employee' :
                         selectedUser.role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()))
                      : `${selectedGroup?.members.length} Members`
                    }
                  </p>
                </div>
              </div>

              {/* Chat Actions */}
              <div className="flex items-center gap-2">
                
                {/* Search in History Toggle */}
                <div className="relative flex items-center">
                  {isSearchingHistory && (
                    <input
                      type="text"
                      placeholder="Find messages..."
                      value={searchHistoryQuery}
                      onChange={(e) => setSearchHistoryQuery(e.target.value)}
                      className="input h-8 text-[11px] w-40 border border-slate-200 rounded-lg mr-2 animate-in slide-in-from-right-3 duration-250"
                    />
                  )}
                  <button
                    onClick={() => {
                      setIsSearchingHistory(!isSearchingHistory);
                      if (isSearchingHistory) setSearchHistoryQuery('');
                    }}
                    className={`p-2 rounded-lg transition-colors ${
                      isSearchingHistory ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>

                {/* Group Configuration Gear (Managers only) */}
                {selectedGroup && canManageGroups && (
                  <button
                    onClick={openGroupSettings}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                )}
              </div>
            </header>

            {/* CHAT MESSAGES BODY */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/10">
              
              {loadingHistory ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`flex gap-3 max-w-[70%] ${i % 2 === 0 ? 'ml-auto flex-row-reverse' : ''}`}>
                      <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />
                      <div className="space-y-1 flex-1">
                        <Skeleton className={`h-10 rounded-2xl ${i % 2 === 0 ? 'rounded-tr-none' : 'rounded-tl-none'}`} />
                        <Skeleton className={`h-3 w-16 ${i % 2 === 0 ? 'ml-auto' : ''}`} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {messages.map((msg) => {
                    const isOwn = msg.sender_id === user?.id;
                    const formattedTime = formatTimeIST(msg.created_at);
                    
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 max-w-[70%] group ${
                          isOwn ? 'ml-auto flex-row-reverse' : 'mr-auto'
                        }`}
                      >
                        {/* Avatar */}
                        {!isOwn && (
                          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs flex-shrink-0 mt-1 shadow-sm">
                            {msg.sender_name.charAt(0).toUpperCase()}
                          </div>
                        )}

                        {/* Content */}
                        <div className="space-y-1">
                          
                          {/* Sender name for Group chats */}
                          {selectedGroup && !isOwn && (
                            <p className="text-[10px] font-bold text-slate-500 ml-1">
                              {msg.sender_name}
                            </p>
                          )}

                          {/* Bubble wrapper */}
                          <div className="relative">
                            
                            {/* TEXT MESSAGES */}
                            {msg.type === 'text' && (
                              <div className={`p-3 rounded-2xl text-xs leading-relaxed shadow-sm border ${
                                isOwn
                                  ? 'bg-indigo-600 border-indigo-700 text-white rounded-tr-none'
                                  : 'bg-white border-slate-100 text-slate-800 rounded-tl-none'
                              }`}>
                                {msg.deleted_for_everyone ? (
                                  <span className="italic text-[10px] opacity-75">Message deleted</span>
                                ) : (
                                  msg.text
                                )}
                              </div>
                            )}

                            {/* ATTACHMENT CARD */}
                            {msg.type === 'file' && msg.attachment_url && (
                              <div className={`p-1.5 rounded-2xl border shadow-sm ${
                                isOwn ? 'bg-indigo-50 border-indigo-200 text-indigo-800 rounded-tr-none' : 'bg-white border-slate-200 text-slate-800 rounded-tl-none'
                              }`}>
                                {msg.attachment_name?.match(/\.(jpg|jpeg|png|gif)$/i) ? (
                                  <div className="space-y-1">
                                    <div className="relative overflow-hidden rounded-xl bg-slate-100 max-w-[240px]">
                                      <img
                                        src={`http://localhost:8000${msg.attachment_url}`}
                                        alt={msg.attachment_name}
                                        className="object-cover max-h-40 w-full hover:scale-105 transition-transform duration-300"
                                      />
                                    </div>
                                    <div className="p-2 flex items-center justify-between gap-4">
                                      <span className="text-[10px] font-bold truncate max-w-[150px]">{msg.attachment_name}</span>
                                      <a
                                        href={`http://localhost:8000${msg.attachment_url}`}
                                        download={msg.attachment_name}
                                        className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </a>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3 p-3">
                                    <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                                      <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold truncate max-w-[160px]">{msg.attachment_name}</p>
                                      <p className="text-[9px] text-slate-400 mt-0.5">Document Shared</p>
                                    </div>
                                    <a
                                      href={`http://localhost:8000${msg.attachment_url}`}
                                      download={msg.attachment_name}
                                      className="p-1.5 hover:bg-indigo-100 rounded-lg text-indigo-600 transition-colors ml-2"
                                    >
                                      <Download className="w-4 h-4" />
                                    </a>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* TASK CARD */}
                            {msg.type === 'task' && msg.task_details && (
                              <div className={`p-4 rounded-2xl border shadow-md max-w-sm ${
                                isOwn ? 'bg-indigo-50/80 border-indigo-200 text-indigo-900 rounded-tr-none' : 'bg-white border-slate-200 text-slate-800 rounded-tl-none'
                              }`}>
                                <div className="flex items-center gap-2 mb-3">
                                  <ClipboardList className="w-4 h-4 text-indigo-600" />
                                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Task Shared</span>
                                </div>
                                <p className="text-xs font-bold mb-3 leading-relaxed">{msg.task_details.work_description}</p>
                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${
                                    msg.task_details.status === 'completed'
                                      ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                      : msg.task_details.status === 'under_review'
                                      ? 'bg-amber-50 border-amber-100 text-amber-700'
                                      : 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                  }`}>
                                    {msg.task_details.status.replace('_', ' ')}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${
                                    msg.task_details.priority === 'critical' || msg.task_details.priority === 'high'
                                      ? 'bg-rose-50 border-rose-100 text-rose-600'
                                      : 'bg-slate-50 border-slate-100 text-slate-600'
                                  }`}>
                                    {msg.task_details.priority} Priority
                                  </span>
                                </div>
                                <Link 
                                  href={isOwn || user?.role === 'admin' ? '/admin/tasks' : '/employee/tasks'}
                                  className="w-full btn btn-ghost text-[10px] h-8 rounded-lg flex items-center justify-center gap-1.5 hover:bg-indigo-100"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View Task Dashboard
                                </Link>
                              </div>
                            )}

                            {/* REWARD TIP BUBBLE */}
                            {msg.type === 'tip' && (
                              <div className="p-4 rounded-2xl border shadow-lg max-w-sm bg-gradient-to-br from-amber-500/10 to-yellow-500/5 border-amber-250 text-amber-950 rounded-tl-none rounded-tr-none rounded-b-2xl">
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-white shadow-md shadow-amber-200">
                                    <Trophy className="w-4 h-4 animate-bounce" />
                                  </div>
                                  <div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">Reward Appreciation</span>
                                    <p className="text-[11px] font-black text-amber-600">+{msg.tip_points} POINTS APPRECIATED</p>
                                  </div>
                                </div>
                                <p className="text-xs font-bold leading-relaxed bg-white/70 p-3 rounded-xl border border-amber-100">{msg.text}</p>
                              </div>
                            )}

                            {/* Hover Options Context Trigger */}
                            {!msg.deleted_for_everyone && (
                              <div className={`absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-1 ${
                                isOwn ? 'left-full mr-2 -translate-x-full pr-14' : 'right-full ml-2 translate-x-full pl-14'
                              }`}>
                                <div className="flex bg-white/95 border border-slate-200 shadow-md rounded-lg p-0.5 gap-0.5">
                                  <button
                                    onClick={() => handleDeleteMessage(msg.id, 'me')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors"
                                    title="Delete for me"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  {(isOwn || canManageGroups) && (
                                    <button
                                      onClick={() => handleDeleteMessage(msg.id, 'everyone')}
                                      className="p-1 hover:bg-rose-50 rounded text-rose-500 hover:text-rose-700 transition-colors"
                                      title="Delete for everyone"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                          </div>

                          {/* Time Stamp */}
                          <div className={`flex items-center gap-1.5 text-[9px] text-slate-400 ${isOwn ? 'justify-end mr-1' : 'ml-1'}`}>
                            <span>{formattedTime}</span>
                            {isOwn && !msg.deleted_for_everyone && (
                              <CheckCheck className="w-3 h-3 text-indigo-500" />
                            )}
                          </div>

                        </div>
                      </div>
                    );
                  })}
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                      <MessageSquare className="w-10 h-10 text-slate-200" />
                      <p className="text-xs font-bold text-slate-500">No messages yet</p>
                      <p className="text-[10px] text-slate-400">Send a greeting to start collaborating.</p>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* CHAT INPUT BAR */}
            <footer className="p-4 border-t border-border bg-slate-50/30">
              <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                
                {/* Paperclip upload trigger */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAttachFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="p-2.5 hover:bg-slate-100 active:bg-slate-200 rounded-xl text-slate-500 transition-colors flex-shrink-0"
                >
                  {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                </button>

                {/* Share Task trigger */}
                <button
                  type="button"
                  onClick={() => setShowTaskSelector(true)}
                  className="p-2.5 hover:bg-slate-100 active:bg-slate-200 rounded-xl text-slate-500 transition-colors flex-shrink-0"
                >
                  <ClipboardList className="w-5 h-5" />
                </button>

                {/* Reward tipping trigger (Managers + Direct chat only) */}
                {selectedUser && canManageGroups && (
                  <button
                    type="button"
                    onClick={() => setShowTipModal(true)}
                    className="p-2.5 hover:bg-amber-50 active:bg-amber-100 rounded-xl text-amber-600 transition-colors flex-shrink-0"
                  >
                    <Trophy className="w-5 h-5" />
                  </button>
                )}

                {/* Input Text Box */}
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  className="input flex-1 h-11 border border-slate-200 rounded-xl px-4 text-xs"
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!msgText.trim()}
                  className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/20 text-slate-400 p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center text-indigo-600 shadow-md">
              <MessageSquare className="w-8 h-8" />
            </div>
            <div>
              <p className="font-bold text-slate-700">Collaboration Workspace</p>
              <p className="text-xs text-slate-400 max-w-sm mt-1 mx-auto leading-relaxed">
                Connect and share attachments, tasks, and appreciation directly with other active employees in real-time.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* --- CREATE GROUP MODAL --- */}
      {showCreateGroup && (
        <div className="modal-overlay" onClick={() => setShowCreateGroup(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                Create Group Chat
              </h3>
              <button onClick={() => setShowCreateGroup(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-400 mb-2">Group Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Frontend Team, Operations"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="input h-10 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black text-slate-400 mb-2">Select Members</label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1">
                  {users.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleGroupMemberSelection(u.id)}
                      className={`w-full text-left p-2.5 rounded-lg flex items-center justify-between text-xs transition-colors ${
                        selectedGroupMembers.includes(u.id) ? 'bg-indigo-50/50 text-indigo-700' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold">{u.name}</span>
                      </div>
                      {selectedGroupMembers.includes(u.id) && <Check className="w-4 h-4 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  className="btn btn-secondary flex-1 h-11"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!groupName.trim()}
                  className="btn btn-primary flex-1 h-11"
                >
                  Create Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- GROUP SETTINGS / MEMBERS MODAL --- */}
      {showGroupSettings && selectedGroup && (
        <div className="modal-overlay" onClick={() => setShowGroupSettings(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-500" />
                Manage Group: {selectedGroup.name}
              </h3>
              <button onClick={() => setShowGroupSettings(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateGroupMembers} className="space-y-5">
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-400 mb-2">Edit Room Members</label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1">
                  {users.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleGroupMemberSelection(u.id)}
                      className={`w-full text-left p-2.5 rounded-lg flex items-center justify-between text-xs transition-colors ${
                        selectedGroupMembers.includes(u.id) ? 'bg-indigo-50/50 text-indigo-700' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold">{u.name}</span>
                      </div>
                      {selectedGroupMembers.includes(u.id) && <Check className="w-4 h-4 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={handleDeleteGroup}
                  className="btn btn-danger flex-1 h-11 flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Group
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1 h-11"
                >
                  Save Members
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- SHARE TASK MODAL --- */}
      {showTaskSelector && (
        <div className="modal-overlay" onClick={() => setShowTaskSelector(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-indigo-600" />
                Select Task to Share
              </h3>
              <button onClick={() => setShowTaskSelector(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 p-1">
              {myTasks.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleShareTask(t)}
                  className="w-full text-left p-3 border border-slate-100 hover:border-indigo-150 hover:bg-slate-50 rounded-xl transition-all flex items-start gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 flex-shrink-0 mt-0.5">
                    <ClipboardList className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate leading-tight">{t.work_description}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        t.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                      }`}>
                        {t.status.replace('_', ' ')}
                      </span>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{t.priority} priority</span>
                    </div>
                  </div>
                </button>
              ))}
              {myTasks.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">No active tasks to share.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MANAGER REWARD TIP MODAL --- */}
      {showTipModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowTipModal(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6 text-amber-500">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shadow-lg shadow-amber-100">
                <Trophy className="w-6 h-6 text-amber-500 animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 leading-none">Gift Reward Points</h3>
                <p className="text-[10px] uppercase font-black text-amber-500 mt-1.5 tracking-wider">Tipping to: {selectedUser.name}</p>
              </div>
            </div>

            <form onSubmit={handleSendTip} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-400 mb-2">Points Amount</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={200}
                  value={tipPoints}
                  onChange={(e) => setTipPoints(Number(e.target.value))}
                  className="input h-10 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black text-slate-400 mb-2">Appreciation Note</label>
                <textarea
                  placeholder="e.g. Great job resolving the task ahead of deadline!"
                  value={tipMsg}
                  onChange={(e) => setTipMsg(e.target.value)}
                  className="input h-24 border border-slate-200 rounded-xl text-xs py-2 leading-relaxed"
                  required
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTipModal(false)}
                  className="btn btn-secondary flex-1 h-11"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={tipLoading || tipPoints <= 0}
                  className="btn btn-primary flex-1 h-11 bg-gradient-to-br from-amber-500 to-yellow-500 border-none text-white font-bold shadow-lg shadow-amber-100 flex items-center justify-center gap-1.5"
                >
                  {tipLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Trophy className="w-4 h-4" />
                      Tip Points
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
