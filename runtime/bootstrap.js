import { loadEffectiveConfig, refreshRuntimeConfig } from "./config.js";
import { handleCommandInvocation } from "./commands.js";
import {
  decorateResult,
  decorateRequestPrompt,
  rememberIncomingMessage,
  rememberMatch,
  sendFollowup,
} from "./decorate.js";
import { getEditableSettings, getPluginMetadata, register } from "./host_api.js";
import { createLogger } from "./logger.js";
import { buildIndex } from "./meme_index.js";

function createRuntimeState(config, index, hostApi, settings) {
  return {
    hostApi,
    config,
    index,
    settingsSignature: JSON.stringify(settings || {}),
    pendingByRequestId: {},
    followupByRequestId: {},
    hintByConversationId: {},
  };
}

export default async function bootstrap(hostApi) {
  await Promise.resolve();

  const metadata = getPluginMetadata(hostApi);
  const logger = createLogger(hostApi, metadata.pluginId);
  const settings = getEditableSettings(hostApi);
  const config = loadEffectiveConfig(settings, logger);
  const index = buildIndex(config, logger);
  const state = createRuntimeState(config, index, hostApi, settings);

  logger.info("Bootstrap started", {
    version: metadata.installedVersion,
    runtimeKind: metadata.runtimeKind,
    runtimeApiVersion: metadata.runtimeApiVersion,
    runtimeBootstrap: metadata.runtimeBootstrap,
    categoryCount: state.index.labels.length,
  });

  register(
    hostApi,
    "registerLifecycleHandler",
    {
      hook: "on_plugin_loaded",
      key: "meme-manager.plugin-loaded",
      priority: 100,
      metadata: {
        feature: "startup_log",
      },
      handler() {
        logger.info("Plugin loaded lifecycle received", {
          categoryCount: state.index.labels.length,
        });
      },
    },
    logger,
  );

  register(
    hostApi,
    "registerLifecycleHandler",
    {
      hook: "on_plugin_unloaded",
      key: "meme-manager.plugin-unloaded",
      priority: 100,
      metadata: {
        feature: "shutdown_log",
      },
      handler() {
        logger.info("Plugin unloaded lifecycle received");
      },
    },
    logger,
  );

  register(
    hostApi,
    "registerLifecycleHandler",
    {
      hook: "on_plugin_error",
      key: "meme-manager.plugin-error",
      priority: 100,
      metadata: {
        feature: "error_log",
      },
      handler(payload) {
        logger.error("Plugin error hook observed", payload || {});
      },
    },
    logger,
  );

  const commandToken = register(
    hostApi,
    "registerCommandHandler",
    {
      stage: "command",
      key: "meme-manager.command.root",
      command: "表情管理",
      aliases: ["meme_manager"],
      groupPath: [],
      metadata: {
        feature: "command_group_root",
        commandGroup: "表情管理",
      },
      filters: [],
      handler(event) {
        refreshRuntimeConfig(state, logger);
        return handleCommandInvocation(state, logger, event, ["表情管理"]);
      },
    },
    logger,
  );

  logger.info("Root command registration attempted", {
    command: "表情管理",
    token: commandToken ? String(commandToken) : "",
  });

  register(
    hostApi,
    "registerMessageHandler",
    {
      key: "meme-manager.message.ingress",
      priority: 120,
      metadata: {
        feature: "message_ingress_hint",
      },
      filters: [],
      handler(event) {
        refreshRuntimeConfig(state, logger);
        return rememberIncomingMessage(state, logger, event);
      },
    },
    logger,
  );

  register(
    hostApi,
    "registerLlmHook",
    {
      hook: "on_llm_request",
      key: "meme-manager.llm.request-prompt",
      priority: 180,
      metadata: {
        feature: "request_prompt_tagging",
      },
      handler(...args) {
        refreshRuntimeConfig(state, logger);
        return decorateRequestPrompt(state, logger, ...args);
      },
    },
    logger,
  );

  register(
    hostApi,
    "registerLlmHook",
    {
      hook: "on_llm_response",
      key: "meme-manager.llm.match",
      priority: 180,
      metadata: {
        feature: "response_match",
      },
      handler(...args) {
        refreshRuntimeConfig(state, logger);
        return rememberMatch(state, logger, ...args);
      },
    },
    logger,
  );

  const decorateToken = register(
    hostApi,
    "registerLlmHook",
    {
      hook: "on_decorating_result",
      key: "meme-manager.llm.decorate",
      priority: 180,
      metadata: {
        feature: "result_attachment",
        sendMode: config.sendMode,
      },
      handler(...args) {
        refreshRuntimeConfig(state, logger);
        return decorateResult(state, logger, ...args);
      },
    },
    logger,
  );
  
  if (decorateToken) {
    logger.info("on_decorating_result hook registration SUCCESS", {
      token: String(decorateToken),
      sendMode: config.sendMode,
    });
  } else {
    logger.error("CRITICAL: on_decorating_result hook registration FAILED - host may not support this hook", {
      feature: "result_attachment",
    });
  }

  register(
    hostApi,
    "registerLlmHook",
    {
      hook: "after_message_sent",
      key: "meme-manager.llm.followup",
      priority: 180,
      metadata: {
        feature: "followup_send",
      },
      handler(...args) {
        refreshRuntimeConfig(state, logger);
        return sendFollowup(state, logger, ...args);
      },
    },
    logger,
  );

  logger.info("Bootstrap finished", {
    commands: [
      "表情管理",
      "表情管理 查看分类",
      "表情管理 查看配置",
      "表情管理 链路测试 <标签>",
      "表情管理 随机测试",
      "表情管理 重建索引",
      "表情管理 状态",
    ],
    sendMode: state.config.sendMode,
    matchMode: state.config.matchMode,
  });
}
