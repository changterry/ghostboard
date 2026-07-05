import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INBOX_BUCKETS, classifyMessage } from "./classifier.js";

const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const LEGACY_REQUIRED_ENV = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "SCHEDULED_INBOX_USER_EMAILS"];
const MAX_GMAIL_ACCOUNTS = 4;

loadLocalEnvForDev();

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (isDebugRequest(request)) {
    response.status(200).json(buildDebugDiagnostics(process.env));
    return;
  }

  const accounts = getConfiguredAccounts();
  if (!accounts.length) {
    response.status(501).json({ error: "Gmail integration not configured", todos: [] });
    return;
  }

  try {
    if (isPreviewRequest(request)) {
      response.status(200).json(await fetchEmailPreviewForRequest(request, accounts));
      return;
    }
    const accountResults = await Promise.all(accounts.map(fetchTodosForAccount));
    const todos = accountResults
      .flatMap((result) => result.todos)
      .sort((a, b) => urgencyRank(b.urgency) - urgencyRank(a.urgency) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
    response.status(200).json({ accounts: accounts.map(publicAccount), todos });
  } catch (error) {
    const code = error instanceof GreyboardInboxError ? error.code : "scheduled_inbox_failed";
    console.error("Scheduled inbox failed", { code });
    if (error instanceof GoogleOAuthError) {
      response.status(500).json({
        error: "Gmail auth failed",
        googleError: error.googleError,
        googleErrorDescription: error.googleErrorDescription,
        code,
        todos: [],
      });
      return;
    }
    response.status(500).json({ error: "Could not load scheduled inbox todos", code, todos: [] });
  }
}

class GreyboardInboxError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

class GoogleOAuthError extends GreyboardInboxError {
  constructor(data) {
    super("google_token_refresh_failed");
    this.googleError = typeof data?.error === "string" ? data.error : "unknown_error";
    this.googleErrorDescription = typeof data?.error_description === "string" ? data.error_description : undefined;
  }
}

async function fetchTodosForAccount(account) {
  const accessToken = await getAccessToken(account);
  const [incomingMessages, sentMessages] = await Promise.all([
    fetchCandidateMessages(accessToken, incomingQuery()),
    fetchSentFollowUpMessages(accessToken, account.userEmails, true),
  ]);
  return { account, todos: normalizeMessages([...incomingMessages, ...sentMessages], account.userEmails, publicAccount(account)) };
}

async function getAccessToken(account) {
  const body = new URLSearchParams({
    client_id: account.clientId,
    client_secret: account.clientSecret,
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
  });
  const tokenResponse = await fetch(GMAIL_TOKEN_URL, { method: "POST", body });
  const data = await tokenResponse.json();
  if (!tokenResponse.ok) throw new GoogleOAuthError(data);
  if (!data.access_token) throw new GreyboardInboxError("google_access_token_missing");
  return data.access_token;
}

function isDebugRequest(request) {
  const host = request.headers?.host || "localhost";
  const url = new URL(request.url || "/", `https://${host}`);
  return url.searchParams.get("debug") === "1";
}

function isPreviewRequest(request) {
  const host = request.headers?.host || "localhost";
  const url = new URL(request.url || "/", `https://${host}`);
  return url.searchParams.get("preview") === "1";
}

function buildDebugDiagnostics(env = process.env) {
  const accounts = getConfiguredAccounts(env);
  const refreshToken = env.GOOGLE_REFRESH_TOKEN || accounts[0]?.refreshToken || "";
  const configuredUserEmails = accounts.flatMap((account) => account.userEmails);
  const missingEnv = accounts.length ? [] : LEGACY_REQUIRED_ENV.filter((key) => !env[key]);
  const diagnostics = {
    ok: missingEnv.length === 0,
    environment: env.VERCEL_ENV || env.NODE_ENV || "local",
    configured: {
      GOOGLE_CLIENT_ID: Boolean(env.GOOGLE_CLIENT_ID),
      GOOGLE_CLIENT_SECRET: Boolean(env.GOOGLE_CLIENT_SECRET),
      GOOGLE_REFRESH_TOKEN: Boolean(env.GOOGLE_REFRESH_TOKEN) || accounts.some((account) => Boolean(account.refreshToken)),
      SCHEDULED_INBOX_USER_EMAILS: Boolean(env.SCHEDULED_INBOX_USER_EMAILS) || configuredUserEmails.length > 0,
      OPENAI_API_KEY: Boolean(env.OPENAI_API_KEY),
    },
    tokenShape: {
      startsWith1SlashSlash: refreshToken.startsWith("1//"),
      length: refreshToken.length,
      hasWhitespace: /\s/.test(refreshToken),
      hasQuotes: refreshToken.includes("\"") || refreshToken.includes("'"),
    },
    identityShape: {
      hasConfiguredUserEmails: configuredUserEmails.length > 0,
      configuredUserEmailsCount: configuredUserEmails.length,
      configuredAccountsCount: accounts.length,
    },
    message: "Debug mode only shows env presence and token shape. It never returns secret values.",
  };
  if (missingEnv.length) diagnostics.missingEnv = missingEnv;
  return diagnostics;
}

function incomingQuery() {
  return [
    "newer_than:30d",
    "in:inbox",
    "-category:promotions",
    "-category:social",
    "-from:handshake",
    "-subject:handshake",
    "-subject:\"Project XYZ\"",
  ].join(" ");
}

function sentFollowUpQuery() {
  return [
    "newer_than:90d",
    "older_than:7d",
    "in:sent",
    "-to:handshake",
    "-subject:handshake",
    "-subject:\"Project XYZ\"",
  ].join(" ");
}

async function fetchCandidateMessages(accessToken, query) {
  const listUrl = `${GMAIL_API_BASE}/messages?maxResults=25&q=${encodeURIComponent(query)}`;
  const list = await gmailFetch(listUrl, accessToken);
  const messages = list.messages ?? [];
  return Promise.all(messages.map((message) =>
    gmailFetch(`${GMAIL_API_BASE}/messages/${message.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`, accessToken),
  ));
}

async function fetchSentFollowUpMessages(accessToken, userEmails, includeThreadMessages = false) {
  const sentMessages = await fetchCandidateMessages(accessToken, sentFollowUpQuery());
  const checks = await Promise.all(sentMessages.map(async (message) => {
    const thread = await gmailFetch(`${GMAIL_API_BASE}/threads/${message.threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Date`, accessToken);
    if (hasNonUserReplyAfterMessage(thread.messages ?? [], message, userEmails)) return null;
    return includeThreadMessages ? { ...message, threadMessages: thread.messages ?? [] } : message;
  }));
  return checks.filter(Boolean);
}

async function gmailFetch(url, accessToken) {
  const result = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!result.ok) throw new GreyboardInboxError(`gmail_api_${result.status}`);
  return result.json();
}

function normalizeMessages(messages, userEmails, account) {
  const seen = new Set();
  const todos = [];
  for (const message of messages) {
    const todo = toInboxTodo(message, userEmails, account);
    if (!todo || seen.has(todo.id)) continue;
    seen.add(todo.id);
    todos.push(todo);
  }
  return todos
    .sort((a, b) => urgencyRank(b.urgency) - urgencyRank(a.urgency) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12);
}

function toInboxTodo(message, userEmails, account) {
  const headers = headerMap(message);
  const from = headers.from ?? "";
  const to = headers.to ?? "";
  const cc = headers.cc ?? "";
  const subject = headers.subject ?? "(no subject)";
  const snippet = message.snippet ?? "";
  const date = headers.date ? new Date(headers.date) : new Date();
  const haystack = `${from} ${to} ${cc} ${subject} ${snippet}`;
  const fromLower = from.toLowerCase();
  const sentByUser = userEmails.some((email) => fromLower.includes(email));
  const classification = classifyMessage({ message, userEmails, threadMessages: message.threadMessages ?? [] });

  if (!classification.isTodo) return null;

  const contactSource = sentByUser ? to : from;
  const contactName = extractContactName(contactSource);
  const dueDate = dueDateFromText(haystack) ?? (sentByUser ? "Follow up" : undefined);
  const type = sentByUser ? "follow_up" : typeForBucket(classification.bucket, haystack, from);
  const urgency = inferUrgency(haystack, dueDate, sentByUser);
  const reason = sentByUser
    ? "Sent email has not had a visible response after a week."
    : reasonForType(type, dueDate);

  return {
    id: stableTodoId(message, type),
    type,
    bucket: classification.bucket,
    confidence: classification.confidence,
    reasonCodes: classification.reasons,
    title: sentByUser ? `Follow up with ${contactName || "contact"}` : titleForType(type, contactName),
    contactName,
    contactEmail: extractEmail(contactSource),
    subject,
    emailThreadId: message.threadId,
    emailMessageId: message.id,
    gmailUrl: message.threadId ? `https://mail.google.com/mail/u/0/#inbox/${message.threadId}` : undefined,
    dueDate,
    urgency,
    reason,
    suggestedAction: sentByUser ? "Send a short follow-up and ask about next steps." : suggestedActionForType(type),
    suggestedDraft: suggestedDraftForTodo(type, contactName, subject, sentByUser),
    source: "gmail",
    accountId: account?.id,
    accountLabel: account?.label,
    accountEmail: account?.email,
    accountIcon: account?.icon,
    accountColor: account?.color,
    status: "open",
    createdAt: date.toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function hasNonUserReplyAfterMessage(threadMessages, sentMessage, userEmails) {
  const sentDate = messageDate(sentMessage);
  return threadMessages.some((message) => {
    if (message.id === sentMessage.id) return false;
    if (messageDate(message) <= sentDate) return false;
    const from = headerMap(message).from ?? "";
    return !isFromUser(from, userEmails);
  });
}

function headerMap(message) {
  return Object.fromEntries((message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
}

function messageDate(message) {
  const headers = headerMap(message);
  const date = headers.date ? new Date(headers.date) : new Date(Number(message.internalDate || 0));
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function isFromUser(from, userEmails) {
  const fromLower = from.toLowerCase();
  return userEmails.some((email) => fromLower.includes(email));
}

function typeForBucket(bucket, text, from) {
  if (bucket === INBOX_BUCKETS.FOLLOW_UP_REQUIRED || bucket === INBOX_BUCKETS.WAITING_ON_REPLY) return "follow_up";
  if (bucket === INBOX_BUCKETS.RSVP_REQUIRED) return "calendar_change";
  if (bucket === INBOX_BUCKETS.ACTION_REQUIRED && /send|transcript|document|resume|upload|submit|fill out|complete/i.test(text)) return "send";
  return inferType(text, from);
}

function inferType(text, from) {
  const lower = text.toLowerCase();
  if (/prof|professor|reu|lab|research|university|college/.test(`${lower} ${from.toLowerCase()}`) || /@(?:[^>\s,]+\.)?edu(?:[>\s,]|$)/i.test(from)) return "professor";
  if (/recruit|interview|intern|hiring/.test(lower)) return "recruiter";
  if (/calendar|resched|time change|deadline|meeting/.test(lower)) return "calendar_change";
  if (/send|transcript|document|resume/.test(lower)) return "send";
  return "reply";
}

async function fetchEmailPreviewForRequest(request, accounts) {
  const host = request.headers?.host || "localhost";
  const url = new URL(request.url || "/", `https://${host}`);
  const accountId = url.searchParams.get("accountId") || "";
  const messageId = url.searchParams.get("messageId") || "";
  if (!accountId || !messageId) throw new GreyboardInboxError("missing_preview_params");
  const account = accounts.find((item) => item.id === accountId);
  if (!account) throw new GreyboardInboxError("account_not_found");
  const accessToken = await getAccessToken(account);
  const message = await gmailFetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, accessToken);
  if (message.id !== messageId) throw new GreyboardInboxError("gmail_message_not_found");
  return emailPreviewFromMessage(message, publicAccount(account));
}

function emailPreviewFromMessage(message, account) {
  const headers = headerMap(message);
  const body = truncatePreview(plainTextFromPayload(message.payload) || message.snippet || "");
  return {
    id: message.id,
    threadId: message.threadId,
    accountId: account.id,
    from: headers.from,
    date: headers.date,
    subject: headers.subject,
    snippet: message.snippet,
    bodyText: body.text,
    bodyTruncated: body.truncated,
    gmailUrl: message.threadId ? `https://mail.google.com/mail/u/0/#inbox/${message.threadId}` : undefined,
  };
}

function plainTextFromPayload(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.mimeType === "text/html" && payload.body?.data) return stripHtmlForPreview(decodeBase64Url(payload.body.data));
  for (const part of payload.parts ?? []) {
    const nested = plainTextFromPayload(part);
    if (nested) return nested;
  }
  return "";
}

function decodeBase64Url(value = "") {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function stripHtmlForPreview(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncatePreview(text, maxLength = 8000) {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length <= maxLength) return { text: clean, truncated: false };
  return { text: `${clean.slice(0, maxLength).trim()}...`, truncated: true };
}

function inferUrgency(text, dueDate, sentByUser) {
  if (dueDate && /today|tonight|tomorrow/i.test(dueDate)) return "high";
  if (/(urgent|asap|deadline|today|tonight|tomorrow|interview)/i.test(text)) return "high";
  return sentByUser ? "medium" : "medium";
}

function reasonForType(type, dueDate) {
  if (type === "calendar_change") return "Meeting or deadline timing appears to need attention.";
  if (type === "professor") return "Professor, lab, or academic email appears to need a personal response.";
  if (type === "recruiter") return "Recruiter or internship email appears to expect a response.";
  if (type === "send") return "Email appears to require sending a document or follow-up item.";
  return dueDate ? "Email appears to need a personal response by the detected date." : "Email appears to need a personal response.";
}

function suggestedActionForType(type) {
  if (type === "calendar_change") return "Confirm the date or time and ask any needed follow-up question.";
  if (type === "professor") return "Reply concisely and clarify the next academic or lab step.";
  if (type === "recruiter") return "Reply with availability or a concise next-step question.";
  if (type === "send") return "Send the requested item and confirm receipt.";
  return "Reply concisely and clarify the next step.";
}

function suggestedDraftForTodo(type, contactName, subject, sentByUser) {
  const name = firstName(contactName) || "there";
  if (sentByUser) {
    return `Hi ${name}, wanted to follow up on ${subject || "my note"}. No rush, just wanted to keep this on your radar.`;
  }
  if (type === "calendar_change") {
    return `Hi ${name}, thanks for the update. I can make that work. Please let me know if there is anything else I should prepare.`;
  }
  if (type === "send") {
    return `Hi ${name}, thanks for the reminder. I will send this over shortly.`;
  }
  if (type === "recruiter") {
    return `Hi ${name}, thanks for reaching out. I would be happy to connect and can share availability for next steps.`;
  }
  return `Hi ${name}, thanks for reaching out. I will take a look and get back to you shortly.`;
}

function titleForType(type, contactName) {
  if (type === "professor") return `Reply to ${contactName || "professor"}`;
  if (type === "recruiter") return `Reply to ${contactName || "recruiter"}`;
  if (type === "calendar_change") return `Confirm with ${contactName || "contact"}`;
  if (type === "send") return `Send item to ${contactName || "contact"}`;
  return `Reply to ${contactName || "contact"}`;
}

function dueDateFromText(text) {
  const match = text.match(/\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}:\d{2}\s?(?:am|pm)?|\d{1,2}\s?(?:am|pm))\b/i);
  return match?.[0];
}

function stableTodoId(message, type) {
  return `gmail-${message.threadId || message.id}-${type}`;
}

function getConfiguredUserEmails() {
  return getConfiguredAccounts().flatMap((account) => account.userEmails);
}

function parseConfiguredUserEmails(value = "") {
  return value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getConfiguredAccounts(env = process.env) {
  const numbered = [];
  for (let index = 1; index <= MAX_GMAIL_ACCOUNTS; index += 1) {
    const prefix = `GMAIL_ACCOUNT_${index}`;
    const email = env[`${prefix}_EMAIL`]?.trim();
    const refreshToken = env[`${prefix}_REFRESH_TOKEN`]?.trim();
    const clientId = env[`${prefix}_CLIENT_ID`] || env.GOOGLE_CLIENT_ID;
    const clientSecret = env[`${prefix}_CLIENT_SECRET`] || env.GOOGLE_CLIENT_SECRET;
    if (!email && !refreshToken) continue;
    if (!email || !refreshToken || !clientId || !clientSecret) continue;
    const label = env[`${prefix}_LABEL`]?.trim() || labelFromEmail(email);
    numbered.push({
      id: slugify(`${label}-${email}`),
      label,
      email: email.toLowerCase(),
      userEmails: parseConfiguredUserEmails(email),
      clientId,
      clientSecret,
      refreshToken,
      icon: env[`${prefix}_ICON`]?.trim() || label.slice(0, 1).toUpperCase(),
      color: env[`${prefix}_COLOR`]?.trim() || defaultAccountColor(numbered.length),
    });
  }
  if (numbered.length) return numbered;

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) return [];
  const userEmails = parseConfiguredUserEmails(env.SCHEDULED_INBOX_USER_EMAILS);
  const email = userEmails[0] || "";
  const label = env.GMAIL_ACCOUNT_LABEL?.trim() || labelFromEmail(email) || "Gmail";
  return [{
    id: slugify(`${label}-${email || "default"}`),
    label,
    email,
    userEmails,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    refreshToken: env.GOOGLE_REFRESH_TOKEN,
    icon: env.GMAIL_ACCOUNT_ICON?.trim() || label.slice(0, 1).toUpperCase(),
    color: env.GMAIL_ACCOUNT_COLOR?.trim() || defaultAccountColor(0),
  }];
}

function publicAccount(account) {
  return {
    id: account.id,
    label: account.label,
    email: account.email,
    icon: account.icon,
    color: account.color,
  };
}

function labelFromEmail(email = "") {
  if (!email) return "";
  if (email.endsWith("@umass.edu")) return "UMass";
  if (email.includes("@gmail.com")) return "Gmail";
  return email.split("@")[0] || "Gmail";
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gmail";
}

function defaultAccountColor(index) {
  return ["#e8b7d0", "#5f6fcb", "#34a853", "#fbbc04"][index % 4];
}

function loadLocalEnvForDev() {
  if (process.env.VERCEL_ENV) return;
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex < 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (!/^[A-Z0-9_]+$/.test(key) || process.env[key]) continue;
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function urgencyRank(urgency) {
  return urgency === "high" ? 3 : urgency === "medium" ? 2 : 1;
}

function extractContactName(value) {
  const clean = value.replace(/<.*?>/g, "").replace(/"/g, "").trim();
  return clean.split(",")[0] || undefined;
}

function firstName(value) {
  return value?.split(/\s+/).find(Boolean)?.replace(/[,;]/g, "");
}

function extractEmail(value) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

export { GMAIL_READONLY_SCOPE, buildDebugDiagnostics, getConfiguredAccounts, normalizeMessages };
