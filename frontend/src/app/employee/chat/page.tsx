'use client';

import ChatContainer from '@/components/ChatContainer';
import { MessageSquare } from 'lucide-react';

export default function EmployeeChatPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-indigo-600" />
          Collaboration Workspace
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Chat in real-time, share files, reference tasks, and collaborate with your team.
        </p>
      </div>

      {/* Main Chat component */}
      <ChatContainer />
    </div>
  );
}
