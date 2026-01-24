"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";

type Msg = { id: string; role: "assistant"|"user"; text: string; chips?: string[] };

function Bubble({m}:{m:Msg}) {
  const isA = m.role==="assistant";
  return (
    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${isA?"bg-zinc-100 text-zinc-900":"ml-auto bg-zinc-900 text-white"}`}>
      <div className="whitespace-pre-wrap">{m.text}</div>
      {m.chips?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.chips.map(c=> <span key={c} className="rounded-full bg-white/10 px-3 py-1 text-xs">{c}</span>)}
        </div>
      ): null}
    </div>
  );
}

export default function ChatPage(){
  const [sessionId,setSessionId]=useState<string>("");
  const [msgs,setMsgs]=useState<Msg[]>([]);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const endRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const sid = localStorage.getItem("chat_session_id");
    if (sid) { setSessionId(sid); load(sid); }
    else create();
  }, []);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs.length]);

  async function create(){
    const res = await fetch("/api/chat/session", {method:"POST"});
    const data = await res.json();
    localStorage.setItem("chat_session_id", data.session_id);
    setSessionId(data.session_id);
    setMsgs(data.messages);
  }

  async function load(sid:string){
    const res = await fetch(`/api/chat/session?session_id=${sid}`);
    const data = await res.json();
    setMsgs(data.messages);
  }

  async function send(text:string){
    if (!text.trim() || !sessionId) return;
    setBusy(true);
    setMsgs(m=> [...m, {id: crypto.randomUUID(), role:"user", text}]);
    setInput("");
    const res = await fetch("/api/chat/message", {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({session_id: sessionId, text})
    });
    const data = await res.json();
    setMsgs(m=> [...m, ...data.new_messages]);
    setBusy(false);
  }

  return (
    <main className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">Chat</div>
          <Badge tone="info">Onboarding + commands</Badge>
        </div>

        <div className="mt-4 h-[70vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-col gap-3">
            {msgs.map(m=> <Bubble key={m.id} m={m} />)}
            <div ref={endRef} />
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={e=>setInput(e.target.value)}
            placeholder={busy?"Thinking…":"Napiši poruku… (npr. 'poveži instagram', 'generiraj plan', 'export')"}
            className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
            onKeyDown={(e)=>{ if(e.key==="Enter") send(input); }}
            disabled={busy}
          />
          <button
            onClick={()=>send(input)}
            disabled={busy}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >Send</button>
        </div>

        <div className="mt-2 text-xs text-zinc-500">
          Tip: onboarding ide kroz chat. Kad povežeš Instagram u Settings, chat će automatski povući sadržaj i predložiti plan.
        </div>
      </Card>
    </main>
  );
}
