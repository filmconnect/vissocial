// ============================================================
// CHAT NOTIFICATIONS - Helper for worker → chat communication
// ============================================================

import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { chip, ChatChip } from "@/lib/chatChips";

// ============================================================
// TYPES
// ============================================================

export type NotificationType =
  | "job_started"
  | "job_complete"
  | "job_failed"
  | "products_detected"
  | "analysis_complete"
  | "ingest_complete"
  | "brand_rebuild_complete"
  | "plan_generated"
  | "info"
  | "warning"
  | "error";

export interface NotificationData {
  job_name?: string;
  job_id?: string;
  count?: number;
  products_count?: number;
  images_count?: number;
  duration_ms?: number;
  error?: string;
  [key: string]: any;
}

export interface ChatNotification {
  id: string;
  session_id: string;
  project_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  data: NotificationData;
  chips: ChatChip[];
  read: boolean;
  created_at: Date;
}

// ============================================================
// GET ACTIVE SESSION FOR PROJECT
// ============================================================

async function getActiveSession(project_id: string): Promise<string | null> {
  try {
    // Get most recent session for this project
    const [session] = await q<any>(
      `SELECT id FROM chat_sessions 
       WHERE project_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [project_id]
    );
    return session?.id || null;
  } catch (error: any) {
    // Table might not exist yet or project_id column missing
    log("notifications", "getActiveSession error (table may not exist)", { 
      project_id, 
      error: error.message 
    });
    return null;
  }
}

// ============================================================
// PUSH NOTIFICATION
// ============================================================

export async function pushNotification(
  project_id: string,
  type: NotificationType,
  title: string,
  message?: string,
  data?: NotificationData,
  chips?: ChatChip[]
): Promise<string | null> {
  try {
    const session_id = await getActiveSession(project_id);
    
    if (!session_id) {
      log("notifications", "no active session found", { project_id, type });
      return null;
    }

    const id = "notif_" + uuid();

    await q(
      `INSERT INTO chat_notifications (id, session_id, project_id, type, title, message, data, chips)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        session_id,
        project_id,
        type,
        title,
        message || null,
        JSON.stringify(data || {}),
        JSON.stringify(chips || []),
      ]
    );

    log("notifications", "pushed notification", { id, session_id, type, title });
    return id;
  } catch (error: any) {
    // Graceful degradation - if table doesn't exist, just log and continue
    log("notifications", "error pushing notification (table may not exist)", { 
      error: error.message, 
      project_id, 
      type 
    });
    return null;
  }
}

// ============================================================
// HELPER FUNCTIONS FOR COMMON NOTIFICATIONS
// ============================================================

export const notify = {
  // Instagram ingest started
  ingestStarted: (project_id: string) =>
    pushNotification(
      project_id,
      "job_started",
      "📥 Povlačim slike s Instagrama...",
      "Ovo može potrajati minutu-dvije.",
      { job_name: "instagram.ingest" }
    ),

  // Instagram ingest complete
  ingestComplete: (project_id: string, count: number) =>
    pushNotification(
      project_id,
      "ingest_complete",
      `✅ Povukao sam ${count} slika s Instagrama!`,
      "Pokrećem analizu...",
      { images_count: count },
      [chip.suggestion("Status")]
    ),

  // Analysis started
  analysisStarted: (project_id: string, total: number) =>
    pushNotification(
      project_id,
      "job_started",
      `🔍 Analiziram ${total} slika...`,
      "Tražim proizvode, stil i boje.",
      { job_name: "analyze", images_count: total }
    ),

  // Analysis complete with products
  analysisComplete: (project_id: string, products_count: number, images_count: number) =>
    pushNotification(
      project_id,
      "analysis_complete",
      `🔔 Analiza gotova!`,
      products_count > 0
        ? `Pronašao sam ${products_count} proizvoda za potvrdu.`
        : `Analizirao sam ${images_count} slika.`,
      { products_count, images_count },
      products_count > 0
        ? [chip.suggestion("Prikaži proizvode"), chip.suggestion("Potvrdi sve")]
        : [chip.suggestion("Status")]
    ),

  // Products detected (can be called separately)
  productsDetected: (project_id: string, count: number) =>
    pushNotification(
      project_id,
      "products_detected",
      `📦 Pronađeno ${count} novih proizvoda!`,
      "Potvrdi ih da mogu bolje personalizirati sadržaj.",
      { products_count: count },
      [chip.suggestion("Prikaži proizvode"), chip.suggestion("Potvrdi sve")]
    ),

  // Brand rebuild complete
  brandRebuildComplete: (project_id: string) =>
    pushNotification(
      project_id,
      "brand_rebuild_complete",
      `✨ Brand profil ažuriran!`,
      "Spreman si za generiranje plana.",
      {},
      [chip.suggestion("Generiraj plan"), chip.suggestion("Status")]
    ),

  // Plan generated
  planGenerated: (project_id: string, items_count: number, month: string) =>
    pushNotification(
      project_id,
      "plan_generated",
      `🎉 Plan generiran!`,
      `Kreirao sam ${items_count} objava za ${month}.`,
      { items_count, month },
      [chip.navigation("Otvori Calendar", "/calendar"), chip.suggestion("Status")]
    ),

  // Web scrape complete
  webScrapeComplete: (project_id: string, brand_name: string | null, products_count: number) =>
    pushNotification(
      project_id,
      "job_complete",
      `🌐 Web pretraga završena!`,
      brand_name
        ? `Pronašao sam "${brand_name}" i ${products_count} proizvoda.`
        : `Pronašao sam ${products_count} proizvoda.`,
      { brand_name, products_count },
      products_count > 0
        ? [chip.suggestion("Prikaži proizvode")]
        : [chip.suggestion("Status")]
    ),

  // Job failed
  jobFailed: (project_id: string, job_name: string, error: string) =>
    pushNotification(
      project_id,
      "job_failed",
      `❌ Greška: ${job_name}`,
      error.slice(0, 200),
      { job_name, error },
      [chip.suggestion("Status"), chip.suggestion("Pomoć")]
    ),

  // Generic info
  info: (project_id: string, title: string, message?: string, chips?: ChatChip[]) =>
    pushNotification(project_id, "info", title, message, {}, chips),

  // Generic warning
  warning: (project_id: string, title: string, message?: string) =>
    pushNotification(project_id, "warning", `⚠️ ${title}`, message),

  // Generic error
  error: (project_id: string, title: string, message?: string) =>
    pushNotification(project_id, "error", `❌ ${title}`, message),
};

// ============================================================
// GET UNREAD NOTIFICATIONS
// ============================================================

export async function getUnreadNotifications(session_id: string): Promise<ChatNotification[]> {
  const notifications = await q<any>(
    `SELECT id, session_id, project_id, type, title, message, data, chips, read, created_at
     FROM chat_notifications
     WHERE session_id = $1 AND read = FALSE
     ORDER BY created_at ASC`,
    [session_id]
  );

  return notifications.map((n: any) => ({
    ...n,
    data: n.data || {},
    chips: n.chips || [],
  }));
}

// ============================================================
// MARK NOTIFICATIONS AS READ
// ============================================================

export async function markNotificationsRead(notification_ids: string[]): Promise<void> {
  if (notification_ids.length === 0) return;

  await q(
    `UPDATE chat_notifications SET read = TRUE WHERE id = ANY($1)`,
    [notification_ids]
  );
}

// ============================================================
// CONVERT NOTIFICATIONS TO CHAT MESSAGES
// ============================================================

export async function convertNotificationsToMessages(
  session_id: string
): Promise<Array<{ id: string; role: "assistant"; text: string; chips: ChatChip[] }>> {
  const notifications = await getUnreadNotifications(session_id);

  if (notifications.length === 0) return [];

  const messages = notifications.map((n) => ({
    id: n.id,
    role: "assistant" as const,
    text: n.message ? `${n.title}\n\n${n.message}` : n.title,
    chips: n.chips,
  }));

  // Mark as read
  await markNotificationsRead(notifications.map((n) => n.id));

  return messages;
}
