// ============================================================
// CHAT PAGE (WITH NOTIFICATIONS POLLING)
// ============================================================
// Main chat interface with:
// - Message history
// - Clickable chips (ChatChip component)
// - Notifications polling (5s interval)
// ============================================================

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { ChatChip, ChatChipList, normalizeChips, ChatChipData } from "@/ui/ChatChip";

// ============================================================
// TYPES
// ============================================================

interface Message {
  id: string;
  role: "assistant" | "user";
  text: string;
  chips?: (string | ChatChipData)[];
  meta?: Record<string, any>;
}

// ============================================================
// MESSAGE BUBBLE
// ============================================================

interface BubbleProps {
  message: Message;
  onChipSelect: (value: string) => void;
}

function Bubble({ message, onChipSelect }: BubbleProps) {
  const isAssistant = message.role === "assistant";
  const chips = normalizeChips(message.chips);

  return (
    <div
      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
        isAssistant
          ? "bg-zinc-100 text-zinc-900"
          : "ml-auto bg-zinc-900 text-white"
      }`}
    >
      <div className="whitespace-pre-wrap">{message.text}</div>
      
      {chips.length > 0 && (
        <ChatChipList 
          chips={chips} 
          onSelect={onChipSelect}
        />
      )}
    </div>
  );
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string>("");
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // ============================================================
  // INITIALIZATION
  // ============================================================

  useEffect(() => {
    const existingSessionId = localStorage.getItem("chat_session_id");
    
    if (existingSessionId) {
      setSessionId(existingSessionId);
      loadSession(existingSessionId);
    } else {
      createSession();
    }

    return () => {
      // Cleanup polling on unmount
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // ============================================================
  // AUTO-SCROLL
  // ============================================================

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  // ============================================================
  // NOTIFICATIONS POLLING
  // ============================================================

  useEffect(() => {
    if (!sessionId) return;

    // Start polling for notifications
    pollingRef.current = setInterval(() => {
      pollNotifications();
    }, 5000); // Poll every 5 seconds

    // Initial poll
    pollNotifications();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [sessionId]);

  async function pollNotifications() {
    if (!sessionId) return;

    try {
      const res = await fetch(`/api/chat/notifications?session_id=${sessionId}`);
      
      if (!res.ok) return;
      
      const data = await res.json();
      
      if (data.notifications && data.notifications.length > 0) {
        // Convert notifications to messages and add to chat
        const newMessages: Message[] = data.notifications.map((n: any) => ({
          id: n.id,
          role: "assistant" as const,
          text: n.message,
          chips: n.chips || undefined,
          meta: {
            notification_type: n.type,
            notification_title: n.title,
            ...n.data
          }
        }));

        setMsgs(prev => [...prev, ...newMessages]);

        // Mark as read
        const notificationIds = data.notifications.map((n: any) => n.id);
        await fetch("/api/chat/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            session_id: sessionId, 
            mark_read: notificationIds 
          })
        });
      }
    } catch (error) {
      // Silent fail - don't break the UI
      console.error("Notification polling error:", error);
    }
  }

  // ============================================================
  // SESSION MANAGEMENT
  // ============================================================

  async function createSession() {
    try {
      const res = await fetch("/api/chat/session", { method: "POST" });
      const data = await res.json();
      
      localStorage.setItem("chat_session_id", data.session_id);
      setSessionId(data.session_id);
      setMsgs(normalizeMessages(data.messages));
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  }

  async function loadSession(sid: string) {
    try {
      const res = await fetch(`/api/chat/session?session_id=${sid}`);
      const data = await res.json();
      setMsgs(normalizeMessages(data.messages));
    } catch (error) {
      console.error("Failed to load session:", error);
      // If session fails to load, create a new one
      createSession();
    }
  }

  // Normalize messages from API (handle both old and new chip formats)
  function normalizeMessages(messages: any[]): Message[] {
    return messages.map(m => ({
      id: m.id,
      role: m.role,
      text: m.text,
      chips: m.chips || m.meta?.chips,
      meta: m.meta
    }));
  }

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  const send = useCallback(async (text: string) => {
    if (!text.trim() || !sessionId || busy) return;

    setBusy(true);
    
    // Optimistically add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: text.trim()
    };
    setMsgs(prev => [...prev, userMsg]);
    setInput("");

    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, text: text.trim() })
      });

      const data = await res.json();

      if (data.new_messages) {
        const newMsgs = normalizeMessages(data.new_messages);
        setMsgs(prev => [...prev, ...newMsgs]);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      
      // Add error message
      setMsgs(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Ups! Nešto je pošlo po zlu. Pokušaj ponovo."
        }
      ]);
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy]);

  // Handle chip selection (same as sending a message)
  function handleChipSelect(value: string) {
    send(value);
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <main className="space-y-4">
      <Card>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">Chat</div>
          <Badge tone="info">Onboarding + commands</Badge>
        </div>

        {/* Messages */}
        <div className="mt-4 h-[70vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-col gap-3">
            {msgs.map(m => (
              <Bubble 
                key={m.id} 
                message={m} 
                onChipSelect={handleChipSelect}
              />
            ))}
            <div ref={endRef} />
          </div>
        </div>

        {/* Input */}
        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={
              busy
                ? "Thinking…"
                : "Napiši poruku… (npr. 'poveži instagram', 'generiraj plan', 'export')"
            }
            className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
            onKeyDown={e => {
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
            Send
          </button>
        </div>

        {/* Tip */}
        <div className="mt-2 text-xs text-zinc-500">
          Tip: onboarding ide kroz chat. Kad povežeš Instagram u Settings, chat
          će automatski povući sadržaj i predložiti plan.
        </div>
      </Card>
    </main>
  );
}
