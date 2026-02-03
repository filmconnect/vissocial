// ============================================================
// UI: MultiSelect
// ============================================================
// Dropdown za odabir više opcija kao tagovi
// ============================================================

"use client";

import { useState, useRef, useEffect } from "react";

interface MultiSelectProps {
  selected: string[];
  options: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  maxItems?: number;
}

export function MultiSelect({ 
  selected, 
  options, 
  onChange,
  placeholder = "Odaberi...",
  maxItems = 5
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(s => s !== option));
    } else if (selected.length < maxItems) {
      onChange([...selected, option]);
    }
  };

  const removeOption = (option: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter(s => s !== option));
  };

  const availableOptions = options.filter(o => !selected.includes(o));

  return (
    <div ref={containerRef} className="relative">
      {/* Selected tags + trigger */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="min-h-[38px] w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 cursor-pointer hover:border-zinc-300 transition-colors flex flex-wrap gap-1.5 items-center"
      >
        {selected.length === 0 ? (
          <span className="text-sm text-zinc-400 px-1">{placeholder}</span>
        ) : (
          selected.map(item => (
            <span
              key={item}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded text-xs font-medium"
            >
              {item}
              <button
                onClick={(e) => removeOption(item, e)}
                className="hover:text-red-600 transition-colors"
              >
                ×
              </button>
            </span>
          ))
        )}
        
        {/* Dropdown arrow */}
        <svg
          className={`ml-auto w-4 h-4 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg max-h-48 overflow-y-auto">
          {availableOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-zinc-500">
              {selected.length >= maxItems ? "Maksimalan broj odabran" : "Nema dostupnih opcija"}
            </div>
          ) : (
            availableOptions.map(option => (
              <div
                key={option}
                onClick={() => toggleOption(option)}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-zinc-50 transition-colors"
              >
                {option}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
