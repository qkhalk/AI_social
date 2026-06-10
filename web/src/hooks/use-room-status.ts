"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Room } from "@/types/database";

type RoomStatus = Room["status"];

interface UseRoomStatusReturn {
  status: RoomStatus;
  loading: boolean;
  error: string | null;
}

/**
 * Tracks a room's status in real time via Supabase Realtime.
 * Falls back to a one-shot fetch for the initial value, then
 * listens for UPDATE events on the rooms table.
 */
export function useRoomStatus(roomId: string): UseRoomStatusReturn {
  const [status, setStatus] = useState<RoomStatus>("waiting");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchStatus = useCallback(async () => {
    const supabase = createClient();

    try {
      const { data, error: queryError } = await supabase
        .from("rooms")
        .select("status")
        .eq("id", roomId)
        .single();

      if (queryError) {
        setError(queryError.message);
        return;
      }

      if (data) {
        setStatus(data.status);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load room status");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStatus();

    const supabase = createClient();
    const channel = supabase.channel(`room-status:${roomId}`);

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "rooms",
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        const updated = payload.new as { status: RoomStatus };
        setStatus(updated.status);
      }
    );

    channel.subscribe((subscriptionStatus) => {
      if (subscriptionStatus === "CHANNEL_ERROR") {
        setError("Real-time connection lost.");
      }
    });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, fetchStatus]);

  return { status, loading, error };
}
