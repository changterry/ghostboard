import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { describeGoogleOAuthError, loadLocalEnv } from "./oauth-env.mjs";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

loadLocalEnv();

const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:5173/oauth2callback";
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.");
  console.error("Copy .env.local.example to .env.local and fill in your real local-only values, or export them in this shell.");
  console.error("Shell env vars override .env.local values.");
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
console.log("The Gmail readonly scope is the only requested Gmail scope.");
console.log("A GOOGLE_REFRESH_TOKEN that starts with 1// is normal.");
console.log("If the browser says the page cannot be reached after approval, copy the code= value from the address bar.");

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
  const details = describeGoogleOAuthError(data);
  console.error(`Token exchange failed: ${details.googleError}`);
  if (details.googleErrorDescription) console.error(details.googleErrorDescription);
  console.error(`Likely cause: ${details.likelyCause}`);
  process.exit(1);
}

if (!data.refresh_token) {
  console.error("No refresh_token returned.");
  console.error("Revoke this app in Google Account permissions, rerun this helper, confirm prompt=consent is present, and make sure the OAuth consent app includes this Gmail account as a test user if it is in Testing mode.");
  process.exit(1);
}

console.log("\nAdd this to Vercel server-side environment variables:");
console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`);
console.log("\nA refresh token starting with 1// is normal.");
console.log("Keep it secret. Do not paste it into frontend code or commit it.");
