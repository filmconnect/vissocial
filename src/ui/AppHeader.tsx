// ============================================================
// APP HEADER
// ============================================================
// Shared navigation header for all app pages.
// Hides on:
//   - Landing page "/" (has its own header with Pricing/Login/Signup)
//   - Chat page "/chat" (ChatLayout provides header with nav + step indicator)
// ============================================================

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ============================================================
// Icons
// ============================================================

function DocumentIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

// ============================================================
// Navigation Items
// ============================================================

const NAV_ITEMS = [
  { href: "/chat", label: "Chat" },
  { href: "/calendar", label: "Calendar" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
] as const;

// ============================================================
// Navigation Link
// ============================================================

function NavLink({ href, label, isActive }: { href: string; label: string; isActive: boolean }) {
  return (
    <Link
      href={href}
      className={`
        relative px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200
        ${isActive
          ? "text-gray-900 bg-white/60 shadow-sm"
          : "text-gray-500 hover:text-gray-700 hover:bg-white/30"
        }
      `}
    >
      {label}
    </Link>
  );
}

// ============================================================
// App Header Component
// ============================================================

export default function AppHeader() {
  const pathname = usePathname();

  // Don't render on pages that have their own header
  // - Landing page "/" has its own header (Pricing, Log in, Sign up)
  // - Chat page "/chat" uses ChatLayout which has nav + step indicator
  if (pathname === "/" || pathname === "/chat") {
    return null;
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-lavender-100/95 backdrop-blur-md border-b border-lavender-200/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo */}
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center shadow-sm">
                <DocumentIcon className="w-4 h-4 text-gray-900" />
              </div>
              <span className="text-lg font-semibold text-gray-900">
                Vissocial
              </span>
            </Link>

            {/* Center: Navigation */}
            <nav className="hidden sm:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  isActive={pathname === item.href}
                />
              ))}
            </nav>

            {/* Right: spacer for balance */}
            <div className="hidden sm:block w-[120px]" />
          </div>

          {/* Mobile Navigation */}
          <nav className="sm:hidden flex items-center gap-1 pb-2 -mt-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                isActive={pathname === item.href}
              />
            ))}
          </nav>
        </div>
      </header>

      {/* Spacer — pushes page content below the fixed header */}
      <div className="h-24 sm:h-16" />
    </>
  );
}
