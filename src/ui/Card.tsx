// ============================================================
// CARD COMPONENT
// ============================================================
// Vissocial Design System - Card with variants
// ============================================================

"use client";

import React from "react";

// ============================================================
// Types
// ============================================================

export interface CardProps {
  children: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
  className?: string;
  onClick?: () => void;
}

// ============================================================
// Card Component
// ============================================================

export function Card({
  children,
  padding = "md",
  hover = false,
  className = "",
  onClick,
}: CardProps) {
  const baseClasses = "bg-white rounded-2xl shadow-card";

  const paddingClasses = {
    none: "",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  const hoverClasses = hover
    ? "transition-all duration-200 hover:shadow-card-hover cursor-pointer"
    : "";

  const combinedClasses = `
    ${baseClasses}
    ${paddingClasses[padding]}
    ${hoverClasses}
    ${className}
  `.replace(/\s+/g, " ").trim();

  return (
    <div className={combinedClasses} onClick={onClick}>
      {children}
    </div>
  );
}

// ============================================================
// Card Header
// ============================================================

export interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className = "" }: CardHeaderProps) {
  return (
    <div className={`mb-4 ${className}`}>
      {children}
    </div>
  );
}

// ============================================================
// Card Title
// ============================================================

export interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "h4";
}

export function CardTitle({ children, className = "", as: Tag = "h2" }: CardTitleProps) {
  return (
    <Tag className={`text-lg font-semibold text-gray-900 ${className}`}>
      {children}
    </Tag>
  );
}

// ============================================================
// Card Description
// ============================================================

export interface CardDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function CardDescription({ children, className = "" }: CardDescriptionProps) {
  return (
    <p className={`text-sm text-gray-500 mt-1 ${className}`}>
      {children}
    </p>
  );
}

// ============================================================
// Card Content
// ============================================================

export interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className = "" }: CardContentProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

// ============================================================
// Card Footer
// ============================================================

export interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "center" | "right" | "between";
}

export function CardFooter({ children, className = "", align = "right" }: CardFooterProps) {
  const alignClasses = {
    left: "justify-start",
    center: "justify-center",
    right: "justify-end",
    between: "justify-between",
  };

  return (
    <div className={`mt-6 pt-4 border-t border-gray-100 flex items-center gap-3 ${alignClasses[align]} ${className}`}>
      {children}
    </div>
  );
}

// ============================================================
// Card Separator
// ============================================================

export function CardSeparator({ className = "" }: { className?: string }) {
  return <hr className={`border-gray-100 my-4 ${className}`} />;
}

// ============================================================
// Exports
// ============================================================

export default Card;
