// ============================================================
// AVATAR COMPONENT
// ============================================================
// Vissocial Design System - Modern AI Avatar
// NO ROBOT STYLE - Modern gradient/icon design
// ============================================================

"use client";

import React from "react";

// ============================================================
// Types
// ============================================================

export interface AvatarProps {
  type?: "ai" | "user" | "system";
  size?: "sm" | "md" | "lg";
  name?: string;
  imageUrl?: string;
  className?: string;
}

// ============================================================
// AI Avatar Icon (Modern sparkle/star design)
// ============================================================

function AISparkleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Main star */}
      <path 
        d="M12 2L13.09 8.26L18 6L15.74 10.91L22 12L15.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L8.26 13.09L2 12L8.26 10.91L6 6L10.91 8.26L12 2Z" 
        fill="currentColor"
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Alternative: Gradient orb with V logo
function AILogoIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="aiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFCA28" />
          <stop offset="100%" stopColor="#FFB300" />
        </linearGradient>
      </defs>
      {/* V shape */}
      <path 
        d="M6 6L12 18L18 6" 
        stroke="url(#aiGradient)" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        fill="none"
      />
      {/* Sparkle dots */}
      <circle cx="19" cy="5" r="1.5" fill="#FFCA28" />
      <circle cx="5" cy="5" r="1" fill="#FFE082" />
    </svg>
  );
}

// Simple dot pattern icon
function AIDotIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="6" r="2" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="12" cy="18" r="2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ============================================================
// User Avatar (initials or image)
// ============================================================

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ============================================================
// Avatar Component
// ============================================================

export function Avatar({
  type = "ai",
  size = "md",
  name,
  imageUrl,
  className = "",
}: AvatarProps) {
  // Size classes
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  };

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  // Base classes
  const baseClasses = `
    inline-flex items-center justify-center
    rounded-xl font-medium
    flex-shrink-0
  `;

  // Type-specific styling
  const typeClasses = {
    ai: "bg-gradient-to-br from-primary-400 to-primary-500 text-gray-900 shadow-sm",
    user: "bg-gray-100 text-gray-600",
    system: "bg-lavender-300 text-violet-700",
  };

  const combinedClasses = `
    ${baseClasses}
    ${sizeClasses[size]}
    ${typeClasses[type]}
    ${className}
  `.replace(/\s+/g, " ").trim();

  // Render image avatar
  if (imageUrl) {
    return (
      <div className={`${sizeClasses[size]} ${className} rounded-xl overflow-hidden flex-shrink-0`}>
        <img
          src={imageUrl}
          alt={name || "Avatar"}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Render AI avatar
  if (type === "ai") {
    return (
      <div className={combinedClasses}>
        <AISparkleIcon className={iconSizes[size]} />
      </div>
    );
  }

  // Render system avatar
  if (type === "system") {
    return (
      <div className={combinedClasses}>
        <AIDotIcon className={iconSizes[size]} />
      </div>
    );
  }

  // Render user avatar with initials
  return (
    <div className={combinedClasses}>
      {name ? getInitials(name) : "U"}
    </div>
  );
}

// ============================================================
// Chat Avatar (specialized for chat bubbles)
// ============================================================

export interface ChatAvatarProps {
  isAssistant?: boolean;
  userName?: string;
  className?: string;
}

export function ChatAvatar({ isAssistant = true, userName, className = "" }: ChatAvatarProps) {
  if (isAssistant) {
    return (
      <div className={`
        w-10 h-10 rounded-xl
        bg-gradient-to-br from-primary-400 to-primary-500
        flex items-center justify-center
        shadow-sm flex-shrink-0
        ${className}
      `}>
        <AISparkleIcon className="w-5 h-5 text-gray-900" />
      </div>
    );
  }

  return (
    <Avatar
      type="user"
      size="md"
      name={userName}
      className={className}
    />
  );
}

// ============================================================
// Brand Logo (for header)
// ============================================================

export interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

export function BrandLogo({ size = "md", showText = true, className = "" }: BrandLogoProps) {
  const logoSizes = {
    sm: "w-7 h-7",
    md: "w-8 h-8",
    lg: "w-10 h-10",
  };

  const textSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Logo icon - yellow notepad style like Contently */}
      <div className={`
        ${logoSizes[size]} rounded-lg
        bg-gradient-to-br from-primary-400 to-primary-500
        flex items-center justify-center
        shadow-sm
      `}>
        <svg className="w-4 h-4 text-gray-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
          <path d="M10 9H8" />
        </svg>
      </div>

      {/* Brand text */}
      {showText && (
        <span className={`font-semibold text-gray-900 ${textSizes[size]}`}>
          Vissocial
        </span>
      )}
    </div>
  );
}

// ============================================================
// Exports
// ============================================================

export default Avatar;
