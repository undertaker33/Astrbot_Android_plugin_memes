import {
  buildAssetAttachment,
  extractAfterSentView,
  extractConversationId,
  extractRequestId,
  extractResultController,
  extractText,
  sendCommandResult,
} from "./host_api.js";
import { matchCategory } from "./match.js";
import { pickMeme } from "./meme_index.js";

function suffixText(text, category) {
  if (!text) {
    return `[表情:${category}]`;
  }
  return `${text}\n[表情:${category}]`;
}

function applyAppendMode(resultController, attachment, text, config, logger, category, replacementText) {
  if (!resultController) {
    logger.info("Decorating result controller unavailable for append mode", {
      category,
    });
    return false;
  }

  if (
    typeof replacementText === "string" &&
    replacementText !== text &&
    typeof resultController.replaceText === "function"
  ) {
    resultController.replaceText(replacementText);
  }

  if (typeof resultController.appendAttachment === "function") {
    resultController.appendAttachment(attachment);
  } else if (typeof resultController.replaceAttachments === "function") {
    resultController.replaceAttachments([attachment]);
  } else {
    logger.info("Attachment append API missing on result controller", {
      category,
    });
    return false;
  }

  if (config.replySuffixEnabled) {
    if (typeof resultController.appendText === "function") {
      resultController.appendText(`\n[表情:${category}]`);
    } else if (typeof resultController.replaceText === "function") {
      const suffixBaseText = typeof replacementText === "string" ? replacementText : text;
      resultController.replaceText(suffixText(suffixBaseText, category));
    }
  }

  return true;
}

function buildTagPrompt(state) {
  const labels = Array.isArray(state.index.labels) ? state.index.labels : [];
  return [
    "当回复内容适合配一张表情包时，请在回复正文末尾单独附加一个标准标签。",
    `可用标签仅限: ${labels.map((label) => `[${label}]`).join(" ")}`,
    "如果不适合配图，则不要输出任何标签。",
    "每次最多输出一个标签，不要解释标签本身。",
  ].join("\n");
}

function extractRequestController(args) {
  if (!args || !Array.isArray(args)) {
    return null;
  }
  return args.find((item) => item && typeof item === "object" && item.request) || null;
}

function shouldTriggerByProbability(probability) {
  const numeric = Number(probability);
  if (!Number.isFinite(numeric)) {
    return true;
  }
  if (numeric <= 0) {
    return false;
  }
  if (numeric >= 100) {
    return true;
  }
  return Math.random() * 100 < numeric;
}

function buildPendingMeme(state, logger, requestId, conversationId, match, source) {
  const picked = pickMeme(state.index, match.category, state.config.randomPick);
  if (!picked.ok) {
    logger.info("Matched category could not produce a meme", {
      requestId,
      conversationId,
      category: match.category,
      error: picked.error,
      source,
    });
    return null;
  }

  if (!shouldTriggerByProbability(state.config.memeTriggerProbability)) {
    logger.info("Matched meme skipped by trigger probability", {
      requestId,
      conversationId,
      category: match.category,
      probability: String(state.config.memeTriggerProbability),
      source,
    });
    return null;
  }

  return {
    requestId,
    conversationId,
    category: picked.label,
    file: picked.file,
    cleanedText: match.cleanedText,
    mode: match.mode,
    source,
  };
}

function queuePendingMeme(state, pending) {
  const primaryKey = pending.requestId || `conv:${pending.conversationId}`;
  state.pendingByRequestId[primaryKey] = pending;
}

function replacementTextForPending(pending, originalText) {
  if (
    pending &&
    pending.mode === "explicit_tag" &&
    pending.source !== "message_hint" &&
    typeof pending.cleanedText === "string"
  ) {
    return pending.cleanedText;
  }

  return originalText;
}

function canReply(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (typeof value.replyResult === "function" ||
        typeof value.sendResult === "function" ||
        typeof value.respond === "function" ||
        typeof value.reply === "function" ||
        typeof value.replyText === "function" ||
        typeof value.sendText === "function" ||
        typeof value.respondText === "function"),
  );
}

function extractReplyContext(args) {
  const bag = { items: [], seen: [] };

  function walk(value) {
    if (!value || typeof value !== "object" || bag.seen.indexOf(value) >= 0) {
      return;
    }

    bag.seen.push(value);
    bag.items.push(value);

    if (value.event && typeof value.event === "object") {
      walk(value.event);
    }
    if (value.context && typeof value.context === "object") {
      walk(value.context);
    }
    if (value.commandContext && typeof value.commandContext === "object") {
      walk(value.commandContext);
    }
  }

  for (const arg of args) {
    walk(arg);
  }

  for (const item of bag.items) {
    if (canReply(item)) {
      return item;
    }
  }

  return null;
}

export function rememberIncomingMessage(state, logger, event) {
  if (!state.config.enabled || !event || typeof event !== "object") {
    return;
  }

  const conversationId = extractConversationId(event);
  const text = extractText(event);
  if (!conversationId || !text) {
    return;
  }

  if (text.trimStart().startsWith("/")) {
    delete state.hintByConversationId[conversationId];
    return;
  }

  const match = matchCategory(text, state.index, state.config);
  if (!match.matched) {
    delete state.hintByConversationId[conversationId];
    return;
  }

  state.hintByConversationId[conversationId] = {
    category: match.category,
    mode: match.mode,
    cleanedText: match.cleanedText,
  };

  logger.info("Stored meme hint from incoming message", {
    conversationId,
    category: match.category,
    mode: match.mode,
  });
}

export function decorateRequestPrompt(state, logger, ...args) {
  if (!state.config.enabled) {
    return;
  }

  const tagPrompt = buildTagPrompt(state);
  const payload = extractRequestController(args);
  const request = payload && payload.request ? payload.request : null;

  if (!request) {
    logger.info("Skip decorateRequestPrompt: request not found");
    return;
  }

  if (typeof request.appendSystemPrompt === "function") {
    request.appendSystemPrompt(tagPrompt);
    logger.info("Injected meme tag system prompt via appendSystemPrompt", {
      categoryCount: state.index.labels.length,
      matchMode: state.config.matchMode,
    });
    return;
  }

  logger.info("Skip decorateRequestPrompt: appendSystemPrompt method unavailable");
}

export function rememberMatch(state, logger, ...args) {
  if (!state.config.enabled) {
    return;
  }

  const requestId = extractRequestId(args);
  const conversationId = extractConversationId(args);
  const text = extractText(args);

  if (!text) {
    return;
  }

  if (!requestId && !conversationId) {
    return;
  }

  const hinted = conversationId ? state.hintByConversationId[conversationId] : null;
  const match = hinted || matchCategory(text, state.index, state.config);
  if (!match || (!match.matched && !hinted)) {
    return;
  }

  const pending = buildPendingMeme(
    state,
    logger,
    requestId,
    conversationId,
    match,
    hinted ? "message_hint" : "response_text",
  );
  if (conversationId) {
    delete state.hintByConversationId[conversationId];
  }
  if (!pending) {
    return;
  }

  queuePendingMeme(state, pending);

  logger.info("Matched meme category for response", {
    requestId,
    conversationId,
    category: pending.category,
    mode: pending.mode,
    file: pending.file,
    source: pending.source,
  });
}

export function decorateResult(state, logger, ...args) {
  if (!state.config.enabled) {
    return;
  }

  const requestId = extractRequestId(args);
  const originalText = extractText(args);
  const conversationId = extractConversationId(args);

  let pending = requestId ? state.pendingByRequestId[requestId] : null;

  if (!pending && conversationId) {
    const convKey = `conv:${conversationId}`;
    pending = state.pendingByRequestId[convKey];
  }

  if (!pending && originalText) {
    const match = matchCategory(originalText, state.index, state.config);
    if (match.matched) {
      pending = buildPendingMeme(
        state,
        logger,
        requestId,
        conversationId,
        match,
        "decorating_result_text",
      );
    }
  }

  if (!pending) {
    return;
  }

  const resultController = extractResultController(args, logger);
  const attachment = buildAssetAttachment(pending.file, pending.category);
  const replacementText = replacementTextForPending(pending, originalText);

  if (state.config.sendMode === "append") {
    const appended = applyAppendMode(
      resultController,
      attachment,
      originalText,
      state.config,
      logger,
      pending.category,
      replacementText,
    );
    if (appended) {
      logger.info("Meme attachment appended to result", {
        requestId: requestId || "(empty)",
        conversationId,
        category: pending.category,
        file: pending.file,
      });
      if (requestId) delete state.pendingByRequestId[requestId];
      if (conversationId) delete state.pendingByRequestId[`conv:${conversationId}`];
    }
    return;
  }

  if (!requestId) {
    logger.info("Skip followup meme payload because requestId is missing", {
      category: pending.category,
    });
    return;
  }

  state.followupByRequestId[requestId] = {
    text: state.config.replySuffixEnabled ? `[表情:${pending.category}]` : "",
    attachments: [attachment],
  };
  logger.info("Meme attachment queued for followup result", {
    requestId,
    conversationId,
    category: pending.category,
    file: pending.file,
    streamingCompatibility: state.config.streamingCompatibility,
  });
  delete state.pendingByRequestId[requestId];
  if (conversationId) delete state.pendingByRequestId[`conv:${conversationId}`];
}

export function sendFollowup(state, logger, ...args) {
  const requestId = extractRequestId(args);
  if (!requestId) {
    return;
  }

  const followup = state.followupByRequestId[requestId];
  if (!followup) {
    return;
  }

  delete state.followupByRequestId[requestId];

  // Use the host-provided sendFollowup API on the afterSentView.
  const view = extractAfterSentView(args);
  if (!view || typeof view.sendFollowup !== "function") {
    logger.info("Skip followup meme payload because view.sendFollowup is unavailable", {
      requestId,
      canSendFollowup: view ? view.canSendFollowup : false,
    });
    return;
  }

  const result = view.sendFollowup(
    followup.text || "",
    Array.isArray(followup.attachments) ? followup.attachments : [],
  );
  logger.info("Meme followup payload sent", {
    requestId,
    attachmentCount: Array.isArray(followup.attachments) ? followup.attachments.length : 0,
    success: result ? result.success : null,
  });
}
