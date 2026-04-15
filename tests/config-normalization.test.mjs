import assert from "node:assert/strict";
import test from "node:test";

import { loadEffectiveConfig } from "../runtime/config.js";

const logger = {
  info() {},
};

test("loadEffectiveConfig accepts wrapped select and toggle values from host settings", () => {
  const config = loadEffectiveConfig(
    {
      enabled: { value: false },
      sendMode: { value: "followup" },
      matchMode: { value: "tag_only" },
      randomPick: { value: false },
      replySuffixEnabled: { value: true },
      streamingCompatibility: { value: false },
      memeTriggerProbability: { value: "25" },
    },
    logger,
  );

  assert.equal(config.enabled, false);
  assert.equal(config.sendMode, "followup");
  assert.equal(config.matchMode, "tag_only");
  assert.equal(config.randomPick, false);
  assert.equal(config.replySuffixEnabled, true);
  assert.equal(config.streamingCompatibility, false);
  assert.equal(config.memeTriggerProbability, 25);
});

test("loadEffectiveConfig accepts localized send mode labels", () => {
  const config = loadEffectiveConfig(
    {
      sendMode: "作为补发消息",
    },
    logger,
  );

  assert.equal(config.sendMode, "followup");
});
