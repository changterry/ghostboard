export const INBOX_BUCKETS = {
  ACTION_REQUIRED: "ACTION_REQUIRED",
  REPLY_REQUIRED: "REPLY_REQUIRED",
  RSVP_REQUIRED: "RSVP_REQUIRED",
  FOLLOW_UP_REQUIRED: "FOLLOW_UP_REQUIRED",
  WAITING_ON_REPLY: "WAITING_ON_REPLY",
  FYI_ONLY: "FYI_ONLY",
  EVENT_NO_ACTION: "EVENT_NO_ACTION",
  PROMOTION_NOISE: "PROMOTION_NOISE",
  SOCIAL_NOISE: "SOCIAL_NOISE",
  PLATFORM_SYSTEM_NOISE: "PLATFORM_SYSTEM_NOISE",
  SELF_EMAIL_NO_ACTION: "SELF_EMAIL_NO_ACTION",
  BETTY_ANNAN_NO_ACTION: "BETTY_ANNAN_NO_ACTION",
  REU_RIDE_NO_ACTION: "REU_RIDE_NO_ACTION",
  THREAD_CLOSED: "THREAD_CLOSED",
  LOW_CONFIDENCE_IGNORE: "LOW_CONFIDENCE_IGNORE",
};

export const MIN_ACTION_CONFIDENCE = 0.72;

const TODO_BUCKETS = new Set([
  INBOX_BUCKETS.ACTION_REQUIRED,
  INBOX_BUCKETS.REPLY_REQUIRED,
  INBOX_BUCKETS.RSVP_REQUIRED,
  INBOX_BUCKETS.FOLLOW_UP_REQUIRED,
  INBOX_BUCKETS.WAITING_ON_REPLY,
]);

const EXPLICIT_ACTION_PATTERNS = [
  /\bplease\s+(reply|respond|send|complete|submit|upload|review|confirm|sign|fill out|bring|prepare|let me know|get back to me)\b/i,
  /\b(can|could|would)\s+you\s+(send|complete|submit|upload|review|confirm|sign|fill out|bring|prepare|let me know|get back to me)\b/i,
  /\baction required\b/i,
  /\bresponse required\b/i,
  /\brequired\b/i,
  /\bmandatory\b/i,
  /\bform\b/i,
  /\bdeadline\b/i,
  /\bdue by\b/i,
  /\bneeded by\b/i,
  /\brespond by\b/i,
  /\bsubmit by\b/i,
  /\bby (tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
];

const VENDOR_ACTION_PATTERNS = [
  /\baction required\b/i,
  /\bverify your account\b/i,
  /\bsecurity alert\b/i,
  /\bsuspicious sign-?in\b/i,
  /\bpassword reset requested\b/i,
  /\bpayment failed\b/i,
  /\bfailed payment\b/i,
  /\bbilling issue\b/i,
  /\binvoice overdue\b/i,
  /\baccount will be suspended\b/i,
  /\bcomplete setup\b/i,
  /\bconfirm recovery email\b/i,
  /\bdeadline\b/i,
  /\bexpires today\b/i,
  /\brequires your response\b/i,
  /\bdeployment failed\b/i,
];

const RSVP_PATTERNS = [
  /\brsvp\b/i,
  /\bconfirm (your )?(attendance|availability)\b/i,
  /\bregister\b/i,
  /\bsign up\b/i,
];

const REPLY_PATTERNS = [
  /\bplease (reply|respond|let me know|get back to me)\b/i,
  /\b(can|could|would) you\b/i,
  /\bare you available\b/i,
  /\bdoes that work\b/i,
  /\bwhat do you think\b/i,
  /\?/,
];

const OPEN_LOOP_PATTERNS = [
  /\bcould we\b/i,
  /\bcan we\b/i,
  /\blet me know\b/i,
  /\bwhat do you think\b/i,
  /\bdoes that work\b/i,
  /\bwould you be able\b/i,
  /\bwould it be possible\b/i,
  /\bcould you connect me\b/i,
  /\bcould you\b/i,
  /\bcan you\b/i,
  /\bnext steps?\b/i,
  /\bfollow(?:ing)? up\b/i,
  /\bchecking in\b/i,
  /\bavailable\b/i,
  /\bavailability\b/i,
  /\binterested\b/i,
  /\bopportunit(?:y|ies)\b/i,
  /\binternship\b/i,
  /\bco-?op\b/i,
  /\bresearch\b/i,
  /\blab\b/i,
  /\bresume\b/i,
  /\bwaiting on\b/i,
];

const WEAK_OPEN_LOOP_PATTERNS = [
  /\bwanted to see\b/i,
  /\bwanted to ask\b/i,
  /\bhope to hear\b/i,
  /\bkeep me posted\b/i,
];

const CLOSED_PATTERNS = [
  /\bthanks\b/i,
  /\bthank you\b/i,
  /\bsounds good\b/i,
  /\bgot it\b/i,
  /\bwill do\b/i,
  /\bsent\b/i,
  /\bsubmitted\b/i,
  /\bdone\b/i,
  /\bcompleted\b/i,
  /\bsee you then\b/i,
  /\bappreciate it\b/i,
  /\bno worries\b/i,
  /\bconfirmed\b/i,
  /\ball set\b/i,
  /\bno action needed\b/i,
  /\bresolved\b/i,
  /\bhandled\b/i,
];

const PROMOTION_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bnewsletter\b/i,
  /\bdigest\b/i,
  /\bpromotion\b/i,
  /\bdeal\b/i,
  /\bjob alert\b/i,
  /\binternship alert\b/i,
  /\bhandshake\b/i,
];

const SOCIAL_PATTERNS = [
  /\blinkedin jobs\b/i,
  /linkedin@e\.linkedin\.com/i,
  /\bcomplete your profile\b/i,
  /\bviewed your profile\b/i,
  /\bnew connection\b/i,
];

const EVENT_NO_ACTION_PATTERNS = [
  /\byou are invited\b/i,
  /\bjoin us\b/i,
  /\bcome to\b/i,
  /\bevent reminder\b/i,
  /\bfriendly reminder\b/i,
  /\btoday'?s session\b/i,
  /\bworkshop\b/i,
  /\bseminar\b/i,
  /\bspeaker series\b/i,
  /\blunch\b/i,
  /\bsocial\b/i,
  /\boptional\b/i,
  /\bfyi\b/i,
  /\bno action needed\b/i,
  /\bprofessional development event\b/i,
  /\bpd event\b/i,
  /\bcareer fair reminder\b/i,
];

const DIRECT_ACTION_VERBS = /\b(send|complete|submit|upload|review|confirm|sign|fill out|bring|prepare)\b/i;
const BETTY_ACTION_PATTERN = /\b(action required|required|mandatory|fill out|complete this form|submit|rsvp|confirm|deadline|due by|respond by|send me|please send)\b/i;
const REU_RIDE_PATTERN = /\b(ride|reu|research experience for undergraduates|professional development|pd|seminar|workshop|speaker|event|lunch|reminder|program announcement|cohort)\b/i;
const REU_RIDE_ACTION_PATTERN = /\b(rsvp|fill out|form|required|mandatory|confirm|submit|register|sign up|respond by|deadline|due|upload|complete)\b/i;
const PLATFORM_SYSTEM_DOMAINS = [
  "chatgpt.com",
  "openai.com",
  "google.com",
  "accounts.google.com",
  "workspace.google.com",
  "drive.google.com",
  "dropbox.com",
  "dropboxmail.com",
  "quizlet.com",
  "github.com",
  "vercel.com",
];
const PLATFORM_SYSTEM_NAMES = [
  "chatgpt",
  "openai",
  "google",
  "google workspace",
  "google account",
  "google drive",
  "dropbox",
  "quizlet",
  "github",
  "vercel",
];

export function classifyMessage({ message, userEmails = [], threadMessages = [], now = new Date() }) {
  const headers = headerMap(message);
  const from = headers.from ?? "";
  const to = headers.to ?? "";
  const cc = headers.cc ?? "";
  const subject = headers.subject ?? "";
  const snippet = message.snippet ?? "";
  const text = `${from} ${to} ${cc} ${subject} ${snippet}`;
  const fromLower = from.toLowerCase();
  const sentByUser = isFromUser(from, userEmails);
  const directRecipient = userEmails.some((email) => `${to},${cc}`.toLowerCase().includes(email));
  const recipients = recipientCount(`${to},${cc}`);
  const reasons = [];
  let bucket = INBOX_BUCKETS.LOW_CONFIDENCE_IGNORE;
  let confidence = 0.35;

  const explicitAction = EXPLICIT_ACTION_PATTERNS.some((pattern) => pattern.test(text));
  const explicitRsvp = RSVP_PATTERNS.some((pattern) => pattern.test(text));
  const vendorAction = VENDOR_ACTION_PATTERNS.some((pattern) => pattern.test(text));
  const replySignal = REPLY_PATTERNS.some((pattern) => pattern.test(text));
  const promotion = PROMOTION_PATTERNS.some((pattern) => pattern.test(text));
  const social = SOCIAL_PATTERNS.some((pattern) => pattern.test(text));
  const eventOnly = EVENT_NO_ACTION_PATTERNS.some((pattern) => pattern.test(text));
  const freke = /\bfreke\b/i.test(text);
  const ride = /\b(ride|reu)\b/i.test(text);
  const bettyAnnan = /\bbetty\s+annan\b/i.test(text);
  const platformNoise = isPlatformSystemNoise({ from, subject, snippet });
  const reuRideNoise = REU_RIDE_PATTERN.test(text);

  if (isSelfOnlyMessage({ message, threadMessages, userEmails })) {
    return { bucket: INBOX_BUCKETS.SELF_EMAIL_NO_ACTION, confidence: 0.96, reasons: ["self_email"], isTodo: false };
  }

  if (sentByUser) {
    return classifySentFollowUp({ message, userEmails, threadMessages, now });
  }

  const handledThread = classifyHandledIncomingThread({ message, userEmails, threadMessages });
  if (handledThread) return handledThread;

  if (platformNoise && !vendorAction) {
    bucket = INBOX_BUCKETS.PLATFORM_SYSTEM_NOISE;
    confidence = 0.95;
    reasons.push("platform_system_noise");
  } else if (bettyAnnan && !BETTY_ACTION_PATTERN.test(text)) {
    bucket = INBOX_BUCKETS.BETTY_ANNAN_NO_ACTION;
    confidence = 0.94;
    reasons.push("betty_annan_default_suppression");
  } else if (reuRideNoise && !REU_RIDE_ACTION_PATTERN.test(text)) {
    bucket = INBOX_BUCKETS.REU_RIDE_NO_ACTION;
    confidence = 0.92;
    reasons.push("reu_ride_default_suppression");
  } else if (CLOSED_PATTERNS.some((pattern) => pattern.test(text)) && !explicitAction && !explicitRsvp && !replySignal && !vendorAction) {
    bucket = INBOX_BUCKETS.THREAD_CLOSED;
    confidence = 0.9;
    reasons.push("closed_language");
  } else if (social && !explicitAction && !explicitRsvp && !replySignal) {
    bucket = INBOX_BUCKETS.SOCIAL_NOISE;
    confidence = 0.94;
    reasons.push("social_noise");
  } else if (promotion && !explicitAction && !explicitRsvp && !replySignal) {
    bucket = INBOX_BUCKETS.PROMOTION_NOISE;
    confidence = 0.9;
    reasons.push("promotion_noise");
  } else if ((eventOnly || (ride && recipients > 4)) && !explicitAction && !explicitRsvp) {
    bucket = INBOX_BUCKETS.EVENT_NO_ACTION;
    confidence = freke ? 0.82 : 0.9;
    reasons.push(ride ? "ride_event_no_action" : "event_no_action");
  } else if (explicitRsvp) {
    bucket = INBOX_BUCKETS.RSVP_REQUIRED;
    confidence = 0.82;
    reasons.push("rsvp_phrase");
  } else if (explicitAction || vendorAction || DIRECT_ACTION_VERBS.test(text)) {
    bucket = INBOX_BUCKETS.ACTION_REQUIRED;
    confidence = explicitAction || vendorAction ? 0.84 : 0.73;
    reasons.push(vendorAction ? "vendor_action" : explicitAction ? "explicit_action" : "action_verb");
  } else if (replySignal) {
    bucket = INBOX_BUCKETS.REPLY_REQUIRED;
    confidence = 0.76;
    reasons.push("reply_signal");
  } else {
    bucket = INBOX_BUCKETS.LOW_CONFIDENCE_IGNORE;
    confidence = 0.52;
    reasons.push("no_action_signal");
  }

  if (directRecipient) {
    confidence += 0.08;
    reasons.push("direct_recipient");
  }
  if (recipients > 8 && !explicitAction && !explicitRsvp) {
    confidence -= 0.18;
    reasons.push("many_recipients");
  }
  if (/@(?:[^>\s,]+\.)?edu(?:[>\s,]|$)/i.test(from) && TODO_BUCKETS.has(bucket)) {
    confidence += 0.04;
    reasons.push("edu_sender");
  }
  if (freke && TODO_BUCKETS.has(bucket)) {
    confidence += 0.08;
    reasons.push("freke_direct_signal");
  }
  if (bettyAnnan && TODO_BUCKETS.has(bucket)) {
    confidence -= 0.06;
    reasons.push("betty_annan_requires_high_confidence");
  }
  if (ride && recipients > 4 && TODO_BUCKETS.has(bucket) && !explicitAction && !explicitRsvp) {
    confidence -= 0.2;
    reasons.push("ride_bulk_suppression");
  }

  confidence = clampConfidence(confidence);
  if (TODO_BUCKETS.has(bucket) && confidence < MIN_ACTION_CONFIDENCE) {
    bucket = INBOX_BUCKETS.LOW_CONFIDENCE_IGNORE;
    reasons.push("below_threshold");
  }

  return {
    bucket,
    confidence,
    reasons,
    isTodo: TODO_BUCKETS.has(bucket) && confidence >= MIN_ACTION_CONFIDENCE,
  };
}

function classifySentFollowUp({ message, userEmails, threadMessages, now }) {
  if (isSelfOnlyMessage({ message, threadMessages, userEmails })) {
    return { bucket: INBOX_BUCKETS.SELF_EMAIL_NO_ACTION, confidence: 0.96, reasons: ["self_email"], isTodo: false };
  }
  if (isPlatformSystemNoise({ from: headerMap(message).from ?? "", subject: headerMap(message).subject ?? "", snippet: message.snippet ?? "" })) {
    return { bucket: INBOX_BUCKETS.PLATFORM_SYSTEM_NOISE, confidence: 0.94, reasons: ["platform_system_sent_noise"], isTodo: false };
  }
  const messages = threadMessages.length ? threadMessages : [message];
  const latestUserMessage = latestMessageMatching(messages, (candidate) => isFromUser(headerMap(candidate).from ?? "", userEmails));
  const latestUserAsk = latestMessageMatching(messages, (candidate) => {
    const candidateHeaders = headerMap(candidate);
    const candidateText = `${candidateHeaders.to ?? ""} ${candidateHeaders.cc ?? ""} ${candidateHeaders.subject ?? ""} ${candidate.snippet ?? ""}`;
    return isFromUser(candidateHeaders.from ?? "", userEmails) && hasOpenLoopSignal(candidateText) && !hasClosureSignal(candidateText);
  });
  const sentMessage = latestUserAsk ?? message;
  const sentHeaders = headerMap(sentMessage);
  const sentText = `${sentHeaders.to ?? ""} ${sentHeaders.cc ?? ""} ${sentHeaders.subject ?? ""} ${sentMessage.snippet ?? ""}`;
  const ageDays = (now.getTime() - messageDate(sentMessage).getTime()) / 86400000;
  const recipients = recipientCount(`${sentHeaders.to ?? ""},${sentHeaders.cc ?? ""}`);
  const laterNonUserReply = hasNonUserReplyAfterMessage(threadMessages, sentMessage, userEmails);
  const reasons = ["sent_message"];

  if (latestUserMessage && messageDate(latestUserMessage) > messageDate(sentMessage) && hasClosureSignal(messageText(latestUserMessage))) {
    return { bucket: INBOX_BUCKETS.THREAD_CLOSED, confidence: 0.9, reasons: [...reasons, "later_user_closure"], isTodo: false };
  }
  if (latestUserAsk && latestUserAsk.id !== message.id) {
    return { bucket: INBOX_BUCKETS.THREAD_CLOSED, confidence: 0.88, reasons: [...reasons, "newer_user_ask"], isTodo: false };
  }
  if (laterNonUserReply) {
    return { bucket: INBOX_BUCKETS.THREAD_CLOSED, confidence: 0.9, reasons: [...reasons, "later_reply"], isTodo: false };
  }
  if (ageDays < 5) {
    return { bucket: INBOX_BUCKETS.LOW_CONFIDENCE_IGNORE, confidence: 0.88, reasons: [...reasons, "too_recent"], isTodo: false };
  }
  if (recipients > 5 || hasClosureSignal(sentText) || PROMOTION_PATTERNS.some((pattern) => pattern.test(sentText))) {
    return { bucket: INBOX_BUCKETS.THREAD_CLOSED, confidence: 0.82, reasons: [...reasons, "closed_or_bulk_sent"], isTodo: false };
  }
  if (OPEN_LOOP_PATTERNS.some((pattern) => pattern.test(sentText))) {
    return { bucket: INBOX_BUCKETS.FOLLOW_UP_REQUIRED, confidence: 0.82, reasons: [...reasons, "open_loop"], isTodo: true };
  }
  if (WEAK_OPEN_LOOP_PATTERNS.some((pattern) => pattern.test(sentText))) {
    return { bucket: INBOX_BUCKETS.WAITING_ON_REPLY, confidence: 0.74, reasons: [...reasons, "weak_open_loop"], isTodo: true };
  }
  return { bucket: INBOX_BUCKETS.LOW_CONFIDENCE_IGNORE, confidence: 0.56, reasons: [...reasons, "no_open_loop"], isTodo: false };
}

function classifyHandledIncomingThread({ message, userEmails, threadMessages }) {
  if (!threadMessages.length) return null;
  const ordered = [...threadMessages].sort((a, b) => messageDate(a).getTime() - messageDate(b).getTime());
  const latestUserMessage = [...ordered].reverse().find((candidate) => isFromUser(headerMap(candidate).from ?? "", userEmails));
  if (!latestUserMessage) return null;

  const latestUserDate = messageDate(latestUserMessage);
  const latestUserText = messageText(latestUserMessage);
  if (hasClosureSignal(latestUserText) && isLatestThreadMessage(latestUserMessage, ordered)) {
    return { bucket: INBOX_BUCKETS.THREAD_CLOSED, confidence: 0.94, reasons: ["latest_user_closure"], isTodo: false };
  }

  const messageIsBeforeUserReply = messageDate(message) <= latestUserDate;
  const newerAskAfterUserReply = ordered.some((candidate) => {
    if (messageDate(candidate) <= latestUserDate) return false;
    if (isFromUser(headerMap(candidate).from ?? "", userEmails)) return false;
    return hasIncomingAskSignal(messageText(candidate));
  });

  if (messageIsBeforeUserReply && !newerAskAfterUserReply) {
    return { bucket: INBOX_BUCKETS.THREAD_CLOSED, confidence: 0.9, reasons: ["handled_by_later_user_reply"], isTodo: false };
  }
  if (messageIsBeforeUserReply && newerAskAfterUserReply) {
    return { bucket: INBOX_BUCKETS.THREAD_CLOSED, confidence: 0.86, reasons: ["older_ask_superseded"], isTodo: false };
  }
  return null;
}

function hasIncomingAskSignal(text) {
  return EXPLICIT_ACTION_PATTERNS.some((pattern) => pattern.test(text)) ||
    RSVP_PATTERNS.some((pattern) => pattern.test(text)) ||
    REPLY_PATTERNS.some((pattern) => pattern.test(text)) ||
    DIRECT_ACTION_VERBS.test(text);
}

function hasOpenLoopSignal(text) {
  return OPEN_LOOP_PATTERNS.some((pattern) => pattern.test(text)) ||
    WEAK_OPEN_LOOP_PATTERNS.some((pattern) => pattern.test(text));
}

function hasClosureSignal(text) {
  return CLOSED_PATTERNS.some((pattern) => pattern.test(text));
}

function isPlatformSystemNoise({ from = "", subject = "", snippet = "" }) {
  const fromLower = from.toLowerCase();
  const text = `${from} ${subject} ${snippet}`.toLowerCase();
  const senderEmail = extractEmail(fromLower);
  const senderDomain = senderEmail?.split("@")[1] ?? "";
  return PLATFORM_SYSTEM_DOMAINS.some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`)) ||
    PLATFORM_SYSTEM_NAMES.some((name) => text.includes(name));
}

function isSelfOnlyMessage({ message, threadMessages, userEmails }) {
  const ownEmails = new Set(userEmails.map((email) => email.toLowerCase()).filter(Boolean));
  if (!ownEmails.size) return false;
  const messages = threadMessages.length ? threadMessages : [message];
  const participantEmails = new Set(messages.flatMap((candidate) => {
    const headers = headerMap(candidate);
    return [headers.from, headers.to, headers.cc].flatMap((value) => extractEmails(value ?? ""));
  }));
  if (!participantEmails.size) return false;
  return [...participantEmails].every((email) => ownEmails.has(email));
}

function latestMessageMatching(messages, predicate) {
  return [...messages]
    .filter(predicate)
    .sort((a, b) => messageDate(b).getTime() - messageDate(a).getTime())[0];
}

function isLatestThreadMessage(message, orderedMessages) {
  return orderedMessages[orderedMessages.length - 1]?.id === message.id;
}

function messageText(message) {
  const headers = headerMap(message);
  return `${headers.from ?? ""} ${headers.to ?? ""} ${headers.cc ?? ""} ${headers.subject ?? ""} ${message.snippet ?? ""}`;
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

function recipientCount(value) {
  return value.split(",").map((part) => part.trim()).filter(Boolean).length;
}

function extractEmails(value) {
  return (value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((email) => email.toLowerCase());
}

function extractEmail(value) {
  return extractEmails(value)[0];
}

function clampConfidence(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
