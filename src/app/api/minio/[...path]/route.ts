// src/app/api/minio/[...path]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getInternalStorageUrl, isProxyMode } from "@/lib/storageUrl";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MinIO Proxy Handler
 * 
 * Development: Proxies requests from ngrok to localhost MinIO
 * Production (with CDN): Should not be used (direct CDN via rewrites)
 * Production (without CDN): Can be used as proxy
 */

async function handleRequest(
  req: NextRequest,
  method: "GET" | "HEAD",
  params: { path: string[] }
) {
  // In production with CDN, proxy should not be accessed
  if (process.env.NODE_ENV === "production" && !isProxyMode()) {
    log("minio-proxy", "proxy disabled - CDN in use", { method });
    return new NextResponse(
      JSON.stringify({ error: "Use CDN URL directly" }),
      { status: 503, headers: { "content-type": "application/json" } }
    );
  }

  const path = (params.path || []).join("/");
  
  if (!path) {
    return new NextResponse(
      JSON.stringify({ error: "Path required" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  try {
    // getInternalStorageUrl koristi S3_ENDPOINT iz config-a
    const upstreamUrl = getInternalStorageUrl(path);
    
    log("minio-proxy", "proxying request", {
      method,
      path: path.substring(0, 50),
      upstream: upstreamUrl.substring(0, 80)
    });

    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers: {
        "User-Agent": req.headers.get("user-agent") || "NextJS-Proxy"
      },
      // @ts-ignore
      signal: req.signal
    });

    if (!upstreamResponse.ok) {
      log("minio-proxy", "upstream error", {
        method,
        path: path.substring(0, 50),
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText
      });
      
      return new NextResponse(
        JSON.stringify({ 
          error: `Storage error: ${upstreamResponse.status}` 
        }),
        { 
          status: upstreamResponse.status,
          headers: { "content-type": "application/json" }
        }
      );
    }

    // Build response headers
    const headers = new Headers();
    
    // Content-Type
    const contentType = upstreamResponse.headers.get("content-type") || "application/octet-stream";
    headers.set("content-type", contentType);
    
    // Content-Length
    const contentLength = upstreamResponse.headers.get("content-length");
    if (contentLength) {
      headers.set("content-length", contentLength);
    }
    
    // ETag
    const etag = upstreamResponse.headers.get("etag");
    if (etag) {
      headers.set("etag", etag);
    }
    
    // Last-Modified
    const lastModified = upstreamResponse.headers.get("last-modified");
    if (lastModified) {
      headers.set("last-modified", lastModified);
    }
    
    // Cache-Control (aggressive caching for media files)
    if (path.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov)$/i)) {
      headers.set("cache-control", "public, max-age=31536000, immutable");
    } else {
      headers.set("cache-control", "public, max-age=3600");
    }
    
    // CORS headers
    headers.set("access-control-allow-origin", "*");
    headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
    headers.set("access-control-max-age", "86400");
    
    log("minio-proxy", "success", {
      method,
      path: path.substring(0, 50),
      contentType,
      contentLength: contentLength || "unknown"
    });

    // For HEAD requests, don't send body
    if (method === "HEAD") {
      return new NextResponse(null, { 
        status: upstreamResponse.status, 
        headers 
      });
    }

    // For GET requests, stream the body
    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers
    });

  } catch (error: any) {
    log("minio-proxy", "fetch failed", {
      method,
      path: path.substring(0, 50),
      error: error.message,
      code: error.code
    });
    
    return new NextResponse(
      JSON.stringify({ 
        error: "Storage unavailable",
        details: error.message
      }),
      { 
        status: 503,
        headers: { "content-type": "application/json" }
      }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleRequest(req, "GET", params);
}

export async function HEAD(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleRequest(req, "HEAD", params);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-max-age": "86400"
    }
  });
}