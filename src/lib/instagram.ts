import { config } from "./config";
import { log } from "./logger";

const base = () => `https://graph.instagram.com`;
const oauthBase = () => `https://api.instagram.com`;

export async function exchangeCodeForToken(code: string) {
  log("ig:oauth", "exchangeCodeForToken start");

  const u = new URL(oauthBase() + "/oauth/access_token");

  const body = new URLSearchParams({
    client_id: config.meta.appId,
    client_secret: config.meta.appSecret,
    grant_type: "authorization_code",
    redirect_uri: config.meta.redirectUri,
    code
  });

  const res = await fetch(u.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await res.json();

  if (!res.ok) {
    log("ig:oauth", "exchangeCodeForToken failed", data);
    throw new Error(JSON.stringify(data));
  }

  log("ig:oauth", "exchangeCodeForToken success", {
    user_id: data.user_id
  });

  return data as { access_token: string; user_id: string };
}

export async function getLongLivedToken(shortToken: string) {
  log("ig:oauth", "getLongLivedToken start");

  const u = new URL(base() + "/access_token");
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", config.meta.appSecret);
  u.searchParams.set("access_token", shortToken);

  const res = await fetch(u.toString());
  const data = await res.json();

  if (!res.ok) {
    log("ig:oauth", "getLongLivedToken failed", data);
    throw new Error(JSON.stringify(data));
  }

  log("ig:oauth", "getLongLivedToken success", {
    expires_in: data.expires_in
  });

  return data as { access_token: string; expires_in: number };
}

export async function graphGET(
  path: string,
  accessToken: string,
  params: Record<string, string> = {}
) {
  const u = new URL(base() + path);
  u.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

  log("ig:graph", "GET request", { path, params });

  const res = await fetch(u.toString());
  const data = await res.json();

  if (!res.ok) {
    log("ig:graph", "GET failed", data);
    throw new Error(JSON.stringify(data));
  }

  log("ig:graph", "GET success", { path });
  return data;
}

export async function graphPOST(
  path: string,
  accessToken: string,
  body: Record<string, any>
) {
  const u = new URL(base() + path);
  u.searchParams.set("access_token", accessToken);

  log("ig:graph", "POST request", { path, body });

  const res = await fetch(u.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!res.ok) {
    log("ig:graph", "POST failed", data);
    throw new Error(JSON.stringify(data));
  }

  log("ig:graph", "POST success", { path });
  return data;
}

export async function discoverInstagramAccount(accessToken: string) {
  log("ig:account", "discoverInstagramAccount start");

  const pages = await graphGET("/me/accounts", accessToken, {
    fields: "id,name,instagram_business_account"
  });

  const page = pages?.data?.[0];
  if (!page) {
    log("ig:account", "no pages found");
    return null;
  }

  if (page.instagram_business_account?.id) {
    log("ig:account", "found ig account", {
      ig_user_id: page.instagram_business_account.id
    });
    return {
      fb_page_id: page.id,
      ig_user_id: page.instagram_business_account.id
    };
  }

  log("ig:account", "no ig account on page");
  return { fb_page_id: page.id, ig_user_id: null };
}

export async function getInstagramUser(accessToken: string) {
  log("ig:user", "getInstagramUser");
  return graphGET("/me", accessToken, {
    fields: "id,username,account_type"
  });
}

export async function createMediaContainer(
  igUserId: string,
  accessToken: string,
  opts: any
) {
  log("ig:publish", "createMediaContainer", { igUserId });
  return graphPOST(`/${igUserId}/media`, accessToken, opts);
}

export async function publishMedia(
  igUserId: string,
  accessToken: string,
  creation_id: string
) {
  log("ig:publish", "publishMedia", { igUserId, creation_id });
  return graphPOST(`/${igUserId}/media_publish`, accessToken, {
    creation_id
  });
}

export async function getMediaInsights(
  igMediaId: string,
  accessToken: string,
  metricsCsv: string
) {
  log("ig:metrics", "getMediaInsights", { igMediaId });
  return graphGET(`/${igMediaId}/insights`, accessToken, {
    metric: metricsCsv
  });
}
