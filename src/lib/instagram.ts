import { config } from "./config";
import { log } from "./logger";

//const base = () => `https://graph.facebook.com/${config.meta.version}`;
//const base = () => `https://graph.instagram.com/${config.meta.version}`;
//const oauthBase = () => `https://api.instagram.com`;
const base = () =>
  `https://graph.instagram.com`;

const oauthBase = () =>
  `https://api.instagram.com`;

export async function exchangeCodeForToken(code: string) {
  const u = new URL(oauthBase() + '/oauth/access_token');

  const body = new URLSearchParams({
    client_id: config.meta.appId,
    client_secret: config.meta.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: config.meta.redirectUri,
    code,
  });

  const res = await fetch(u.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await res.json();

  if (!res.ok) {
    log.error('IG exchangeCodeForToken failed', data);
    throw new Error(JSON.stringify(data));
  }

  return data as {
    access_token: string;
    user_id: string;
  };
}




export async function getLongLivedToken(shortToken: string) {
  const u = new URL(base() + '/access_token');

  u.searchParams.set('grant_type', 'ig_exchange_token');
  u.searchParams.set('client_secret', config.meta.appSecret);
  u.searchParams.set('access_token', shortToken);

  const res = await fetch(u.toString());
  const data = await res.json();

  if (!res.ok) {
    log.error('IG getLongLivedToken failed', data);
    throw new Error(JSON.stringify(data));
  }

  return data as {
    access_token: string;
    expires_in: number;
  };
}




export async function graphGET(path: string, accessToken: string, params: Record<string,string> = {}) {
  const u = new URL(base()+path);
  u.searchParams.set("access_token", accessToken);
  for (const [k,v] of Object.entries(params)) u.searchParams.set(k,v);
  const res = await fetch(u.toString());
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function graphPOST(path: string, accessToken: string, body: Record<string, any>) {
  const u = new URL(base()+path);
  u.searchParams.set("access_token", accessToken);
  const res = await fetch(u.toString(), { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

// Discover IG professional account: pages -> page -> instagram_business_account
export async function discoverInstagramAccount(accessToken: string) {
  // list pages
  const pages = await graphGET("/me/accounts", accessToken, { fields: "id,name,instagram_business_account" });
  const page = pages?.data?.[0];
  if (!page) return null;
  if (page.instagram_business_account?.id) return { fb_page_id: page.id, ig_user_id: page.instagram_business_account.id };
  // sometimes need fetch page fields
  const pageFull = await graphGET(`/${page.id}`, accessToken, { fields: "instagram_business_account" });
  const ig = pageFull?.instagram_business_account?.id;
  if (!ig) return { fb_page_id: page.id, ig_user_id: null };
  return { fb_page_id: page.id, ig_user_id: ig };
}

export async function getInstagramUser(accessToken: string) {
  return graphGET("/me", accessToken, {
    fields: "id,username,account_type"
  });
}


// Publish: /{ig-user-id}/media then /{ig-user-id}/media_publish citeturn0search0
export async function createMediaContainer(igUserId: string, accessToken: string, opts: { image_url?: string; video_url?: string; caption?: string; media_type?: string; is_carousel_item?: boolean }) {
  return graphPOST(`/${igUserId}/media`, accessToken, opts);
}
export async function publishMedia(igUserId: string, accessToken: string, creation_id: string) {
  return graphPOST(`/${igUserId}/media_publish`, accessToken, { creation_id });
}

// Insights: GET /{ig-media-id}/insights citeturn0search2
export async function getMediaInsights(igMediaId: string, accessToken: string, metricsCsv: string) {
  return graphGET(`/${igMediaId}/insights`, accessToken, { metric: metricsCsv });
}

