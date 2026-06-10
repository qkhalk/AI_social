"use client";

export interface TokenUsageRow {
  agent_name: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
}

interface TokenUsageChartProps {
  data: TokenUsageRow[];
}

/**
 * CSS-based horizontal bar chart for token usage per agent.
 * No external chart library — pure Tailwind bars.
 */
export function TokenUsageChart({ data }: TokenUsageChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-gray-500 text-sm py-8 text-center">
        No token usage data available.
      </p>
    );
  }

  const maxTokens = Math.max(...data.map((d) => d.total_tokens), 1);

  return (
    <div className="space-y-4">
      {data.map((row) => (
        <div key={row.agent_name}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-300 font-medium">{row.agent_name}</span>
            <span className="text-xs text-gray-500">
              {row.total_tokens.toLocaleString()} tokens
            </span>
          </div>
          <div className="flex gap-0.5 h-6">
            {/* Prompt tokens (blue) */}
            <div
              className="bg-blue-600 rounded-l"
              style={{ width: `${(row.prompt_tokens / maxTokens) * 100}%`, minWidth: row.prompt_tokens > 0 ? "2px" : "0" }}
              title={`Prompt: ${row.prompt_tokens.toLocaleString()}`}
            />
            {/* Completion tokens (purple) */}
            <div
              className="bg-purple-600 rounded-r"
              style={{ width: `${(row.completion_tokens / maxTokens) * 100}%`, minWidth: row.completion_tokens > 0 ? "2px" : "0" }}
              title={`Completion: ${row.completion_tokens.toLocaleString()}`}
            />
          </div>
          <div className="flex gap-4 mt-1">
            <span className="text-xs text-blue-400">
              Prompt: {row.prompt_tokens.toLocaleString()}
            </span>
            <span className="text-xs text-purple-400">
              Completion: {row.completion_tokens.toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
