// src/lib/storage.ts
// ============================================================
// Hybrid Storage: MinIO (local) + Vercel Blob (production)
// ============================================================

import { config } from "./config";

// Detect environment
const isProduction = process.env.NODE_ENV === "production" || !!process.env.BLOB_READ_WRITE_TOKEN;

// ============================================================
// Vercel Blob (Production)
// ============================================================
async function putObjectBlob(key: string, body: Buffer, contentType: string): Promise<string> {
  const { put } = await import("@vercel/blob");
  
  const blob = await put(key, body, {
    access: "public",
    contentType,
  });
  
  return blob.url;
}

// ============================================================
// S3/MinIO (Local Development)
// ============================================================
async function putObjectS3(key: string, body: Buffer, contentType: string): Promise<string> {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  
  const s3 = new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint,
    credentials: { 
      accessKeyId: config.s3.accessKey, 
      secretAccessKey: config.s3.secretKey 
    },
    forcePathStyle: true
  });

  await s3.send(new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    Body: body,
    ContentType: contentType
  }));
  
  return `${config.s3.publicBase}/${key}`;
}

// ============================================================
// Main Export - Auto-selects based on environment
// ============================================================
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  if (isProduction) {
    console.log("📦 Storage: Using Vercel Blob");
    return putObjectBlob(key, body, contentType);
  } else {
    console.log("📦 Storage: Using MinIO/S3");
    return putObjectS3(key, body, contentType);
  }
}

// ============================================================
// Ensure Bucket (only for S3/MinIO)
// ============================================================
export async function ensureBucket() {
  if (isProduction) {
    console.log("✓ Vercel Blob - no bucket setup needed");
    return;
  }

  const { S3Client, HeadBucketCommand, CreateBucketCommand } = await import("@aws-sdk/client-s3");
  
  const s3 = new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint,
    credentials: { 
      accessKeyId: config.s3.accessKey, 
      secretAccessKey: config.s3.secretKey 
    },
    forcePathStyle: true
  });

  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
    console.log("✓ S3 bucket exists:", config.s3.bucket);
  } catch (err) {
    console.log("📦 Creating S3 bucket:", config.s3.bucket);
    try {
      await s3.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
      console.log("✓ Bucket created successfully");
    } catch (createErr: any) {
      console.error("❌ Failed to create bucket:", createErr.message);
      throw createErr;
    }
  }
}

// ============================================================
// Download helper
// ============================================================
export async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
