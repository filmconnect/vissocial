"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Re-export types from server lib
export type ChipType =
  | "suggestion"
  | "onboarding_option"
  | "navigation"
  | "product_confirm"
  | "action";

export interface ChatChip {
  type: ChipType;
  label: string;
  value?: string;
  step?: string;
  href?: string;
  productId?: string;
  action?: "confirm" | "reject";
  apiEndpoint?: string;
  payload?: Record<string, any>;
}

// ============================================================
// LEGACY CONVERTER (client-side copy)
// ============================================================

export function convertLegacyChips(chips: any[] | undefined): ChatChip[] {
  if (!chips) return [];

  return chips.map((c) => {
    if (typeof c === "object" && c.type) {
      return c as ChatChip;
    }

    const label = String(c);

    // Navigation chips
    if (
      label.toLowerCase().includes("otvori") ||
      label.toLowerCase().includes("settings") ||
      label.toLowerCase().includes("poveži")
    ) {
      const hrefMap: Record<string, string> = {
        calendar: "/calendar",
        kalendar: "/calendar",
        settings: "/settings",
        postavke: "/settings",
        instagram: "/settings",
        export: "/export",
        profile: "/profile",
        profil: "/profile",
      };

      for (const [key, href] of Object.entries(hrefMap)) {
        if (label.toLowerCase().includes(key)) {
          return { type: "navigation" as ChipType, label, href };
        }
      }
    }

    return { type: "suggestion" as ChipType, label, value: label };
  });
}

// ============================================================
// SINGLE CHIP BUTTON
// ============================================================

interface ChatChipButtonProps {
  chip: ChatChip;
  sessionId: string;
  onSend: (text: string) => void;
  onRefresh?: () => void;
  disabled?: boolean;
}

export function ChatChipButton({
  chip,
  sessionId,
  onSend,
  onRefresh,
  disabled,
}: ChatChipButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  async function handleClick() {
    if (disabled || isLoading || isConfirmed) return;

    switch (chip.type) {
      case "suggestion":
      case "onboarding_option":
        onSend(chip.value || chip.label);
        break;

      case "navigation":
        if (chip.href) router.push(chip.href);
        break;

      case "product_confirm":
        if (chip.productId && chip.action) {
          setIsLoading(true);
          try {
            const endpoint =
              chip.action === "confirm" ? "/api/products/confirm" : "/api/products/reject";
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ product_id: chip.productId }),
            });
            
            if (response.ok) {
              // Show confirmed state briefly, then refresh
              setIsConfirmed(true);
              setTimeout(() => {
                onRefresh?.();
              }, 500);
            } else {
              console.error("Product action failed:", await response.text());
              setIsLoading(false);
            }
          } catch (error) {
            console.error("Product action failed:", error);
            setIsLoading(false);
          }
        }
        break;

      case "action":
        if (chip.apiEndpoint) {
          try {
            await fetch(chip.apiEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(chip.payload || {}),
            });
            onSend(chip.value || `Izvršeno: ${chip.label}`);
            onRefresh?.();
          } catch (error) {
            console.error("Action failed:", error);
          }
        }
        break;
    }
  }

  const baseStyle =
    "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer";

  const typeStyles: Record<ChipType, string> = {
    suggestion: "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200",
    onboarding_option:
      "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200",
    navigation: "bg-zinc-900 text-white hover:bg-zinc-700",
    product_confirm:
      chip.action === "confirm"
        ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
        : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200",
    action: "bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200",
  };

  const disabledStyle = disabled ? "opacity-50 cursor-not-allowed" : "";
  const loadingStyle = isLoading ? "opacity-70 cursor-wait" : "";
  const confirmedStyle = isConfirmed ? "bg-green-500 text-white border-green-500" : "";

  // Determine display label
  let displayLabel = chip.label;
  if (chip.type === "product_confirm") {
    if (isLoading) {
      displayLabel = "⏳ " + chip.label;
    } else if (isConfirmed) {
      displayLabel = "✅ " + chip.label;
    } else {
      // Not yet confirmed - show action icon
      displayLabel = (chip.action === "confirm" ? "☐ " : "✗ ") + chip.label;
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading || isConfirmed}
      className={`${baseStyle} ${confirmedStyle || typeStyles[chip.type]} ${disabledStyle} ${loadingStyle}`}
    >
      {displayLabel}
    </button>
  );
}

// ============================================================
// CHIP GROUP
// ============================================================

interface ChatChipGroupProps {
  chips: ChatChip[];
  sessionId: string;
  onSend: (text: string) => void;
  onRefresh?: () => void;
  disabled?: boolean;
}

export function ChatChipGroup({
  chips,
  sessionId,
  onSend,
  onRefresh,
  disabled,
}: ChatChipGroupProps) {
  if (!chips || chips.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {chips.map((c, idx) => (
        <ChatChipButton
          key={`chip-${idx}-${c.label}`}
          chip={c}
          sessionId={sessionId}
          onSend={onSend}
          onRefresh={onRefresh}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
