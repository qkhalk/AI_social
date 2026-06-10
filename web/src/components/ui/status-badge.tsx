import type { Room } from "@/types/database";

type RoomStatus = Room["status"];

interface StatusBadgeProps {
  status: RoomStatus;
}

/** Maps room status to color + label for consistent badge rendering. */
const STATUS_CONFIG: Record<RoomStatus, { label: string; className: string }> = {
  waiting: {
    label: "Waiting",
    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  active: {
    label: "Active",
    className: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  paused: {
    label: "Paused",
    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  concluded: {
    label: "Concluded",
    className: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  },
  archived: {
    label: "Archived",
    className: "bg-gray-700/20 text-gray-500 border-gray-700/30",
  },
};

/**
 * Inline status badge for room cards and headers.
 * Color-coded by status: active=green, waiting/paused=yellow, concluded=gray, archived=dark.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${config.className}`}
    >
      {status === "active" && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />
      )}
      {config.label}
    </span>
  );
}
