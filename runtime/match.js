import { normalizeLabel } from "./meme_index.js";

const EXPLICIT_PATTERNS = [
  /\[([a-zA-Z0-9_-]+)\]/g,
  /&&([a-zA-Z0-9_-]+)&&/g,
  /:([a-zA-Z0-9_-]+):/g,
];

function unique(list) {
  const output = [];
  for (const item of list) {
    if (output.indexOf(item) < 0) {
      output.push(item);
    }
  }
  return output;
}

export function extractExplicitLabels(text) {
  const matches = [];
  const source = String(text || "");
  for (const pattern of EXPLICIT_PATTERNS) {
    pattern.lastIndex = 0;
    let result = pattern.exec(source);
    while (result) {
      const label = normalizeLabel(result[1]);
      if (label) {
        matches.push(label);
      }
      result = pattern.exec(source);
    }
  }
  return unique(matches);
}

export function cleanupExplicitLabels(text) {
  let cleaned = String(text || "");
  for (const pattern of EXPLICIT_PATTERNS) {
    cleaned = cleaned.replace(pattern, "").trim();
  }
  return cleaned;
}

export function matchCategory(text, index, config) {
  const source = String(text || "");
  const lowered = source.toLowerCase();
  const explicit = extractExplicitLabels(source);

  for (const label of explicit) {
    if (index.entries[label]) {
      return {
        matched: true,
        category: label,
        mode: "explicit_tag",
        cleanedText: cleanupExplicitLabels(source),
      };
    }
  }

  if (config.defaultCategory && explicit.length && index.entries[config.defaultCategory]) {
    return {
      matched: true,
      category: config.defaultCategory,
      mode: "default_category",
      cleanedText: cleanupExplicitLabels(source),
    };
  }

  if (config.matchMode === "tag_only") {
    return {
      matched: false,
      mode: "tag_only_miss",
      cleanedText: source,
    };
  }

  for (const label of index.labels) {
    const entry = index.entries[label];
    for (const keyword of entry.keywords) {
      if (keyword && lowered.indexOf(keyword.toLowerCase()) >= 0) {
        return {
          matched: true,
          category: label,
          mode: "keyword",
          cleanedText: source,
        };
      }
    }
  }

  return {
    matched: false,
    mode: "no_match",
    cleanedText: source,
  };
}
