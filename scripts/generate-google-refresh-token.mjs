import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:5173/oauth2callback";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in this shell first.");
  process.exit(1);
}

const authUrl = new URL(GOOGLE_AUTH_URL);
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", GMAIL_READONLY_SCOPE);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

console.log("\nOpen this URL, approve Gmail read-only access, then paste the returned code:\n");
console.log(authUrl.toString());
console.log("\nRedirect URI used:", REDIRECT_URI);

const rl = createInterface({ input, output });
const code = (await rl.question("\nAuthorization code: ")).trim();
rl.close();

const body = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  redirect_uri: REDIRECT_URI,
  grant_type: "authorization_code",
  code,
});

const response = await fetch(GOOGLE_TOKEN_URL, { method: "POST", body });
const data = await response.json();

if (!response.ok) {
  console.error("Token exchange failed:");
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

if (!data.refresh_token) {
  console.error("No refresh_token returned. Re-run with prompt=consent, or remove this app's prior Google consent and try again.");
  process.exit(1);
}

console.log("\nAdd this to Vercel server-side environment variables:");
console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`);
console.log("\nKeep it secret. Do not paste it into frontend code or commit it.");
