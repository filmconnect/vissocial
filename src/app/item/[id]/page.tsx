"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";

function renderUrl(latest:any){ try{ const o=typeof latest==="string"?JSON.parse(latest):latest; return o?.url||null;}catch{return null;}}

export default function ItemPage(){
  const {id}=useParams<{id:string}>();
  const [item,setItem]=useState<any>(null);
  const [caption,setCaption]=useState("");
  const [instruction,setInstruction]=useState("");
  const [scheduledAt,setScheduledAt]=useState("");
  const [publishMode,setPublishMode]=useState("export_only");

  async function load(){
    const res=await fetch(`/api/content/item?item_id=${id}`);
    const data=await res.json();
    setItem(data.item);
    setCaption(data.item?.caption?.long||"");
    setPublishMode(data.item?.publish_mode||"export_only");
    setScheduledAt(data.item?.scheduled_at? new Date(data.item.scheduled_at).toISOString().slice(0,16):"");
  }
  useEffect(()=>{ load(); },[id]);

  async function save(){
    await fetch("/api/content/item", {method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({item_id:id, caption_long:caption, publish_mode:publishMode, scheduled_at: scheduledAt? new Date(scheduledAt).toISOString(): null})});
    await load();
  }
  async function approve(){
    await fetch("/api/content/item", {method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({item_id:id, status: item?.status==="approved"?"draft":"approved"})});
    await load();
  }
  async function regen(){
    await fetch("/api/render/regen", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({content_item_id:id, instruction})});
    alert("Render queued.");
  }
  async function publishNow(){
    const res=await fetch("/api/publish/now", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({content_item_id:id})});
    const data=await res.json();
    alert(data.ok ? "Publish queued." : ("Publish failed: "+(data.error||"")));
  }

  if(!item) return <div className="text-sm text-zinc-600">Loading…</div>;
  const img=renderUrl(item.latest_render);

  return (
    <main className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">Day {item.day}: {item.topic}</div>
            <div className="mt-2 flex gap-2">
              <Badge tone={item.status==="approved"?"good":"neutral"}>{item.status}</Badge>
              <Badge tone={item.publish_status==="published"?"good":item.publish_status==="scheduled"?"info":"neutral"}>{item.publish_status}</Badge>
            </div>
          </div>
          <div className="h-28 w-28 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
            {img? <img src={img} className="h-full w-full object-cover" />:<div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">render…</div>}
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={approve} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">{item.status==="approved"?"Unapprove":"Approve"}</button>
            <button onClick={save} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">Save</button>
            <button onClick={publishNow} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">Publish now</button>
          </div>

          <label className="grid gap-1">
            <span className="text-xs font-medium text-zinc-700">Caption</span>
            <textarea value={caption} onChange={e=>setCaption(e.target.value)} className="min-h-[140px] rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-zinc-700">Publish mode</span>
              <select value={publishMode} onChange={e=>setPublishMode(e.target.value)} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm">
                <option value="export_only">Export only</option>
                <option value="in_app_schedule">Schedule in app</option>
                <option value="auto_publish">Auto publish</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-zinc-700">Scheduled at</span>
              <input type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="h-px bg-zinc-200" />

          <label className="grid gap-1">
            <span className="text-xs font-medium text-zinc-700">Regenerate instruction</span>
            <input value={instruction} onChange={e=>setInstruction(e.target.value)} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" placeholder="Cleaner background, softer light…" />
          </label>
          <button onClick={regen} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">Regenerate</button>
        </div>
      </Card>
    </main>
  );
}
