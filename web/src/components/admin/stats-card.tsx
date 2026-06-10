"use client";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
}

/**
 * Dashboard stats card with optional trend indicator.
 * Used across all admin overview sections.
 */
export function StatsCard({ title, value, subtitle, trend }: StatsCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <p className="text-sm text-gray-400 mb-1">{title}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {subtitle && (
        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      )}
      {trend && (
        <div className="flex items-center gap-1 mt-2">
          <span
            className={`text-xs font-medium ${
              trend.value >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value}%
          </span>
          <span className="text-xs text-gray-500">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
