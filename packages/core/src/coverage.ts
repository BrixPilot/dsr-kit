import { CoverageError } from "./errors.js";
import type { DataMap, SchemaIntrospection } from "./types.js";

export interface CoverageGap {
  type: "undeclared_model" | "undeclared_column" | "orphan_declaration";
  message: string;
}

export function checkCoverage(
  dataMap: DataMap,
  schema: SchemaIntrospection,
  options?: { personalColumns?: Record<string, string[]> },
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const declaredModels = new Set(Object.keys(dataMap.models));
  const schemaModels = new Set(schema.models.map((m) => m.name));

  for (const model of schema.models) {
    if (!declaredModels.has(model.name)) {
      gaps.push({
        type: "undeclared_model",
        message: `Schema model "${model.name}" is not declared in the data map`,
      });
      continue;
    }

    const declared = dataMap.models[model.name];
    const declaredFields = new Set(Object.keys(declared.fields ?? {}));

    const personalCols =
      options?.personalColumns?.[model.name] ??
      model.columns.filter((c) => c.isPersonal !== false).map((c) => c.name);

    for (const col of personalCols) {
      if (!declaredFields.has(col) && !declared.action) {
        gaps.push({
          type: "undeclared_column",
          message: `Model "${model.name}" column "${col}" touches personal data but is not declared`,
        });
      }
    }
  }

  for (const modelName of declaredModels) {
    if (!schemaModels.has(modelName)) {
      gaps.push({
        type: "orphan_declaration",
        message: `Data map declares model "${modelName}" but it is not in the schema`,
      });
    }
  }

  return gaps;
}

export function assertCoverage(
  dataMap: DataMap,
  schema: SchemaIntrospection,
  options?: { personalColumns?: Record<string, string[]> },
): void {
  const gaps = checkCoverage(dataMap, schema, options);
  const critical = gaps.filter((g) => g.type !== "orphan_declaration");
  if (critical.length > 0) {
    throw new CoverageError(critical.map((g) => g.message));
  }
}
