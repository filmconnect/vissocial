import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "./config";

const s3 = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
  forcePathStyle: true
});

export async function putObject(key:string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    Body: body,
    ContentType: contentType
  }));
  return `${config.s3.publicBase}/${key}`;
}

export async function downloadToBuffer(url:string): Promise<Buffer> {
  const res = await fetch(url);
  if(!res.ok) throw new Error(`download failed ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
