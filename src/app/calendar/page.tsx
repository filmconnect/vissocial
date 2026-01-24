"use client";
import { useEffect, useState } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";

function thumb(latest:any){ try{ const o=typeof latest==="string"?JSON.parse(latest):latest; return o?.url||null;}catch{return null;}}

export default function CalendarPage(){
  const [pack,setPack]=useState<any>(null);
  const [items,setItems]=useState<any[]>([]);
  async function load(){
    const res=await fetch("/api/content/latest");
    const data=await res.json();
    setPack(data.pack); setItems(data.items||[]);
  }
  useEffect(()=>{ load(); const t=setInterval(load, 4000); return ()=>clearInterval(t); },[]);
  return (
    <main className="space-y-4">
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-base font-semibold">Calendar</div>
            <div className="mt-1 text-sm text-zinc-600">{pack?`Plan: ${pack.month}`:"No plan yet (use chat: 'generiraj plan')"}</div>
          </div>
          <div className="flex items-center gap-2">
            <a className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white" href="/export">Export</a>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {items.map(it=>{
            const t=thumb(it.latest_render);
            return (
              <a key={it.id} href={`/item/${it.id}`} className="rounded-2xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Day {it.day}: {it.topic}</div>
                    <div className="mt-1 text-xs text-zinc-600">Format: {it.format}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={it.status==="approved"?"good":"neutral"}>{it.status}</Badge>
                      <Badge tone={it.publish_status==="published"?"good":it.publish_status==="scheduled"?"info":"neutral"}>{it.publish_status}</Badge>
                    </div>
                  </div>
                  <div className="h-16 w-16 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
                    {t? <img src={t} className="h-full w-full object-cover" />:<div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-500">render…</div>}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </Card>
    </main>
  );
}
