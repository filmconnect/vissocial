// ============================================================
// PAGE: /analyze/[handle]
// ============================================================
// Profile analysis page — shows brand analysis results
// between landing page and chat.
// Step 1 of 6 in the onboarding flow.
// ============================================================

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatLayout } from "@/ui/ChatLayout";

// ============================================================
// Types (matches /api/analyze response)
// ============================================================

interface BasicData {
  handle?: string;
  full_name?: string;
  bio?: string;
  followers?: number;
  posts_count?: number;
  profile_pic_url?: string;
  website_url?: string;
}

interface BrandAnalysis {
  company: string;
  services: string;
  brand_tone: string;
  target_audience: string;
  language: string;
  usp_analysis: string;
  recommended_focus: string;
  strengths: string[];
  opportunities: string[];
}

interface AnalyzeResponse {
  success: boolean;
  input: string;
  input_type: string;
  basic: BasicData;
  analysis: BrandAnalysis | null;
  error?: string;
}

type PageState = "loading" | "success" | "error";

// ============================================================
// AI Avatar (consistent with ChatBubble sparkle design)
// ============================================================

function AIAvatar({ size = "lg" }: { size?: "md" | "lg" }) {
  const sizeClasses = size === "lg" ? "w-12 h-12" : "w-10 h-10";
  const iconSize = size === "lg" ? "w-6 h-6" : "w-5 h-5";

  return (
    <div
      className={`
        ${sizeClasses} rounded-xl flex-shrink-0
        bg-gradient-to-br from-primary-400 to-primary-500
        flex items-center justify-center
        shadow-sm
      `}
    >
      <svg
        className={`${iconSize} text-gray-900`}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 2L13.09 8.26L18 6L15.74 10.91L22 12L15.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L8.26 13.09L2 12L8.26 10.91L6 6L10.91 8.26L12 2Z" />
      </svg>
    </div>
  );
}

// ============================================================
// Warning Icon (for error state)
// ============================================================

function WarningIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
  );
}

// ============================================================
// Skeleton Components
// ============================================================

function SkeletonLine({
  width = "w-full",
  height = "h-4",
}: {
  width?: string;
  height?: string;
}) {
  return (
    <div className={`${width} ${height} bg-gray-200 rounded-md animate-pulse`} />
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] px-6 py-6 sm:px-8 sm:py-8">
      {/* Header skeleton */}
      <div className="flex gap-4 items-start">
        <div className="w-12 h-12 rounded-xl bg-gray-200 animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <SkeletonLine width="w-64" height="h-5" />
          <SkeletonLine width="w-96" height="h-4" />
        </div>
      </div>

      {/* Quick Facts skeleton */}
      <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4">
            <SkeletonLine width="w-36" height="h-4" />
            <SkeletonLine width="w-48" height="h-4" />
          </div>
        ))}
      </div>

      {/* USP skeleton */}
      <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
        <SkeletonLine width="w-40" height="h-5" />
        <div className="space-y-2">
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-5/6" />
        </div>
        <div className="space-y-2 mt-4">
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-4/6" />
        </div>
      </div>

      {/* CTA skeleton */}
      <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-end gap-4">
        <SkeletonLine width="w-32" height="h-4" />
        <SkeletonLine width="w-52" height="h-11" />
      </div>
    </div>
  );
}

// ============================================================
// Error Card
// ============================================================

function ErrorCard({
  handle,
  onRetry,
  onBack,
}: {
  handle: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] px-6 py-10 sm:px-8 text-center animate-fade-in">
      <div className="flex justify-center mb-4">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
          <WarningIcon className="w-8 h-8 text-red-400" />
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Nismo mogli analizirati profil @{handle}
      </h3>
      <p className="text-sm text-gray-500 mb-8 max-w-sm mx-auto">
        Profil možda ne postoji, ili je došlo do privremene greške. Pokušaj
        ponovo ili se vrati na početnu stranicu.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={onRetry}
          className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold"
        >
          Pokušaj ponovo
        </button>
        <button
          onClick={onBack}
          className="text-sm font-medium text-violet-600 hover:underline transition-colors"
        >
          Vrati se
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Quick Facts Row
// ============================================================

function FactRow({ label, value }: { label: string; value: string }) {
  if (!value || value === "Not determined") return null;

  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-1.5">
      <dt className="w-40 flex-shrink-0 text-sm text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium">{value}</dd>
    </div>
  );
}

// ============================================================
// Partial Analysis Notice
// ============================================================

function PartialNotice() {
  return (
    <div className="mt-6 pt-6 border-t border-gray-100 animate-fade-in">
      <div className="bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 text-sm text-gray-700">
        <span className="font-medium">Note:</span> Detailed AI analysis was not
        available for this profile. The data shown is based on publicly available
        information. Connect your Instagram account for a deeper analysis.
      </div>
    </div>
  );
}

// ============================================================
// Strengths & Opportunities
// ============================================================

function ListSection({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon: string;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-5">
      <h4 className="text-sm font-semibold text-gray-900 mb-2">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((item, idx) => (
          <li key={idx} className="flex gap-2 text-sm text-gray-700">
            <span className="flex-shrink-0">{icon}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// Main Page Component
// ============================================================

export default function AnalyzePage() {
  const params = useParams();
  const router = useRouter();

  // Extract handle from URL — Next.js dynamic route [handle]
  const rawHandle = typeof params.handle === "string"
    ? params.handle
    : Array.isArray(params.handle)
    ? params.handle[0]
    : "";
  const handle = decodeURIComponent(rawHandle).replace(/^@/, "");

  // State
  const [pageState, setPageState] = useState<PageState>("loading");
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // ========================================
  // API Call
  // ========================================
  const fetchAnalysis = useCallback(async () => {
    if (!handle) {
      setPageState("error");
      return;
    }

    setPageState("loading");
    setData(null);
    setShowAnalysis(false);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: handle }),
      });

      const json: AnalyzeResponse = await res.json();

      if (!res.ok || !json.success) {
        setPageState("error");
        return;
      }

      setData(json);
      setPageState("success");

      // Delay analysis reveal for progressive effect
      if (json.analysis) {
        setTimeout(() => setShowAnalysis(true), 400);
      }
    } catch {
      setPageState("error");
    }
  }, [handle]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  // ========================================
  // Handlers
  // ========================================
  const handleContinue = () => {
    if (data) {
      try {
        localStorage.setItem("analyze_result", JSON.stringify(data));
      } catch {
        // localStorage unavailable — continue anyway
      }
    }
    router.push("/chat?from=analyze");
  };

  const handleBack = () => {
    router.push("/");
  };

  const handleRetry = () => {
    fetchAnalysis();
  };

  // ========================================
  // Render
  // ========================================
  return (
    <ChatLayout
      currentStep={1}
      totalSteps={6}
      stepTitle="Profile analysis"
      showSteps
    >
      {/* Loading State */}
      {pageState === "loading" && <SkeletonCard />}

      {/* Error State */}
      {pageState === "error" && (
        <ErrorCard handle={handle} onRetry={handleRetry} onBack={handleBack} />
      )}

      {/* Success State */}
      {pageState === "success" && data && (
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] px-6 py-6 sm:px-8 sm:py-8 animate-fade-in">
          {/* ================================================
              A) HEADER
              ================================================ */}
          <div className="flex gap-4 items-start">
            <AIAvatar size="lg" />
            <div className="flex-1 min-w-0 pt-0.5">
              <h2 className="text-lg font-semibold text-gray-900">
                Profile analysis: @{handle}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Here is a profile analysis based on your public Instagram
                presence. Let&apos;s dive in.
              </p>
            </div>
          </div>

          {/* ================================================
              B) QUICK FACTS
              ================================================ */}
          {data.analysis && (
            <div className="mt-6 pt-6 border-t border-gray-100 animate-fade-in">
              <dl className="space-y-0.5">
                <FactRow label="Company" value={data.analysis.company} />
                <FactRow label="Services" value={data.analysis.services} />
                <FactRow label="Brand tone" value={data.analysis.brand_tone} />
                <FactRow
                  label="Target audience"
                  value={data.analysis.target_audience}
                />
                <FactRow label="Language" value={data.analysis.language} />
              </dl>
            </div>
          )}

          {/* Quick facts from basic data (if no analysis) */}
          {!data.analysis && data.basic && (
            <div className="mt-6 pt-6 border-t border-gray-100 animate-fade-in">
              <dl className="space-y-0.5">
                {data.basic.full_name && (
                  <FactRow label="Name" value={data.basic.full_name} />
                )}
                {data.basic.bio && (
                  <FactRow label="Bio" value={data.basic.bio} />
                )}
                {data.basic.followers !== undefined && (
                  <FactRow
                    label="Followers"
                    value={data.basic.followers.toLocaleString()}
                  />
                )}
                {data.basic.posts_count !== undefined && (
                  <FactRow
                    label="Posts"
                    value={data.basic.posts_count.toLocaleString()}
                  />
                )}
                {data.basic.website_url && (
                  <FactRow label="Website" value={data.basic.website_url} />
                )}
              </dl>
              <PartialNotice />
            </div>
          )}

          {/* ================================================
              C) USP ANALYSIS
              ================================================ */}
          {showAnalysis && data.analysis?.usp_analysis && (
            <div className="mt-6 pt-6 border-t border-gray-100 animate-fade-in">
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                USP analysis
              </h3>
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {data.analysis.usp_analysis}
              </div>

              {/* Strengths */}
              <ListSection
                title="Key strengths"
                items={data.analysis.strengths}
                icon="✦"
              />

              {/* Opportunities */}
              <ListSection
                title="Opportunities"
                items={data.analysis.opportunities}
                icon="→"
              />
            </div>
          )}

          {/* ================================================
              D) RECOMMENDED FOCUS
              ================================================ */}
          {showAnalysis && data.analysis?.recommended_focus && (
            <div
              className="mt-6 pt-6 border-t border-gray-100 animate-fade-in"
              style={{ animationDelay: "150ms" }}
            >
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                Recommended focus (next 30 days)
              </h3>
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {data.analysis.recommended_focus}
              </div>
            </div>
          )}

          {/* ================================================
              E) ACTION FOOTER
              ================================================ */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
              {/* Secondary: This doesn't feel right */}
              <button
                onClick={handleBack}
                className="order-2 sm:order-1 text-sm font-medium text-violet-600 hover:underline transition-colors text-center py-2"
              >
                This doesn&apos;t feel right
              </button>

              {/* Primary: Sounds good → Continue */}
              <button
                onClick={handleContinue}
                className="order-1 sm:order-2 btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold"
              >
                Sounds good → Continue
              </button>
            </div>

            {/* Hint */}
            <p className="text-xs text-gray-400 text-right mt-2">
              You can adjust this later. Nothing is locked in.
            </p>
          </div>
        </div>
      )}
    </ChatLayout>
  );
}
