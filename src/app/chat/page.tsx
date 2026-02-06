// ============================================================
// CHAT PAGE - DESIGN SYSTEM V2 + ANALYZE FLOW
// ============================================================
// Merged from:
//   - 81434b5 (new design: ChatBubble, ChatLayout, ActionButton)
//   - 1ff3de0 (from=analyze flow, legacy ?analyze=X compat)
//
// Design changes:
//   1. IMPORTI: ChatBubble, ChatLayout, ActionButton, ActionFooter
//   2. MSG TIP: +metadata polje
//   3. ADAPTER: toDesignMessage() — stari Msg → novi ChatMessage
//   4. BUBBLE: OBRISANA — zamijenjeno s ChatBubble
//   5. CHIPBUTTON: ZADRŽAN — ne brisan, ne mijenjan
//   6. WRAPPER: Card → ChatLayout
//   7. MESSAGE LOOP: Bubble → ChatBubble + handleSmartChipClick
//   8. INPUT: Fixed bottom position izvan ChatLayout-a
//   9. normalizeMessages: +metadata field
//
// Functional additions:
//   10. from=analyze: auto-send handle when coming from /analyze page
//   11. Legacy ?analyze=X backward compat
//   12. Notifications: graceful handling of 500 errors (missing column)
// ============================================================

"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChatBubble, ActionButton, ActionFooter } from "@/ui/ChatBubble";
import { ChatLayout } from "@/ui/ChatLayout";
import type { ChatMessage, ChatChipData } from "@/ui/ChatBubble";

// ============================================================
// Types
// ============================================================

type Chip = string | {
  type: string;
  label: string;
  value?: string;
  href?: string;
  productId?: string;
  action?: "confirm" | "reject";
  assetId?: string;
  uploadType?: string;
  accept?: string;
};

type Msg = {
  id: string;
  role: "assistant" | "user";
  text: string;
  chips?: Chip[];
  metadata?: {
    title?: string;
    subtitle?: string;
    fields?: { label: string; value: string }[];
  };
};

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  chips?: Chip[];
  data?: Record<string, any>;
};

// ============================================================
// ChipButton — ZADRŽAN NETAKNUT (za handleSmartChipClick fallback)
// ============================================================

function ChipButton({
  chip,
  onAction,
  onFileUpload,
  disabled
}: {
  chip: Chip;
  onAction?: (value: string) => void;
  onFileUpload?: (file: File, uploadType: string) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const label = typeof chip === "string" ? chip : chip.label;
  const value = typeof chip === "string" ? chip : (chip.value || chip.label);
  const type = typeof chip === "string" ? "suggestion" : chip.type;
  const href = typeof chip === "string" ? null : chip.href;
  const productId = typeof chip === "string" ? null : chip.productId;
  const action = typeof chip === "string" ? null : chip.action;
  const assetId = typeof chip === "string" ? null : (chip as any).assetId;
  const uploadType = typeof chip === "string" ? null : (chip as any).uploadType;

  async function handleClick() {
    if (disabled || loading || confirmed) return;

    if (type === "navigation" && href) {
      router.push(href);
      return;
    }

    if (type === "file_upload") {
      fileInputRef.current?.click();
      return;
    }

    if (type === "asset_delete" && assetId) {
      if (!confirm("Obrisati ovu referencu?")) return;
      setLoading(true);
      try {
        const res = await fetch("/api/assets/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asset_id: assetId })
        });
        if (res.ok) setConfirmed(true);
      } catch (e) {
        console.error("Delete failed:", e);
      }
      setLoading(false);
      return;
    }

    if (type === "product_confirm" && productId) {
      setLoading(true);
      try {
        const endpoint = action === "reject" ? "/api/products/reject" : "/api/products/confirm";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: productId })
        });
        if (res.ok) setConfirmed(true);
      } catch (e) {
        console.error("Product action failed:", e);
      }
      setLoading(false);
      return;
    }

    if (onAction) onAction(value);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadType) return;
    if (onFileUpload) onFileUpload(file, uploadType);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  let icon = null;
  if (loading) {
    icon = (
      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  } else if (confirmed) {
    icon = (
      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  } else if (type === "file_upload") {
    icon = (
      <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    );
  } else if (type === "asset_delete") {
    icon = (
      <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    );
  } else if (type === "product_confirm") {
    if (action === "reject") {
      icon = (
        <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    } else {
      icon = (
        <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      );
    }
  } else if (type === "navigation") {
    icon = (
      <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>
    );
  }

  const baseClasses = "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 cursor-pointer select-none";

  let stateClasses = "bg-zinc-100 text-zinc-700 border border-zinc-200 hover:bg-zinc-200";
  if (confirmed) {
    stateClasses = "bg-green-50 text-green-700 border border-green-200";
  } else if (type === "product_confirm" && action === "reject") {
    stateClasses = "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100";
  } else if (type === "product_confirm") {
    stateClasses = "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100";
  } else if (type === "onboarding_option") {
    stateClasses = "bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100";
  } else if (type === "file_upload") {
    stateClasses = "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100";
  } else if (type === "asset_delete") {
    stateClasses = "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100";
  }

  return (
    <>
      {type === "file_upload" && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading || confirmed}
        className={`${baseClasses} ${stateClasses}`}
      >
        {icon}
        <span>{label}</span>
      </button>
    </>
  );
}

// ============================================================
// Stara Bubble komponenta — OBRISANA
// Zamijenjeno s ChatBubble iz design systema
// ============================================================

// ============================================================
// Main Chat Page Content (uses useSearchParams)
// ============================================================

function ChatPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string>("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [igConnected, setIgConnected] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const initRef = useRef(false);
  const processedNotifRef = useRef<Set<string>>(new Set());
  const sentMessagesRef = useRef<Set<string>>(new Set());

  // Ref to hold handle from analyze flow
  const fromAnalyzeRef = useRef<string | null>(null);

  // ============================================================
  // Scroll to bottom on new messages
  // ============================================================
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  // ============================================================
  // Initialize session (StrictMode safe)
  // Handles: from=analyze, legacy ?analyze=X, normal restore
  // ============================================================
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    // Check if coming from /analyze page
    const fromParam = searchParams.get("from");
    if (fromParam === "analyze") {
      try {
        const stored = localStorage.getItem("analyze_result");
        if (stored) {
          const result = JSON.parse(stored);
          const analyzeHandle = result?.basic?.handle
            || result?.input?.replace(/^@/, "")
            || "";
          if (analyzeHandle) {
            fromAnalyzeRef.current = analyzeHandle;
          }
        }
      } catch (e) {
        console.debug("Failed to parse analyze_result:", e);
      }
      localStorage.removeItem("analyze_result");
      localStorage.removeItem("chat_session_id");
      router.replace("/chat", { scroll: false });
      createSession();
      return;
    }

    // Legacy: someone navigated to /chat?analyze=X directly
    const analyzeParam = searchParams.get("analyze");
    if (analyzeParam) {
      fromAnalyzeRef.current = analyzeParam.replace(/^@/, "");
      localStorage.removeItem("chat_session_id");
      router.replace("/chat", { scroll: false });
      createSession();
      return;
    }

    // Normal session restore
    const sid = localStorage.getItem("chat_session_id");
    if (sid) {
      setSessionId(sid);
      loadSession(sid);
    } else {
      createSession();
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // ============================================================
  // Auto-send handle message when session is ready after analyze
  // Uses direct API call instead of sendMessage to avoid stale closure
  // ============================================================
  useEffect(() => {
    if (!sessionId || !fromAnalyzeRef.current) return;

    const handle = fromAnalyzeRef.current;
    fromAnalyzeRef.current = null; // Clear so it doesn't fire again

    const text = `Brzi pregled: @${handle}`;

    (async () => {
      const userMsg: Msg = {
        id: "temp_analyze_" + Date.now(),
        role: "user",
        text,
      };
      setMsgs((prev) => [...prev, userMsg]);
      setBusy(true);

      try {
        const res = await fetch("/api/chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, text }),
        });

        const data = await res.json();

        if (data.new_messages) {
          setMsgs((prev) => {
            const withoutTemp = prev.filter((m) => m.id !== userMsg.id);
            const normalized = normalizeMessages(data.new_messages);
            const existingIds = new Set(withoutTemp.map((m) => m.id));
            const newMsgs = normalized.filter((m) => !existingIds.has(m.id));
            return [...withoutTemp, userMsg, ...newMsgs];
          });
        }
      } catch (err) {
        console.error("Auto-send analyze handle failed:", err);
      }

      setBusy(false);
    })();
  }, [sessionId]);

  // ============================================================
  // Handle Instagram OAuth callback
  // ============================================================
  useEffect(() => {
    const igParam = searchParams.get("ig");

    if (igParam === "connected" && sessionId && !igConnected) {
      setIgConnected(true);
      router.replace("/chat", { scroll: false });

      loadSession(sessionId).then(() => {
        const msgKey = `ig_connected_${sessionId}`;
        if (!sentMessagesRef.current.has(msgKey)) {
          sentMessagesRef.current.add(msgKey);
          sendMessage("Instagram uspješno spojen!");
        }
      });
    }
  }, [searchParams, sessionId, igConnected, router]);

  // ============================================================
  // Start notification polling when session is ready
  // ============================================================
  useEffect(() => {
    if (!sessionId) return;

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(() => {
      pollNotifications();
    }, 5000);

    pollNotifications();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [sessionId]);

  // ============================================================
  // Create new session
  // ============================================================
  async function createSession() {
    try {
      const res = await fetch("/api/chat/session", { method: "POST" });
      const data = await res.json();

      if (data.session_id) {
        localStorage.setItem("chat_session_id", data.session_id);
        setSessionId(data.session_id);
        setMsgs(normalizeMessages(data.messages || []));
      }
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }

  // ============================================================
  // Load existing session
  // ============================================================
  async function loadSession(sid: string) {
    try {
      const res = await fetch(`/api/chat/session?session_id=${sid}`);
      const data = await res.json();

      if (data.messages) {
        setMsgs(normalizeMessages(data.messages));
      }
    } catch (err) {
      console.error("Failed to load session:", err);
      localStorage.removeItem("chat_session_id");
      createSession();
    }
  }

  // ============================================================
  // Normalize messages — with metadata field
  // ============================================================
  function normalizeMessages(messages: any[]): Msg[] {
    return messages.map(m => ({
      id: m.id,
      role: m.role,
      text: m.text,
      chips: m.chips || m.meta?.chips || [],
      metadata: m.metadata || m.meta?.metadata || undefined
    }));
  }

  // ============================================================
  // Adapter — toDesignMessage()
  // Konvertira stari Msg + Chip[] → novi ChatMessage format
  // ============================================================
  function toDesignMessage(m: Msg): ChatMessage {
    return {
      id: m.id,
      role: m.role,
      content: m.text,
      metadata: m.metadata,
      chips: m.chips?.map(chip => {
        if (typeof chip === "string") {
          return { type: "suggestion" as const, label: chip, value: chip };
        }
        return {
          type: (chip.type || "suggestion") as ChatChipData["type"],
          label: chip.label,
          value: chip.value || chip.label,
          href: chip.href,
          productId: chip.productId,
          action: chip.action,
          assetId: chip.assetId,
          uploadType: chip.uploadType,
          accept: chip.accept,
        } as ChatChipData;
      }),
    };
  }

  // ============================================================
  // handleSmartChipClick — bridge za specijalne chipove
  // ChatBubble šalje value string, ali trebamo full chip objekt
  // za file_upload, navigation, product_confirm, asset_delete
  // ============================================================
  async function handleSmartChipClick(chip: Chip, value: string) {
    if (typeof chip === "string") {
      handleChipAction(value);
      return;
    }

    // Navigation
    if (chip.type === "navigation" && chip.href) {
      router.push(chip.href);
      return;
    }

    // File upload — treba triggerati file input
    if (chip.type === "file_upload") {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = chip.accept || "image/*";
      fileInput.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) handleFileUpload(file, chip.uploadType || "style_reference");
      };
      fileInput.click();
      return;
    }

    // Asset delete
    if (chip.type === "asset_delete" && chip.assetId) {
      if (!confirm("Obrisati ovu referencu?")) return;
      setBusy(true);
      try {
        await fetch(`/api/assets/${chip.assetId}`, { method: "DELETE" });
        sendMessage(`Referenca obrisana: ${chip.assetId}`);
      } catch (e) {
        console.error("Delete failed:", e);
      }
      setBusy(false);
      return;
    }

    // Product confirm/reject
    if (chip.type === "product_confirm" && chip.productId) {
      setBusy(true);
      try {
        const endpoint = chip.action === "reject" ? "/api/products/reject" : "/api/products/confirm";
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: chip.productId })
        });
      } catch (e) {
        console.error("Product action failed:", e);
      }
      setBusy(false);
      handleChipAction(value);
      return;
    }

    // Default — treat as text
    handleChipAction(value);
  }

  // ============================================================
  // Poll for notifications — graceful on 500 (missing column etc.)
  // ============================================================
  async function pollNotifications() {
    if (!sessionId) return;

    try {
      const res = await fetch(`/api/chat/notifications?session_id=${sessionId}`);
      if (!res.ok) return; // Silently skip on server error

      const data = await res.json();

      if (data.notifications && data.notifications.length > 0) {
        for (const notif of data.notifications) {
          if (processedNotifRef.current.has(notif.id)) {
            continue;
          }

          processedNotifRef.current.add(notif.id);

          const notifMsg: Msg = {
            id: notif.id,
            role: "assistant",
            text: notif.message || notif.title,
            chips: notif.chips || []
          };

          setMsgs(prev => {
            if (prev.some(m => m.id === notifMsg.id)) {
              return prev;
            }
            return [...prev, notifMsg];
          });

          await markNotificationRead(notif.id);
        }
      }
    } catch (err) {
      // Silently ignore — notifications are non-critical
    }
  }

  // ============================================================
  // Mark notification as read
  // ============================================================
  async function markNotificationRead(notifId: string) {
    try {
      await fetch("/api/chat/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_id: notifId, action: "mark_read" })
      });
    } catch (err) {
      // Silently ignore
    }
  }

  // ============================================================
  // Send message
  // ============================================================
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !sessionId || busy) return;

    const recentKey = `${sessionId}_${text}`;
    if (sentMessagesRef.current.has(recentKey)) {
      console.debug("Duplicate message blocked:", text);
      return;
    }
    sentMessagesRef.current.add(recentKey);

    setTimeout(() => {
      sentMessagesRef.current.delete(recentKey);
    }, 2000);

    setBusy(true);

    const userMsg: Msg = {
      id: "temp_" + Date.now(),
      role: "user",
      text
    };
    setMsgs(prev => [...prev, userMsg]);
    setInput("");

    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, text })
      });

      const data = await res.json();

      if (data.new_messages) {
        setMsgs(prev => {
          const withoutTemp = prev.filter(m => m.id !== userMsg.id);
          const normalized = normalizeMessages(data.new_messages);
          const existingIds = new Set(withoutTemp.map(m => m.id));
          const newMsgs = normalized.filter(m => !existingIds.has(m.id));
          return [...withoutTemp, userMsg, ...newMsgs];
        });
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    }

    setBusy(false);
  }, [sessionId, busy]);

  // ============================================================
  // Handle chip click
  // ============================================================
  function handleChipAction(value: string) {
    sendMessage(value);
  }

  // ============================================================
  // Handle file upload
  // ============================================================
  async function handleFileUpload(file: File, uploadType: string) {
    setBusy(true);
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("label", uploadType);
      formData.append("project_id", "proj_local");

      const res = await fetch("/api/assets/upload", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (data.success) {
        const successMsg: Msg = {
          id: "msg_upload_" + Date.now(),
          role: "assistant",
          text: `✅ Slika uploadana! (${uploadType.replace('_reference', '')})\n\n📁 ${file.name}`,
          chips: [
            { type: "suggestion", label: "Uploaj još", value: "uploaj slike" },
            { type: "suggestion", label: "Nastavi dalje", value: "preskoči reference" }
          ]
        };
        setMsgs(prev => [...prev, successMsg]);
      } else {
        const errorMsg: Msg = {
          id: "msg_upload_error_" + Date.now(),
          role: "assistant",
          text: `❌ Upload nije uspio: ${data.error}`,
          chips: [
            { type: "suggestion", label: "Pokušaj ponovo", value: "uploaj slike" }
          ]
        };
        setMsgs(prev => [...prev, errorMsg]);
      }
    } catch (e: any) {
      console.error("Upload failed:", e);
      const errorMsg: Msg = {
        id: "msg_upload_error_" + Date.now(),
        role: "assistant",
        text: `❌ Greška pri uploadu: ${e.message}`,
        chips: []
      };
      setMsgs(prev => [...prev, errorMsg]);
    }

    setBusy(false);
  }

  // ============================================================
  // Handle input submit
  // ============================================================
  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    sendMessage(input);
  }

  // ============================================================
  // Reset session
  // ============================================================
  async function resetSession() {
    if (!confirm("Želiš li stvarno započeti novu sesiju?\n\nOvo će:\n• Odspojiti Instagram\n• Obrisati sve proizvode\n• Započeti onboarding ispočetka")) {
      return;
    }

    try {
      const res = await fetch("/api/chat/reset", { method: "POST" });
      
      if (!res.ok) {
        throw new Error("Reset failed");
      }

      const data = await res.json();

      localStorage.removeItem("chat_session_id");
      
      processedNotifRef.current.clear();
      sentMessagesRef.current.clear();
      initRef.current = false;
      
      setSessionId(data.session_id);
      setMsgs(data.messages || []);
      setIgConnected(false);

      localStorage.setItem("chat_session_id", data.session_id);

      console.log("Session reset complete:", data.reset);

    } catch (e) {
      console.error("Reset failed:", e);
      alert("Greška pri resetiranju sesije. Pokušaj ponovno.");
    }
  }

  // ============================================================
  // Render — ChatLayout + ChatBubble + Fixed bottom input
  // ============================================================
  return (
    <>
      <ChatLayout
        currentStep={1}
        totalSteps={6}
        stepTitle="Profile analysis"
      >
        {/* Nova sesija button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={resetSession}
            className="rounded-lg border border-lavender-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white hover:text-gray-900 transition-colors"
            title="Započni novu sesiju"
          >
            🔄 Nova sesija
          </button>
        </div>

        {/* Message area — ChatBubble + handleSmartChipClick */}
        <div className="space-y-4 pb-32">
          {msgs.map(m => (
            <ChatBubble
              key={m.id}
              message={toDesignMessage(m)}
              onChipClick={(value) => {
                // Pronađi originalni chip objekt za full handling
                const originalChip = m.chips?.find(c =>
                  typeof c === "string" ? c === value : (c.value || c.label) === value
                );
                if (originalChip && typeof originalChip !== "string") {
                  handleSmartChipClick(originalChip, value);
                } else {
                  handleChipAction(value);
                }
              }}
              disabled={busy}
            />
          ))}
          <div ref={endRef} />
        </div>
      </ChatLayout>

      {/* Input form — Fixed bottom position IZVAN ChatLayout-a */}
      <div className="fixed bottom-0 left-0 right-0 bg-lavender-100/95 backdrop-blur-md border-t border-lavender-200/50 p-4 z-40">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={busy ? "Thinking…" : "Napiši poruku..."}
            className="flex-1 px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="btn-primary px-6 py-3 rounded-xl font-semibold text-sm disabled:opacity-60"
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}

// ============================================================
// Default Export with Suspense Boundary
// ============================================================

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-lavender flex items-center justify-center">
        <div className="text-gray-500 text-sm">Učitavam chat...</div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
