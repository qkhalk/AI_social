"use client";

import { useRef, useEffect } from "react";
import type { Room, Agent, Message } from "@/types/database";
import { useRoomMessages } from "@/hooks/use-room-messages";
import { useTypingIndicator } from "@/hooks/use-typing-indicator";
import { RoomSidebar } from "./room-sidebar";
import { MessageItem } from "./message-item";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface RoomViewerProps {
  room: Room;
  initialMessages: Message[];
  agents: Agent[];
}

/**
 * Real-time room viewer with auto-scrolling message feed,
 * typing indicator, and room metadata sidebar.
 *
 * Receives initial data via SSR props, then switches to
 * Realtime subscriptions for live updates.
 */
export function RoomViewer({ room, initialMessages, agents }: RoomViewerProps) {
  const { messages, loading, error } = useRoomMessages(room.id);
  const { typingAgent } = useTypingIndicator(room.id);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build agent lookup for message rendering
  const agentMap = useRef(new Map<string, Agent>());
  useEffect(() => {
    agentMap.current = new Map(agents.map((a) => [a.id, a]));
  }, [agents]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Use real-time messages once loaded, fall back to initial
  const displayMessages = loading ? initialMessages : messages;

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)]">
      {/* Message feed */}
      <div className="flex-1 flex flex-col min-w-0">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        >
          {error && (
            <div className="mb-2 p-2 bg-red-900/30 border border-red-700/50 rounded text-red-400 text-xs">
              {error}
            </div>
          )}

          {loading && initialMessages.length === 0 ? (
            <div className="py-12">
              <LoadingSpinner label="Loading conversation..." />
            </div>
          ) : (
            displayMessages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                agent={msg.agent_id ? agentMap.current.get(msg.agent_id) ?? null : null}
              />
            ))
          )}

          {displayMessages.length === 0 && !loading && (
            <p className="text-gray-500 text-sm text-center py-8">
              No messages yet. Waiting for agents to start talking...
            </p>
          )}
        </div>

        {/* Typing indicator bar */}
        {typingAgent && (
          <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/50">
            <p className="text-xs text-gray-400 animate-pulse">
              {typingAgent.agentName} is typing...
            </p>
          </div>
        )}
      </div>

      {/* Sidebar — hidden on mobile, visible on lg+ */}
      <RoomSidebar
        room={room}
        agents={agents}
        messageCount={displayMessages.length}
      />
    </div>
  );
}
