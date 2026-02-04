// src/lib/makePublicUrl.ts
// ============================================================
// URL helper for hybrid storage (MinIO local + Vercel Blob prod)
// ============================================================

import { config } from "./config";

export function makePublicUrl(url: string): string {
  if (!url) return url;

  // Vercel Blob URLs are already public - pass through
  if (url.includes(".blob.vercel-storage.com") || url.includes(".public.blob.vercel-storage.com")) {
    return url;
  }

  // Already HTTPS - pass through
  if (url.startsWith("https://")) {
    return url;
  }

  // Local MinIO URL transformation
  const localBase = process.env.S3_PUBLIC_BASE;
  const appUrl = process.env.APP_URL;

  if (localBase && appUrl && url.startsWith(localBase)) {
    return url.replace(localBase, `${appUrl.replace(/\/$/, "")}/vissocial`);
  }

  // Fallback - return as-is
  return url;
}
