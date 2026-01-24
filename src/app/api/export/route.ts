import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import JSZip from "jszip";
import { stringify } from "csv-stringify/sync";

const PROJECT_ID="proj_local";

function extractUrl(latest_render:any):string|null{
  try{ if(!latest_render) return null; const o=typeof latest_render==="string"?JSON.parse(latest_render):latest_render; return o?.url||null; }catch{return null;}
}

export async function POST(req: Request) {
  const body = await req.json();
  const approved_only = !!body.approved_only;

  const pack = (await q<any>(`SELECT * FROM content_packs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1`, [PROJECT_ID]))[0];
  if(!pack) return NextResponse.json({ error:"no_pack" }, {status:400});

  const items = await q<any>(`
    SELECT ci.id, ci.day, ci.format, ci.topic, ci.caption, ci.status,
           r.outputs AS latest_render
    FROM content_items ci
    LEFT JOIN LATERAL (SELECT outputs FROM renders WHERE content_item_id=ci.id AND status='succeeded' ORDER BY updated_at DESC LIMIT 1) r ON true
    WHERE ci.content_pack_id=$1 ${approved_only?"AND ci.status='approved'":""}
    ORDER BY ci.day`, [pack.id]);

  const rows = items.map((it:any)=>({
    day: it.day,
    format: it.format,
    topic: it.topic,
    caption: it.caption?.long ?? it.caption?.short ?? "",
    media_path: `posts/${it.id}/media_1.jpg`
  }));

  const zip = new JSZip();
  zip.file("schedule_export.csv", stringify(rows, { header:true }));
  zip.file("README_IMPORT.md", "MVP export. Posts folder contains caption.txt and media_1.jpg when available.\n");

  for (const it of items) {
    const folder = zip.folder(`posts/${it.id}`)!;
    folder.file("caption.txt", it.caption?.long ?? it.caption?.short ?? "");
    const url = extractUrl(it.latest_render);
    if (!url) continue;
    try{
      const res = await fetch(url);
      if(res.ok){
        const buf = Buffer.from(await res.arrayBuffer());
        folder.file("media_1.jpg", buf);
      }
    }catch{}
  }

  const buf = await zip.generateAsync({ type:"nodebuffer" });
  const bundle_url = `data:application/zip;base64,${buf.toString("base64")}`;
  return NextResponse.json({ bundle_url });
}
