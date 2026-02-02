// ============================================================
// CHAT CHIP COMPONENT
// ============================================================
// Clickable chip za chat poruke.
// Types: suggestion, onboarding_option, product_confirm, navigation
// ============================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ============================================================
// TYPES
// ============================================================

export interface ChatChipData {
  type: "suggestion" | "onboarding_option" | "product_confirm" | "navigation";
  label: string;
  value?: string;
  step?: string;
  href?: string;
  productId?: string;
  action?: "confirm" | "reject";
}

interface ChatChipProps {
  chip: ChatChipData;
  onSelect?: (value: string) => void;
  disabled?: boolean;
}

// ============================================================
// ICONS (inline SVG)
// ============================================================

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SpinnerIcon = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

// ============================================================
// COMPONENT
// ============================================================

export function ChatChip({ chip, onSelect, disabled = false }: ChatChipProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isRejected, setIsRejected] = useState(false);

  // Handle chip click
  async function handleClick() {
    if (disabled || isLoading || isConfirmed || isRejected) return;

    // Navigation chip
    if (chip.type === "navigation" && chip.href) {
      router.push(chip.href);
      return;
    }

    // Product confirm/reject
    if (chip.type === "product_confirm" && chip.productId) {
      setIsLoading(true);
      
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
          if (chip.action === "reject") {
            setIsRejected(true);
          } else {
            setIsConfirmed(true);
          }
        }
      } catch (error) {
        console.error("Chip action failed:", error);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Suggestion or onboarding option - send to parent
    if (onSelect) {
      onSelect(chip.value || chip.label);
    }
  }

  // Determine chip style based on type and state
  function getChipStyle(): string {
    const baseStyle = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer select-none";
    
    // Already actioned
    if (isConfirmed) {
      return `${baseStyle} bg-green-100 text-green-700 border border-green-300`;
    }
    if (isRejected) {
      return `${baseStyle} bg-red-100 text-red-700 border border-red-300`;
    }
    
    // Loading
    if (isLoading) {
      return `${baseStyle} bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-wait`;
    }
    
    // Disabled
    if (disabled) {
      return `${baseStyle} bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed`;
    }

    // By type
    switch (chip.type) {
      case "product_confirm":
        if (chip.action === "reject") {
          return `${baseStyle} bg-red-50 text-red-700 border border-red-200 hover:bg-red-100`;
        }
        return `${baseStyle} bg-green-50 text-green-700 border border-green-200 hover:bg-green-100`;
      
      case "navigation":
        return `${baseStyle} bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100`;
      
      case "onboarding_option":
        return `${baseStyle} bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100`;
      
      case "suggestion":
      default:
        return `${baseStyle} bg-zinc-100 text-zinc-700 border border-zinc-200 hover:bg-zinc-200`;
    }
  }

  // Render icon based on state
  function renderIcon() {
    if (isLoading) return <SpinnerIcon />;
    if (isConfirmed) return <CheckIcon />;  // ✅ Kvačica, ne sat!
    if (isRejected) return <XIcon />;
    
    // Default icons by type
    if (chip.type === "navigation") return <ArrowRightIcon />;
    if (chip.type === "product_confirm") {
      return chip.action === "reject" ? <XIcon /> : <CheckIcon />;
    }
    
    return null;
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading || isConfirmed || isRejected}
      className={getChipStyle()}
    >
      {renderIcon()}
      <span>{chip.label}</span>
    </button>
  );
}

// ============================================================
// CHIP LIST COMPONENT
// ============================================================

interface ChatChipListProps {
  chips: ChatChipData[];
  onSelect?: (value: string) => void;
  disabled?: boolean;
}

export function ChatChipList({ chips, onSelect, disabled }: ChatChipListProps) {
  if (!chips || chips.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {chips.map((chip, index) => (
        <ChatChip
          key={`${chip.label}-${index}`}
          chip={chip}
          onSelect={onSelect}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

// ============================================================
// LEGACY SUPPORT: Convert string chips to ChatChipData
// ============================================================

export function normalizeChips(chips: (string | ChatChipData)[] | undefined): ChatChipData[] {
  if (!chips) return [];
  
  return chips.map(chip => {
    if (typeof chip === "string") {
      // Legacy string chip - convert to suggestion
      return {
        type: "suggestion" as const,
        label: chip,
        value: chip
      };
    }
    return chip;
  });
}
