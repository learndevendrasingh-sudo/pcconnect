'use client';

import { useState, useRef, useEffect } from 'react';
import { useSessionStore } from '@/lib/stores/session-store';
import type { ChatMessage } from '@securedesk/shared';
import type { PeerConnection } from '@/lib/webrtc/peer-connection';
import { X, Send } from 'lucide-react';

interface ChatPanelProps {
  peerConnection: PeerConnection | null;
  userName: string;
}

export function ChatPanel({ peerConnection, userName }: ChatPanelProps) {
  const { chatMessages, chatOpen, toggleChat, addChatMessage } = useSessionStore();
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages.length]);

  function handleSend() {
    if (!text.trim() || !peerConnection) return;

    const message: ChatMessage = {
      type: 'chat',
      text: text.trim(),
      sender: userName,
      timestamp: Date.now(),
    };

    peerConnection.sendChat(JSON.stringify(message));
    addChatMessage(message);
    setText('');
  }

  if (!chatOpen) return null;

  return (
    <div className="absolute inset-0 sm:relative sm:inset-auto z-30 w-full sm:w-80 flex flex-col border-l border-[#1e3f68] bg-[#112640]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e3f68]">
        <h3 className="text-sm font-semibold text-[#edf2fc]">Chat</h3>
        <button
          onClick={toggleChat}
          className="text-[#5e80a8] hover:text-[#edf2fc] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatMessages.length === 0 && (
          <p className="text-center text-[#406085] text-sm py-8">No messages yet</p>
        )}
        {chatMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col ${msg.sender === userName ? 'items-end' : 'items-start'}`}
          >
            <span className="text-xs text-[#5e80a8] mb-1">{msg.sender}</span>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.sender === userName
                  ? 'bg-[#2b5ddb] text-[#edf2fc]'
                  : 'bg-[#1c3860] text-[#b0c4e8]'
              }`}
            >
              {msg.text}
            </div>
            <span className="text-xs text-[#406085] mt-0.5">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[#1e3f68]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-lg border border-[#1e3f68] bg-[#0c1a30] px-3 py-2 text-sm text-[#edf2fc] placeholder-[#406085] outline-none focus:border-[#3b6cf5]/50"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2b5ddb] text-[#edf2fc] hover:bg-[#3b6cf5] disabled:opacity-50 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
