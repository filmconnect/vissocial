// src/lib/storageUrl.ts

import { config } from "./config";
import { log } from "./logger";

export interface StorageConfig {
  mode: "proxy" | "direct";
  publicBaseUrl: string;
  internalBaseUrl: string;
}

function getStorageConfig(): StorageConfig {
  const env = process.env.NODE_ENV;
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const s3Endpoint = config.s3.endpoint; // http://localhost:9100
  
  // ✅ KORISTIMO TVOJ S3_PUBLIC_BASE (iz config.ts)
  const s3PublicBase = process.env.S3_PUBLIC_BASE || config.s3.publicBase;
  
  // Development - proxy kroz Next.js
  if (env === "development") {
    return {
      mode: "proxy",
      publicBaseUrl: appUrl, // ngrok URL
      internalBaseUrl: s3Endpoint // localhost:9100
    };
  }
  
  // Production - provjeri ima li S3_PUBLIC_BASE postavljen za CDN
  // Ako ima, koristi direct mode
  if (s3PublicBase && !s3PublicBase.includes("localhost")) {
    return {
      mode: "direct",
      publicBaseUrl: s3PublicBase, // CDN URL iz S3_PUBLIC_BASE
      internalBaseUrl: s3PublicBase
    };
  }
  
  // Production fallback - proxy kroz Next.js
  return {
    mode: "proxy",
    publicBaseUrl: appUrl,
    internalBaseUrl: s3Endpoint
  };
}

const storageConfig = getStorageConfig();

export function makePublicUrl(s3Key: string): string {
  let cleanKey = s3Key.replace(/^\/+/, "");
  
  // Remove "vissocial/" prefix if present
  if (cleanKey.startsWith("vissocial/")) {
    cleanKey = cleanKey.substring(10);
  }
  
  // Remove bucket name if present
  const bucketName = config.s3.bucket;
  if (cleanKey.startsWith(`${bucketName}/`)) {
    cleanKey = cleanKey.substring(bucketName.length + 1);
  }
  
  const publicUrl = `${storageConfig.publicBaseUrl}/vissocial/${cleanKey}`;
  
  log("storageUrl", "generated public URL", {
    mode: storageConfig.mode,
    s3Key: cleanKey.substring(0, 50),
    publicUrl: publicUrl.substring(0, 80)
  });
  
  return publicUrl;
}

export function getInternalStorageUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, "");
  const internalUrl = `${storageConfig.internalBaseUrl}/vissocial/${cleanPath}`;
  
  log("storageUrl", "generated internal URL", {
    path: cleanPath.substring(0, 50),
    internalUrl: internalUrl.substring(0, 80)
  });
  
  return internalUrl;
}

export function isProxyMode(): boolean {
  return storageConfig.mode === "proxy";
}

export function getStorageInfo() {
  return {
    ...storageConfig,
    env: process.env.NODE_ENV,
    s3Endpoint: config.s3.endpoint,
    s3Bucket: config.s3.bucket
  };
}