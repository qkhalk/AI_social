"use client";

import { StatsCard } from "./stats-card";
import { TokenUsageChart, type TokenUsageRow } from "./token-usage-chart";

interface AnalyticsDashboardProps {
  tokenUsageData: TokenUsageRow[];
  roomStatusDistribution: Record<string, number>;
  messagesPerDay: { date: string; count: number }[];
  totalAgents: number;
  activeAgents: number;
  totalRooms: number;
  totalMessages: number;
}

const STATUS_COLORS: Record<string, string> = {
  waiting: "bg-yellow-500",
  active: "bg-green-500",
  paused: "bg-orange-500",
  concluded: "bg-red-500",
  archived: "bg-gray-500",
};

/**
 * Client component that renders the full analytics view:
 * summary stats, token usage chart, room distribution, daily activity.
 */
export function AnalyticsDashboard({
  tokenUsageData,
  roomStatusDistribution,
  messagesPerDay,
  totalAgents,
  activeAgents,
  totalRooms,
  totalMessages,
}: AnalyticsDashboardProps) {
  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Agents" value={totalAgents} subtitle={`${activeAgents} active`} />
        <StatsCard title="Total Rooms" value={totalRooms} />
        <StatsCard title="Messages Analyzed" value={totalMessages} />
        <StatsCard title="Days Active" value={messagesPerDay.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent activity chart (token usage proxy) */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Agent Activity</h2>
          <TokenUsageChart data={tokenUsageData} />
        </div>

        {/* Room status distribution */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Room Status</h2>
          {Object.keys(roomStatusDistribution).length === 0 ? (
            <p className="text-gray-500 text-sm">No rooms yet.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(roomStatusDistribution).map(([status, count]) => {
                const total = Object.values(roomStatusDistribution).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={status}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300 capitalize">{status}</span>
                      <span className="text-gray-500">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${STATUS_COLORS[status] ?? "bg-gray-600"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Daily message activity */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Daily Messages (Last 7 Days)</h2>
        {messagesPerDay.length === 0 ? (
          <p className="text-gray-500 text-sm">No message activity in the last 7 days.</p>
        ) : (
          <div className="flex items-end gap-2 h-40">
            {messagesPerDay.map(({ date, count }) => {
              const maxCount = Math.max(...messagesPerDay.map((d) => d.count), 1);
              const height = Math.max((count / maxCount) * 100, 4);
              return (
                <div key={date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-400">{count}</span>
                  <div
                    className="w-full bg-blue-600 rounded-t"
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-xs text-gray-600">
                    {new Date(date).toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
