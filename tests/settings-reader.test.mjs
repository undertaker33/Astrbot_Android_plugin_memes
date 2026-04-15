import assert from "node:assert/strict";
import test from "node:test";

import { getEditableSettings } from "../runtime/host_api.js";

test("getEditableSettings uses a later host settings API when an earlier one is empty", () => {
  const settings = getEditableSettings({
    getSettings() {
      return {};
    },
    getPluginSettings() {
      return {
        enabled: false,
        sendMode: "followup",
      };
    },
  });

  assert.deepEqual(settings, {
    enabled: false,
    sendMode: "followup",
  });
});

test("getEditableSettings materializes bridge-like settings with inherited properties", () => {
  const bridgeSettings = Object.create({
    enabled: false,
    matchMode: "tag_only",
    sendMode: "followup",
  });

  const settings = getEditableSettings({
    getSettings() {
      return bridgeSettings;
    },
  });

  assert.deepEqual(settings, {
    enabled: false,
    sendMode: "followup",
    matchMode: "tag_only",
  });
});

test("getEditableSettings unwraps wrapped bridge setting values", () => {
  const sendMode = Object.create({
    value: "followup",
  });

  const settings = getEditableSettings({
    getSettings() {
      return {
        sendMode,
      };
    },
  });

  assert.deepEqual(settings, {
    sendMode: "followup",
  });
});

test("getEditableSettings reads map-like bridge settings with get(key)", () => {
  const settings = getEditableSettings({
    getSettings() {
      const values = {
        sendMode: "followup",
        matchMode: "tag_only",
        enabled: false,
      };
      return {
        get(key) {
          return values[key];
        },
      };
    },
  });

  assert.deepEqual(settings, {
    enabled: false,
    sendMode: "followup",
    matchMode: "tag_only",
  });
});
