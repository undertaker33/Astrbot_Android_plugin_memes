import { GENERATED_MEME_MANIFEST } from "./generated_meme_manifest.js";

function unique(list) {
  const output = [];
  for (const item of list) {
    if (output.indexOf(item) < 0) {
      output.push(item);
    }
  }
  return output;
}

function toFileList(value) {
  if (Array.isArray(value)) {
    return value.slice();
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

export function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[\[\](){}<:]+/, "")
    .replace(/[\])}>:]+$/, "");
}

export function buildIndex(config, logger) {
  const manifestByLabel = {};
  for (const item of GENERATED_MEME_MANIFEST) {
    manifestByLabel[item.label] = {
      label: item.label,
      dir: item.dir,
      files: toFileList(item.files),
      count: Number(item.count || 0),
    };
  }

  const categoryMeta = {};
  for (const category of config.categories) {
    const label = normalizeLabel(category.label);
    categoryMeta[label] = {
      label,
      description: category.description,
      dir: category.dir,
      keywords: unique(
        (Array.isArray(category.keywords) ? category.keywords : []).map((item) =>
          String(item).trim().toLowerCase(),
        ),
      ),
    };
  }

  const labels = Object.keys(manifestByLabel).sort();
  const index = {
    labels,
    entries: {},
  };

  for (const label of labels) {
    const manifestItem = manifestByLabel[label];
    const meta = categoryMeta[label] || {
      label,
      description: "",
      dir: manifestItem.dir,
      keywords: Array.isArray(config.keywords[label]) ? config.keywords[label] : [],
    };

    index.entries[label] = {
      label,
      description: meta.description || "",
      dir: manifestItem.dir,
      keywords: unique(
        (Array.isArray(meta.keywords) ? meta.keywords : []).map((item) =>
          String(item).trim().toLowerCase(),
        ),
      ),
      files: manifestItem.files.slice(),
      count: manifestItem.count,
    };
  }

  logger.info("Built meme index from bundled manifest", {
    categoryCount: labels.length,
    totalFiles: labels.reduce((sum, label) => sum + index.entries[label].files.length, 0),
  });

  return index;
}

export function rebuildIndex(config, logger) {
  return buildIndex(config, logger);
}

export function pickMeme(index, label, randomPick) {
  const normalized = normalizeLabel(label);
  const entry = index.entries[normalized];
  if (!entry) {
    return { ok: false, error: "CATEGORY_NOT_FOUND", label: normalized };
  }

  if (!entry.files.length) {
    return { ok: false, error: "CATEGORY_EMPTY", label: normalized };
  }

  const file = randomPick
    ? entry.files[Math.floor(Math.random() * entry.files.length)]
    : entry.files[0];

  return {
    ok: true,
    label: normalized,
    file,
    dir: entry.dir,
    count: entry.files.length,
  };
}

export function pickRandomMeme(index) {
  const labels = Object.keys(index.entries);
  if (!labels.length) {
    return { ok: false, error: "NO_CATEGORIES" };
  }

  const label = labels[Math.floor(Math.random() * labels.length)];
  return pickMeme(index, label, true);
}

export function categorySummary(index, label) {
  const normalized = normalizeLabel(label);
  const entry = index.entries[normalized];
  if (!entry) {
    return null;
  }

  return {
    label: entry.label,
    dir: entry.dir,
    fileCount: entry.files.length,
    description: entry.description,
    keywords: entry.keywords.slice(),
  };
}

export function listCategories(index) {
  return index.labels.map((label) => categorySummary(index, label));
}
