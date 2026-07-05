import { describeGoogleOAuthError, loadLocalEnv, requiredEnv } from "./oauth-env.mjs";

const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const REQUIRED_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "SCHEDULED_INBOX_USER_EMAILS"];

loadLocalEnv();

const missing = requiredEnv(REQUIRED_KEYS);
if (missing.length) {
  console.error("Gmail OAuth check cannot run yet.");
  console.error(`Missing from .env.local or shell: ${missing.join(", ")}`);
  console.error("Create .env.local from .env.local.example and fill in real local-only values.");
  process.exit(1);
}

const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || "";
console.log("Checking Gmail OAuth with local environment values...");
console.log(`Refresh token shape: starts with 1// = ${refreshToken.startsWith("1//")}, length = ${refreshToken.length}`);
console.log("A refresh token starting with 1// is normal.");

const body = new URLSearchParams({
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  refresh_token: refreshToken,
  grant_type: "refresh_token",
});

const tokenResponse = await fetch(GMAIL_TOKEN_URL, { method: "POST", body });
const tokenData = await tokenResponse.json().catch(() => ({}));

if (!tokenResponse.ok || !tokenData.access_token) {
  const details = describeGoogleOAuthError(tokenData);
  console.error(`Gmail OAuth check failed: ${details.googleError}`);
  if (details.googleErrorDescription) console.error(details.googleErrorDescription);
  console.error(`Likely cause: ${details.likelyCause}`);
  process.exit(1);
}

const profileResponse = await fetch(GMAIL_PROFILE_URL, {
  headers: { Authorization: `Bearer ${tokenData.access_token}` },
});
const profileData = await profileResponse.json().catch(() => ({}));

if (!profileResponse.ok) {
  console.error(`Gmail OAuth check failed while loading profile: gmail_api_${profileResponse.status}`);
  if (profileData.error?.message) console.error(profileData.error.message);
  console.error("Likely cause: Gmail API is not enabled, the account lacks permission, or the token lacks Gmail readonly access.");
  process.exit(1);
}

console.log("Gmail OAuth check passed.");
console.log("Authenticated Gmail profile loaded.");
if (profileData.emailAddress) {
  const profileEmail = profileData.emailAddress.toLowerCase();
  const configuredEmails = process.env.SCHEDULED_INBOX_USER_EMAILS
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  console.log(`Profile email: ${profileData.emailAddress}`);
  console.log(`Configured user email match: ${configuredEmails.includes(profileEmail)}`);
  console.log("Greyboard reads only this profile mailbox.");
  if (!configuredEmails.includes(profileEmail)) {
    console.log("Add this profile email to SCHEDULED_INBOX_USER_EMAILS if Greyboard should treat sent mail from this account as yours.");
    console.log("If you expected a different mailbox, regenerate GOOGLE_REFRESH_TOKEN while signed into that Google account.");
  }
}
console.log("No secrets were printed.");
