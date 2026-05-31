'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { Brain, Sparkles, Send, X, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export default function AIAssistant() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      // Initialize with welcome message if empty
      if (messages.length === 0 && user) {
        setMessages([
          {
            sender: 'ai',
            text: `Hello ${user.name}! I am your AI Workforce Copilot. How can I assist you today? You can query tasks, performance metrics, late logins, or ask operational summaries.`,
            timestamp: new Date()
          }
        ]);
      }
    }
  }, [isOpen, messages]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = {
      sender: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/ai/assistant', { message: textToSend });
      const aiMsg: Message = {
        sender: 'ai',
        text: res.data.answer,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error('AI assistant request failed:', err);
      const errorMsg: Message = {
        sender: 'ai',
        text: err.response?.data?.detail || 'Sorry, I am having trouble connecting to the intelligence server right now.',
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend(input);
    }
  };

  const suggestedTags = [
    { label: 'Overdue Tasks', query: 'Show overdue tasks' },
    { label: 'Workload Capacity', query: 'Who is overloaded or underutilized?' },
    { label: 'Late check-ins', query: 'Show attendance issues or late login patterns' },
    { label: 'Team Performance', query: 'Who has the highest productivity?' },
  ];

  if (!user) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Floating Chat Panel */}
      {isOpen && (
        <div className="w-[360px] sm:w-[400px] h-[500px] bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl flex flex-col overflow-hidden mb-4 animate-fade-in">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-4 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-sm">TaskReward AI Copilot</h3>
                <span className="text-[10px] text-indigo-200 font-bold uppercase tracking-wider">Workforce Intelligence</span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-white/10 rounded-lg text-indigo-100 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar bg-slate-50/50">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex flex-col max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed",
                  msg.sender === 'user'
                    ? "bg-indigo-600 text-white ml-auto rounded-tr-none shadow-sm"
                    : "bg-white text-slate-800 border border-slate-100 mr-auto rounded-tl-none shadow-sm font-medium"
                )}
              >
                <div className="whitespace-pre-line">{msg.text}</div>
                <span className={cn(
                  "text-[9px] mt-1 block",
                  msg.sender === 'user' ? "text-indigo-200 text-right" : "text-slate-400"
                )}>
                  {msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                </span>
              </div>
            ))}
            {loading && (
              <div className="bg-white border border-slate-100 text-slate-500 mr-auto rounded-2xl rounded-tl-none p-3 max-w-[85%] flex items-center gap-2 shadow-sm">
                <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                <span className="text-xs font-semibold">AI is analyzing workforce patterns...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Quick-Tags */}
          {messages.length === 1 && !loading && (
            <div className="px-4 py-2 border-t border-slate-100 bg-white">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">Ask AI Copilot:</span>
              <div className="flex flex-wrap gap-1.5">
                {suggestedTags.map((tag, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(tag.query)}
                    className="text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100/80 px-2.5 py-1 rounded-xl transition-colors border border-indigo-100/50"
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Panel */}
          <div className="p-3 border-t border-slate-200 bg-white flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask me something..."
              disabled={loading}
              className="flex-1 input h-10 px-3.5 rounded-xl border-slate-200 text-xs font-semibold focus:border-indigo-500 focus:ring-indigo-500"
            />
            <button
              onClick={() => handleSend(input)}
              disabled={loading || !input.trim()}
              className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100 transition-colors"
            >
              <Send className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 relative overflow-hidden",
          isOpen 
            ? "bg-slate-800 shadow-slate-300/30" 
            : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-300/40"
        )}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <>
            <Brain className="w-6 h-6 animate-pulse" />
            <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white mt-1 mr-1 animate-ping" />
          </>
        )}
      </button>
    </div>
  );
}
