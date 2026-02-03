// ============================================================
// API: /api/chat/notifications
// ============================================================
// Polling endpoint za async notifikacije iz workera.
// GET: Dohvaća nepročitane notifikacije za session
// POST: Markira notifikaciju kao pročitanu
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { log } from "@/lib/logger";

const PROJECT_ID = "proj_local";

// ============================================================
// GET /api/chat/notifications
// Dohvaća nepročitane notifikacije za danu session
// ============================================================
export async function GET(req: Request) {
  const url = new URL(req.url);
  const session_id = url.searchParams.get("session_id");

  if (!session_id) {
    return NextResponse.json(
      { error: "session_id required" },
      { status: 400 }
    );
  }

  try {
    // Dohvati nepročitane notifikacije za ovu session
    // Limit na 10 da ne preopteretimo frontend
    const notifications = await q<any>(
      `SELECT id, type, title, message, data, chips, created_at
       FROM chat_notifications
       WHERE session_id = $1 AND read = false
       ORDER BY created_at ASC
       LIMIT 10`,
      [session_id]
    );

    // Parse JSONB fields
    const parsed = notifications.map((n: any) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      data: typeof n.data === "string" ? JSON.parse(n.data) : n.data,
      chips: typeof n.chips === "string" ? JSON.parse(n.chips) : n.chips,
      created_at: n.created_at
    }));

    return NextResponse.json({
      ok: true,
      notifications: parsed,
      count: parsed.length
    });

  } catch (error: any) {
    log("api:notifications", "GET error", { error: error.message });
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/chat/notifications
// Markira notifikaciju kao pročitanu ili izvršava akciju
// ============================================================
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { notification_id, action } = body;

    if (!notification_id) {
      return NextResponse.json(
        { error: "notification_id required" },
        { status: 400 }
      );
    }

    if (action === "mark_read") {
      // Mark single notification as read
      await q(
        `UPDATE chat_notifications SET read = true WHERE id = $1`,
        [notification_id]
      );

      log("api:notifications", "marked_read", { notification_id });

      return NextResponse.json({ ok: true, marked: notification_id });
    }

    if (action === "mark_all_read") {
      // Mark all notifications for session as read
      const session_id = body.session_id;
      if (!session_id) {
        return NextResponse.json(
          { error: "session_id required for mark_all_read" },
          { status: 400 }
        );
      }

      const result = await q(
        `UPDATE chat_notifications SET read = true 
         WHERE session_id = $1 AND read = false`,
        [session_id]
      );

      log("api:notifications", "marked_all_read", { session_id });

      return NextResponse.json({ ok: true, session_id });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );

  } catch (error: any) {
    log("api:notifications", "POST error", { error: error.message });
    return NextResponse.json(
      { error: "Failed to process notification action" },
      { status: 500 }
    );
  }
}
