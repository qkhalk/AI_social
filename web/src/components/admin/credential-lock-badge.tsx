"use client";

import { useEffect, useState } from "react";

/**
 * Lock/cooldown status badge for credentials.
 * Shows "Locked Xm" with countdown when active, "Ready" when unlocked.
 */
interface CredentialLockBadgeProps {
  lockedUntil: string | null;
  errorType: string | null;
  backoffLevel: number;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

export function CredentialLockBadge({ lockedUntil, errorType, backoffLevel }: CredentialLockBadgeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  if (!lockedUntil) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-900/40 text-green-400 border border-green-900/60">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        Ready
      </span>
    );
  }

  const expiresAt = new Date(lockedUntil).getTime();
  const remaining = expiresAt - now;
  const isExpired = remaining <= 0;

  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-900/40 text-green-400 border border-green-900/60">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        Ready
      </span>
    );
  }

  const errorLabel = errorType ? errorType.replace("_", " ") : "locked";

  return (
    <span
      title={`Locked: ${errorLabel}${backoffLevel > 0 ? ` (backoff level ${backoffLevel})` : ""}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-900/40 text-red-300 border border-red-900/60"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
      Locked {formatRemaining(remaining)}
    </span>
  );
}
