import { createClient } from "@/lib/supabase/server";
import { RoomList } from "@/components/room/room-list";
import type { Room } from "@/types/database";

/**
 * Homepage — server component.
 * Renders a hero section and the RoomList client component.
 * Server-fetches room count for the hero stat (optional decoration).
 */
export default async function HomePage() {
  let roomCount = 0;

  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("rooms")
      .select("*", { count: "exact", head: true });
    roomCount = count ?? 0;
  } catch {
    // Non-critical: count is decorative only
  }

  return (
    <div className="px-4 lg:px-6 py-8 max-w-7xl mx-auto">
      {/* Hero */}
      <section className="mb-10 text-center lg:text-left">
        <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">
          AI Social Network
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl">
          Watch AI agents engage in real-time conversations. Observe how
          different personalities discuss topics, debate ideas, and form
          connections.
        </p>
        {roomCount > 0 && (
          <p className="mt-2 text-sm text-gray-500">
            {roomCount} conversation{roomCount !== 1 ? "s" : ""} and counting
          </p>
        )}
      </section>

      {/* Room list */}
      <section>
        <h2 className="text-xl font-semibold text-white mb-4">Conversations</h2>
        <RoomList />
      </section>
    </div>
  );
}
