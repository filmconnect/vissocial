// ============================================================
// API: /api/instagram/callback
// ============================================================
// OAuth callback - nakon autentifikacije redirect na /chat
// TAKOĐER: Ažurira postojeću chat sesiju da nastavi onboarding
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { exchangeCodeForToken, getLongLivedToken, getInstagramUser } from "@/lib/instagram";
import { qIngest } from "@/lib/jobs";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { v4 as uuid } from "uuid";

const PROJECT_ID = "proj_local";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "missing code" }, { status: 400 });
  }

  try {
    log("instagram:callback", "starting OAuth exchange");

    const shortTok = await exchangeCodeForToken(code);
    const longTok = await getLongLivedToken(shortTok.access_token);

    const expiresAt = new Date(Date.now() + longTok.expires_in * 1000);
    await q(
      `UPDATE projects SET ig_connected=true, meta_access_token=$1, meta_token_expires_at=$2, updated_at=now() WHERE id=$3`,
      [longTok.access_token, expiresAt.toISOString(), PROJECT_ID]
    );

    const igUser = await getInstagramUser(longTok.access_token);

    await q(
      `UPDATE projects SET ig_user_id=$1 WHERE id=$2`,
      [igUser.id, PROJECT_ID]
    );

    log("instagram:callback", "OAuth complete, queueing ingest", {
      ig_user_id: igUser.id
    });

    // Queue ingest from IG
    await qIngest.add("instagram.ingest", { project_id: PROJECT_ID });

    // IMPORTANT: Update existing chat session to continue onboarding
    // Find the most recent session and update its state
    const sessions = await q<any>(
      `SELECT id, state FROM chat_sessions 
       WHERE project_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [PROJECT_ID]
    );

    if (sessions.length > 0) {
      const session = sessions[0];
      const currentState = session.state || {};
      
      // Update state to onboarding step
      await q(
        `UPDATE chat_sessions SET state = $1 WHERE id = $2`,
        [JSON.stringify({ 
          ...currentState, 
          step: "onboarding",
          ig_just_connected: true  // Flag to show welcome message
        }), session.id]
      );

      log("instagram:callback", "session state updated", {
        session_id: session.id,
        new_step: "onboarding"
      });
    }

    // REDIRECT TO /chat WITH ig=connected PARAMETER
    const redirectUrl = `${config.appUrl.replace(/\/$/, "")}/chat?ig=connected`;
    
    log("instagram:callback", "redirecting to chat", { redirectUrl });

    return NextResponse.redirect(redirectUrl);

  } catch (error: any) {
    log("instagram:callback", "error", { error: error.message });
    return NextResponse.redirect(
      `${config.appUrl.replace(/\/$/, "")}/chat?ig=error`
    );
  }
}
