// ============================================================
// LANDING PAGE
// ============================================================
// Vissocial - Landing page with Instagram handle input
// Redirects to /analyze/[handle] for profile analysis
// ============================================================

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ============================================================
// Icons
// ============================================================

function CheckIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CalendarIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function PhotoIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
    </svg>
  );
}

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

function BrandLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center shadow-sm">
        <DocumentIcon className="w-5 h-5 text-gray-900" />
      </div>
      <span className="text-xl font-semibold text-gray-900">
        Vissocial
      </span>
    </div>
  );
}

// ============================================================
// Header Component
// ============================================================

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-lavender-100/80 backdrop-blur-md border-b border-lavender-200/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/">
            <BrandLogo />
          </Link>

          <nav className="flex items-center gap-6">
            <Link 
              href="/pricing" 
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Pricing
            </Link>
            <Link 
              href="/login" 
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 text-sm font-medium text-gray-900 bg-primary-500 hover:bg-primary-600 rounded-xl transition-all shadow-sm hover:shadow-md"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

// ============================================================
// Feature Item Component
// ============================================================

interface FeatureItemProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
}

function FeatureItem({ icon, title, description }: FeatureItemProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 text-primary-600">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700">{title}</p>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Main Landing Page Component
// ============================================================

export default function LandingPage() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Parse and normalize handle
  const normalizeHandle = (input: string): string => {
    let cleaned = input.trim();
    cleaned = cleaned.replace(/^https?:\/\//, "");
    cleaned = cleaned.replace(/^www\./, "");
    cleaned = cleaned.replace(/^instagram\.com\//, "");
    cleaned = cleaned.replace(/^@/, "");
    cleaned = cleaned.split("/")[0];
    return cleaned;
  };

  // Handle form submission
  const handleAnalyze = async () => {
    const normalized = normalizeHandle(handle);
    
    if (!normalized) {
      setError("Please enter an Instagram handle or URL");
      return;
    }

    if (!/^[a-zA-Z0-9._]+$/.test(normalized)) {
      setError("Invalid Instagram handle format");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // CHANGED: Navigate to /analyze/[handle] instead of /chat?analyze=X
      router.push(`/analyze/${encodeURIComponent(normalized)}`);
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAnalyze();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-lavender">
      <Header />

      <main className="pt-32 pb-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight tracking-tight">
            AI that plans, creates, and improves your{" "}
            <span className="text-gray-900">Instagram content.</span>
          </h1>

          <p className="mt-5 text-lg text-gray-600 max-w-2xl mx-auto">
            Create your next 30 days of posts — automatically, from your existing profile.
          </p>

          <div className="mt-10 max-w-lg mx-auto">
            <div className="bg-white rounded-2xl shadow-card p-6">
              <p className="text-sm font-medium text-gray-700 mb-3">
                Paste your Instagram profile
              </p>

              <div className="relative">
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => {
                    setHandle(e.target.value);
                    setError("");
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="instagram.com/yourhandle or @yourhandle"
                  className={`
                    w-full px-4 py-3.5 text-gray-900 bg-white
                    border rounded-xl text-base
                    placeholder:text-gray-400
                    focus:outline-none focus:ring-2 focus:border-transparent
                    transition-all duration-200
                    ${error ? "border-red-300 focus:ring-red-500" : "border-gray-200 focus:ring-primary-500"}
                  `}
                  disabled={loading}
                />
              </div>

              {error && (
                <p className="mt-2 text-sm text-red-500">{error}</p>
              )}

              <button
                onClick={handleAnalyze}
                disabled={loading}
                className={`
                  mt-4 w-full px-6 py-3.5
                  text-base font-semibold text-gray-900
                  bg-primary-500 hover:bg-primary-600
                  rounded-xl transition-all duration-200
                  shadow-button hover:shadow-md
                  disabled:opacity-60 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2
                `}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  "Analyze profile"
                )}
              </button>

              {/* CHANGED: Navigate to /analyze/nike instead of /chat?analyze=nike */}
              <button
                onClick={() => router.push("/analyze/nike")}
                className="mt-3 text-sm text-violet-600 hover:text-violet-700 hover:underline transition-colors"
              >
                See an example
              </button>
            </div>

            <p className="mt-4 text-sm text-gray-500">
              No login needed. We never post without your approval.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
            <FeatureItem
              icon={<CheckIcon className="w-5 h-5" />}
              title="Instant USP analysis"
            />
            <FeatureItem
              icon={<CalendarIcon className="w-5 h-5" />}
              title="30-day strategy recommendation"
            />
            <FeatureItem
              icon={<PhotoIcon className="w-5 h-5" />}
              title="AI-generated posts after you connect Instagram"
            />
          </div>

          <p className="mt-16 text-sm text-gray-500 max-w-xl mx-auto">
            Our AI works on your content — and improves it over time based on real engagement.
          </p>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 h-32 pointer-events-none overflow-hidden">
        <svg 
          className="absolute bottom-0 w-full h-32 text-lavender-200/30"
          viewBox="0 0 1440 120" 
          fill="currentColor"
          preserveAspectRatio="none"
        >
          <path d="M0,64L48,69.3C96,75,192,85,288,80C384,75,480,53,576,48C672,43,768,53,864,64C960,75,1056,85,1152,80C1248,75,1344,53,1392,42.7L1440,32L1440,120L1392,120C1344,120,1248,120,1152,120C1056,120,960,120,864,120C768,120,672,120,576,120C480,120,384,120,288,120C192,120,96,120,48,120L0,120Z" />
        </svg>
      </div>
    </div>
  );
}
