import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "@/lib/config";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { getProjectId } from "@/lib/projectId";

// V9: PROJECT_ID removed — now uses getProjectId()
const s3 = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
  forcePathStyle: true
});

export async function POST(req: Request) {
  const projectId = await getProjectId();
  const body = await req.json();
  const { filename, contentType, label } = body;
  if(!filename || !contentType) return NextResponse.json({error:"filename, contentType required"},{status:400});
  const id="asset_"+uuid();
  const key=`uploads/${projectId}/${id}_${filename}`;
  const cmd = new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, ContentType: contentType });
  const url = await getSignedUrl(s3, cmd, { expiresIn: 60*5 });
  const publicUrl = `${config.s3.publicBase}/${key}`;
  await q(`INSERT INTO assets(id, project_id, type, source, url, label) VALUES ($1,$2,$3,'upload',$4,$5)`,
    [id, projectId, contentType.startsWith("video/")?"video":"image", publicUrl, label ?? null]);
  return NextResponse.json({ upload_url: url, public_url: publicUrl, asset_id: id });
}
