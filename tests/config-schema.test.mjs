import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
}

test("plugin setting UI fields are backed by the static config schema", () => {
  const androidPlugin = readJson("../android-plugin.json");
  const settingsSchema = readJson("../schemas/settings-schema.json");
  const staticSchemaPath = androidPlugin.config.staticSchema;
  const staticSchema = readJson(`../${staticSchemaPath}`);

  assert.equal(staticSchemaPath, "_conf_schema.json");

  const fieldIds = settingsSchema.sections.flatMap((section) =>
    section.fields.map((field) => field.fieldId),
  );
  const staticKeys = Object.keys(staticSchema);

  assert.deepEqual(
    fieldIds.filter((fieldId) => !staticKeys.includes(fieldId)),
    [],
  );
});
