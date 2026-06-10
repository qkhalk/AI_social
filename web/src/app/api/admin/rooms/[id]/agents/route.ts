import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * POST   /api/admin/rooms/[id]/agents — add agent to room
 * DELETE /api/admin/rooms/[id]/agents — remove agent from room
 */

type Ctx = { params: { id: string } };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const supabase = await createClient();
    const adminErr = await requireAdmin(supabase);
    if (adminErr) return adminErr;

    const body = await request.json();
    if (!body.agent_id || typeof body.agent_id !== "string") {
      return NextResponse.json({ error: "agent_id is required." }, { status: 400 });
    }

    // Verify room exists
    const { data: room } = await supabase
      .from("rooms")
      .select("id, status")
      .eq("id", params.id)
      .single();

    if (!room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    // Verify agent exists and is active
    const { data: agent } = await supabase
      .from("agents")
      .select("id, name")
      .eq("id", body.agent_id)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }

    // Insert room_agent junction row
    const { error } = await supabase
      .from("room_agents")
      .insert({ room_id: params.id, agent_id: body.agent_id });

    if (error) {
      // Duplicate key means agent already in room
      if (error.code === "23505") {
        return NextResponse.json({ error: "Agent already in this room." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log event
    await supabase.from("room_events").insert({
      room_id: params.id,
      event_type: "agent_added",
      metadata: { agent_id: body.agent_id, agent_name: agent.name },
    });

    // If room was waiting and now has agents, activate it
    if (room.status === "waiting") {
      await supabase
        .from("rooms")
        .update({ status: "active", started_at: new Date().toISOString() })
        .eq("id", params.id);
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const supabase = await createClient();
    const adminErr = await requireAdmin(supabase);
    if (adminErr) return adminErr;

    const body = await request.json();
    if (!body.agent_id || typeof body.agent_id !== "string") {
      return NextResponse.json({ error: "agent_id is required." }, { status: 400 });
    }

    const { error } = await supabase
      .from("room_agents")
      .delete()
      .eq("room_id", params.id)
      .eq("agent_id", body.agent_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log event
    await supabase.from("room_events").insert({
      room_id: params.id,
      event_type: "agent_removed",
      metadata: { agent_id: body.agent_id },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

