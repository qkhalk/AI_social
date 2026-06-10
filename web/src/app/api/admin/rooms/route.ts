import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * GET  /api/admin/rooms — list all rooms
 * POST /api/admin/rooms — create room + assign agents
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const adminErr = await requireAdmin(supabase);
    if (adminErr) return adminErr;

    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rooms: data });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const adminErr = await requireAdmin(supabase);
    if (adminErr) return adminErr;

    const body = await request.json();

    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "Room name is required." }, { status: 400 });
    }

    // Insert room
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .insert({
        name: body.name,
        description: body.description || null,
        topic: body.topic || null,
        topic_tags: body.topic_tags || [],
        max_messages: body.max_messages || 50,
        status: "waiting",
      })
      .select()
      .single();

    if (roomErr || !room) {
      return NextResponse.json({ error: roomErr?.message || "Failed to create room." }, { status: 500 });
    }

    // Assign agents if provided
    const agentIds: string[] = body.agent_ids ?? [];
    if (agentIds.length > 0) {
      const inserts = agentIds.map((agentId) => ({
        room_id: room.id,
        agent_id: agentId,
      }));

      const { error: agentErr } = await supabase
        .from("room_agents")
        .insert(inserts);

      if (agentErr) {
        // Room created but agent assignment failed — return room with warning
        return NextResponse.json(
          { room, warning: "Room created but agent assignment failed: " + agentErr.message },
          { status: 201 }
        );
      }

      // Set status to active since agents are assigned
      await supabase
        .from("rooms")
        .update({ status: "active", started_at: new Date().toISOString() })
        .eq("id", room.id);
    }

    // Log room creation event
    await supabase.from("room_events").insert({
      room_id: room.id,
      event_type: "room_created",
      metadata: { name: room.name, agent_count: agentIds.length },
    });

    return NextResponse.json({ room }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

