const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const IGNORE_SENDERS = ["handshake", "project xyz"];
const USER_EMAILS = ["changg.terry@gmail.com", "tchang@umass.edu"];

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const required = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    response.status(501).json({ error: "Gmail integration not configured", todos: [] });
    return;
  }

  try {
    const accessToken = await getAccessToken();
    const messages = await fetchCandidateMessages(accessToken);
    const todos = normalizeMessages(messages);
    response.status(200).json({ todos });
  } catch {
    response.status(500).json({ error: "Could not load scheduled inbox todos", todos: [] });
  }
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const tokenResponse = await fetch(GMAIL_TOKEN_URL, { method: "POST", body });
  if (!tokenResponse.ok) throw new Error("Token refresh failed");
  const data = await tokenResponse.json();
  if (!data.access_token) throw new Error("Missing access token");
  return data.access_token;
}

async function fetchCandidateMessages(accessToken) {
  const query = [
    "newer_than:30d",
    "-category:promotions",
    "-category:social",
    "-from:handshake",
    "-subject:handshake",
    "-subject:\"Project XYZ\"",
    "(in:inbox OR in:sent)",
  ].join(" ");
  const listUrl = `${GMAIL_API_BASE}/messages?maxResults=20&q=${encodeURIComponent(query)}`;
  const list = await gmailFetch(listUrl, accessToken);
  const messages = list.messages ?? [];
  const fullMessages = await Promise.all(messages.map((message) =>
    gmailFetch(`${GMAIL_API_BASE}/messages/${message.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, accessToken),
  ));
  return fullMessages;
}

async function gmailFetch(url, accessToken) {
  const result = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!result.ok) throw new Error("Gmail request failed");
  return result.json();
}

function normalizeMessages(messages) {
  return messages
    .map(toInboxTodo)
    .filter(Boolean)
    .slice(0, 12);
}

function toInboxTodo(message) {
  const headers = Object.fromEntries((message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
  const from = headers.from ?? "";
  const to = headers.to ?? "";
  const subject = headers.subject ?? "(no subject)";
  const date = headers.date ? new Date(headers.date) : new Date();
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  if (IGNORE_SENDERS.some((blocked) => fromLower.includes(blocked) || subjectLower.includes(blocked))) return null;
  if (subjectLower.includes("project xyz")) return null;

  const sentByUser = USER_EMAILS.some((email) => fromLower.includes(email));
  const contactName = extractContactName(sentByUser ? to : from);
  const type = sentByUser ? "follow_up" : inferType(subjectLower, fromLower);
  const dueDate = dueDateFromText(`${subject} ${message.snippet ?? ""}`) ?? (sentByUser ? "Follow up" : "Today");

  return {
    id: `gmail-${message.threadId || message.id}-${type}`,
    type,
    title: sentByUser ? `Follow up with ${contactName || "contact"}` : titleForType(type, contactName),
    contactName,
    contactEmail: extractEmail(sentByUser ? to : from),
    subject,
    emailThreadId: message.threadId,
    emailMessageId: message.id,
    gmailUrl: message.threadId ? `https://mail.google.com/mail/u/0/#inbox/${message.threadId}` : undefined,
    dueDate,
    urgency: dueDate && /today|tonight/i.test(dueDate) ? "high" : "medium",
    reason: sentByUser ? "Sent email may need a follow-up." : "Email appears to need a reply or action.",
    suggestedAction: sentByUser ? "Send a short follow-up and ask about next steps." : "Reply concisely and clarify the next step.",
    source: "gmail",
    status: "open",
    createdAt: date.toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function inferType(subject, from) {
  if (/prof|edu|university|college/.test(from) || /reu|lab|professor/.test(subject)) return "professor";
  if (/recruit|intern|interview/.test(subject)) return "recruiter";
  if (/calendar|resched|time change|deadline/.test(subject)) return "calendar_change";
  return "reply";
}

function titleForType(type, contactName) {
  if (type === "professor") return `Reply to ${contactName || "professor"}`;
  if (type === "recruiter") return `Reply to ${contactName || "recruiter"}`;
  return `Reply to ${contactName || "contact"}`;
}

function dueDateFromText(text) {
  const match = text.match(/\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}:\d{2}\s?(?:am|pm)?|\d{1,2}\s?(?:am|pm))\b/i);
  return match?.[0];
}

function extractContactName(value) {
  const clean = value.replace(/<.*?>/g, "").replace(/"/g, "").trim();
  return clean.split(",")[0] || undefined;
}

function extractEmail(value) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}
