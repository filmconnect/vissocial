// ============================================================
// CHAT CHIP COMPONENT
// ============================================================
// Interactive chip component for chat interface.
// Supports: suggestions, onboarding options, product confirmations, navigation
// 
// FIX: Icons now correctly show:
//   - Before confirm: ➕ Plus icon (not ✅)
//   - After confirm: ✅ Checkmark icon
// ============================================================

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatChip as ChatChipType } from "@/types/vision";

// ============================================================
// Icon Components (inline SVG for simplicity)
// ============================================================

function PlusIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function CheckIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SpinnerIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function ArrowRightIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );
}

function ChatBubbleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

// ============================================================
// Type definitions
// ============================================================

interface ChatChipProps {
  chip: ChatChipType;
  onAction?: (chip: ChatChipType) => void | Promise<void>;
  disabled?: boolean;
}

type ChipState = "default" | "loading" | "confirmed" | "rejected";

// ============================================================
// Helper: Normalize chip from legacy format
// ============================================================

function normalizeChip(chip: ChatChipType | string): ChatChipType {
  // Handle legacy string chips (backward compatibility)
  if (typeof chip === "string") {
    return {
      type: "suggestion",
      label: chip,
      value: chip
    };
  }
  return chip;
}

// ============================================================
// Main Component
// ============================================================

export function ChatChip({ chip: rawChip, onAction, disabled = false }: ChatChipProps) {
  const router = useRouter();
  const chip = normalizeChip(rawChip);
  
  const [state, setState] = useState<ChipState>("default");

  const isLoading = state === "loading";
  const isConfirmed = state === "confirmed";
  const isRejected = state === "rejected";
  const isInteracted = isConfirmed || isRejected;

  // ============================================================
  // Icon rendering logic
  // FIX: Before confirmation = Plus icon, After = Check icon
  // ============================================================
  function renderIcon() {
    // Always show spinner when loading
    if (isLoading) {
      return <SpinnerIcon />;
    }

    // After interaction
    if (isConfirmed) {
      return <CheckIcon className="w-4 h-4 text-green-600" />;
    }
    if (isRejected) {
      return <XIcon className="w-4 h-4 text-red-600" />;
    }

    // Default icons by type - BEFORE interaction
    switch (chip.type) {
      case "product_confirm":
        // FIX: Show Plus BEFORE confirm, X for reject action
        if (chip.action === "reject") {
          return <XIcon className="w-4 h-4 text-zinc-500" />;
        }
        // Default for "confirm" action: Plus icon (NOT checkmark!)
        return <PlusIcon className="w-4 h-4 text-zinc-500" />;

      case "navigation":
        return <ArrowRightIcon className="w-4 h-4 text-zinc-500" />;

      case "onboarding_option":
        return <ChatBubbleIcon className="w-4 h-4 text-zinc-500" />;

      case "suggestion":
      default:
        return null; // No icon for suggestions
    }
  }

  // ============================================================
  // Click handler
  // ============================================================
  async function handleClick() {
    if (disabled || isLoading || isInteracted) return;

    // Navigation chips
    if (chip.type === "navigation" && chip.href) {
      router.push(chip.href);
      return;
    }

    // Product confirmation
    if (chip.type === "product_confirm" && chip.productId) {
      setState("loading");
      
      try {
        const endpoint = chip.action === "reject" 
          ? "/api/products/reject" 
          : "/api/products/confirm";

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: chip.productId })
        });

        if (res.ok) {
          setState(chip.action === "reject" ? "rejected" : "confirmed");
        } else {
          setState("default");
          console.error("Product action failed:", await res.text());
        }
      } catch (error) {
        console.error("Product action error:", error);
        setState("default");
      }

      // Call optional onAction callback
      if (onAction) {
        await onAction(chip);
      }
      return;
    }

    // Default action callback for other chip types
    if (onAction) {
      setState("loading");
      try {
        await onAction(chip);
        setState("confirmed");
      } catch {
        setState("default");
      }
    }
  }

  // ============================================================
  // Styling
  // ============================================================
  const baseClasses = `
    inline-flex items-center gap-2 
    px-3 py-1.5 
    text-sm font-medium 
    rounded-full 
    transition-all duration-200
    cursor-pointer
    select-none
  `;

  const stateClasses = (() => {
    if (disabled || isLoading) {
      return "bg-zinc-100 text-zinc-400 cursor-not-allowed";
    }

    if (isConfirmed) {
      return "bg-green-50 text-green-700 border border-green-200";
    }

    if (isRejected) {
      return "bg-red-50 text-red-700 border border-red-200";
    }

    // Default state styling by type
    switch (chip.type) {
      case "product_confirm":
        if (chip.action === "reject") {
          return "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100";
        }
        return "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100";

      case "navigation":
        return "bg-zinc-100 text-zinc-700 border border-zinc-200 hover:bg-zinc-200";

      case "onboarding_option":
        return "bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100";

      case "suggestion":
      default:
        return "bg-zinc-100 text-zinc-700 border border-zinc-200 hover:bg-zinc-200";
    }
  })();

  // ============================================================
  // Render
  // ============================================================
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isLoading || isInteracted}
      className={`${baseClasses} ${stateClasses}`}
      title={chip.label}
    >
      {renderIcon()}
      <span>{chip.label}</span>
    </button>
  );
}

// ============================================================
// Chip Group Component (renders multiple chips)
// ============================================================

interface ChipGroupProps {
  chips: (ChatChipType | string)[];
  onAction?: (chip: ChatChipType) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function ChipGroup({ chips, onAction, disabled, className = "" }: ChipGroupProps) {
  if (!chips || chips.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {chips.map((chip, index) => (
        <ChatChip
          key={typeof chip === "string" ? chip : chip.label + index}
          chip={chip}
          onAction={onAction}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

// ============================================================
// Default export
// ============================================================

export default ChatChip;
