// src/lib/storage.ts
import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { config } from "./config";

const s3 = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
  forcePathStyle: true
});

export async function ensureBucket() {
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

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    Body: body,
    ContentType: contentType
  }));
  return `${config.s3.publicBase}/${key}`;
}

export async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}