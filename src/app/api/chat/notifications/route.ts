// ============================================================
// /api/chat/notifications
// ============================================================
// GET: Fetch unread notifications for session
// POST: Mark notifications as read
// ============================================================

import { NextResponse } from "next/server";
import { getUnreadNotifications, markNotificationsRead } from "@/lib/notifications";
import { log } from "@/lib/logger";

// ============================================================
// GET - Fetch unread notifications
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
    const notifications = await getUnreadNotifications(session_id);

    return NextResponse.json({
      session_id,
      notifications,
      count: notifications.length
    });

  } catch (error: any) {
    log("api:chat:notifications", "get_error", {
      session_id,
      error: error.message
    });

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// POST - Mark notifications as read
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { session_id, mark_read } = body;

    if (!session_id) {
      return NextResponse.json(
        { error: "session_id required" },
        { status: 400 }
      );
    }

    if (mark_read && Array.isArray(mark_read) && mark_read.length > 0) {
      await markNotificationsRead(mark_read);
      
      log("api:chat:notifications", "marked_read", {
        session_id,
        count: mark_read.length
      });
    }

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    log("api:chat:notifications", "post_error", {
      error: error.message
    });

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
