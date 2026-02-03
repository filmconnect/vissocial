// ============================================================
// UI: ColorPicker
// ============================================================
// Prikaz i editiranje dominant colors
// Koristi native color input (bez dependencies)
// ============================================================

"use client";

import { useState } from "react";

interface ColorPickerProps {
  colors: string[];
  onChange: (colors: string[]) => void;
  maxColors?: number;
}

export function ColorPicker({ 
  colors, 
  onChange,
  maxColors = 5
}: ColorPickerProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const addColor = () => {
    if (colors.length < maxColors) {
      onChange([...colors, "#808080"]);
      setEditingIndex(colors.length);
    }
  };

  const updateColor = (index: number, color: string) => {
    const newColors = [...colors];
    newColors[index] = color;
    onChange(newColors);
  };

  const removeColor = (index: number) => {
    const newColors = colors.filter((_, i) => i !== index);
    onChange(newColors);
    setEditingIndex(null);
  };

  return (
    <div className="space-y-2">
      {/* Color swatches */}
      <div className="flex flex-wrap gap-2 items-center">
        {colors.map((color, index) => (
          <div key={index} className="relative group">
            {/* Color swatch */}
            <div
              className="w-10 h-10 rounded-lg border-2 border-zinc-200 cursor-pointer shadow-sm hover:border-zinc-400 transition-colors"
              style={{ backgroundColor: color }}
              onClick={() => setEditingIndex(editingIndex === index ? null : index)}
              title={color}
            />
            
            {/* Remove button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeColor(index);
              }}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>

            {/* Color picker popup */}
            {editingIndex === index && (
              <div className="absolute z-50 mt-2 p-2 bg-white rounded-lg shadow-lg border border-zinc-200">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => updateColor(index, e.target.value)}
                  className="w-32 h-32 cursor-pointer border-0"
                />
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                        updateColor(index, val);
                      }
                    }}
                    className="flex-1 px-2 py-1 text-xs font-mono border border-zinc-200 rounded"
                    placeholder="#FFFFFF"
                  />
                  <button
                    onClick={() => setEditingIndex(null)}
                    className="px-2 py-1 text-xs bg-zinc-100 rounded hover:bg-zinc-200"
                  >
                    OK
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add button */}
        {colors.length < maxColors && (
          <button
            onClick={addColor}
            className="w-10 h-10 rounded-lg border-2 border-dashed border-zinc-300 flex items-center justify-center text-zinc-400 hover:border-zinc-400 hover:text-zinc-500 transition-colors"
            title="Dodaj boju"
          >
            +
          </button>
        )}
      </div>

      {/* Color codes */}
      <div className="text-xs text-zinc-500">
        {colors.join(", ") || "Nema boja"}
      </div>
    </div>
  );
}
