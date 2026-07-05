import test from "node:test";
import assert from "node:assert/strict";

import { normalizeMessages } from "../api/scheduled-inbox/todos.js";

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
  assert.equal(todos[0].type, "professor");
  assert.equal(todos[0].title, "Reply to UMass Amherst Makerspace");
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
