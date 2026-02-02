import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { log } from "@/lib/logger";
import { v4 as uuid } from "uuid";
import { convertNotificationsToMessages, markNotificationsRead } from "@/lib/notifications";
import { chip } from "@/lib/chatChips";

// ============================================================
// GET - Fetch unread notifications and convert to messages
// ============================================================

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const session_id = url.searchParams.get("session_id");

    if (!session_id) {
      return NextResponse.json({ error: "session_id required" }, { status: 400 });
    }

    // Try to get notifications - gracefully handle if table doesn't exist
    let messages: any[] = [];
    try {
      messages = await convertNotificationsToMessages(session_id);

      // Also save them as actual chat messages for history
      for (const msg of messages) {
        const msgId = "msg_notif_" + uuid();
        await q(
          `INSERT INTO chat_messages (id, session_id, role, text, meta)
           VALUES ($1, $2, 'assistant', $3, $4)
           ON CONFLICT DO NOTHING`,
          [msgId, session_id, msg.text, JSON.stringify({ chips: msg.chips, from_notification: true })]
        );
      }
    } catch (error: any) {
      // Table might not exist yet - that's OK
      log("api:notifications", "table may not exist yet", { error: error.message });
      messages = [];
    }

    return NextResponse.json({
      notifications: messages,
      count: messages.length,
    });
  } catch (error: any) {
    log("api:notifications", "error", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================
// POST - Mark notifications as read
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { notification_ids } = body;

    if (!notification_ids || !Array.isArray(notification_ids)) {
      return NextResponse.json({ error: "notification_ids array required" }, { status: 400 });
    }

    await markNotificationsRead(notification_ids);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    log("api:notifications", "error marking read", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
