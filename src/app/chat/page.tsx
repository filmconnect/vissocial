"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { ChatChipButton, ChatChip, convertLegacyChips } from "@/ui/ChatChip";

// ============================================================
// TYPES
// ============================================================

type Msg = {
  id: string;
  role: "assistant" | "user";
  text: string;
  chips?: ChatChip[] | string[];
};

interface SystemState {
  ig_connected: boolean;
  media_count: number;
  media_analyzed: number;
  pending_products: number;
  confirmed_products: number;
  brand_profile_ready: boolean;
  active_jobs: number;
}

// ============================================================
// BUBBLE COMPONENT
// ============================================================

function Bubble({
  m,
  sessionId,
  onSend,
  onRefresh,
  isLatest,
}: {
  m: Msg;
  sessionId: string;
  onSend: (text: string) => void;
  onRefresh: () => void;
  isLatest: boolean;
}) {
  const isAssistant = m.role === "assistant";
  const chips = convertLegacyChips(m.chips as any);

  return (
    <div
      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
        isAssistant ? "bg-zinc-100 text-zinc-900" : "ml-auto bg-zinc-900 text-white"
      }`}
    >
      <div className="whitespace-pre-wrap">{m.text}</div>

      {chips.length > 0 && isAssistant && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c, idx) => {
            // Product confirm chips are always enabled (user can confirm multiple)
            // Other chips are only enabled on latest message
            const isProductChip = c.type === "product_confirm";
            const shouldDisable = !isLatest && !isProductChip;
            
            return (
              <ChatChipButton
                key={`${m.id}-chip-${idx}`}
                chip={c}
                sessionId={sessionId}
                onSend={onSend}
                onRefresh={onRefresh}
                disabled={shouldDisable}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TYPING INDICATOR
// ============================================================

function TypingIndicator() {
  return (
    <div className="max-w-[85%] rounded-2xl bg-zinc-100 px-4 py-3">
      <div className="flex items-center gap-1">
        <div
          className="h-2 w-2 animate-bounce rounded-full bg-zinc-400"
          style={{ animationDelay: "0ms" }}
        />
        <div
          className="h-2 w-2 animate-bounce rounded-full bg-zinc-400"
          style={{ animationDelay: "150ms" }}
        />
        <div
          className="h-2 w-2 animate-bounce rounded-full bg-zinc-400"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  );
}

// ============================================================
// STATUS BAR
// ============================================================

function StatusBar({ state }: { state: SystemState | null }) {
  if (!state) return null;

  const items = [
    { label: "IG", value: state.ig_connected ? "✅" : "❌", color: state.ig_connected ? "green" : "red" },
    { label: "Slike", value: `${state.media_analyzed}/${state.media_count}` },
    { label: "Proizvodi", value: `${state.confirmed_products}+${state.pending_products}` },
    { label: "Profil", value: state.brand_profile_ready ? "✅" : "⏳" },
  ];

  if (state.active_jobs > 0) {
    items.push({ label: "Jobovi", value: `🔄 ${state.active_jobs}` });
  }

  return (
    <div className="flex flex-wrap gap-3 text-xs text-zinc-500 border-b border-zinc-100 pb-2 mb-2">
      {items.map((item, idx) => (
        <span key={idx}>
          <span className="font-medium">{item.label}:</span> {item.value}
        </span>
      ))}
    </div>
  );
}

// ============================================================
// MAIN CHAT PAGE
// ============================================================

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string>("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  // Focus input when not busy
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  // Handle IG connected redirect
  useEffect(() => {
    const igParam = searchParams.get("ig");
    if (igParam === "connected") {
      // Clear query param from URL without reload
      router.replace("/chat", { scroll: false });
      
      // Clear old session to get fresh state
      localStorage.removeItem("chat_session_id");
      setSessionId("");
      setMsgs([]);
      
      // Create new session (will detect IG connected)
      createSession();
    }
  }, [searchParams]);

  // Initial load (only if not handling IG redirect)
  useEffect(() => {
    const igParam = searchParams.get("ig");
    if (igParam === "connected") return; // Will be handled by the other effect
    
    const sid = localStorage.getItem("chat_session_id");
    if (sid) {
      setSessionId(sid);
      loadMessages(sid);
    } else {
      createSession();
    }
  }, []);

  // Polling for notifications (every 5s)
  useEffect(() => {
    if (!sessionId) return;

    const pollNotifications = async () => {
      try {
        const res = await fetch(`/api/chat/notifications?session_id=${sessionId}`);
        const data = await res.json();
        
        if (data.notifications && data.notifications.length > 0) {
          // Append notification messages to chat
          setMsgs((prev) => {
            // Avoid duplicates
            const existingIds = new Set(prev.map(m => m.id));
            const newMsgs = data.notifications.filter((n: any) => !existingIds.has(n.id));
            return [...prev, ...newMsgs];
          });
          
          // Also refresh system state
          loadMessages(sessionId, true);
        }
      } catch (err) {
        // Silent fail for polling
      }
    };

    // Initial poll after 2 seconds
    const initialTimeout = setTimeout(pollNotifications, 2000);
    
    // Then poll every 5 seconds
    const interval = setInterval(pollNotifications, 5000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [sessionId]);

  // Polling for job updates (every 10s if jobs active) - REMOVED, replaced by notifications
  // useEffect(() => {
  //   if (!systemState?.active_jobs || systemState.active_jobs === 0) return;
  //   ...
  // }, [systemState?.active_jobs, sessionId]);

  async function createSession() {
    try {
      setBusy(true);
      const res = await fetch("/api/chat/session", { method: "POST" });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      
      localStorage.setItem("chat_session_id", data.session_id);
      setSessionId(data.session_id);
      setMsgs(data.messages || []);
      setSystemState(data.system_state || null);
    } catch (err: any) {
      setError("Greška pri kreiranju sesije: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadMessages(sid: string, silent = false) {
    try {
      if (!silent) setBusy(true);
      
      const res = await fetch(`/api/chat/session?session_id=${sid}`);
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      
      setMsgs(data.messages || []);
      setSystemState(data.system_state || null);
    } catch (err: any) {
      if (!silent) setError("Greška pri učitavanju: " + err.message);
    } finally {
      if (!silent) setBusy(false);
    }
  }

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || !sessionId || busy) return;

      setBusy(true);
      setError(null);

      const tempId = crypto.randomUUID();
      setMsgs((m) => [...m, { id: tempId, role: "user", text }]);
      setInput("");

      try {
        const res = await fetch("/api/chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, text }),
        });

        const data = await res.json();
        
        if (data.error) throw new Error(data.error);

        setMsgs((m) => [...m, ...(data.new_messages || [])]);
        
        // Refresh system state after message
        loadMessages(sessionId, true);
      } catch (err: any) {
        setError("Greška pri slanju: " + err.message);
      } finally {
        setBusy(false);
      }
    },
    [sessionId, busy]
  );

  const refresh = useCallback(() => {
    if (sessionId) loadMessages(sessionId);
  }, [sessionId]);

  async function resetChat() {
    if (!confirm("Kreirati novu sesiju? Stari razgovor ostaje sačuvan.")) return;
    
    localStorage.removeItem("chat_session_id");
    setMsgs([]);
    setSessionId("");
    setSystemState(null);
    await createSession();
  }

  // Find latest assistant message for chip enabling
  const latestAssistantIdx = msgs.reduce(
    (latest, msg, idx) => (msg.role === "assistant" ? idx : latest),
    -1
  );

  return (
    <main className="space-y-4">
      <Card>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">Chat</div>
          <div className="flex items-center gap-2">
            <Badge tone="info">Smart Onboarding</Badge>
            <button
              onClick={refresh}
              className="text-xs text-zinc-500 hover:text-zinc-700"
              title="Osvježi"
            >
              🔄
            </button>
            <button
              onClick={resetChat}
              className="text-xs text-zinc-500 hover:text-zinc-700"
            >
              Nova sesija
            </button>
          </div>
        </div>

        {/* Status bar */}
        <StatusBar state={systemState} />

        {/* Error message */}
        {error && (
          <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-800 hover:underline"
            >
              ✕
            </button>
          </div>
        )}

        {/* Chat messages */}
        <div className="mt-4 h-[65vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-col gap-3">
            {msgs.map((m, idx) => (
              <Bubble
                key={m.id}
                m={m}
                sessionId={sessionId}
                onSend={send}
                onRefresh={refresh}
                isLatest={idx === latestAssistantIdx}
              />
            ))}
            {busy && <TypingIndicator />}
            <div ref={endRef} />
          </div>
        </div>

        {/* Input */}
        <div className="mt-3 flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              busy
                ? "Razmišljam…"
                : "Napiši poruku… (ili klikni gumb iznad)"
            }
            className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={busy}
          />
          <button
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Pošalji
          </button>
        </div>

        {/* Quick commands */}
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="text-zinc-400">Brze naredbe:</span>
          <button
            onClick={() => send("status")}
            disabled={busy}
            className="text-zinc-600 hover:text-zinc-900 hover:underline disabled:opacity-50"
          >
            status
          </button>
          <button
            onClick={() => send("pomoć")}
            disabled={busy}
            className="text-zinc-600 hover:text-zinc-900 hover:underline disabled:opacity-50"
          >
            pomoć
          </button>
          <button
            onClick={() => send("generiraj plan")}
            disabled={busy}
            className="text-zinc-600 hover:text-zinc-900 hover:underline disabled:opacity-50"
          >
            generiraj plan
          </button>
        </div>
      </Card>
    </main>
  );
}
