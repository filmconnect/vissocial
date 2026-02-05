// ============================================================
// CHAT BUBBLE COMPONENT
// ============================================================
// Vissocial - Chat message bubbles with modern AI avatar
// NO ROBOT - Uses sparkle/gradient avatar
// Extended: file_upload, asset_delete chip types
// ============================================================

"use client";

import React from "react";
import {
  UploadIcon,
  TrashIcon,
  CheckIcon,
  ChevronRightIcon,
  LoadingSpinner,
  ArrowRightIcon,
} from "@/ui/Icons";

// ============================================================
// Types
// ============================================================

export interface ChatMessage {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  timestamp?: Date;
  chips?: ChatChipData[];
  metadata?: {
    title?: string;
    subtitle?: string;
    fields?: { label: string; value: string }[];
  };
}

export interface ChatChipData {
  type:
    | "suggestion"
    | "onboarding_option"
    | "product_confirm"
    | "navigation"
    | "action"
    | "file_upload"
    | "asset_delete";
  label: string;
  value?: string;
  recommended?: boolean;
  href?: string;
  productId?: string;
  action?: "confirm" | "reject";
  /** Asset ID for asset_delete operations */
  assetId?: string;
  /** Upload type hint for file_upload (e.g. "style_reference", "product_reference") */
  uploadType?: string;
  /** Accepted MIME types for file_upload (e.g. "image/*") */
  accept?: string;
}

// ============================================================
// AI Avatar Icon (Modern sparkle design)
// ============================================================

function AIAvatar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`
        w-10 h-10 rounded-xl flex-shrink-0
        bg-gradient-to-br from-primary-400 to-primary-500
        flex items-center justify-center
        shadow-sm
        ${className}
      `}
    >
      <svg className="w-5 h-5 text-gray-900" viewBox="0 0 24 24" fill="currentColor">
        {/* Star/sparkle shape */}
        <path d="M12 2L13.09 8.26L18 6L15.74 10.91L22 12L15.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L8.26 13.09L2 12L8.26 10.91L6 6L10.91 8.26L12 2Z" />
      </svg>
    </div>
  );
}

// ============================================================
// User Avatar
// ============================================================

function UserAvatar({ name, className = "" }: { name?: string; className?: string }) {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <div
      className={`
        w-10 h-10 rounded-xl flex-shrink-0
        bg-gray-100 text-gray-600
        flex items-center justify-center
        text-sm font-medium
        ${className}
      `}
    >
      {initials}
    </div>
  );
}

// ============================================================
// Chip Component (extended with type-specific rendering)
// ============================================================

interface ChipProps {
  chip: ChatChipData;
  onClick?: (value: string) => void;
  selected?: boolean;
  disabled?: boolean;
}

function Chip({ chip, onClick, selected = false, disabled = false }: ChipProps) {
  const baseClasses = `
    inline-flex items-center gap-2
    px-4 py-2.5 text-sm font-medium
    rounded-full border
    transition-all duration-200
    cursor-pointer select-none
    focus:outline-none focus:ring-2 focus:ring-offset-2
  `;

  // ── Type-specific style logic ────────────────────────────
  const getStateClasses = (): string => {
    if (disabled) {
      return "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed focus:ring-primary-500";
    }

    // asset_delete → reddish styling
    if (chip.type === "asset_delete") {
      if (selected) {
        return "bg-red-100 text-red-700 border-red-400 shadow-sm focus:ring-red-500";
      }
      return "bg-white text-red-600 border-gray-200 hover:border-red-300 hover:bg-red-50 hover:shadow-sm focus:ring-red-500";
    }

    // product_confirm with action="reject" → neutral grey
    if (chip.type === "product_confirm" && chip.action === "reject") {
      if (selected) {
        return "bg-gray-200 text-gray-700 border-gray-400 shadow-sm focus:ring-gray-500";
      }
      return "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:bg-gray-50 hover:shadow-sm focus:ring-gray-500";
    }

    // file_upload → subtle primary accent
    if (chip.type === "file_upload") {
      if (selected) {
        return "bg-primary-100 text-gray-900 border-primary-500 shadow-sm focus:ring-primary-500";
      }
      return "bg-white text-gray-700 border-dashed border-gray-300 hover:border-primary-400 hover:bg-primary-50 hover:shadow-sm focus:ring-primary-500";
    }

    // Default styles (suggestion, onboarding_option, product_confirm/confirm, navigation, action)
    if (selected || chip.recommended) {
      return "bg-primary-100 text-gray-900 border-primary-500 shadow-sm focus:ring-primary-500";
    }

    return "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:shadow-sm focus:ring-primary-500";
  };

  // ── Leading icon by type ─────────────────────────────────
  const renderLeadingIcon = () => {
    if (selected) {
      return <CheckIcon className="w-4 h-4" />;
    }

    switch (chip.type) {
      case "file_upload":
        return <UploadIcon className="w-4 h-4" />;
      case "asset_delete":
        return <TrashIcon className="w-4 h-4" />;
      default:
        return null;
    }
  };

  // ── Trailing indicator ───────────────────────────────────
  const renderTrailing = () => {
    if (selected) return null;

    if (chip.recommended) {
      return <span className="text-xs text-primary-600">(recommended)</span>;
    }

    // No chevron for destructive or upload chips — they have leading icons
    if (chip.type === "file_upload" || chip.type === "asset_delete") {
      return null;
    }

    return <ChevronRightIcon className="w-3 h-3 text-gray-400" />;
  };

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick(chip.value || chip.label);
    }
  };

  return (
    <button
      type="button"
      className={`${baseClasses} ${getStateClasses()}`.replace(/\s+/g, " ").trim()}
      onClick={handleClick}
      disabled={disabled}
    >
      {renderLeadingIcon()}
      <span>{chip.label}</span>
      {renderTrailing()}
    </button>
  );
}

// ============================================================
// Metadata Display (for profile analysis)
// ============================================================

interface MetadataDisplayProps {
  metadata: ChatMessage["metadata"];
}

function MetadataDisplay({ metadata }: MetadataDisplayProps) {
  if (!metadata) return null;

  return (
    <div className="mt-4 space-y-3">
      {/* Field list */}
      {metadata.fields && metadata.fields.length > 0 && (
        <div className="space-y-2">
          {metadata.fields.map((field, idx) => (
            <div key={idx} className="flex gap-3 text-sm">
              <span className="text-gray-500 w-32 flex-shrink-0">{field.label}:</span>
              <span className="text-gray-900 font-medium">{field.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Selection Chip (User's selected answer)
// ============================================================

interface SelectionDisplayProps {
  value: string;
}

function SelectionDisplay({ value }: SelectionDisplayProps) {
  return (
    <div className="flex justify-end mt-2">
      <span className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
        {value}
      </span>
    </div>
  );
}

// ============================================================
// Chat Bubble Props
// ============================================================

export interface ChatBubbleProps {
  message: ChatMessage;
  onChipClick?: (value: string) => void;
  selectedValue?: string;
  disabled?: boolean;
  showAvatar?: boolean;
}

// ============================================================
// Chat Bubble Component
// ============================================================

export function ChatBubble({
  message,
  onChipClick,
  selectedValue,
  disabled = false,
  showAvatar = true,
}: ChatBubbleProps) {
  const isAssistant = message.role === "assistant";
  const isUser = message.role === "user";

  // User message styling
  if (isUser) {
    return <SelectionDisplay value={message.content} />;
  }

  // Assistant message styling
  return (
    <div className="flex gap-3 animate-fade-in">
      {/* Avatar */}
      {showAvatar && <AIAvatar />}

      {/* Message content */}
      <div className="flex-1 min-w-0">
        {/* Message bubble */}
        <div className="bg-white rounded-2xl shadow-chat px-5 py-4">
          {/* Title (if present) */}
          {message.metadata?.title && (
            <div className="mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                {message.metadata.title}
              </h3>
              {message.metadata.subtitle && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {message.metadata.subtitle}
                </p>
              )}
            </div>
          )}

          {/* Message text */}
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>

          {/* Metadata fields */}
          {message.metadata && <MetadataDisplay metadata={message.metadata} />}

          {/* Chips */}
          {message.chips && message.chips.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex flex-wrap gap-2">
                {message.chips.map((chip, idx) => (
                  <Chip
                    key={`${chip.label}-${idx}`}
                    chip={chip}
                    onClick={onChipClick}
                    selected={selectedValue === (chip.value || chip.label)}
                    disabled={disabled || !!selectedValue}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Primary Action Button (like "Sounds good → Continue")
// ============================================================

export interface ActionButtonProps {
  label: string;
  onClick?: () => void;
  loading?: boolean;
  variant?: "primary" | "secondary" | "link";
  icon?: "arrow" | "none";
}

export function ActionButton({
  label,
  onClick,
  loading = false,
  variant = "primary",
  icon = "arrow",
}: ActionButtonProps) {
  const baseClasses =
    "inline-flex items-center gap-2 font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2";

  const variantClasses = {
    primary:
      "px-6 py-3 bg-primary-500 text-gray-900 rounded-xl hover:bg-primary-600 focus:ring-primary-500 shadow-button hover:shadow-md",
    secondary:
      "px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl hover:border-gray-300 focus:ring-gray-500",
    link: "text-violet-600 hover:text-violet-700 hover:underline",
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`${baseClasses} ${variantClasses[variant]} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {loading && <LoadingSpinner className="w-5 h-5" />}
      <span>{label}</span>
      {icon === "arrow" && variant === "primary" && !loading && (
        <ArrowRightIcon className="w-4 h-4" />
      )}
    </button>
  );
}

// ============================================================
// Action Footer (for buttons at bottom of bubble)
// ============================================================

export interface ActionFooterProps {
  primaryLabel?: string;
  primaryOnClick?: () => void;
  primaryLoading?: boolean;
  secondaryLabel?: string;
  secondaryOnClick?: () => void;
  hint?: string;
}

export function ActionFooter({
  primaryLabel,
  primaryOnClick,
  primaryLoading = false,
  secondaryLabel,
  secondaryOnClick,
  hint,
}: ActionFooterProps) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
      <div className="flex items-center gap-3 justify-end">
        {primaryLabel && (
          <ActionButton
            label={primaryLabel}
            onClick={primaryOnClick}
            loading={primaryLoading}
            variant="primary"
          />
        )}
      </div>
      {secondaryLabel && (
        <div className="text-right">
          <button
            onClick={secondaryOnClick}
            className="text-sm text-violet-600 hover:text-violet-700 hover:underline transition-colors"
          >
            {secondaryLabel}
          </button>
        </div>
      )}
      {hint && <p className="text-xs text-gray-400 text-right">{hint}</p>}
    </div>
  );
}

// ============================================================
// Exports
// ============================================================

export default ChatBubble;
