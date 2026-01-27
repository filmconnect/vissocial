import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { exchangeCodeForToken, getLongLivedToken, discoverInstagramAccount, getInstagramUser  } from "@/lib/instagram";
import { qIngest } from "@/lib/jobs";
import { config } from "@/lib/config";

const PROJECT_ID="proj_local";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if(!code) return NextResponse.json({ error:"missing code" }, {status:400});

  const shortTok = await exchangeCodeForToken(code);
  const longTok = await getLongLivedToken(shortTok.access_token);

  const expiresAt = new Date(Date.now() + (longTok.expires_in*1000));
  await q(`UPDATE projects SET ig_connected=true, meta_access_token=$1, meta_token_expires_at=$2, updated_at=now() WHERE id=$3`,
    [longTok.access_token, expiresAt.toISOString(), PROJECT_ID]);

  // const acct = await discoverInstagramAccount(longTok.access_token);
  // if (acct) {
    // await q(`UPDATE projects SET fb_page_id=$1, ig_user_id=$2 WHERE id=$3`, [acct.fb_page_id, acct.ig_user_id, PROJECT_ID]);
  // }
  
  const igUser = await getInstagramUser(longTok.access_token);

	await q(
	  `UPDATE projects SET ig_user_id=$1 WHERE id=$2`,
	  [igUser.id, PROJECT_ID]
	);

  // enqueue ingest from IG (media + optional products detection later)
  await qIngest.add("instagram.ingest", { project_id: PROJECT_ID });

  //return NextResponse.redirect("/chat");
  // const origin = new URL(req.url).origin;

// return NextResponse.redirect(
  // new URL("/settings?ig=connected", origin)
// );
	return NextResponse.redirect(
  `${config.appUrl.replace(/\/$/, "")}/settings?ig=connected`
);
}
