"use client";
import { useEffect, useState } from "react";
import { Card } from "@/ui/Card";

export default function ExportPage(){
  const [approvedOnly,setApprovedOnly]=useState(true);
  const [download,setDownload]=useState<string|null>(null);

  async function run(){
    const res=await fetch("/api/export", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({approved_only: approvedOnly})});
    const data=await res.json();
    setDownload(data.bundle_url || null);
  }

  return (
    <main className="space-y-4">
      <Card>
        <div className="text-base font-semibold">Export</div>
        <div className="mt-1 text-sm text-zinc-600">CSV + ZIP (media + captions)</div>

        <div className="mt-5 grid gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={approvedOnly} onChange={e=>setApprovedOnly(e.target.checked)} />
            Approved only
          </label>
          <button onClick={run} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white w-fit">Generate export</button>
          {download ? <a className="text-sm text-blue-700 underline" href={download} download>Download ZIP</a> : null}
          <div className="text-xs text-zinc-500">Local dev returns a data: URL. In prod you’ll upload to S3 and return a signed URL.</div>
        </div>
      </Card>
    </main>
  );
}
