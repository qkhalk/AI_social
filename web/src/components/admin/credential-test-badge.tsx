export type CredentialTestStatus = "untested" | "testing" | "success" | "failed" | null;

interface CredentialTestBadgeProps {
  status: CredentialTestStatus;
  error?: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  untested: "bg-gray-800 text-gray-400",
  testing: "bg-yellow-900/50 text-yellow-300",
  success: "bg-green-900/50 text-green-400",
  failed: "bg-red-900/50 text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  untested: "Untested",
  testing: "Testing",
  success: "Passed",
  failed: "Failed",
};

export function CredentialTestBadge({ status, error }: CredentialTestBadgeProps) {
  const normalized = status || "untested";

  return (
    <span
      title={error || undefined}
      className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[normalized] || STATUS_STYLES.untested}`}
    >
      {STATUS_LABELS[normalized] || "Untested"}
    </span>
  );
}
