interface LoadingSpinnerProps {
  /** Tailwind size class, e.g. "h-5 w-5" (default "h-8 w-8") */
  size?: string;
  /** Optional text shown below the spinner */
  label?: string;
}

/**
 * Animated loading spinner using Tailwind's animate-spin.
 * Used as a fallback while data is being fetched.
 */
export function LoadingSpinner({ size = "h-8 w-8", label }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className={`${size} border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin`}
      />
      {label && <p className="text-sm text-gray-500">{label}</p>}
    </div>
  );
}
