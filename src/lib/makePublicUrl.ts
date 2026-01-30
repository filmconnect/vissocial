import { config } from "./config";

export function makePublicUrl(url: string) {
  const localBase = process.env.S3_PUBLIC_BASE!;
  const appUrl = process.env.APP_URL!;

  // http://localhost:9000/vissocial/...
  // -> https://aerologic-xxx.ngrok.dev/vissocial/...
  if (url.startsWith(localBase)) {
    return url.replace(localBase, `${appUrl}/vissocial`);
  }

  return url;
}
