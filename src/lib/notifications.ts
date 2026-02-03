// ============================================================
// NOTIFICATIONS LIBRARY
// ============================================================
// Helper functions za push notifikacija iz workera u chat.
// Uključuje deduplication da se ne šalju duplikati.
// ============================================================

import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";

// ============================================================
// Types
// ============================================================

export type NotificationType =
  | "analysis_complete"
  | "plan_generated"
  | "render_complete"
  | "publish_success"
  | "publish_failed"
  | "job_failed"
  | "product_detected"
  | "info";

export interface NotificationChip {
  type: string;
  label: string;
  value?: string;
  href?: string;
  productId?: string;
  action?: "confirm" | "reject";
}

export interface PushNotificationInput {
  session_id: string;
  project_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  chips?: NotificationChip[];
  dedupe_key?: string; // Optional key for deduplication
}

// ============================================================
// Core Function: Push Notification
// ============================================================

export async function pushNotification(
  input: PushNotificationInput
): Promise<{ ok: boolean; id?: string; dedupe?: boolean }> {
  const {
    session_id,
    project_id,
    type,
    title,
    message,
    data,
    chips,
    dedupe_key
  } = input;

  try {
    // =========================================================
    // Deduplication check
    // If dedupe_key is provided, check if similar notification exists
    // within last 5 minutes
    // =========================================================
    if (dedupe_key) {
      const existing = await q<any>(
        `SELECT id FROM chat_notifications
         WHERE session_id = $1
           AND type = $2
           AND data->>'dedupe_key' = $3
           AND created_at > NOW() - INTERVAL '5 minutes'
         LIMIT 1`,
        [session_id, type, dedupe_key]
      );

      if (existing.length > 0) {
        log("notifications", "dedupe_skipped", {
          session_id,
          type,
          dedupe_key,
          existing_id: existing[0].id
        });

        return { ok: true, id: existing[0].id, dedupe: true };
      }
    }

    // =========================================================
    // Insert notification
    // =========================================================
    const id = "notif_" + uuid();

    const notifData = {
      ...data,
      dedupe_key: dedupe_key || null
    };

    await q(
      `INSERT INTO chat_notifications (id, session_id, project_id, type, title, message, data, chips, read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())`,
      [
        id,
        session_id,
        project_id,
        type,
        title,
        message,
        JSON.stringify(notifData),
        chips ? JSON.stringify(chips) : null
      ]
    );

    log("notifications", "pushed", {
      id,
      session_id,
      project_id,
      type,
      title
    });

    return { ok: true, id };

  } catch (error: any) {
    log("notifications", "push_error", {
      session_id,
      type,
      error: error.message
    });

    return { ok: false };
  }
}

// ============================================================
// Helper: Get active session for project
// ============================================================

export async function getActiveSessionForProject(
  project_id: string
): Promise<string | null> {
  try {
    // Get the most recent active session for this project
    const sessions = await q<any>(
      `SELECT id FROM chat_sessions
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [project_id]
    );

    return sessions[0]?.id || null;
  } catch (error: any) {
    log("notifications", "get_session_error", {
      project_id,
      error: error.message
    });
    return null;
  }
}

// ============================================================
// Convenience Functions
// ============================================================

export const notify = {
  /**
   * Notify when Vision analysis is complete
   * UPDATED: Sada dohvaća proizvode i prikazuje ih direktno u chatu
   */
  async analysisComplete(
    project_id: string,
    data: {
      posts_analyzed: number;
      products_found: number;
      dominant_color?: string;
    }
  ): Promise<boolean> {
    const session_id = await getActiveSessionForProject(project_id);
    if (!session_id) return false;

    // Use dedupe_key to prevent multiple notifications for same event
    const dedupe_key = `analysis_${project_id}_${Date.now().toString().slice(0, -4)}`; // Group by ~10 second window

    let chips: NotificationChip[] = [];
    let message = `✅ Analiza završena!\n📊 Analizirano: ${data.posts_analyzed} objava\n🎨 Dominantna boja: ${data.dominant_color || "N/A"}`;

    // Ako ima proizvoda, dohvati ih i prikaži chipove za potvrdu
    if (data.products_found > 0) {
      try {
        const pendingProducts = await q<any>(
          `SELECT DISTINCT ON (product_name) 
             id, product_name, category, confidence
           FROM detected_products
           WHERE project_id = $1 AND status = 'pending'
           ORDER BY product_name, confidence DESC
           LIMIT 5`,
          [project_id]
        );

        if (pendingProducts.length > 0) {
          message += `\n\n🏷️ Pronađeno ${pendingProducts.length} proizvoda. Klikni za potvrdu:`;

          // Jedan chip po proizvodu - ne dupliciraj ✓/✗
          for (const p of pendingProducts) {
            chips.push({
              type: "product_confirm",
              label: `☐ ${p.product_name}`,
              productId: p.id,
              action: "confirm"
            });
          }

          // Dodaj akcijske gumbe
          chips.push({
            type: "suggestion",
            label: "✓ Potvrdi sve",
            value: "potvrdi sve proizvode"
          });
          chips.push({
            type: "suggestion",
            label: "➜ Nastavi dalje",
            value: "nastavi s generiranjem"
          });

          // Dodaj opciju za pregled svih ako ih ima više
          if (data.products_found > pendingProducts.length) {
            chips.push({
              type: "suggestion",
              label: `Prikaži sve (${data.products_found})`,
              value: "prikaži sve proizvode"
            });
          }
        }
      } catch (err) {
        log("notifications", "products_fetch_error", { error: (err as any).message });
        message += `\n\n🏷️ Pronađeno ${data.products_found} proizvoda za potvrdu.`;
        chips.push({
          type: "suggestion",
          label: "Prikaži proizvode",
          value: "prikaži proizvode"
        });
      }
    }

    const result = await pushNotification({
      session_id,
      project_id,
      type: "analysis_complete",
      title: "Analiza gotova",
      message,
      data,
      chips: chips.length > 0 ? chips : undefined,
      dedupe_key
    });

    return result.ok;
  },

  /**
   * Notify when content plan is generated
   */
  async planGenerated(
    project_id: string,
    itemCount: number,
    month: string
  ): Promise<boolean> {
    const session_id = await getActiveSessionForProject(project_id);
    if (!session_id) return false;

    const dedupe_key = `plan_${project_id}_${month}`;

    const result = await pushNotification({
      session_id,
      project_id,
      type: "plan_generated",
      title: "Plan generiran",
      message: `🎉 Plan za ${month} je gotov!\n📅 Kreirano ${itemCount} objava.\n\nPogledaj ih u Calendaru.`,
      data: { item_count: itemCount, month },
      chips: [
        { type: "navigation", label: "Otvori Calendar", href: "/calendar" }
      ],
      dedupe_key
    });

    return result.ok;
  },

  /**
   * Notify when renders are complete
   */
  async renderComplete(
    project_id: string,
    successCount: number,
    failedCount: number
  ): Promise<boolean> {
    const session_id = await getActiveSessionForProject(project_id);
    if (!session_id) return false;

    const result = await pushNotification({
      session_id,
      project_id,
      type: "render_complete",
      title: "Vizuali gotovi",
      message: `🖼️ Renderiranje završeno!\n✅ Uspješno: ${successCount}\n${failedCount > 0 ? `❌ Neuspješno: ${failedCount}` : ""}`,
      data: { success: successCount, failed: failedCount },
      chips: [
        { type: "navigation", label: "Pogledaj u Calendaru", href: "/calendar" }
      ]
    });

    return result.ok;
  },

  /**
   * Notify about new detected products
   */
  async productsDetected(
    project_id: string,
    products: Array<{ name: string; category: string; productId: string }>
  ): Promise<boolean> {
    const session_id = await getActiveSessionForProject(project_id);
    if (!session_id) return false;

    const chips: NotificationChip[] = [];
    for (const p of products.slice(0, 5)) {
      chips.push({
        type: "product_confirm",
        label: `✓ ${p.name}`,
        productId: p.productId,
        action: "confirm"
      });
      chips.push({
        type: "product_confirm",
        label: `✗ ${p.name}`,
        productId: p.productId,
        action: "reject"
      });
    }

    const result = await pushNotification({
      session_id,
      project_id,
      type: "product_detected",
      title: "Novi proizvodi",
      message: `🔍 Pronađeno ${products.length} proizvoda. Potvrdi koje želiš koristiti u generiranju sadržaja:`,
      data: { products: products.map(p => p.name) },
      chips
    });

    return result.ok;
  },

  /**
   * Generic info notification
   */
  async info(
    project_id: string,
    title: string,
    message: string,
    chips?: NotificationChip[]
  ): Promise<boolean> {
    const session_id = await getActiveSessionForProject(project_id);
    if (!session_id) return false;

    const result = await pushNotification({
      session_id,
      project_id,
      type: "info",
      title,
      message,
      chips
    });

    return result.ok;
  },

  /**
   * Notify about job failure
   */
  async jobFailed(
    project_id: string,
    jobType: string,
    errorMessage: string
  ): Promise<boolean> {
    const session_id = await getActiveSessionForProject(project_id);
    if (!session_id) return false;

    const result = await pushNotification({
      session_id,
      project_id,
      type: "job_failed",
      title: "Greška",
      message: `❌ ${jobType} nije uspio:\n${errorMessage}`,
      data: { job_type: jobType, error: errorMessage }
    });

    return result.ok;
  }
};

export default notify;
