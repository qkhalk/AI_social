import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * GET    /api/admin/rooms/[id] — fetch single room
 * PATCH  /api/admin/rooms/[id] — update room (status, fields)
 * DELETE /api/admin/rooms/[id] — delete room
 */

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const supabase = await createClient();
    const adminErr = await requireAdmin(supabase);
    if (adminErr) return adminErr;

    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }
    return NextResponse.json({ room: data });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const supabase = await createClient();
    const adminErr = await requireAdmin(supabase);
    if (adminErr) return adminErr;

    const body = await request.json();

    const updates: Record<string, unknown> = {};
    const allowed = [
      "name", "description", "topic", "topic_tags",
      "max_messages", "status",
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    // Track status transitions with timestamps
    if (body.status === "active" && !body.started_at) {
      updates.started_at = new Date().toISOString();
    }
    if (body.status === "concluded" && !body.concluded_at) {
      updates.concluded_at = new Date().toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("rooms")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log status change events
    if (body.status) {
      await supabase.from("room_events").insert({
        room_id: params.id,
        event_type: `room_${body.status}`,
        metadata: { updated_fields: Object.keys(updates) },
      });
    }

    return NextResponse.json({ room: data });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const supabase = await createClient();
    const adminErr = await requireAdmin(supabase);
    if (adminErr) return adminErr;

    const { error } = await supabase
      .from("rooms")
      .delete()
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

