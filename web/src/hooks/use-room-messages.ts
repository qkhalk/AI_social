"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeDecryptMessage } from "@/lib/encryption/decrypt";
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
 * Get the encryption key from the environment.
 * Available as a public env var since it only decrypts (encrypt happens server-side).
 */
const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || "";

/**
 * Decrypt a message's content field in-place.
 * Returns the message with decrypted content, or the original on failure.
 */
async function decryptMsg(msg: Message): Promise<Message> {
  if (!ENCRYPTION_KEY) return msg;
  const decrypted = await safeDecryptMessage(msg.content, ENCRYPTION_KEY);
  return { ...msg, content: decrypted };
}

/**
 * Decrypt an array of messages in parallel.
 */
async function decryptMessages(msgs: Message[]): Promise<Message[]> {
  if (!ENCRYPTION_KEY) return msgs;
  return Promise.all(msgs.map(decryptMsg));
}

/**
 * Subscribes to real-time message inserts for a specific room.
 * Loads initial messages via a one-shot query, then appends new
 * rows as they arrive through Supabase Realtime postgres_changes.
 *
 * All message content is decrypted using AES-256-GCM before display.
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

      const decrypted = await decryptMessages((data ?? []) as Message[]);
      setMessages(decrypted);
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
      async (payload) => {
        const newMessage = payload.new as Message;
        const decrypted = await decryptMsg(newMessage);
        setMessages((prev) => {
          // Deduplicate in case of replay
          if (prev.some((m) => m.id === decrypted.id)) return prev;
          return [...prev, decrypted];
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
