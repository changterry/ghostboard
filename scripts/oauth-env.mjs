import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function parseDotEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex < 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function loadLocalEnv(filePath = resolve(process.cwd(), ".env.local")) {
  if (!existsSync(filePath)) return {};
  const parsed = parseDotEnv(readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) process.env[key] = value;
  }
  return parsed;
}

export function requiredEnv(keys) {
  return keys.filter((key) => !process.env[key]);
}

export function describeGoogleOAuthError(data) {
  const googleError = typeof data?.error === "string" ? data.error : "unknown_error";
  const googleErrorDescription = typeof data?.error_description === "string" ? data.error_description : undefined;
  const likelyCause = {
    invalid_grant: "Refresh token was revoked, malformed, copied incorrectly, expired, or generated for different client credentials.",
    invalid_client: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are wrong or do not belong to the same OAuth client.",
    unauthorized_client: "OAuth client or Google Cloud project is not configured for this flow.",
    access_denied: "The Gmail account or OAuth app permission was denied.",
  }[googleError] || "Check Google Cloud OAuth setup, Gmail API enablement, consent screen, and deployed environment variables.";

  return { googleError, googleErrorDescription, likelyCause };
}
