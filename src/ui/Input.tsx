// ============================================================
// INPUT COMPONENT
// ============================================================
// Vissocial Design System - Input field with variants
// ============================================================

"use client";

import React, { forwardRef } from "react";
import { SearchIcon, InstagramIcon } from "@/ui/Icons";

// ============================================================
// Types
// ============================================================

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
}

// ============================================================
// Input Component
// ============================================================

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      icon,
      iconPosition = "left",
      fullWidth = true,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    // Base input classes
    const baseClasses = `
      px-4 py-3 text-gray-900 bg-white
      border rounded-xl
      transition-all duration-200
      placeholder:text-gray-400
      focus:outline-none focus:ring-2 focus:border-transparent
    `;

    // State classes
    const stateClasses = error
      ? "border-error-500 focus:ring-error-500"
      : "border-gray-200 focus:ring-primary-500";

    // Icon padding
    const iconPadding = icon
      ? iconPosition === "left"
        ? "pl-11"
        : "pr-11"
      : "";

    // Width class
    const widthClass = fullWidth ? "w-full" : "";

    const combinedClasses = `
      ${baseClasses}
      ${stateClasses}
      ${iconPadding}
      ${widthClass}
      ${className}
    `.replace(/\s+/g, " ").trim();

    return (
      <div className={fullWidth ? "w-full" : ""}>
        {/* Label */}
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {label}
          </label>
        )}

        {/* Input wrapper */}
        <div className="relative">
          {/* Icon (left) */}
          {icon && iconPosition === "left" && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              {icon}
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={inputId}
            className={combinedClasses}
            {...props}
          />

          {/* Icon (right) */}
          {icon && iconPosition === "right" && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              {icon}
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <p className="mt-1.5 text-sm text-error-500">{error}</p>
        )}

        {/* Hint text */}
        {hint && !error && (
          <p className="mt-1.5 text-sm text-gray-500">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

// ============================================================
// Textarea Component
// ============================================================

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      hint,
      fullWidth = true,
      className = "",
      id,
      rows = 4,
      ...props
    },
    ref
  ) => {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

    // Base classes
    const baseClasses = `
      px-4 py-3 text-gray-900 bg-white
      border rounded-xl
      transition-all duration-200
      placeholder:text-gray-400
      focus:outline-none focus:ring-2 focus:border-transparent
      resize-none
    `;

    // State classes
    const stateClasses = error
      ? "border-error-500 focus:ring-error-500"
      : "border-gray-200 focus:ring-primary-500";

    // Width class
    const widthClass = fullWidth ? "w-full" : "";

    const combinedClasses = `
      ${baseClasses}
      ${stateClasses}
      ${widthClass}
      ${className}
    `.replace(/\s+/g, " ").trim();

    return (
      <div className={fullWidth ? "w-full" : ""}>
        {/* Label */}
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {label}
          </label>
        )}

        {/* Textarea */}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          className={combinedClasses}
          {...props}
        />

        {/* Error message */}
        {error && (
          <p className="mt-1.5 text-sm text-error-500">{error}</p>
        )}

        {/* Hint text */}
        {hint && !error && (
          <p className="mt-1.5 text-sm text-gray-500">{hint}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

// ============================================================
// Search Input (with search icon)
// ============================================================

export interface SearchInputProps extends Omit<InputProps, "icon" | "iconPosition"> {}

export function SearchInput(props: SearchInputProps) {
  return (
    <Input
      icon={<SearchIcon />}
      iconPosition="left"
      {...props}
    />
  );
}

// ============================================================
// Instagram Handle Input
// ============================================================

export interface InstagramInputProps extends Omit<InputProps, "icon" | "iconPosition"> {}

export function InstagramInput(props: InstagramInputProps) {
  return (
    <Input
      icon={<InstagramIcon className="w-5 h-5 text-gray-400" />}
      iconPosition="left"
      placeholder="instagram.com/yourhandle or @yourhandle"
      {...props}
    />
  );
}

// ============================================================
// Exports
// ============================================================

export default Input;
