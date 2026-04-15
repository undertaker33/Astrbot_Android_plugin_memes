import { buildAssetAttachment, sendCommandResult } from "./host_api.js";
import {
  categorySummary,
  listCategories,
  normalizeLabel,
  pickMeme,
  pickRandomMeme,
  rebuildIndex,
} from "./meme_index.js";
import { summarizeConfig } from "./config.js";

function buildPayload(text, attachments) {
  const payload = {
    text,
    resultType: attachments && attachments.length ? "mixed" : "text",
  };
  if (attachments && attachments.length) {
    payload.attachments = attachments;
  }
  return payload;
}

function extractRawText(event) {
  if (!event || typeof event !== "object") {
    return "";
  }

  if (typeof event.rawText === "string" && event.rawText) {
    return event.rawText.trim();
  }

  if (typeof event.workingText === "string" && event.workingText) {
    return event.workingText.trim();
  }

  return "";
}

function extractArgs(event, commandPath) {
  if (!event || typeof event !== "object") {
    return [];
  }

  if (Array.isArray(event.args)) {
    return event.args.map((item) => String(item).trim()).filter(Boolean);
  }

  if (event.triggerMetadata && Array.isArray(event.triggerMetadata.args)) {
    return event.triggerMetadata.args.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof event.argText === "string") {
    return event.argText.split(/\s+/u).map((item) => item.trim()).filter(Boolean);
  }

  const rawText = extractRawText(event);
  if (!rawText) {
    return [];
  }

  const slashPath = `/${commandPath.join(" ")}`.trim();
  const plainPath = commandPath.join(" ").trim();
  let remainder = rawText;
  if (remainder.startsWith(slashPath)) {
    remainder = remainder.slice(slashPath.length);
  } else if (remainder.startsWith(plainPath)) {
    remainder = remainder.slice(plainPath.length);
  }

  return remainder
    .trim()
    .split(/\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatCommandPath(commandPath) {
  return `/${commandPath.join(" ")}`;
}

function buildCategoryListText(state) {
  const lines = ["可用表情分类:"];
  for (const entry of listCategories(state.index)) {
    lines.push(
      `- ${entry.label} (${entry.fileCount})` +
        (entry.description ? `: ${entry.description}` : ""),
    );
  }
  return lines.join("\n");
}

function buildConfigText(state) {
  const summary = summarizeConfig(state.config);
  return [
    "当前表情配置摘要:",
    `- enabled: ${summary.enabled}`,
    `- defaultCategory: ${summary.defaultCategory || "(none)"}`,
    `- sendMode: ${summary.sendMode}`,
    `- matchMode: ${summary.matchMode}`,
    `- memeTriggerProbability: ${summary.memeTriggerProbability}`,
    `- randomPick: ${summary.randomPick}`,
    `- maxImagesPerReply: ${summary.maxImagesPerReply}`,
    `- replySuffixEnabled: ${summary.replySuffixEnabled}`,
    `- streamingCompatibility: ${summary.streamingCompatibility}`,
    `- categoryCount: ${summary.categoryCount}`,
  ].join("\n");
}

function buildHelpText() {
  return [
    "表情管理命令:",
    "- /表情管理 查看分类",
    "- /表情管理 查看分类 <标签>",
    "- /表情管理 查看配置",
    "- /表情管理 链路测试 <标签>",
    "- /表情管理 随机测试",
    "- /表情管理 重建索引",
    "- /表情管理 状态",
  ].join("\n");
}

function formatPickError(label, errorCode) {
  if (errorCode === "CATEGORY_NOT_FOUND") {
    return `未找到标签 "${label}"。请先执行 /表情管理 查看分类 查看可用标签。`;
  }
  if (errorCode === "CATEGORY_EMPTY") {
    return `标签 "${label}" 存在，但目录内没有可发送的图片资源。`;
  }
  return `无法为标签 "${label}" 选择表情包。`;
}

export function handleCommandInvocation(state, logger, event, commandPath) {
  const normalizedPath = Array.isArray(commandPath) ? commandPath : [];
  if (!normalizedPath.length) {
    return null;
  }

  const args = extractArgs(event, normalizedPath);
  const isRootCommand = normalizedPath.length === 1 && normalizedPath[0] === "表情管理";

  if (isRootCommand && args.length === 0) {
    return sendCommandResult(event, buildPayload(buildHelpText()));
  }

  let action = normalizedPath[normalizedPath.length - 1];
  let argTokens = args;

  if (isRootCommand) {
    action = args[0] || action;
    argTokens = args.slice(1);
  }

  const arg = argTokens.join(" ");

  if (action === "查看分类" && !arg) {
    logger.info("Handled command: 查看分类");
    return sendCommandResult(event, buildPayload(buildCategoryListText(state)));
  }

  if (action === "查看分类" && arg) {
    const info = categorySummary(state.index, arg);
    if (!info) {
      logger.warn("Requested category summary for unknown label", { label: arg });
      return sendCommandResult(
        event,
        buildPayload(`未找到标签 "${arg}"。请先执行 /表情管理 查看分类。`),
      );
    }

    return sendCommandResult(
      event,
      buildPayload(
        [
          `分类: ${info.label}`,
          `目录: ${info.dir}`,
          `图片数量: ${info.fileCount}`,
          `说明: ${info.description || "(none)"}`,
          `关键词: ${info.keywords.length ? info.keywords.join(", ") : "(none)"}`,
        ].join("\n"),
      ),
    );
  }

  if (action === "查看配置") {
    logger.info("Handled command: 查看配置");
    return sendCommandResult(event, buildPayload(buildConfigText(state)));
  }

  if (action === "状态") {
    return sendCommandResult(
      event,
      buildPayload(
        [
          `插件状态: ${state.config.enabled ? "enabled" : "disabled"}`,
          `索引分类数: ${state.index.labels.length}`,
          `待发送装饰数: ${Object.keys(state.pendingByRequestId).length}`,
          `补发队列数: ${Object.keys(state.followupByRequestId).length}`,
        ].join("\n"),
      ),
    );
  }

  if (action === "重建索引") {
    state.index = rebuildIndex(state.config, logger);
    logger.info("Rebuilt meme index from bundled manifest");
    return sendCommandResult(
      event,
      buildPayload(`索引已重建，共加载 ${state.index.labels.length} 个分类。`),
    );
  }

  if (action === "随机测试") {
    const picked = pickRandomMeme(state.index);
    if (!picked.ok) {
      logger.warn("Random meme test failed", { error: picked.error });
      return sendCommandResult(event, buildPayload("没有可用的表情资源可供随机测试。"));
    }

    logger.info("Random meme test hit", { category: picked.label, file: picked.file });
    return sendCommandResult(
      event,
      buildPayload(`随机测试命中: ${picked.label}`, [
        buildAssetAttachment(picked.file, picked.label),
      ]),
    );
  }

  if (action === "链路测试") {
    const label = normalizeLabel(arg);
    if (!label) {
      return sendCommandResult(
        event,
        buildPayload(`请提供标签。例如: ${formatCommandPath(normalizedPath)} happy`),
      );
    }

    const picked = pickMeme(state.index, label, state.config.randomPick);
    if (!picked.ok) {
      logger.warn("Command chain test failed", {
        label,
        error: picked.error,
      });
      return sendCommandResult(event, buildPayload(formatPickError(label, picked.error)));
    }

    logger.info("Command chain test hit", {
      label: picked.label,
      file: picked.file,
    });

    return sendCommandResult(
      event,
      buildPayload(`链路测试命中: ${picked.label}`, [
        buildAssetAttachment(picked.file, picked.label),
      ]),
    );
  }

  return sendCommandResult(
    event,
    buildPayload(`未知命令路径 "${normalizedPath.join(" ")}"。\n\n${buildHelpText()}`),
  );
}
