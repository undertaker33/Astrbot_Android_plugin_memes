import assert from "node:assert/strict";
import test from "node:test";

import { refreshRuntimeConfig } from "../runtime/config.js";

test("refreshRuntimeConfig reloads host settings into runtime state", () => {
  const logs = [];
  const logger = { info: (message, metadata) => logs.push({ message, metadata }) };
  const state = {
    hostApi: {
      getSettings() {
        return {
          enabled: false,
          sendMode: "followup",
          matchMode: "tag_only",
        };
      },
    },
    config: {
      enabled: true,
      sendMode: "append",
      matchMode: "tag_and_keyword",
    },
    index: {
      labels: [],
      entries: {},
    },
  };

  const changed = refreshRuntimeConfig(state, logger);

  assert.equal(changed, true);
  assert.equal(state.config.enabled, false);
  assert.equal(state.config.sendMode, "followup");
  assert.equal(state.config.matchMode, "tag_only");
});
