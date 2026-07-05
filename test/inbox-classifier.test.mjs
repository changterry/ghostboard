import test from "node:test";
import assert from "node:assert/strict";

import { normalizeMessages } from "../api/scheduled-inbox/todos.js";
import { INBOX_BUCKETS, classifyMessage } from "../api/scheduled-inbox/classifier.js";

test("ignores generic LinkedIn Jobs profile prompts", () => {
  const messages = [{
    id: "linkedin-generic-message",
    threadId: "linkedin-generic-thread",
    snippet: "Complete your profile to get better job recommendations.",
    payload: {
      headers: [
        { name: "From", value: "LinkedIn Jobs <linkedin@e.linkedin.com>" },
        { name: "To", value: "Terry <terry@example.com>" },
        { name: "Subject", value: "Complete your profile" },
        { name: "Date", value: "Sat, 4 Jul 2026 10:00:00 +0000" },
      ],
    },
  }];

  assert.deepEqual(normalizeMessages(messages, ["terry@example.com"]), []);
});

test("keeps real academic edu senders", () => {
  const messages = [{
    id: "academic-message",
    threadId: "academic-thread",
    snippet: "Can you send the parts list before the meeting?",
    payload: {
      headers: [
        { name: "From", value: "UMass Amherst Makerspace <makerspace@umass.edu>" },
        { name: "To", value: "Terry <terry@example.com>" },
        { name: "Subject", value: "Re: Do you have these parts?" },
        { name: "Date", value: "Sat, 4 Jul 2026 11:00:00 +0000" },
      ],
    },
  }];

  const todos = normalizeMessages(messages, ["terry@example.com"]);

  assert.equal(todos.length, 1);
  assert.equal(todos[0].bucket, INBOX_BUCKETS.ACTION_REQUIRED);
  assert.equal(todos[0].title, "Send item to UMass Amherst Makerspace");
});

test("classifies direct questions as reply required", () => {
  const message = messageFixture({
    id: "direct-question",
    from: "Rachel <rachel@example.com>",
    to: "Terry <terry@example.com>",
    subject: "Portfolio contact",
    snippet: "Are you available Tuesday at 2?",
  });

  const classification = classifyMessage({ message, userEmails: ["terry@example.com"] });

  assert.equal(classification.bucket, INBOX_BUCKETS.REPLY_REQUIRED);
  assert.equal(classification.isTodo, true);
});

test("classifies RSVP ask over generic action", () => {
  const message = messageFixture({
    id: "rsvp",
    from: "Lab <lab@umass.edu>",
    to: "Terry <terry@example.com>",
    subject: "Dinner",
    snippet: "Please RSVP by Friday.",
  });

  const classification = classifyMessage({ message, userEmails: ["terry@example.com"] });

  assert.equal(classification.bucket, INBOX_BUCKETS.RSVP_REQUIRED);
  assert.equal(classification.isTodo, true);
});

test("suppresses RIDE bulk event but keeps RIDE direct action", () => {
  const bulkRide = messageFixture({
    id: "ride-bulk",
    from: "RIDE Program <ride@umass.edu>",
    to: "cohort@umass.edu, staff@umass.edu, interns@umass.edu, list1@umass.edu, list2@umass.edu, list3@umass.edu",
    subject: "RIDE seminar reminder",
    snippet: "Freke invites us to a RIDE seminar this afternoon.",
  });
  const directRide = messageFixture({
    id: "ride-action",
    from: "Freke <freke@umass.edu>",
    to: "Terry <terry@example.com>",
    subject: "RIDE RSVP",
    snippet: "Please fill out the RSVP form by Friday.",
  });

  assert.deepEqual(normalizeMessages([bulkRide], ["terry@example.com"]), []);
  const todos = normalizeMessages([directRide], ["terry@example.com"]);
  assert.equal(todos.length, 1);
  assert.equal(todos[0].bucket, INBOX_BUCKETS.RSVP_REQUIRED);
});

test("requires open-loop language before creating sent follow-up todo", () => {
  const oldSentOpenLoop = messageFixture({
    id: "sent-open-loop",
    from: "Terry <terry@example.com>",
    to: "Contact <contact@example.com>",
    subject: "Project",
    snippet: "Let me know if this works.",
    date: "Sat, 20 Jun 2026 10:00:00 +0000",
  });
  const oldSentClosed = messageFixture({
    id: "sent-closed",
    from: "Terry <terry@example.com>",
    to: "Contact <contact@example.com>",
    subject: "Project",
    snippet: "Thanks, see you then.",
    date: "Sat, 20 Jun 2026 10:00:00 +0000",
  });

  const openLoop = normalizeMessages([oldSentOpenLoop], ["terry@example.com"]);
  const closed = normalizeMessages([oldSentClosed], ["terry@example.com"]);

  assert.equal(openLoop.length, 1);
  assert.equal(openLoop[0].bucket, INBOX_BUCKETS.FOLLOW_UP_REQUIRED);
  assert.deepEqual(closed, []);
});

test("suppresses incoming ask after later user reply", () => {
  const incomingAsk = messageFixture({
    id: "incoming-ask",
    threadId: "handled-thread",
    from: "Rachel <rachel@example.com>",
    to: "Terry <terry@example.com>",
    subject: "Portfolio",
    snippet: "Can you send the portfolio link?",
    date: "Mon, 29 Jun 2026 10:00:00 +0000",
  });
  const userReply = messageFixture({
    id: "user-reply",
    threadId: "handled-thread",
    from: "Terry <terry@example.com>",
    to: "Rachel <rachel@example.com>",
    subject: "Re: Portfolio",
    snippet: "Sent, thank you.",
    date: "Mon, 29 Jun 2026 12:00:00 +0000",
  });

  const todos = normalizeMessages([
    { ...incomingAsk, threadMessages: [incomingAsk, userReply] },
  ], ["terry@example.com"]);

  assert.deepEqual(todos, []);
});

test("surfaces newer incoming ask after user reply", () => {
  const firstAsk = messageFixture({
    id: "first-ask",
    threadId: "newer-ask-thread",
    from: "Rachel <rachel@example.com>",
    to: "Terry <terry@example.com>",
    subject: "Portfolio",
    snippet: "Can you send the portfolio link?",
    date: "Mon, 29 Jun 2026 10:00:00 +0000",
  });
  const userReply = messageFixture({
    id: "newer-ask-user-reply",
    threadId: "newer-ask-thread",
    from: "Terry <terry@example.com>",
    to: "Rachel <rachel@example.com>",
    subject: "Re: Portfolio",
    snippet: "Sent, thank you.",
    date: "Mon, 29 Jun 2026 12:00:00 +0000",
  });
  const newerAsk = messageFixture({
    id: "newer-ask",
    threadId: "newer-ask-thread",
    from: "Rachel <rachel@example.com>",
    to: "Terry <terry@example.com>",
    subject: "Re: Portfolio",
    snippet: "Could you also submit the form by Friday?",
    date: "Tue, 30 Jun 2026 10:00:00 +0000",
  });

  const todos = normalizeMessages([
    { ...firstAsk, threadMessages: [firstAsk, userReply, newerAsk] },
    { ...newerAsk, threadMessages: [firstAsk, userReply, newerAsk] },
  ], ["terry@example.com"]);

  assert.equal(todos.length, 1);
  assert.equal(todos[0].emailMessageId, "newer-ask");
  assert.equal(todos[0].bucket, INBOX_BUCKETS.ACTION_REQUIRED);
});

test("suppresses latest user closure thread", () => {
  const incomingAsk = messageFixture({
    id: "closure-ask",
    threadId: "closure-thread",
    from: "Lab <lab@umass.edu>",
    to: "Terry <terry@example.com>",
    subject: "Lab form",
    snippet: "Please submit the lab form.",
    date: "Mon, 29 Jun 2026 10:00:00 +0000",
  });
  const userClosure = messageFixture({
    id: "closure-user",
    threadId: "closure-thread",
    from: "Terry <terry@example.com>",
    to: "Lab <lab@umass.edu>",
    subject: "Re: Lab form",
    snippet: "Done, all set.",
    date: "Mon, 29 Jun 2026 12:00:00 +0000",
  });

  assert.deepEqual(normalizeMessages([
    { ...incomingAsk, threadMessages: [incomingAsk, userClosure] },
  ], ["terry@example.com"]), []);
});

test("requires real ask before creating old sent follow-up todo", () => {
  const oldSentContext = messageFixture({
    id: "sent-context",
    from: "Terry <terry@example.com>",
    to: "Contact <contact@example.com>",
    subject: "Project",
    snippet: "Here is the background context from our meeting.",
    date: "Sat, 20 Jun 2026 10:00:00 +0000",
  });

  assert.deepEqual(normalizeMessages([oldSentContext], ["terry@example.com"]), []);
});

test("suppresses sent follow-up when later user message closes thread", () => {
  const oldSentAsk = messageFixture({
    id: "old-sent-ask",
    threadId: "sent-closed-thread",
    from: "Terry <terry@example.com>",
    to: "Contact <contact@example.com>",
    subject: "Project",
    snippet: "Let me know what you think.",
    date: "Sat, 20 Jun 2026 10:00:00 +0000",
  });
  const laterUserClosure = messageFixture({
    id: "later-user-closure",
    threadId: "sent-closed-thread",
    from: "Terry <terry@example.com>",
    to: "Contact <contact@example.com>",
    subject: "Re: Project",
    snippet: "No worries, all set.",
    date: "Mon, 29 Jun 2026 10:00:00 +0000",
  });

  assert.deepEqual(normalizeMessages([
    { ...oldSentAsk, threadMessages: [oldSentAsk, laterUserClosure] },
  ], ["terry@example.com"]), []);
});

test("adds account identity to normalized todos", () => {
  const account = {
    id: "umass",
    label: "UMass",
    email: "tchang@umass.edu",
    icon: "T",
    color: "#e8b7d0",
  };
  const messages = [{
    id: "account-message",
    threadId: "account-thread",
    snippet: "Could you confirm the lab meeting?",
    payload: {
      headers: [
        { name: "From", value: "UMass Lab <lab@umass.edu>" },
        { name: "To", value: "Terry <tchang@umass.edu>" },
        { name: "Subject", value: "Lab meeting" },
        { name: "Date", value: "Sat, 4 Jul 2026 12:00:00 +0000" },
      ],
    },
  }];

  const todos = normalizeMessages(messages, ["tchang@umass.edu"], account);

  assert.equal(todos.length, 1);
  assert.equal(todos[0].accountId, "umass");
  assert.equal(todos[0].accountLabel, "UMass");
  assert.equal(todos[0].accountEmail, "tchang@umass.edu");
  assert.equal(todos[0].accountIcon, "T");
  assert.equal(todos[0].accountColor, "#e8b7d0");
});

function messageFixture({ id, threadId = `${id}-thread`, from, to, cc = "", subject, snippet, date = "Sat, 4 Jul 2026 10:00:00 +0000" }) {
  return {
    id,
    threadId,
    snippet,
    payload: {
      headers: [
        { name: "From", value: from },
        { name: "To", value: to },
        { name: "Cc", value: cc },
        { name: "Subject", value: subject },
        { name: "Date", value: date },
      ],
    },
  };
}
