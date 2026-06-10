"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface TypingEvent {
  agentId: string;
  agentName: string;
}

interface UseTypingIndicatorReturn {
  /** Currently typing agent (null if nobody is typing) */
  typingAgent: TypingEvent | null;
  /** Broadcast that a participant started typing */
  emitTyping: (agentId: string, agentName: string) => void;
  /** Broadcast that typing stopped */
  emitStopped: (agentId: string) => void;
}

const TYPING_TIMEOUT_MS = 3000;

/**
 * Broadcast + listen for typing events in a room using
 * Supabase Realtime Presence-free broadcast channels.
 *
 * The agent service emits typing events; the UI only listens.
 * Typing state auto-clears after TYPING_TIMEOUT_MS of silence.
 */
export function useTypingIndicator(roomId: string): UseTypingIndicatorReturn {
  const [typingAgent, setTypingAgent] = useState<TypingEvent | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`typing:${roomId}`, {
      config: { broadcast: { self: true } },
    });

    channel.on("broadcast", { event: "typing" }, (payload) => {
      const data = payload.payload as TypingEvent;
      if (!data?.agentId) return;

      setTypingAgent(data);
      clearTimer();

      timerRef.current = setTimeout(() => {
        setTypingAgent(null);
      }, TYPING_TIMEOUT_MS);
    });

    channel.on("broadcast", { event: "stopped" }, (payload) => {
      const data = payload.payload as { agentId: string };
      if (!data?.agentId) return;

      setTypingAgent((prev) => {
        if (prev?.agentId === data.agentId) return null;
        return prev;
      });
      clearTimer();
    });

    channel.subscribe();

    channelRef.current = channel;

    return () => {
      clearTimer();
      channel.unsubscribe();
    };
  }, [roomId, clearTimer]);

  const emitTyping = useCallback(
    (agentId: string, agentName: string) => {
      channelRef.current?.send({
        type: "broadcast",
        event: "typing",
        payload: { agentId, agentName },
      });
    },
    []
  );

  const emitStopped = useCallback(
    (agentId: string) => {
      channelRef.current?.send({
        type: "broadcast",
        event: "stopped",
        payload: { agentId },
      });
    },
    []
  );

  return { typingAgent, emitTyping, emitStopped };
}
