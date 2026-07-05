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
  /\bdeadline\b/i,
  /\bdue by\b/i,
  /\bneeded by\b/i,
  /\bby (tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
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
  /\blet me know\b/i,
  /\bwhat do you think\b/i,
  /\bdoes that work\b/i,
  /\bwould you be able\b/i,
  /\bcould you\b/i,
  /\bcan you\b/i,
  /\bnext steps?\b/i,
  /\bfollow(?:ing)? up\b/i,
  /\bchecking in\b/i,
  /\bavailable\b/i,
  /\bavailability\b/i,
  /\binterested\b/i,
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
  /\bsee you then\b/i,
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
  const replySignal = REPLY_PATTERNS.some((pattern) => pattern.test(text));
  const promotion = PROMOTION_PATTERNS.some((pattern) => pattern.test(text));
  const social = SOCIAL_PATTERNS.some((pattern) => pattern.test(text));
  const eventOnly = EVENT_NO_ACTION_PATTERNS.some((pattern) => pattern.test(text));
  const freke = /\bfreke\b/i.test(text);
  const ride = /\b(ride|reu)\b/i.test(text);

  if (sentByUser) {
    return classifySentFollowUp({ message, userEmails, threadMessages, now });
  }

  if (CLOSED_PATTERNS.some((pattern) => pattern.test(text)) && !explicitAction && !explicitRsvp && !replySignal) {
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
  } else if (explicitAction || DIRECT_ACTION_VERBS.test(text)) {
    bucket = INBOX_BUCKETS.ACTION_REQUIRED;
    confidence = explicitAction ? 0.84 : 0.73;
    reasons.push(explicitAction ? "explicit_action" : "action_verb");
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
  const headers = headerMap(message);
  const text = `${headers.to ?? ""} ${headers.cc ?? ""} ${headers.subject ?? ""} ${message.snippet ?? ""}`;
  const ageDays = (now.getTime() - messageDate(message).getTime()) / 86400000;
  const recipients = recipientCount(`${headers.to ?? ""},${headers.cc ?? ""}`);
  const laterNonUserReply = hasNonUserReplyAfterMessage(threadMessages, message, userEmails);
  const reasons = ["sent_message"];

  if (laterNonUserReply) {
    return { bucket: INBOX_BUCKETS.THREAD_CLOSED, confidence: 0.9, reasons: [...reasons, "later_reply"], isTodo: false };
  }
  if (ageDays < 7) {
    return { bucket: INBOX_BUCKETS.LOW_CONFIDENCE_IGNORE, confidence: 0.88, reasons: [...reasons, "too_recent"], isTodo: false };
  }
  if (recipients > 5 || CLOSED_PATTERNS.some((pattern) => pattern.test(text)) || PROMOTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return { bucket: INBOX_BUCKETS.THREAD_CLOSED, confidence: 0.82, reasons: [...reasons, "closed_or_bulk_sent"], isTodo: false };
  }
  if (OPEN_LOOP_PATTERNS.some((pattern) => pattern.test(text))) {
    return { bucket: INBOX_BUCKETS.FOLLOW_UP_REQUIRED, confidence: 0.82, reasons: [...reasons, "open_loop"], isTodo: true };
  }
  if (WEAK_OPEN_LOOP_PATTERNS.some((pattern) => pattern.test(text))) {
    return { bucket: INBOX_BUCKETS.WAITING_ON_REPLY, confidence: 0.74, reasons: [...reasons, "weak_open_loop"], isTodo: true };
  }
  return { bucket: INBOX_BUCKETS.LOW_CONFIDENCE_IGNORE, confidence: 0.56, reasons: [...reasons, "no_open_loop"], isTodo: false };
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

function clampConfidence(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
