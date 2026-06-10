"use client";

import { PERSONALITY_TRAITS } from "@/lib/admin/agent-constants";

interface PersonalitySlidersProps {
  traits: Record<string, number>;
  onChange: (trait: string, value: number) => void;
}

/**
 * Range sliders for agent personality dimensions.
 * Extracted from agent-form to keep file under 200 lines.
 */
export function PersonalitySliders({ traits, onChange }: PersonalitySlidersProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">Personality Traits</label>
      <div className="space-y-2">
        {PERSONALITY_TRAITS.map((trait) => {
          const val = traits[trait] ?? 0.5;
          return (
            <div key={trait} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-28 capitalize">{trait}</span>
              <input
                type="range"
                min={0} max={1} step={0.1}
                value={val}
                onChange={(e) => onChange(trait, parseFloat(e.target.value))}
                className="flex-1 accent-blue-500"
              />
              <span className="text-xs text-gray-500 w-8">{val.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
