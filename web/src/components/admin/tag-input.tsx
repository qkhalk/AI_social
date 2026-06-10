"use client";

import { useState } from "react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  label: string;
  placeholder?: string;
}

/**
 * Tag-style text input with add/remove functionality.
 * Shared between agent form (expertise keywords) and room form (topic tags).
 */
export function TagInput({ tags, onChange, label, placeholder = "Type and press Enter" }: TagInputProps) {
  const [input, setInput] = useState("");

  function addTag() {
    const tag = input.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <div className="flex gap-2 mb-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={addTag}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
        >
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800 text-gray-300 rounded text-xs"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-gray-500 hover:text-red-400"
            >
              x
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
