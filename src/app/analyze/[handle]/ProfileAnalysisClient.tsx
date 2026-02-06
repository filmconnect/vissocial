// ============================================================
// PROFILE ANALYSIS CLIENT COMPONENT
// ============================================================
// Skeleton loading, progressive reveal, error handling, responsive
// ============================================================

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChatLayout } from "@/ui/ChatLayout";

// ============================================================
// TYPES
// ============================================================

interface AnalysisResult {
  company: string;
  services: string;
  brand_tone: string;
  target_audience: string;
  language: string;
  usp_analysis: string;
  recommended_focus: string;
  strengths?: string[];
  opportunities?: string[];
}

interface BasicInfo {
  handle: string;
  full_name: string;
  bio: string;
  followers: number;
  posts_count: number;
  profile_pic_url: string;
  website_url: string;
}

interface ApiResponse {
  success: boolean;
  input: string;
  input_type: string;
  basic: BasicInfo | null;
  analysis: AnalysisResult | null;
  error?: string;
}

type ErrorType = "timeout" | "network" | "not_found" | "generic";

interface ErrorState {
  type: ErrorType;
  message: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const TIMEOUT_MS = 20_000;

const ERROR_CONFIG: Record<ErrorType, {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  actionType: "retry" | "back";
}> = {
  timeout: {
    icon: <ClockIcon />,
    title: "Analiza traje predugo",
    description: "Server ne odgovara. Moguće je da je profil prevelik ili da je servis preopterećen. Pokušajte ponovo.",
    actionLabel: "Pokušaj ponovo",
    actionType: "retry",
  },
  network: {
    icon: <WifiOffIcon />,
    title: "Nema internetske veze",
    description: "Provjerite internetsku vezu i pokušajte ponovo.",
    actionLabel: "Pokušaj ponovo",
    actionType: "retry",
  },
  not_found: {
    icon: <SearchOffIcon />,
    title: "Profil nije pronađen",
    description: "Ne možemo pronaći Instagram profil s tim korisničkim imenom. Provjerite jeste li ispravno upisali.",
    actionLabel: "Vrati se",
    actionType: "back",
  },
  generic: {
    icon: <AlertIcon />,
    title: "Nešto je pošlo po krivu",
    description: "Došlo je do neočekivane greške. Pokušajte ponovo ili se vratite na početnu stranicu.",
    actionLabel: "Pokušaj ponovo",
    actionType: "retry",
  },
};

// ============================================================
// INLINE SVG ICONS
// ============================================================

function ClockIcon() {
  return (
    <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function WifiOffIcon() {
  return (
    <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0" />
    </svg>
  );
}

function SearchOffIcon() {
  return (
    <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5L10.5 13.5M10.5 10.5l3 3" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z" />
    </svg>
  );
}

// ============================================================
// AI AVATAR (matches ChatBubble sparkle design)
// ============================================================

function AIAvatar() {
  return (
    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md">
      <SparkleIcon />
    </div>
  );
}

// ============================================================
// SKELETON COMPONENTS
// ============================================================

function SkeletonBlock({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`bg-gray-200 animate-pulse rounded ${className}`} style={style} />
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex items-start gap-4 p-6 sm:p-8">
      {/* Circle avatar */}
      <SkeletonBlock className="w-12 h-12 rounded-full flex-shrink-0" />
      {/* Title lines */}
      <div className="flex-1 space-y-3 pt-1">
        <SkeletonBlock className="h-5 w-[200px] max-w-full" />
        <SkeletonBlock className="h-4 w-[300px] max-w-full" />
      </div>
    </div>
  );
}

function QuickFactsSkeleton() {
  const widths = [140, 200, 170, 150, 100];
  return (
    <div className="px-6 sm:px-8 py-5 border-t border-gray-100 space-y-3">
      {widths.map((w, i) => (
        <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0">
          <SkeletonBlock className="h-4 w-[100px] sm:w-[120px]" />
          <SkeletonBlock className="h-4 sm:ml-4" style={{ width: w, maxWidth: "100%" }} />
        </div>
      ))}
    </div>
  );
}

function USPSkeleton() {
  return (
    <div className="px-6 sm:px-8 py-5 border-t border-gray-100 space-y-4">
      <SkeletonBlock className="h-5 w-[140px]" />
      {/* Paragraph 1 */}
      <div className="space-y-2">
        <SkeletonBlock className="h-3.5 w-full" />
        <SkeletonBlock className="h-3.5 w-[95%]" />
        <SkeletonBlock className="h-3.5 w-[88%]" />
        <SkeletonBlock className="h-3.5 w-[72%]" />
      </div>
      {/* Paragraph 2 */}
      <div className="space-y-2">
        <SkeletonBlock className="h-3.5 w-full" />
        <SkeletonBlock className="h-3.5 w-[90%]" />
        <SkeletonBlock className="h-3.5 w-[80%]" />
      </div>
      {/* Paragraph 3 */}
      <div className="space-y-2">
        <SkeletonBlock className="h-3.5 w-[96%]" />
        <SkeletonBlock className="h-3.5 w-[85%]" />
        <SkeletonBlock className="h-3.5 w-[60%]" />
      </div>
    </div>
  );
}

function ActionSkeleton() {
  return (
    <div className="px-6 sm:px-8 py-6 border-t border-gray-100 flex flex-col items-end gap-3">
      <SkeletonBlock className="h-11 w-[220px] rounded-xl" />
      <SkeletonBlock className="h-4 w-[150px]" />
      <SkeletonBlock className="h-3 w-[250px]" />
    </div>
  );
}

function FullSkeleton() {
  return (
    <div className="bg-white rounded-none sm:rounded-2xl shadow-none sm:shadow-[var(--shadow-card)] overflow-hidden">
      <HeaderSkeleton />
      <QuickFactsSkeleton />
      <USPSkeleton />
      <ActionSkeleton />
    </div>
  );
}

// ============================================================
// ERROR CARD COMPONENT
// ============================================================

function ErrorCard({
  error,
  handle,
  onRetry,
  onBack,
}: {
  error: ErrorState;
  handle: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const config = ERROR_CONFIG[error.type];
  const cleanHandle = handle.replace(/^@/, "");

  return (
    <div className="bg-white rounded-none sm:rounded-2xl shadow-none sm:shadow-[var(--shadow-card)] overflow-hidden">
      <div className="px-6 sm:px-8 py-12 flex flex-col items-center text-center">
        {/* Icon */}
        <div className="mb-4">{config.icon}</div>

        {/* Title */}
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          {config.title}
        </h2>

        {/* Description */}
        <p className="text-sm text-gray-500 max-w-md mb-1">
          {error.type === "not_found"
            ? `Ne možemo pronaći profil @${cleanHandle}. Provjerite korisničko ime.`
            : config.description}
        </p>

        {/* Buttons */}
        <div className="mt-6 flex flex-col items-center gap-3">
          {config.actionType === "retry" ? (
            <button
              onClick={onRetry}
              className="px-6 py-3 text-sm font-semibold text-gray-900 bg-primary-500 hover:bg-primary-600 rounded-xl transition-all duration-200 shadow-[var(--shadow-button)] hover:shadow-md"
            >
              {config.actionLabel}
            </button>
          ) : (
            <button
              onClick={onBack}
              className="px-6 py-3 text-sm font-semibold text-gray-900 bg-primary-500 hover:bg-primary-600 rounded-xl transition-all duration-200 shadow-[var(--shadow-button)] hover:shadow-md"
            >
              {config.actionLabel}
            </button>
          )}

          {config.actionType === "retry" && (
            <button
              onClick={onBack}
              className="text-sm text-violet-600 hover:text-violet-700 hover:underline transition-colors"
            >
              Vrati se na početnu
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ANIMATED SECTION WRAPPER (staggered entrance)
// ============================================================

function FadeInSection({
  children,
  delay = 0,
  show = true,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  show?: boolean;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [show, delay]);

  return (
    <div
      className={`transition-all duration-500 ease-out ${className} ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-3"
      }`}
    >
      {children}
    </div>
  );
}

// ============================================================
// QUICK FACTS ROW
// ============================================================

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-0">
      <span className="text-gray-500 text-sm sm:w-[140px] sm:flex-shrink-0">
        {label}:
      </span>
      <span className="text-gray-900 text-sm font-medium sm:ml-2">
        {value}
      </span>
    </div>
  );
}

// ============================================================
// MAIN CLIENT COMPONENT
// ============================================================

export default function ProfileAnalysisClient({
  handle,
}: {
  handle: string;
}) {
  const router = useRouter();
  const cleanHandle = decodeURIComponent(handle).replace(/^@/, "");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ============================================================
  // FETCH ANALYSIS
  // ============================================================

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);

    // Abort previous request if any
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // Timeout timer
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: cleanHandle }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 404) {
          setError({ type: "not_found", message: "Profile not found" });
          setLoading(false);
          return;
        }
        // Try to read error body
        const errBody = await res.json().catch(() => ({}));
        if (
          errBody.error?.toLowerCase().includes("not found") ||
          errBody.error?.toLowerCase().includes("could not")
        ) {
          setError({ type: "not_found", message: errBody.error });
        } else {
          setError({ type: "generic", message: errBody.error || "Unknown error" });
        }
        setLoading(false);
        return;
      }

      const json: ApiResponse = await res.json();

      if (!json.success) {
        const errMsg = json.error || "";
        if (
          errMsg.toLowerCase().includes("not found") ||
          errMsg.toLowerCase().includes("could not")
        ) {
          setError({ type: "not_found", message: errMsg });
        } else {
          setError({ type: "generic", message: errMsg });
        }
        setLoading(false);
        return;
      }

      setData(json);
      setLoading(false);
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === "AbortError") {
        setError({ type: "timeout", message: "Request timed out" });
      } else if (
        err instanceof TypeError &&
        (err.message.includes("fetch") || err.message.includes("network") || err.message.includes("Failed"))
      ) {
        setError({ type: "network", message: "Network error" });
      } else {
        setError({
          type: "generic",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
      setLoading(false);
    }
  }, [cleanHandle]);

  // ============================================================
  // INITIAL FETCH
  // ============================================================

  useEffect(() => {
    fetchAnalysis();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchAnalysis]);

  // ============================================================
  // HANDLERS
  // ============================================================

  const handleContinue = () => {
    if (data) {
      try {
        localStorage.setItem("analyze_result", JSON.stringify(data));
      } catch {
        // localStorage might be full — continue anyway
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

  // ============================================================
  // DERIVED STATE
  // ============================================================

  const analysis = data?.analysis;
  const basic = data?.basic;
  const hasAnalysis = !!analysis;

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <ChatLayout
      currentStep={1}
      totalSteps={6}
      stepTitle="Profile analysis"
    >
      {/* ---- LOADING SKELETON ---- */}
      {loading && <FullSkeleton />}

      {/* ---- ERROR STATE ---- */}
      {!loading && error && (
        <ErrorCard
          error={error}
          handle={cleanHandle}
          onRetry={handleRetry}
          onBack={handleBack}
        />
      )}

      {/* ---- SUCCESS STATE ---- */}
      {!loading && !error && data && (
        <div className="bg-white rounded-none sm:rounded-2xl shadow-none sm:shadow-[var(--shadow-card)] overflow-hidden">
          {/* ========== A) HEADER ========== */}
          <FadeInSection delay={0} show>
            <div className="flex items-start gap-4 p-6 sm:p-8">
              <AIAvatar />
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-gray-900 truncate">
                  Profile analysis: @{cleanHandle}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Here is a profile analysis based on your public Instagram
                  presence. Let&apos;s dive in.
                </p>
              </div>
            </div>
          </FadeInSection>

          {/* ========== B) QUICK FACTS ========== */}
          {hasAnalysis && (
            <FadeInSection delay={200} show>
              <div className="px-6 sm:px-8 py-5 border-t border-gray-100 space-y-2.5">
                {analysis.company && (
                  <FactRow label="Company" value={analysis.company} />
                )}
                {analysis.services && (
                  <FactRow label="Services" value={analysis.services} />
                )}
                {analysis.brand_tone && (
                  <FactRow label="Brand tone" value={analysis.brand_tone} />
                )}
                {analysis.target_audience && (
                  <FactRow
                    label="Target audience"
                    value={analysis.target_audience}
                  />
                )}
                {analysis.language && (
                  <FactRow label="Language" value={analysis.language} />
                )}
              </div>
            </FadeInSection>
          )}

          {/* ========== C) USP ANALYSIS ========== */}
          {hasAnalysis && analysis.usp_analysis && (
            <FadeInSection delay={400} show>
              <div className="px-6 sm:px-8 py-5 border-t border-gray-100">
                <h2 className="text-base font-semibold text-gray-900 mb-3">
                  USP analysis
                </h2>
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {analysis.usp_analysis}
                </div>
              </div>
            </FadeInSection>
          )}

          {/* ========== D) RECOMMENDED FOCUS ========== */}
          {hasAnalysis && analysis.recommended_focus && (
            <FadeInSection delay={600} show>
              <div className="px-6 sm:px-8 py-5 border-t border-gray-100">
                <h2 className="text-base font-semibold text-gray-900 mb-3">
                  Recommended focus (next 30 days)
                </h2>
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {analysis.recommended_focus}
                </div>
              </div>
            </FadeInSection>
          )}

          {/* ========== FALLBACK: No GPT analysis ========== */}
          {!hasAnalysis && basic && (
            <FadeInSection delay={200} show>
              <div className="px-6 sm:px-8 py-5 border-t border-gray-100 space-y-2.5">
                {basic.full_name && (
                  <FactRow label="Name" value={basic.full_name} />
                )}
                {basic.bio && <FactRow label="Bio" value={basic.bio} />}
                {basic.followers > 0 && (
                  <FactRow
                    label="Followers"
                    value={basic.followers.toLocaleString()}
                  />
                )}
                {basic.posts_count > 0 && (
                  <FactRow
                    label="Posts"
                    value={basic.posts_count.toLocaleString()}
                  />
                )}
                {basic.website_url && (
                  <FactRow label="Website" value={basic.website_url} />
                )}
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    ⚠️ Detaljnija AI analiza nije uspjela. Prikazani su samo
                    osnovni podaci. Možete nastaviti i analiza će se ponoviti u
                    chat sucelju.
                  </p>
                </div>
              </div>
            </FadeInSection>
          )}

          {/* ========== E) ACTION FOOTER ========== */}
          <FadeInSection delay={hasAnalysis ? 800 : 400} show>
            <div className="px-6 sm:px-8 py-6 border-t border-gray-100">
              <div className="flex flex-col items-end gap-3">
                {/* Primary CTA */}
                <button
                  onClick={handleContinue}
                  className="px-6 py-3 text-sm font-semibold text-gray-900 bg-primary-500 hover:bg-primary-600 rounded-xl transition-all duration-200 shadow-[var(--shadow-button)] hover:shadow-md active:scale-[0.98]"
                >
                  Sounds good → Continue
                </button>

                {/* Secondary link */}
                <button
                  onClick={handleBack}
                  className="text-sm text-violet-600 hover:text-violet-700 hover:underline transition-colors"
                >
                  This doesn&apos;t feel right
                </button>

                {/* Hint */}
                <p className="text-xs text-gray-400">
                  You can adjust this later. Nothing is locked in.
                </p>
              </div>
            </div>
          </FadeInSection>
        </div>
      )}
    </ChatLayout>
  );
}
