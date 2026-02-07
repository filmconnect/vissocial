// ============================================================
// CHAT BUBBLE COMPONENT
// ============================================================
// Vissocial - Chat message bubbles with modern AI avatar
// NO ROBOT - Uses sparkle/gradient avatar
// ============================================================

"use client";

import React from "react";

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
  type: "suggestion" | "onboarding_option" | "product_confirm" | "navigation" | "action";
  label: string;
  value?: string;
  recommended?: boolean;
  href?: string;
  productId?: string;
  action?: "confirm" | "reject";
  confirmed?: boolean;
}

// ============================================================
// AI Avatar Icon (Modern sparkle design)
// ============================================================

function AIAvatar({ className = "" }: { className?: string }) {
  return (
    <div className={`
      w-10 h-10 rounded-xl flex-shrink-0
      bg-gradient-to-br from-primary-400 to-primary-500
      flex items-center justify-center
      shadow-sm
      ${className}
    `}>
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
    ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className={`
      w-10 h-10 rounded-xl flex-shrink-0
      bg-gray-100 text-gray-600
      flex items-center justify-center
      text-sm font-medium
      ${className}
    `}>
      {initials}
    </div>
  );
}

// ============================================================
// Chip Component
// ============================================================

interface ChipProps {
  chip: ChatChipData;
  onClick?: (value: string) => void;
  selected?: boolean;
  disabled?: boolean;
}

function Chip({ chip, onClick, selected = false, disabled = false }: ChipProps) {
  const isConfirmed = chip.confirmed === true;

  const baseClasses = `
    inline-flex items-center gap-2
    px-4 py-2.5 text-sm font-medium
    rounded-full border
    transition-all duration-200
    select-none
    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500
  `;

  const getStateClasses = () => {
    if (isConfirmed) {
      return "bg-green-50 text-green-700 border-green-400 cursor-default shadow-sm";
    }

    if (disabled) {
      return "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed";
    }

    if (selected || chip.recommended) {
      return "bg-primary-100 text-gray-900 border-primary-500 shadow-sm cursor-pointer";
    }

    return "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-pointer";
  };

  const handleClick = () => {
    if (!disabled && !isConfirmed && onClick) {
      onClick(chip.value || chip.label);
    }
  };

  // Build display label — replace ☐ with ✅ when confirmed
  const displayLabel = isConfirmed
    ? chip.label.replace(/^☐\s*/, "✅ ")
    : chip.label;

  return (
    <button
      type="button"
      className={`${baseClasses} ${getStateClasses()}`}
      onClick={handleClick}
      disabled={disabled || isConfirmed}
    >
      {isConfirmed && (
        <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      <span>{displayLabel}</span>
      {!isConfirmed && chip.recommended && !selected && (
        <span className="text-xs text-primary-600">(recommended)</span>
      )}
      {!isConfirmed && !selected && !chip.recommended && (
        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      )}
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
    return (
      <SelectionDisplay value={message.content} />
    );
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
// Primary Action Button (like "Sounds good â†’ Continue")
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
  const baseClasses = "inline-flex items-center gap-2 font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2";

  const variantClasses = {
    primary: "px-6 py-3 bg-primary-500 text-gray-900 rounded-xl hover:bg-primary-600 focus:ring-primary-500 shadow-button hover:shadow-md",
    secondary: "px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl hover:border-gray-300 focus:ring-gray-500",
    link: "text-violet-600 hover:text-violet-700 hover:underline",
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`${baseClasses} ${variantClasses[variant]} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {loading ? (
        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : null}
      <span>{label}</span>
      {icon === "arrow" && variant === "primary" && !loading && (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
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
      {hint && (
        <p className="text-xs text-gray-400 text-right">
          {hint}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Exports
// ============================================================

export default ChatBubble;
