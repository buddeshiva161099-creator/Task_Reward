'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { Brain, Send, X, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AxiosError } from 'axios';

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
    }
  }, [isOpen, messages]);

  const toggleOpen = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState && messages.length === 0 && user) {
      const isMgmt = ['admin', 'manager', 'hr_manager'].includes(user.role);
      
      let welcomeText = `Hello ${user.name}! I am your AI Workforce Copilot. Here is how I can assist you:\n\n`;
      welcomeText += `📋 Query Information:\n`;
      welcomeText += `  • Check active tasks ("Show my tasks")\n`;
      welcomeText += `  • Check leaves & holidays ("Show leaves status")\n`;
      welcomeText += `  • Check reward points ("What is my points balance?")\n`;
      welcomeText += `  • Check shift roster timing ("What is my shift timing?")\n\n`;
      
      if (isMgmt) {
        welcomeText += `🛠️ Administrative Actions:\n`;
        welcomeText += `  • Create & assign tasks ("Create task for Shiva...")\n`;
        welcomeText += `  • Update shift timings ("Update morning shift timing to 9 to 6")\n`;
        welcomeText += `  • Assign roster shifts ("Assign morning shift to Shiva for next week")\n`;
        welcomeText += `  • Approve & reject leaves ("Approve Shiva's leave request")\n\n`;
      }
      
      welcomeText += `Ask me any question or click a quick action tag below!`;

      setMessages([
        {
          sender: 'ai',
          text: welcomeText,
          timestamp: new Date()
        }
      ]);
    }
  };

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = {
      sender: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    // Calculate chat history payload for contextual memory
    const historyPayload = messages.map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text
    }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/ai/assistant', { 
        message: textToSend,
        history: historyPayload
      });
      
      const responseText = res.data.answer;
      let actionCompletedMessage = "";

      // Regex to extract json block inside markdown code block
      const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
      const match = responseText.match(jsonRegex);
      if (match && match[1]) {
        try {
          const actionPayload = JSON.parse(match[1]);
          if (actionPayload.action === 'create_task' && actionPayload.parameters) {
            const { work_description, assigned_to, priority, deadline } = actionPayload.parameters;
            await api.post('/tasks', {
              work_description,
              assigned_to,
              priority: priority ? priority.toLowerCase() : 'medium',
              deadline: deadline || null
            });
            actionCompletedMessage = "\n\n🤖 *AI Action Executed: Task successfully created and assigned!*";
          } else if (actionPayload.action === 'update_shift' && actionPayload.parameters) {
            const { shift_id, name, start_time, end_time, grace_period_minutes, color_code } = actionPayload.parameters;
            
            const sanitizeTime = (t: string) => {
              if (!t) return "09:00";
              const clean = t.trim();
              const parts = clean.split(':');
              if (parts.length === 2) {
                const hh = parts[0].padStart(2, '0');
                const mm = parts[1].padStart(2, '0');
                return `${hh}:${mm}`;
              }
              return clean;
            };

            const cleanStartTime = sanitizeTime(start_time);
            const cleanEndTime = sanitizeTime(end_time);

            await api.put(`/shifts/${shift_id}`, {
              name: name || "Morning Shift",
              start_time: cleanStartTime,
              end_time: cleanEndTime,
              grace_period_minutes: (grace_period_minutes !== undefined && grace_period_minutes !== null) ? grace_period_minutes : 15,
              color_code: color_code || "#3b82f6"
            });
            actionCompletedMessage = `\n\n🤖 *AI Action Executed: Shift '${name || "Morning Shift"}' timings successfully updated to ${cleanStartTime} - ${cleanEndTime}!*`;
          } else if (actionPayload.action === 'assign_shift' && actionPayload.parameters) {
            const { user_id, shift_id, start_date, end_date } = actionPayload.parameters;
            await api.post('/shifts/assign', {
              user_id,
              shift_id,
              start_date,
              end_date
            });
            actionCompletedMessage = "\n\n🤖 *AI Action Executed: Roster shift assigned successfully to the employee!*";
          } else if (actionPayload.action === 'approve_leave' && actionPayload.parameters) {
            const { leave_id, status } = actionPayload.parameters;
            if (status === 'approved') {
              await api.post(`/leaves/approve/${leave_id}`);
              actionCompletedMessage = "\n\n🤖 *AI Action Executed: Leave request successfully approved!*";
            } else {
              await api.post(`/leaves/reject/${leave_id}`, { comments: "Rejected by AI Copilot" });
              actionCompletedMessage = "\n\n🤖 *AI Action Executed: Leave request has been rejected!*";
            }
          }
        } catch (e: any) {
          console.error("Failed to parse or execute action JSON:", e);
          actionCompletedMessage = `\n\n⚠️ *AI Action failed: ${e.response?.data?.detail || e.message}*`;
        }
      }

      const aiMsg: Message = {
        sender: 'ai',
        text: responseText + actionCompletedMessage,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error('AI assistant request failed:', err);
      let errorText = 'Sorry, I am having trouble connecting to the intelligence server right now.';
      if (err instanceof AxiosError && err.response?.data?.detail) {
        errorText = err.response.data.detail;
      }
      const errorMsg: Message = {
        sender: 'ai',
        text: errorText,
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

  const isMgmt = user && ['admin', 'manager', 'hr_manager'].includes(user.role);
  const suggestedTags = isMgmt
    ? [
        { label: 'My Active Tasks', query: 'Show my tasks' },
        { label: 'Create Task', query: 'Create a high priority task for Shiva to check server logs' },
        { label: 'Approve Leave', query: 'Approve Shiva\'s leave request' },
        { label: 'Update Shift', query: 'Update morning shift timing to 9 AM to 6 PM' },
      ]
    : [
        { label: 'My Active Tasks', query: 'Show my tasks' },
        { label: 'My Reward Balance', query: 'What is my points balance?' },
        { label: 'My Shift Timings', query: 'What is my shift roster timing?' },
        { label: 'Leaves & Holidays', query: 'Show leaves status or holidays' },
      ];

  if (!user) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Floating Chat Panel */}
      {isOpen && (
        <div className="w-[calc(100vw-32px)] sm:w-[480px] max-w-[480px] h-[650px] max-h-[80vh] bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl flex flex-col overflow-hidden mb-4 animate-fade-in">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-4 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-sm">TalentFlow AI Copilot</h3>
                <span className="text-[10px] text-indigo-200 font-bold uppercase tracking-wider">Workforce Intelligence</span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-white/10 rounded-lg text-indigo-100 hover:text-white transition-colors"
              aria-label="Close AI Assistant"
              title="Close AI Assistant"
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
          {!loading && (
            <div className="px-4 py-2 border-t border-slate-100 bg-white">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">Quick Actions:</span>
              <div className="flex flex-wrap gap-1.5">
                {suggestedTags.map((tag, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(tag.query)}
                    title={`Ask AI: ${tag.label}`}
                    className="text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100/80 px-2.5 py-1 rounded-xl transition-colors border border-indigo-100/50 cursor-pointer"
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
              aria-label="Message to AI Assistant"
              className="flex-1 input h-10 px-3.5 rounded-xl border-slate-200 text-xs font-semibold focus:border-indigo-500 focus:ring-indigo-500"
            />
            <button
              onClick={() => handleSend(input)}
              disabled={loading || !input.trim()}
              className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100 transition-colors cursor-pointer"
              aria-label="Send message"
              title="Send message"
            >
              <Send className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={toggleOpen}
        aria-label={isOpen ? "Close AI Copilot" : "Open AI Copilot"}
        title={isOpen ? "Close AI Copilot" : "Open AI Copilot"}
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 relative overflow-hidden cursor-pointer",
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
