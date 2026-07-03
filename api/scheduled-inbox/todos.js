const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const PERSONAL_SIGNAL_WORDS = [
  "reply",
  "respond",
  "follow up",
  "following up",
  "checking in",
  "quick question",
  "could you",
  "can you",
  "would you",
  "let me know",
  "next step",
  "schedule",
  "reschedule",
  "meeting",
  "deadline",
  "interview",
  "application",
  "transcript",
  "internship",
  "research",
  "professor",
  "lab",
  "reu",
];

const IGNORE_PATTERNS = [
  /handshake/i,
  /project\s*xyz/i,
  /promotion/i,
  /unsubscribe/i,
  /newsletter/i,
  /no-?reply/i,
  /donotreply/i,
  /do-not-reply/i,
  /notification/i,
  /digest/i,
  /career fair/i,
  /job alert/i,
  /internship alert/i,
];

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
    const userEmails = getConfiguredUserEmails();
    const [incomingMessages, sentMessages] = await Promise.all([
      fetchCandidateMessages(accessToken, incomingQuery()),
      fetchSentFollowUpMessages(accessToken, userEmails),
    ]);
    const todos = normalizeMessages([...incomingMessages, ...sentMessages], userEmails);
    response.status(200).json({ todos });
  } catch (error) {
    const code = error instanceof GreyboardInboxError ? error.code : "scheduled_inbox_failed";
    console.error("Scheduled inbox failed", { code });
    response.status(500).json({ error: "Could not load scheduled inbox todos", code, todos: [] });
  }
}

class GreyboardInboxError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
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
  if (!tokenResponse.ok) throw new GreyboardInboxError("google_token_refresh_failed");
  const data = await tokenResponse.json();
  if (!data.access_token) throw new GreyboardInboxError("google_access_token_missing");
  return data.access_token;
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

async function fetchSentFollowUpMessages(accessToken, userEmails) {
  const sentMessages = await fetchCandidateMessages(accessToken, sentFollowUpQuery());
  const checks = await Promise.all(sentMessages.map(async (message) => {
    const thread = await gmailFetch(`${GMAIL_API_BASE}/threads/${message.threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Date`, accessToken);
    return hasNonUserReplyAfterMessage(thread.messages ?? [], message, userEmails) ? null : message;
  }));
  return checks.filter(Boolean);
}

async function gmailFetch(url, accessToken) {
  const result = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!result.ok) throw new GreyboardInboxError(`gmail_api_${result.status}`);
  return result.json();
}

function normalizeMessages(messages, userEmails) {
  const seen = new Set();
  const todos = [];
  for (const message of messages) {
    const todo = toInboxTodo(message, userEmails);
    if (!todo || seen.has(todo.id)) continue;
    seen.add(todo.id);
    todos.push(todo);
  }
  return todos
    .sort((a, b) => urgencyRank(b.urgency) - urgencyRank(a.urgency) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12);
}

function toInboxTodo(message, userEmails) {
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

  if (shouldIgnoreMessage(haystack, from, to, cc, sentByUser)) return null;
  if (!sentByUser && !looksActionWorthy(haystack, from, to, cc)) return null;

  const contactSource = sentByUser ? to : from;
  const contactName = extractContactName(contactSource);
  const dueDate = dueDateFromText(haystack) ?? (sentByUser ? "Follow up" : undefined);
  const type = sentByUser ? "follow_up" : inferType(haystack, from);
  const urgency = inferUrgency(haystack, dueDate, sentByUser);
  const reason = sentByUser
    ? "Sent email has not had a visible response after a week."
    : reasonForType(type, dueDate);

  return {
    id: stableTodoId(message, type),
    type,
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

function shouldIgnoreMessage(text, from, to, cc, sentByUser) {
  if (IGNORE_PATTERNS.some((pattern) => pattern.test(text))) return true;
  const fromLower = from.toLowerCase();
  const textLower = text.toLowerCase();
  if (fromLower.includes("ride") && recipientCount(`${to},${cc}`) > 4) return true;
  if (!sentByUser && recipientCount(`${to},${cc}`) > 8 && !/(meeting|deadline|resched|time change|interview|reply|respond)/i.test(textLower)) return true;
  return false;
}

function looksActionWorthy(text, from, to, cc) {
  const lower = text.toLowerCase();
  if (PERSONAL_SIGNAL_WORDS.some((word) => lower.includes(word))) return true;
  if (/@(edu|umass\.edu)>?/i.test(from)) return true;
  if (recipientCount(`${to},${cc}`) <= 3 && !/(newsletter|alert|promotion|webinar|event)/i.test(lower)) return true;
  return false;
}

function inferType(text, from) {
  const lower = text.toLowerCase();
  if (/prof|professor|reu|lab|research|\.edu|university|college/.test(`${lower} ${from.toLowerCase()}`)) return "professor";
  if (/recruit|interview|intern|hiring/.test(lower)) return "recruiter";
  if (/calendar|resched|time change|deadline|meeting/.test(lower)) return "calendar_change";
  if (/send|transcript|document|resume/.test(lower)) return "send";
  return "reply";
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
  return (process.env.SCHEDULED_INBOX_USER_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function recipientCount(value) {
  return value.split(",").map((part) => part.trim()).filter(Boolean).length;
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

export { GMAIL_READONLY_SCOPE };
