// ============================================================
// CHIP COMPONENT
// ============================================================
// Vissocial Design System - Interactive chips
// Used for onboarding options, suggestions, selections
// ============================================================

"use client";

import React, { useState } from "react";
import {
  CheckIcon,
  LoadingSpinner,
  ChevronRightIcon,
} from "@/ui/Icons";

// ============================================================
// Types
// ============================================================

export interface ChipProps {
  label: string;
  value?: string;
  selected?: boolean;
  recommended?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  onClick?: (value: string) => void;
  className?: string;
}

export type ChipData = {
  type: "suggestion" | "onboarding_option" | "product_confirm" | "navigation" | "file_upload" | "action";
  label: string;
  value?: string;
  step?: string;
  href?: string;
  productId?: string;
  action?: "confirm" | "reject";
  recommended?: boolean;
  uploadType?: string;
};

// ============================================================
// Chip Component
// ============================================================

export function Chip({
  label,
  value,
  selected = false,
  recommended = false,
  disabled = false,
  loading = false,
  icon,
  onClick,
  className = "",
}: ChipProps) {
  // Base classes
  const baseClasses = `
    inline-flex items-center gap-2
    px-4 py-2.5 text-sm font-medium
    rounded-full border
    transition-all duration-200
    cursor-pointer select-none
    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500
  `;

  // State classes
  const getStateClasses = () => {
    if (disabled) {
      return "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed";
    }

    if (loading) {
      return "bg-gray-50 text-gray-500 border-gray-200 cursor-wait";
    }

    if (selected || recommended) {
      return "bg-primary-100 text-gray-900 border-primary-500 shadow-sm";
    }

    return "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:shadow-sm";
  };

  const combinedClasses = `
    ${baseClasses}
    ${getStateClasses()}
    ${className}
  `.replace(/\s+/g, " ").trim();

  const handleClick = () => {
    if (!disabled && !loading && onClick) {
      onClick(value || label);
    }
  };

  return (
    <button
      type="button"
      className={combinedClasses}
      onClick={handleClick}
      disabled={disabled || loading}
    >
      {loading && <LoadingSpinner className="w-4 h-4" />}
      {!loading && selected && <CheckIcon className="w-4 h-4 text-primary-600" />}
      {!loading && !selected && icon}
      
      <span>{label}</span>
      
      {recommended && !selected && (
        <span className="text-xs text-primary-600">(recommended)</span>
      )}
      
      {!loading && !selected && !recommended && (
        <ChevronRightIcon className="w-3 h-3 text-gray-400" />
      )}
    </button>
  );
}

// ============================================================
// Chip Group Component
// ============================================================

export interface ChipGroupProps {
  chips: (ChipData | string)[];
  selectedValue?: string;
  onSelect?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  wrap?: boolean;
}

export function ChipGroup({
  chips,
  selectedValue,
  onSelect,
  disabled = false,
  className = "",
  wrap = true,
}: ChipGroupProps) {
  if (!chips || chips.length === 0) return null;

  const wrapClass = wrap ? "flex-wrap" : "flex-nowrap overflow-x-auto";

  return (
    <div className={`flex gap-2 ${wrapClass} ${className}`}>
      {chips.map((chip, index) => {
        // Normalize chip data
        const chipData: ChipData = typeof chip === "string"
          ? { type: "suggestion", label: chip, value: chip }
          : chip;

        const isSelected = selectedValue === (chipData.value || chipData.label);

        return (
          <Chip
            key={`${chipData.label}-${index}`}
            label={chipData.label}
            value={chipData.value || chipData.label}
            selected={isSelected}
            recommended={chipData.recommended}
            disabled={disabled}
            onClick={onSelect}
          />
        );
      })}
    </div>
  );
}

// ============================================================
// Selection Chip (User's selected answer display)
// ============================================================

export interface SelectionDisplayProps {
  label: string;
  className?: string;
}

export function SelectionDisplay({ label, className = "" }: SelectionDisplayProps) {
  return (
    <div className={`ml-auto ${className}`}>
      <span className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
        {label}
      </span>
    </div>
  );
}

// ============================================================
// Chip Factory (for API routes)
// ============================================================

export const chip = {
  suggestion: (label: string, value?: string): ChipData => ({
    type: "suggestion",
    label,
    value: value || label,
  }),

  onboarding: (label: string, step: string, value?: string, recommended?: boolean): ChipData => ({
    type: "onboarding_option",
    label,
    step,
    value: value || label,
    recommended,
  }),

  navigation: (label: string, href: string): ChipData => ({
    type: "navigation",
    label,
    href,
  }),

  productConfirm: (productName: string, productId: string): ChipData => ({
    type: "product_confirm",
    label: productName,
    productId,
    action: "confirm",
  }),

  productReject: (productName: string, productId: string): ChipData => ({
    type: "product_confirm",
    label: productName,
    productId,
    action: "reject",
  }),

  fileUpload: (label: string, uploadType: string): ChipData => ({
    type: "file_upload",
    label,
    uploadType,
  }),

  action: (label: string, value: string): ChipData => ({
    type: "action",
    label,
    value,
  }),
};

// ============================================================
// Exports
// ============================================================

export default Chip;
