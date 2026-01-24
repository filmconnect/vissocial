import { NextResponse } from "next/server";
import { qPublish } from "@/lib/jobs";
import { v4 as uuid } from "uuid";

export async function POST(req: Request) {
  const body = await req.json();
  const { content_item_id } = body;
  if(!content_item_id) return NextResponse.json({ ok:false, error:"content_item_id required" }, {status:400});
  await qPublish.add("publish.instagram", { content_item_id, job_id: "job_"+uuid() });
  return NextResponse.json({ ok:true });
}
