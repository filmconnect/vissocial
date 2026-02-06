// ============================================================
// PROFILE ANALYSIS PAGE — /analyze/[handle]
// ============================================================
// Vissocial — AI-powered profile analysis with skeleton loading,
// progressive reveal, error handling, and mobile responsive design.
// ============================================================

import { Metadata } from "next";
import ProfileAnalysisClient from "./ProfileAnalysisClient";

// ============================================================
// SEO METADATA (Server Component)
// ============================================================

type MetadataProps = {
  params: Promise<{ handle: string }>;
};

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { handle } = await params;
  const cleanHandle = decodeURIComponent(handle).replace(/^@/, "");

  return {
    title: `Profile Analysis: @${cleanHandle} | Vissocial`,
    description: `AI-powered Instagram profile analysis for @${cleanHandle}. Discover brand USP, target audience, and 30-day content strategy.`,
    openGraph: {
      title: `Profile Analysis: @${cleanHandle} | Vissocial`,
      description: `AI-powered Instagram profile analysis for @${cleanHandle}.`,
    },
    robots: {
      index: false, // Don't index individual analysis pages
    },
  };
}

// ============================================================
// PAGE (Server Component shell)
// ============================================================

export default async function AnalyzePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return <ProfileAnalysisClient handle={handle} />;
}
