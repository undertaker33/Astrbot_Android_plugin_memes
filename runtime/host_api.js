function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const KNOWN_SETTING_KEYS = [
  "enabled",
  "defaultCategory",
  "sendMode",
  "matchMode",
  "memeTriggerProbability",
  "randomPick",
  "maxImagesPerReply",
  "replySuffixEnabled",
  "streamingCompatibility",
  "categories",
  "keywords",
];

function tryCall(target, names, args) {
  if (!target) {
    return null;
  }

  for (const name of names) {
    if (typeof target[name] === "function") {
      return target[name](...(args || []));
    }
  }

  return null;
}

function walkCandidates(value, bag) {
  if (!value || bag.seen.indexOf(value) >= 0) {
    return;
  }

  if (typeof value === "object") {
    bag.seen.push(value);
    bag.items.push(value);
    for (const key of Object.keys(value)) {
      walkCandidates(value[key], bag);
    }
  }
}

export function getPluginMetadata(host) {
  if (host && typeof host.getPluginMetadata === "function") {
    const metadata = host.getPluginMetadata();
    if (isObject(metadata)) {
      return metadata;
    }
  }

  return {
    pluginId: "io.github.astrbot.android.meme_manager",
    installedVersion: "0.2.3",
    runtimeKind: "js_quickjs",
    runtimeApiVersion: 1,
    runtimeBootstrap: "runtime/bootstrap.js",
  };
}

export function getEditableSettings(host) {
  if (!host) {
    return {};
  }

  const methodNames = ["getSettings", "getPluginSettings", "readSettings", "getConfig"];
  let fallback = {};

  for (const name of methodNames) {
    if (typeof host[name] !== "function") {
      continue;
    }

    const settings = normalizeSettingsObject(host[name]());
    if (!isObject(settings)) {
      continue;
    }

    if (!Object.keys(fallback).length) {
      fallback = settings;
    }

    if (hasKnownSetting(settings)) {
      return settings;
    }
  }

  return fallback;
}

function hasKnownSetting(value) {
  if (!isObject(value)) {
    return false;
  }
  return KNOWN_SETTING_KEYS.some((key) => hasReadableProperty(value, key));
}

function normalizeSettingsObject(value) {
  if (typeof value === "string" && value.trim()) {
    try {
      return normalizeSettingsObject(JSON.parse(value));
    } catch (_error) {
      return {};
    }
  }

  if (!isObject(value)) {
    return {};
  }

  if (hasKnownSetting(value)) {
    return materializeKnownSettings(value);
  }

  for (const key of ["settings", "config", "values", "data"]) {
    const nested = readBridgeProperty(value, key);
    if (hasKnownSetting(nested)) {
      return materializeKnownSettings(nested);
    }
  }

  return value;
}

function hasReadableProperty(value, key) {
  if (!isObject(value)) {
    return false;
  }

  try {
    if (key in value) {
      return true;
    }
    return readBridgeProperty(value, key) !== undefined;
  } catch (_error) {
    return false;
  }
}

function readBridgeProperty(value, key) {
  if (!isObject(value)) {
    return undefined;
  }

  try {
    if (key in value || value[key] !== undefined) {
      return value[key];
    }
  } catch (_error) {
    // Continue with method-style bridge access.
  }

  const methodNames = ["get", "getString", "getBoolean", "getNumber", "opt", "optString", "optBoolean"];
  for (const methodName of methodNames) {
    try {
      if (typeof value[methodName] === "function") {
        const result = value[methodName](key);
        if (result !== undefined && result !== null) {
          return result;
        }
      }
    } catch (_error) {
      // Try the next method name.
    }
  }

  return undefined;
}

function materializeKnownSettings(value) {
  const output = {};

  for (const key of KNOWN_SETTING_KEYS) {
    if (!hasReadableProperty(value, key)) {
      continue;
    }
    const settingValue = materializeSettingValue(readBridgeProperty(value, key));
    if (settingValue !== undefined) {
      output[key] = settingValue;
    }
  }

  return output;
}

function materializeSettingValue(value) {
  if (!isObject(value)) {
    return value;
  }

  for (const key of ["value", "currentValue", "savedValue", "selectedValue", "rawValue", "checked"]) {
    if (hasReadableProperty(value, key)) {
      return materializeSettingValue(readBridgeProperty(value, key));
    }
  }

  return value;
}

export function register(host, methodName, descriptor, logger) {
  if (!host || typeof host[methodName] !== "function") {
    logger.warn(`Host API ${methodName} is unavailable`, {
      methodName,
      key: descriptor && descriptor.key ? descriptor.key : "",
    });
    return null;
  }

  try {
    return host[methodName](descriptor);
  } catch (error) {
    logger.error(`Registration failed for ${methodName}`, {
      methodName,
      key: descriptor && descriptor.key ? descriptor.key : "",
      error: String(error && error.message ? error.message : error),
    });
    return null;
  }
}

export function buildAssetAttachment(assetPath, label) {
  const extension = String(assetPath).split(".").pop().toLowerCase();
  const mimeType =
    extension === "png"
      ? "image/png"
      : extension === "gif"
        ? "image/gif"
        : "image/jpeg";

  return {
    type: "image",
    kind: "image",
    sourceKind: "PLUGIN_ASSET",
    source: assetPath,
    uri: assetPath,
    path: assetPath,
    assetPath,
    mimeType,
    label,
  };
}

export function extractTextFromResponse(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  if (value.response && typeof value.response === "object") {
    if (typeof value.response.text === "string" && value.response.text) {
      return value.response.text;
    }
    if (typeof value.response.markdown === "string" && value.response.markdown) {
      return value.response.markdown;
    }
  }

  if (value.result && typeof value.result === "object") {
    if (typeof value.result.text === "string" && value.result.text) {
      return value.result.text;
    }
    if (typeof value.result.markdown === "string" && value.result.markdown) {
      return value.result.markdown;
    }
  }

  if (value.event && typeof value.event === "object") {
    if (typeof value.event.workingText === "string" && value.event.workingText) {
      return value.event.workingText;
    }
    if (typeof value.event.rawText === "string" && value.event.rawText) {
      return value.event.rawText;
    }
  }

  if (typeof value.text === "string" && value.text) {
    return value.text;
  }
  if (typeof value.markdown === "string" && value.markdown) {
    return value.markdown;
  }
  if (typeof value.workingText === "string" && value.workingText) {
    return value.workingText;
  }
  if (typeof value.rawText === "string" && value.rawText) {
    return value.rawText;
  }

  return "";
}

export function extractText(value) {
  if (typeof value === "string") {
    return value;
  }

  // 如果是数组，尝试从第一个对象提取
  if (Array.isArray(value) && value.length > 0) {
    const fromFirst = extractTextFromResponse(value[0]);
    if (fromFirst) {
      return fromFirst;
    }
  }
  
  // 如果是对象，直接提取
  if (typeof value === "object") {
    const fromDirect = extractTextFromResponse(value);
    if (fromDirect) {
      return fromDirect;
    }
  }

  // 最后才用贪心遍历（作为兜底）
  const bag = { items: [], seen: [] };
  walkCandidates(value, bag);

  for (const candidate of bag.items) {
    if (typeof candidate.text === "string" && candidate.text) {
      return candidate.text;
    }
    if (typeof candidate.markdown === "string" && candidate.markdown) {
      return candidate.markdown;
    }
    if (typeof candidate.workingText === "string" && candidate.workingText) {
      return candidate.workingText;
    }
    if (typeof candidate.rawText === "string" && candidate.rawText) {
      return candidate.rawText;
    }
  }

  return "";
}

export function extractRequestIdFromResponse(value) {
  if (!value || typeof value !== "object") {
    return "";
  }
  
  // 优先级1：查 response.requestId（最直接）
  if (value.response && typeof value.response === "object") {
    if (typeof value.response.requestId === "string" && value.response.requestId) {
      return value.response.requestId;
    }
  }
  
  // 优先级2：查 request.requestId
  if (value.request && typeof value.request === "object") {
    if (typeof value.request.requestId === "string" && value.request.requestId) {
      return value.request.requestId;
    }
  }
  
  // 优先级3：直接查该对象
  if (typeof value.requestId === "string" && value.requestId) {
    return value.requestId;
  }
  
  return "";
}

export function extractRequestId(value) {
  if (!value) {
    return "";
  }

  // 如果是数组，尝试从第一个对象提取
  if (Array.isArray(value) && value.length > 0) {
    const fromFirst = extractRequestIdFromResponse(value[0]);
    if (fromFirst) {
      return fromFirst;
    }
  }
  
  // 如果是对象，直接提取
  if (typeof value === "object") {
    const fromDirect = extractRequestIdFromResponse(value);
    if (fromDirect) {
      return fromDirect;
    }
  }
  
  // 最后才用贪心遍历
  const bag = { items: [], seen: [] };
  walkCandidates(value, bag);
  for (const candidate of bag.items) {
    if (typeof candidate.requestId === "string" && candidate.requestId) {
      return candidate.requestId;
    }
  }
  return "";
}

export function extractConversationId(value) {
  if (!value) {
    return "";
  }

  const bag = { items: [], seen: [] };
  walkCandidates(value, bag);
  for (const candidate of bag.items) {
    if (typeof candidate.conversationId === "string" && candidate.conversationId) {
      return candidate.conversationId;
    }
  }
  return "";
}

export function extractAfterSentView(args) {
  if (!args) return null;
  const items = Array.isArray(args) ? args : [args];
  for (const item of items) {
    if (item && typeof item === "object") {
      // The after_message_sent payload is { event, view }.
      if (item.view && typeof item.view === "object" && item.view.requestId) {
        return item.view;
      }
      // Also accept the view itself if passed directly.
      if (item.requestId && item.deliveryStatus) {
        return item;
      }
    }
  }
  return null;
}

export function extractResultController(args) {
  if (args && Array.isArray(args) && args.length > 0) {
    const payload = args[0];
    if (payload && typeof payload === "object" && payload.result) {
      const result = payload.result;
      if (
        typeof result.appendAttachment === "function" ||
        typeof result.replaceAttachments === "function" ||
        typeof result.appendText === "function" ||
        typeof result.replaceText === "function" ||
        typeof result.setShouldSend === "function"
      ) {
        return result;
      }
    }
  }

  const bag = { items: [], seen: [] };
  for (const value of args) {
    walkCandidates(value, bag);
  }

  for (const candidate of bag.items) {
    if (
      typeof candidate.appendAttachment === "function" ||
      typeof candidate.replaceAttachments === "function" ||
      typeof candidate.appendText === "function" ||
      typeof candidate.replaceText === "function" ||
      typeof candidate.setShouldSend === "function"
    ) {
      return candidate;
    }
  }

  return null;
}

export function sendCommandResult(commandContext, payload) {
  if (!commandContext) {
    return payload;
  }

  const directResult = tryCall(
    commandContext,
    ["replyResult", "sendResult", "respond", "reply"],
    [payload],
  );

  if (directResult !== null && directResult !== undefined) {
    return directResult;
  }

  if (
    payload &&
    typeof payload.text === "string" &&
    tryCall(commandContext, ["replyText", "sendText", "respondText"], [payload.text]) !== null
  ) {
    return payload;
  }

  return payload;
}

export function safeStopPropagation(value) {
  if (value && typeof value.stopPropagation === "function") {
    value.stopPropagation();
  }
}
