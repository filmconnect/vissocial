"use client";
import { useEffect, useState } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";

export default function SettingsPage(){
  const [project,setProject]=useState<any>(null);
  const [publishEnabled,setPublishEnabled]=useState(false);

  async function load(){
    const res = await fetch("/api/projects/me");
    const data = await res.json();
    setProject(data.project);
    setPublishEnabled(!!data.project?.ig_publish_enabled);
  }

  useEffect(()=>{ load(); }, []);

  async function savePublish(v:boolean){
    setPublishEnabled(v);
    await fetch("/api/projects/me", {method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ig_publish_enabled:v})});
    await load();
  }

  return (
    <main className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">Settings</div>
            <div className="mt-1 text-sm text-zinc-600">Instagram connection + publishing toggle.</div>
          </div>
          <Badge tone={project?.ig_connected ? "good":"warn"}>{project?.ig_connected ? "IG Connected":"Not connected"}</Badge>
        </div>

        <div className="mt-5 grid gap-3">
          <a className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white w-fit" href="/api/instagram/login">
            Connect Instagram (OAuth)
          </a>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={publishEnabled} onChange={e=>savePublish(e.target.checked)} />
            Enable Instagram auto-publish (requires permissions + business account)
          </label>

          {project?.ig_user_id ? (
            <div className="text-xs text-zinc-600">
              IG User ID: <b>{project.ig_user_id}</b> · Page ID: <b>{project.fb_page_id ?? "—"}</b>
            </div>
          ) : <div className="text-xs text-zinc-500">After OAuth, we store tokens and discover connected Instagram professional account.</div>}

        </div>
      </Card>
    </main>
  );
}
