// ============================================================
// CHAT LAYOUT
// ============================================================
// Vissocial - Chat interface layout with header and step indicator
// Extended: "Nova sesija" button in header
// ============================================================

"use client";

import React from "react";
import Link from "next/link";
import { RefreshIcon, ChevronDownIcon } from "@/ui/Icons";

// ============================================================
// Icons (layout-specific, not shared)
// ============================================================

function DocumentIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

// ============================================================
// Brand Logo
// ============================================================

function BrandLogo({ showText = true }: { showText?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center shadow-sm">
        <DocumentIcon className="w-4 h-4 text-gray-900" />
      </div>
      {showText && (
        <span className="text-lg font-semibold text-gray-900">
          Vissocial
        </span>
      )}
    </div>
  );
}

// ============================================================
// Chat Header Props & Component
// ============================================================

export interface ChatHeaderProps {
  currentStep?: number;
  totalSteps?: number;
  stepTitle?: string;
  showSteps?: boolean;
  onNewSession?: () => void;
}

export function ChatHeader({
  currentStep = 1,
  totalSteps = 6,
  stepTitle,
  showSteps = true,
  onNewSession,
}: ChatHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-lavender-100/95 backdrop-blur-md border-b border-lavender-200/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/">
            <BrandLogo />
          </Link>

          {/* Step Title (center) - optional */}
          {stepTitle && (
            <div className="absolute left-1/2 transform -translate-x-1/2">
              <span className="text-sm font-medium text-gray-700">
                {stepTitle}
              </span>
            </div>
          )}

          {/* Right side controls */}
          <div className="flex items-center gap-3">
            {/* Nova sesija button */}
            {onNewSession && (
              <button
                onClick={onNewSession}
                className="
                  inline-flex items-center gap-1.5
                  px-3 py-1.5 text-sm font-medium
                  text-gray-600 hover:text-gray-900
                  bg-white/60 hover:bg-white
                  border border-gray-200 hover:border-gray-300
                  rounded-lg
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500
                "
              >
                <RefreshIcon className="w-4 h-4" />
                <span>Nova sesija</span>
              </button>
            )}

            {/* Step Indicator */}
            {showSteps && (
              <button className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                <span>Step {currentStep} of {totalSteps}</span>
                <ChevronDownIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

// ============================================================
// Chat Layout Props & Component
// ============================================================

export interface ChatLayoutProps {
  children: React.ReactNode;
  currentStep?: number;
  totalSteps?: number;
  stepTitle?: string;
  showSteps?: boolean;
  onNewSession?: () => void;
}

export function ChatLayout({
  children,
  currentStep = 1,
  totalSteps = 6,
  stepTitle,
  showSteps = true,
  onNewSession,
}: ChatLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-lavender">
      {/* Header */}
      <ChatHeader
        currentStep={currentStep}
        totalSteps={totalSteps}
        stepTitle={stepTitle}
        showSteps={showSteps}
        onNewSession={onNewSession}
      />

      {/* Main Content */}
      <main className="pt-20 pb-32 px-4">
        <div className="max-w-3xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default ChatLayout;
