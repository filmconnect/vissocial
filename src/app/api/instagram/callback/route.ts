import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { exchangeCodeForToken, getLongLivedToken, discoverInstagramAccount, getInstagramUser } from "@/lib/instagram";
import { qIngest } from "@/lib/jobs";
import { config } from "@/lib/config";

const PROJECT_ID = "proj_local";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  
  if (!code) {
    return NextResponse.json({ error: "missing code" }, { status: 400 });
  }

  try {
    const shortTok = await exchangeCodeForToken(code);
    const longTok = await getLongLivedToken(shortTok.access_token);

    const expiresAt = new Date(Date.now() + (longTok.expires_in * 1000));
    await q(
      `UPDATE projects SET ig_connected=true, meta_access_token=$1, meta_token_expires_at=$2, updated_at=now() WHERE id=$3`,
      [longTok.access_token, expiresAt.toISOString(), PROJECT_ID]
    );

    const igUser = await getInstagramUser(longTok.access_token);
    await q(
      `UPDATE projects SET ig_user_id=$1 WHERE id=$2`,
      [igUser.id, PROJECT_ID]
    );

    // Enqueue ingest from IG (media + products detection)
    await qIngest.add("instagram.ingest", { project_id: PROJECT_ID });

    // REDIRECT TO CHAT with success indicator
    // This will trigger the chat to show a success message
    return NextResponse.redirect(
      `${config.appUrl.replace(/\/$/, "")}/chat?ig=connected`
    );
  } catch (error: any) {
    console.error("Instagram OAuth error:", error);
    return NextResponse.redirect(
      `${config.appUrl.replace(/\/$/, "")}/settings?ig=error&message=${encodeURIComponent(error.message)}`
    );
  }
}
