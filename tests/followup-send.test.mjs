import assert from "node:assert/strict";
import test from "node:test";

import { decorateResult, sendFollowup } from "../runtime/decorate.js";

function createLogger() {
  return {
    info() {},
  };
}

test("decorateResult queues followup payload without appending attachment to the current result", () => {
  const appended = [];
  const state = {
    config: {
      enabled: true,
      sendMode: "followup",
      randomPick: false,
      memeTriggerProbability: 100,
      replySuffixEnabled: false,
    },
    index: {
      labels: ["sleep"],
      entries: {
        sleep: {
          label: "sleep",
          keywords: [],
          files: ["memes/sleep/a.jpg"],
        },
      },
    },
    pendingByRequestId: {
      "req-1": {
        requestId: "req-1",
        conversationId: "conv-1",
        category: "sleep",
        file: "memes/sleep/a.jpg",
        mode: "keyword",
        source: "response_text",
      },
    },
    followupByRequestId: {},
  };

  decorateResult(
    state,
    createLogger(),
    {
      result: {
        requestId: "req-1",
        conversationId: "conv-1",
        text: "晚安",
        appendAttachment(attachment) {
          appended.push(attachment);
        },
      },
    },
  );

  assert.equal(appended.length, 0);
  assert.deepEqual(Object.keys(state.followupByRequestId), ["req-1"]);
});

test("sendFollowup sends through the after_message_sent view followup API", () => {
  let sentText = null;
  let sentAttachments = null;
  const state = {
    followupByRequestId: {
      "req-1": {
        text: "",
        attachments: [{ uri: "memes/sleep/a.jpg", mimeType: "image/jpeg" }],
      },
    },
  };

  sendFollowup(
    state,
    createLogger(),
    {
      event: {
        replyResult(payload) {
          throw new Error(`event.replyResult should not be used: ${JSON.stringify(payload)}`);
        },
      },
      view: {
        requestId: "req-1",
        deliveryStatus: "success",
        sendFollowup(text, attachments) {
          sentText = text;
          sentAttachments = attachments;
          return { success: true, receiptIds: ["receipt-1"], errorSummary: "" };
        },
      },
    },
  );

  assert.equal(sentText, "");
  assert.deepEqual(sentAttachments, [{ uri: "memes/sleep/a.jpg", mimeType: "image/jpeg" }]);
  assert.deepEqual(state.followupByRequestId, {});
});
