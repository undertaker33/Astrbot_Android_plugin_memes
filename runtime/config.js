import { DEFAULT_SETTINGS } from "./defaults.js";
import { getEditableSettings } from "./host_api.js";
import { buildIndex } from "./meme_index.js";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeObjects(base, extra) {
  const output = cloneJson(base);
  if (!extra || typeof extra !== "object") {
    return output;
  }

  for (const key of Object.keys(extra)) {
    if (
      output[key] &&
      typeof output[key] === "object" &&
      !Array.isArray(output[key]) &&
      typeof extra[key] === "object" &&
      !Array.isArray(extra[key])
    ) {
      output[key] = mergeObjects(output[key], extra[key]);
      continue;
    }

    output[key] = extra[key];
  }

  return output;
}

function normalizeCategoryList(categories, keywordMap) {
  const list = Array.isArray(categories) ? categories : [];
  return list
    .map((category) => ({
      label: String(category.label || "").trim().toLowerCase(),
      description: String(category.description || "").trim(),
      dir: String(category.dir || "").trim(),
      keywords: Array.isArray(category.keywords)
        ? category.keywords.map((item) => String(item).trim()).filter(Boolean)
        : [],
    }))
    .filter((category) => category.label && category.dir)
    .map((category) => ({
      ...category,
      keywords: category.keywords.concat(
        Array.isArray(keywordMap[category.label]) ? keywordMap[category.label] : [],
      ),
    }));
}

function normalizeProbability(value) {
  const numeric = Number(unwrapSettingValue(value));
  if (!Number.isFinite(numeric)) {
    return 100;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function unwrapSettingValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  for (const key of ["value", "currentValue", "savedValue", "selectedValue", "rawValue"]) {
    if (value[key] !== undefined) {
      return unwrapSettingValue(value[key]);
    }
  }

  if (value.checked !== undefined) {
    return unwrapSettingValue(value.checked);
  }

  return value;
}

function normalizeBoolean(value, defaultValue) {
  const raw = unwrapSettingValue(value);
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "number") {
    return raw !== 0;
  }
  const text = String(raw || "").trim().toLowerCase();
  if (["true", "1", "yes", "on", "enabled", "enable", "开启", "启用", "是"].indexOf(text) >= 0) {
    return true;
  }
  if (["false", "0", "no", "off", "disabled", "disable", "关闭", "禁用", "否"].indexOf(text) >= 0) {
    return false;
  }
  return defaultValue;
}

function normalizeText(value) {
  const raw = unwrapSettingValue(value);
  if (raw === null || raw === undefined) {
    return "";
  }
  return String(raw).trim();
}

function normalizeSendMode(value) {
  const text = normalizeText(value).toLowerCase();
  if (
    text === "followup" ||
    text === "follow_up" ||
    text === "separate" ||
    text === "作为补发消息" ||
    text === "补发消息" ||
    text === "补发" ||
    text === "分开发送"
  ) {
    return "followup";
  }
  return "append";
}

function normalizeMatchMode(value) {
  const text = normalizeText(value).toLowerCase();
  if (text === "tag_only" || text === "tag-only" || text === "仅显式标签" || text === "仅标签") {
    return "tag_only";
  }
  return "tag_and_keyword";
}

export function loadEffectiveConfig(settings, logger) {
  const runtimeSettings = mergeObjects(DEFAULT_SETTINGS, settings || {});
  const keywordMap =
    runtimeSettings.keywords && typeof runtimeSettings.keywords === "object"
      ? runtimeSettings.keywords
      : {};

  const categories = normalizeCategoryList(runtimeSettings.categories, keywordMap);
  const config = {
    enabled: normalizeBoolean(runtimeSettings.enabled, true),
    defaultCategory: normalizeText(runtimeSettings.defaultCategory).toLowerCase(),
    sendMode: normalizeSendMode(runtimeSettings.sendMode),
    matchMode: normalizeMatchMode(runtimeSettings.matchMode),
    memeTriggerProbability: normalizeProbability(runtimeSettings.memeTriggerProbability),
    randomPick: normalizeBoolean(runtimeSettings.randomPick, true),
    maxImagesPerReply: Math.max(1, Number(unwrapSettingValue(runtimeSettings.maxImagesPerReply) || 1)),
    replySuffixEnabled: normalizeBoolean(runtimeSettings.replySuffixEnabled, false),
    streamingCompatibility: normalizeBoolean(runtimeSettings.streamingCompatibility, true),
    categories,
    keywords: keywordMap,
  };

  logger.info("Loaded plugin configuration", {
    enabled: config.enabled,
    defaultCategory: config.defaultCategory,
    sendMode: config.sendMode,
    matchMode: config.matchMode,
    memeTriggerProbability: config.memeTriggerProbability,
    categoryCount: categories.length,
  });

  return config;
}

export function summarizeConfig(config) {
  return {
    enabled: config.enabled,
    defaultCategory: config.defaultCategory,
    sendMode: config.sendMode,
    matchMode: config.matchMode,
    memeTriggerProbability: config.memeTriggerProbability,
    randomPick: config.randomPick,
    maxImagesPerReply: config.maxImagesPerReply,
    replySuffixEnabled: config.replySuffixEnabled,
    streamingCompatibility: config.streamingCompatibility,
    categoryCount: Array.isArray(config.categories) ? config.categories.length : 0,
  };
}

export function refreshRuntimeConfig(state, logger) {
  if (!state || !state.hostApi) {
    return false;
  }

  const settings = getEditableSettings(state.hostApi);
  const signature = JSON.stringify(settings || {});
  if (state.settingsSignature === signature) {
    return false;
  }

  state.settingsSignature = signature;
  state.config = loadEffectiveConfig(settings, logger);
  state.index = buildIndex(state.config, logger);
  return true;
}
