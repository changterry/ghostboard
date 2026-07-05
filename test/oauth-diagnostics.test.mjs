import test from "node:test";
import assert from "node:assert/strict";

import { buildDebugDiagnostics, getConfiguredAccounts } from "../api/scheduled-inbox/todos.js";
import { parseDotEnv } from "../scripts/oauth-env.mjs";

test("debug diagnostics expose presence and token shape without secret values", () => {
  const env = {
    VERCEL_ENV: "production",
    GOOGLE_CLIENT_ID: "client-id-value",
    GOOGLE_CLIENT_SECRET: "client-secret-value",
    GOOGLE_REFRESH_TOKEN: "1//refresh-token-value",
    SCHEDULED_INBOX_USER_EMAILS: "terry@example.com",
  };

  const diagnostics = buildDebugDiagnostics(env);
  const serialized = JSON.stringify(diagnostics);

  assert.equal(diagnostics.environment, "production");
  assert.equal(diagnostics.configured.GOOGLE_CLIENT_ID, true);
  assert.equal(diagnostics.configured.GOOGLE_CLIENT_SECRET, true);
  assert.equal(diagnostics.configured.GOOGLE_REFRESH_TOKEN, true);
  assert.equal(diagnostics.configured.SCHEDULED_INBOX_USER_EMAILS, true);
  assert.equal(diagnostics.tokenShape.startsWith1SlashSlash, true);
  assert.equal(diagnostics.tokenShape.length, env.GOOGLE_REFRESH_TOKEN.length);
  assert.equal(diagnostics.tokenShape.hasWhitespace, false);
  assert.equal(diagnostics.tokenShape.hasQuotes, false);
  assert.equal(diagnostics.identityShape.hasConfiguredUserEmails, true);
  assert.equal(diagnostics.identityShape.configuredUserEmailsCount, 1);
  assert.ok(!serialized.includes(env.GOOGLE_CLIENT_SECRET));
  assert.ok(!serialized.includes(env.GOOGLE_REFRESH_TOKEN));
  assert.ok(!serialized.includes(env.SCHEDULED_INBOX_USER_EMAILS));
});

test("debug diagnostics list missing environment variables", () => {
  const diagnostics = buildDebugDiagnostics({ GOOGLE_CLIENT_ID: "client-id-value" });

  assert.deepEqual(diagnostics.missingEnv, [
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
    "SCHEDULED_INBOX_USER_EMAILS",
  ]);
});

test("numbered Gmail accounts are detected without exposing email addresses in debug", () => {
  const env = {
    GOOGLE_CLIENT_ID: "shared-client-id",
    GOOGLE_CLIENT_SECRET: "shared-client-secret",
    GMAIL_ACCOUNT_1_EMAIL: "tchang@umass.edu",
    GMAIL_ACCOUNT_1_LABEL: "UMass",
    GMAIL_ACCOUNT_1_REFRESH_TOKEN: "1//umass-token",
    GMAIL_ACCOUNT_1_ICON: "T",
    GMAIL_ACCOUNT_2_EMAIL: "changg.terry@gmail.com",
    GMAIL_ACCOUNT_2_LABEL: "Gmail",
    GMAIL_ACCOUNT_2_REFRESH_TOKEN: "1//gmail-token",
    GMAIL_ACCOUNT_2_ICON: "bird",
  };

  const accounts = getConfiguredAccounts(env);
  const diagnostics = buildDebugDiagnostics(env);
  const serialized = JSON.stringify(diagnostics);

  assert.equal(accounts.length, 2);
  assert.equal(accounts[0].email, "tchang@umass.edu");
  assert.equal(accounts[1].email, "changg.terry@gmail.com");
  assert.equal(diagnostics.identityShape.configuredAccountsCount, 2);
  assert.equal(diagnostics.identityShape.configuredUserEmailsCount, 2);
  assert.ok(!serialized.includes("tchang@umass.edu"));
  assert.ok(!serialized.includes("changg.terry@gmail.com"));
  assert.ok(!serialized.includes("1//umass-token"));
  assert.ok(!serialized.includes("1//gmail-token"));
});

test("dotenv parsing keeps 1// refresh tokens and strips wrapping quotes", () => {
  const parsed = parseDotEnv(`
GOOGLE_CLIENT_ID=abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET="secret value"
GOOGLE_REFRESH_TOKEN=1//...
SCHEDULED_INBOX_USER_EMAILS='terry@example.com,school@example.edu'
`);

  assert.equal(parsed.GOOGLE_CLIENT_ID, "abc.apps.googleusercontent.com");
  assert.equal(parsed.GOOGLE_CLIENT_SECRET, "secret value");
  assert.equal(parsed.GOOGLE_REFRESH_TOKEN, "1//...");
  assert.equal(parsed.SCHEDULED_INBOX_USER_EMAILS, "terry@example.com,school@example.edu");
});
