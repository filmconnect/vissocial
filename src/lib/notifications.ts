// ============================================================
// NOTIFICATIONS.TS - Worker → Chat Async Notifications
// ============================================================
// Sustav za slanje notifikacija iz workera u chat.
// Worker zapisuje u chat_notifications tablicu,
// frontend poll-a /api/chat/notifications endpoint.
// ============================================================

import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";

// ============================================================
// TYPES
// ============================================================

export interface ChatChip {
  type: "suggestion" | "onboarding_option" | "product_confirm" | "navigation";
  label: string;
  value?: string;
  href?: string;
  productId?: string;
  action?: "confirm" | "reject";
}

export interface NotificationInput {
  session_id?: string;  // Optional - if not provided, uses latest session for project
  project_id: string;
  type: "ingest_complete" | "analysis_complete" | "brand_rebuild_complete" | 
        "plan_generated" | "job_failed" | "product_detected" | "info";
  title: string;
  message: string;
  data?: Record<string, any>;
  chips?: ChatChip[];
}

export interface Notification {
  id: string;
  session_id: string;
  project_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, any> | null;
  chips: ChatChip[] | null;
  read: boolean;
  created_at: Date;
}

// ============================================================
// PUSH NOTIFICATION (from worker)
// ============================================================

/**
 * Push a notification to the chat system.
 * If session_id is not provided, it will use the most recent session for the project.
 */
export async function pushNotification(input: NotificationInput): Promise<string | null> {
  const { project_id, type, title, message, data, chips } = input;
  let { session_id } = input;

  try {
    // If no session_id, find the most recent session for this project
    if (!session_id) {
      const sessions = await q<any>(
        `SELECT id FROM chat_sessions 
         WHERE project_id = $1 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [project_id]
      );
      
      if (sessions.length === 0) {
        log("notifications", "no_session_found", { project_id });
        return null;
      }
      
      session_id = sessions[0].id;
    }

    const notificationId = "notif_" + uuid();

    await q(
      `INSERT INTO chat_notifications 
       (id, session_id, project_id, type, title, message, data, chips, read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())`,
      [
        notificationId,
        session_id,
        project_id,
        type,
        title,
        message,
        data ? JSON.stringify(data) : null,
        chips ? JSON.stringify(chips) : null
      ]
    );

    log("notifications", "pushed", {
      id: notificationId,
      session_id,
      project_id,
      type,
      title
    });

    return notificationId;

  } catch (error: any) {
    // Graceful degradation - log but don't throw
    log("notifications", "push_error", {
      project_id,
      type,
      error: error.message
    });
    return null;
  }
}

// ============================================================
// GET UNREAD NOTIFICATIONS (for API)
// ============================================================

export async function getUnreadNotifications(
  session_id: string
): Promise<Notification[]> {
  try {
    const notifications = await q<any>(
      `SELECT id, session_id, project_id, type, title, message, data, chips, read, created_at
       FROM chat_notifications
       WHERE session_id = $1 AND read = false
       ORDER BY created_at ASC`,
      [session_id]
    );

    return notifications.map((n: any) => ({
      ...n,
      data: typeof n.data === "string" ? JSON.parse(n.data) : n.data,
      chips: typeof n.chips === "string" ? JSON.parse(n.chips) : n.chips
    }));

  } catch (error: any) {
    log("notifications", "get_error", {
      session_id,
      error: error.message
    });
    return [];
  }
}

// ============================================================
// MARK AS READ
// ============================================================

export async function markNotificationsRead(
  notification_ids: string[]
): Promise<void> {
  if (notification_ids.length === 0) return;

  try {
    await q(
      `UPDATE chat_notifications 
       SET read = true 
       WHERE id = ANY($1)`,
      [notification_ids]
    );

    log("notifications", "marked_read", {
      count: notification_ids.length
    });

  } catch (error: any) {
    log("notifications", "mark_read_error", {
      error: error.message
    });
  }
}

// ============================================================
// CONVERT TO CHAT MESSAGES
// ============================================================

export interface ChatMessage {
  id: string;
  role: "assistant" | "user" | "system";
  text: string;
  chips?: ChatChip[];
  meta?: Record<string, any>;
}

export function convertNotificationsToMessages(
  notifications: Notification[]
): ChatMessage[] {
  return notifications.map(n => ({
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
}

// ============================================================
// HELPER FUNCTIONS (convenience wrappers)
// ============================================================

export const notify = {
  /**
   * Notify when Instagram ingest completes
   */
  ingestComplete: async (
    project_id: string,
    stored: number,
    skipped: number
  ) => {
    return pushNotification({
      project_id,
      type: "ingest_complete",
      title: "Instagram sync završen",
      message: `Dohvaćeno ${stored} novih objava${skipped > 0 ? ` (${skipped} preskočeno)` : ""}.`,
      data: { stored, skipped },
      chips: [{ type: "suggestion", label: "Pokreni analizu", value: "Pokreni analizu" }]
    });
  },

  /**
   * Notify when analysis completes
   */
  analysisComplete: async (
    project_id: string,
    analyzed: number,
    productsFound: number
  ) => {
    const hasProducts = productsFound > 0;
    
    return pushNotification({
      project_id,
      type: "analysis_complete",
      title: "Analiza gotova",
      message: `Analizirano ${analyzed} objava. ${hasProducts ? `Pronađeno ${productsFound} proizvoda.` : ""}`,
      data: { analyzed, productsFound },
      chips: hasProducts 
        ? [{ type: "suggestion", label: "Prikaži proizvode", value: "Prikaži proizvode" }]
        : [{ type: "suggestion", label: "Generiraj plan", value: "Generiraj plan" }]
    });
  },

  /**
   * Notify when brand rebuild completes
   */
  brandRebuildComplete: async (
    project_id: string,
    postsAnalyzed: number,
    pendingProducts: number,
    dominantColor?: string,
    mood?: string
  ) => {
    let message = `✅ Analiza završena!\n\n`;
    message += `📊 Analizirano: ${postsAnalyzed} objava\n`;
    if (dominantColor) message += `🎨 Dominantna boja: ${dominantColor}\n`;
    if (mood) message += `📸 Stil: ${mood}\n`;
    if (pendingProducts > 0) {
      message += `\n🏷️ Pronađeno ${pendingProducts} proizvoda za potvrdu.`;
    }

    return pushNotification({
      project_id,
      type: "brand_rebuild_complete",
      title: "Brand profil ažuriran",
      message,
      data: { postsAnalyzed, pendingProducts, dominantColor, mood },
      chips: pendingProducts > 0
        ? [{ type: "suggestion", label: "Prikaži proizvode", value: "Prikaži proizvode" }]
        : [{ type: "suggestion", label: "Generiraj plan", value: "Generiraj plan" }]
    });
  },

  /**
   * Notify when plan generation completes
   */
  planGenerated: async (
    project_id: string,
    itemsCount: number,
    month: string
  ) => {
    return pushNotification({
      project_id,
      type: "plan_generated",
      title: "Plan generiran",
      message: `Plan za ${month} je spreman! Kreirano ${itemsCount} objava.`,
      data: { itemsCount, month },
      chips: [{ type: "navigation", label: "Otvori Calendar", href: "/calendar" }]
    });
  },

  /**
   * Notify when a job fails
   */
  jobFailed: async (
    project_id: string,
    jobType: string,
    errorMessage: string
  ) => {
    return pushNotification({
      project_id,
      type: "job_failed",
      title: `Greška: ${jobType}`,
      message: `Nešto je pošlo po zlu: ${errorMessage}`,
      data: { jobType, error: errorMessage }
    });
  }
};
