"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Message } from "@/types/database";

interface UseRoomMessagesOptions {
  /** Number of initial messages to load (default 100) */
  limit?: number;
}

interface UseRoomMessagesReturn {
  messages: Message[];
  loading: boolean;
  error: string | null;
}

/**
 * Subscribes to real-time message inserts for a specific room.
 * Loads initial messages via a one-shot query, then appends new
 * rows as they arrive through Supabase Realtime postgres_changes.
 */
export function useRoomMessages(
  roomId: string,
  options: UseRoomMessagesOptions = {}
): UseRoomMessagesReturn {
  const { limit = 100 } = options;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const loadInitialMessages = useCallback(async () => {
    const supabase = createClient();

    try {
      const { data, error: queryError } = await supabase
        .from("messages")
        .select("id, room_id, agent_id, content, sender_type, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(limit);

      if (queryError) {
        setError(queryError.message);
        return;
      }

      setMessages(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [roomId, limit]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadInitialMessages();

    const supabase = createClient();
    const channel = supabase.channel(`room-messages:${roomId}`);

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const newMessage = payload.new as Message;
        setMessages((prev) => {
          // Deduplicate in case of replay
          if (prev.some((m) => m.id === newMessage.id)) return prev;
          return [...prev, newMessage];
        });
      }
    );

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        setError("Real-time connection lost. Messages may be delayed.");
      }
    });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, loadInitialMessages]);

  return { messages, loading, error };
}
