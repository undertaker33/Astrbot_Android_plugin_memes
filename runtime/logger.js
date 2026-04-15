export function createLogger(host, pluginId) {
  function emit(level, message, metadata) {
    if (host && typeof host.log === "function") {
      host.log(level, `[${pluginId}] ${message}`, metadata || {});
    }
  }

  return {
    debug(message, metadata) {
      emit("debug", message, metadata);
    },
    info(message, metadata) {
      emit("info", message, metadata);
    },
    warn(message, metadata) {
      emit("warn", message, metadata);
    },
    error(message, metadata) {
      emit("error", message, metadata);
    },
  };
}
