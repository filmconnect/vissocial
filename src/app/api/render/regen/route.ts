import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { qRender } from "@/lib/jobs";
import { v4 as uuid } from "uuid";

export async function POST(req: Request) {
  const body = await req.json();
  const { content_item_id, instruction } = body;
  if(!content_item_id) return NextResponse.json({error:"content_item_id required"},{status:400});
  const item = (await q<any>(`SELECT visual_brief FROM content_items WHERE id=$1`, [content_item_id]))[0];
  const vb = item?.visual_brief ?? {};
  const prompt = `Photorealistic instagram-ready image. ${vb.scene_description ?? ""}. ${instruction ?? ""}`.trim();
  await qRender.add("render.flux", { content_item_id, prompt, job_id: "job_"+uuid() });
  return NextResponse.json({ ok:true });
}
