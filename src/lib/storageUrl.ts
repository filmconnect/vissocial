// ============================================================
// STORAGE URL - Robust URL generation for dev + prod
// ============================================================
// 
// PROBLEM SOLVED:
// OpenAI Vision API needs HTTPS URLs, but MinIO is localhost.
// This module ensures all public URLs are properly formatted.
//
// Dev flow:  MinIO (localhost:9100) → ngrok proxy → HTTPS URL
// Prod flow: MinIO/S3 → CDN → HTTPS URL
// ============================================================

import { config } from "./config";
import { log } from "./logger";

// ============================================================
// CONFIGURATION
// ============================================================

interface StorageConfig {
  mode: "proxy" | "direct";
  publicBaseUrl: string;
  internalBaseUrl: string;
  bucket: string;
}

function getStorageConfig(): StorageConfig {
  const env = process.env.NODE_ENV || "development";
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const s3Endpoint = process.env.S3_ENDPOINT || "http://localhost:9100";
  const s3Bucket = process.env.S3_BUCKET || "vissocial";
  const s3PublicBase = process.env.S3_PUBLIC_BASE;
  
  // Development - always use proxy through Next.js/ngrok
  if (env === "development" || appUrl.includes("ngrok")) {
    return {
      mode: "proxy",
      publicBaseUrl: appUrl.replace(/\/$/, ""),  // Remove trailing slash
      internalBaseUrl: s3Endpoint,
      bucket: s3Bucket
    };
  }
  
  // Production with CDN
  if (s3PublicBase && !s3PublicBase.includes("localhost")) {
    return {
      mode: "direct",
      publicBaseUrl: s3PublicBase.replace(/\/$/, ""),
      internalBaseUrl: s3PublicBase.replace(/\/$/, ""),
      bucket: s3Bucket
    };
  }
  
  // Production fallback - proxy
  return {
    mode: "proxy",
    publicBaseUrl: appUrl.replace(/\/$/, ""),
    internalBaseUrl: s3Endpoint,
    bucket: s3Bucket
  };
}

const storageConfig = getStorageConfig();

log("storageUrl", "initialized", {
  mode: storageConfig.mode,
  publicBase: storageConfig.publicBaseUrl,
  bucket: storageConfig.bucket
});

// ============================================================
// MAKE PUBLIC URL
// ============================================================
// Converts any storage path/URL to a public HTTPS URL
// that OpenAI Vision API can access.
//
// Input formats handled:
//   - "ig/proj_local/xxx.jpg" (relative path)
//   - "/vissocial/ig/proj_local/xxx.jpg" (absolute path)
//   - "http://localhost:9100/vissocial/ig/xxx.jpg" (internal URL)
//   - "https://already-public.com/..." (passthrough)
// ============================================================

export function makePublicUrl(input: string): string {
  if (!input) {
    log("storageUrl", "makePublicUrl called with empty input");
    return "";
  }

  // Already a valid HTTPS URL - return as-is
  if (input.startsWith("https://")) {
    return input;
  }

  // Extract the path from various input formats
  let cleanPath = input;

  // Remove protocol and host if present
  // e.g., "http://localhost:9100/vissocial/ig/xxx.jpg" → "/vissocial/ig/xxx.jpg"
  if (input.includes("://")) {
    try {
      const url = new URL(input);
      cleanPath = url.pathname;
    } catch {
      // Not a valid URL, treat as path
    }
  }

  // Remove leading slashes
  cleanPath = cleanPath.replace(/^\/+/, "");

  // Remove bucket name if present at start
  // e.g., "vissocial/ig/xxx.jpg" → "ig/xxx.jpg"
  const bucket = storageConfig.bucket;
  if (cleanPath.startsWith(`${bucket}/`)) {
    cleanPath = cleanPath.substring(bucket.length + 1);
  }

  // Construct public URL
  // Format: {publicBase}/vissocial/{path}
  const publicUrl = `${storageConfig.publicBaseUrl}/vissocial/${cleanPath}`;

  log("storageUrl", "generated public URL", {
    input: input.substring(0, 50),
    output: publicUrl.substring(0, 80),
    mode: storageConfig.mode
  });

  return publicUrl;
}

// ============================================================
// GET INTERNAL STORAGE URL
// ============================================================
// For server-side access to MinIO (not for Vision API)
// ============================================================

export function getInternalStorageUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, "");
  const bucket = storageConfig.bucket;
  
  // Remove bucket if present
  let finalPath = cleanPath;
  if (cleanPath.startsWith(`${bucket}/`)) {
    finalPath = cleanPath.substring(bucket.length + 1);
  }
  
  return `${storageConfig.internalBaseUrl}/${bucket}/${finalPath}`;
}

// ============================================================
// HELPERS
// ============================================================

export function isProxyMode(): boolean {
  return storageConfig.mode === "proxy";
}

export function getStorageInfo() {
  return {
    ...storageConfig,
    env: process.env.NODE_ENV,
    appUrl: process.env.APP_URL
  };
}

// ============================================================
// VALIDATE URL FOR VISION API
// ============================================================
// Ensures URL is valid for OpenAI Vision API
// ============================================================

export function validateVisionUrl(url: string): { valid: boolean; url: string; error?: string } {
  if (!url) {
    return { valid: false, url: "", error: "URL is empty" };
  }

  // Already HTTPS - validate format
  if (url.startsWith("https://")) {
    // Basic URL validation
    try {
      new URL(url);
      return { valid: true, url };
    } catch {
      return { valid: false, url, error: "Invalid URL format" };
    }
  }

  // Try to convert to public URL
  const publicUrl = makePublicUrl(url);
  
  if (!publicUrl.startsWith("https://")) {
    return { 
      valid: false, 
      url: publicUrl, 
      error: `URL is not HTTPS: ${publicUrl.substring(0, 50)}` 
    };
  }

  return { valid: true, url: publicUrl };
}
