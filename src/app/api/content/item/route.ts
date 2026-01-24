import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function GET(req: Request) {
  const url=new URL(req.url);
  const item_id=url.searchParams.get("item_id");
  if(!item_id) return NextResponse.json({error:"item_id required"},{status:400});
  const item=(await q<any>(`
    SELECT ci.*, r.outputs AS latest_render
    FROM content_items ci
    LEFT JOIN LATERAL (SELECT outputs FROM renders WHERE content_item_id=ci.id AND status='succeeded' ORDER BY updated_at DESC LIMIT 1) r ON true
    WHERE ci.id=$1`, [item_id]))[0] ?? null;
  return NextResponse.json({ item });
}

export async function PATCH(req: Request) {
  const body=await req.json();
  const { item_id, status, caption_long, scheduled_at, publish_mode, publish_status } = body;
  if(!item_id) return NextResponse.json({error:"item_id required"},{status:400});

  const before=(await q<any>(`SELECT project_id, caption, status, scheduled_at, publish_mode, publish_status FROM content_items WHERE id=$1`, [item_id]))[0];

  const sets:string[]=[]; const params:any[]=[]; let i=1;
  if(status){ sets.push(`status=$${i++}`); params.push(status); }
  if(caption_long!==undefined){ sets.push(`caption=jsonb_set(caption,'{long}',to_jsonb($${i++}::text),true)`); params.push(caption_long); }
  if(scheduled_at!==undefined){ sets.push(`scheduled_at=$${i++}`); params.push(scheduled_at); }
  if(publish_mode){ sets.push(`publish_mode=$${i++}`); params.push(publish_mode); }
  if(publish_status){ sets.push(`publish_status=$${i++}`); params.push(publish_status); }
  if(!sets.length) return NextResponse.json({error:"no_changes"},{status:400});
  params.push(item_id);
  await q(`UPDATE content_items SET ${sets.join(", ")} WHERE id=$${i}`, params);

  const after=(await q<any>(`SELECT * FROM content_items WHERE id=$1`, [item_id]))[0];

  // log implicit feedback
  const actions:string[]=[];
  if(status && status!==before?.status) actions.push(status==="approved"?"approve":"unapprove");
  if(caption_long!==undefined && caption_long!==before?.caption?.long) actions.push("caption_edit");
  if(scheduled_at!==undefined) actions.push("schedule");
  if(publish_status!==undefined) actions.push("publish_status");
  for(const a of actions){
    await q(`INSERT INTO user_actions(id, project_id, content_item_id, action_type, payload)
             VALUES ($1,$2,$3,$4,$5)`,
      ["ua_"+uuid(), after.project_id, item_id, a, JSON.stringify({ before, after })]);
  }

  return NextResponse.json({ ok:true, item: after });
}
