// next.config.ts

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb'
    }
  },

  async rewrites() {
    const isProduction = process.env.NODE_ENV === "production";
    
    // ✅ KORISTIMO TVOJ S3_PUBLIC_BASE umjesto STORAGE_CDN_URL
    const s3PublicBase = process.env.S3_PUBLIC_BASE;

    // Production sa zasebnim CDN-om (S3_PUBLIC_BASE nije localhost)
    if (isProduction && s3PublicBase && !s3PublicBase.includes("localhost")) {
      console.log("📦 Storage mode: DIRECT CDN");
      console.log(`   CDN URL: ${s3PublicBase}`);
      
      return [
        {
          source: "/vissocial/:path*",
          destination: `${s3PublicBase}/:path*` // ← Uklonio /vissocial jer je već u S3_PUBLIC_BASE
        }
      ];
    }

    // Development ili Production bez CDN-a - proxy kroz Next.js
    const s3Endpoint = process.env.S3_ENDPOINT || "http://localhost:9100";
    console.log("📦 Storage mode: NEXT.JS PROXY");
    console.log(`   Internal endpoint: ${s3Endpoint}`);
    
    return [
      {
        source: "/vissocial/:path*",
        destination: "/api/minio/:path*"
      }
    ];
  },

  async headers() {
    return [
      {
        source: "/vissocial/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "X-Frame-Options",
            value: "DENY"
          }
        ]
      }
    ];
  }
};

export default nextConfig;