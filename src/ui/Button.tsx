// ============================================================
// BUTTON COMPONENT
// ============================================================
// Vissocial Design System - Button variants
// Primary (yellow), Secondary (white), Ghost, Link
// ============================================================

"use client";

import React from "react";
import { LoadingSpinner, ArrowRightIcon } from "@/ui/Icons";

// ============================================================
// Types
// ============================================================

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "link";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  children: React.ReactNode;
}

// ============================================================
// Button Component
// ============================================================

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconPosition = "left",
  fullWidth = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  // Base classes
  const baseClasses = `
    inline-flex items-center justify-center gap-2
    font-medium transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  // Variant classes
  const variantClasses = {
    primary: `
      bg-primary-500 text-gray-900
      hover:bg-primary-600 active:bg-primary-700
      focus:ring-primary-500
      shadow-button hover:shadow-md
    `,
    secondary: `
      bg-white text-gray-700 border border-gray-200
      hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100
      focus:ring-primary-500
    `,
    ghost: `
      text-gray-600 
      hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200
      focus:ring-gray-500
    `,
    link: `
      text-violet-600 
      hover:text-violet-700 hover:underline
      focus:ring-violet-500
      p-0
    `,
  };

  // Size classes
  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm rounded-lg",
    md: "px-4 py-2.5 text-sm rounded-xl",
    lg: "px-6 py-3 text-base rounded-xl",
  };

  // Combine classes
  const combinedClasses = `
    ${baseClasses}
    ${variantClasses[variant]}
    ${variant !== "link" ? sizeClasses[size] : ""}
    ${fullWidth ? "w-full" : ""}
    ${className}
  `.replace(/\s+/g, " ").trim();

  // Content rendering
  const renderContent = () => {
    if (loading) {
      return (
        <>
          <LoadingSpinner className="w-4 h-4" />
          <span>{children}</span>
        </>
      );
    }

    if (icon && iconPosition === "left") {
      return (
        <>
          {icon}
          <span>{children}</span>
        </>
      );
    }

    if (icon && iconPosition === "right") {
      return (
        <>
          <span>{children}</span>
          {icon}
        </>
      );
    }

    return children;
  };

  return (
    <button
      className={combinedClasses}
      disabled={disabled || loading}
      {...props}
    >
      {renderContent()}
    </button>
  );
}

// ============================================================
// Re-export ArrowRightIcon for CTA convenience
// ============================================================

export { ArrowRightIcon };

export default Button;
