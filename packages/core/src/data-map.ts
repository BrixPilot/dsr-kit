import { DataMapError } from "./errors.js";
import type { DataMap, DataMapInput, ErasureAction, ModelDeclaration } from "./types.js";

function normalizeFieldAction(
  action: ErasureAction | { action: ErasureAction; legalBasis?: string },
): { action: ErasureAction; legalBasis?: string } {
  if (typeof action === "string") {
    return { action };
  }
  return action;
}

function normalizeModel(name: string, decl: ModelDeclaration): ModelDeclaration {
  const fields: Record<string, ErasureAction | { action: ErasureAction; legalBasis?: string }> =
    decl.fields ?? {};

  if (decl.action && !decl.fields) {
    return { ...decl, fields: {} };
  }

  if (decl.parent && !decl.subjectLink) {
    return { ...decl, subjectLink: decl.parent === name ? undefined : undefined };
  }

  for (const [field, fieldDecl] of Object.entries(fields)) {
    const normalized = normalizeFieldAction(fieldDecl as ErasureAction);
    if (normalized.action === "RETAIN" && !normalized.legalBasis && !decl.legalBasis) {
      throw new DataMapError(
        `Model "${name}" field "${field}" is RETAIN but has no legalBasis`,
      );
    }
  }

  if (decl.action === "RETAIN" && !decl.legalBasis) {
    const hasRetainField = Object.values(fields).some((f) => {
      const a = normalizeFieldAction(f as ErasureAction);
      return a.action === "RETAIN";
    });
    if (hasRetainField || Object.keys(fields).length === 0) {
      throw new DataMapError(`Model "${name}" has RETAIN action but no legalBasis`);
    }
  }

  return decl;
}

/**
 * Build a declarative data map — the auditable source of truth for erasure/export.
 *
 * Action precedence when both `action` and `fields` are set:
 * - Declared fields use their own action (DELETE | REDACT | RETAIN).
 * - Undeclared columns inherit the model `action` (default DELETE).
 * - If every declared field is RETAIN, the model is treated as RETAIN.
 * - Otherwise the model `action` (or `cascade`, or DELETE) drives row delete vs redact.
 */
export function defineDataMap(input: DataMapInput): DataMap {
  if (!input.subjectKey) {
    throw new DataMapError("subjectKey is required");
  }
  if (!input.models || Object.keys(input.models).length === 0) {
    throw new DataMapError("At least one model must be declared");
  }

  const models: DataMap["models"] = {};
  for (const [name, decl] of Object.entries(input.models)) {
    models[name] = normalizeModel(name, decl) as DataMap["models"][string];
  }

  return {
    subjectKey: input.subjectKey,
    subjectModel: input.subjectModel,
    subjectIdField: input.subjectIdField ?? "id",
    models,
    processors: input.processors ?? [],
  };
}

/** Column used to match a subject on a given model. */
export function getSubjectLinkField(dataMap: DataMap, modelName: string): string {
  const decl = dataMap.models[modelName];
  if (decl?.subjectLink) {
    return decl.subjectLink;
  }
  if (dataMap.subjectModel && modelName === dataMap.subjectModel) {
    return dataMap.subjectIdField ?? "id";
  }
  return dataMap.subjectKey;
}

export function getModelAction(
  dataMap: DataMap,
  modelName: string,
): { action: ErasureAction; legalBasis?: string; fields: Record<string, ErasureAction> } {
  const decl = dataMap.models[modelName];
  if (!decl) {
    throw new DataMapError(`Model "${modelName}" not in data map`);
  }

  const fields: Record<string, ErasureAction> = {};
  for (const [field, fieldDecl] of Object.entries(decl.fields ?? {})) {
    if (typeof fieldDecl === "string") {
      fields[field] = fieldDecl;
    } else {
      fields[field] = fieldDecl.action;
    }
  }

  const fieldActions = Object.values(fields);
  const allRetain =
    fieldActions.length > 0 && fieldActions.every((a) => a === "RETAIN");

  return {
    action: allRetain ? "RETAIN" : (decl.action ?? decl.cascade ?? "DELETE"),
    legalBasis: decl.legalBasis,
    fields,
  };
}

export function getFieldAction(
  dataMap: DataMap,
  modelName: string,
  fieldName: string,
): { action: ErasureAction; legalBasis?: string } {
  const decl = dataMap.models[modelName];
  if (!decl) {
    throw new DataMapError(`Model "${modelName}" not in data map`);
  }

  const fieldDecl = decl.fields?.[fieldName];
  if (fieldDecl) {
    if (typeof fieldDecl === "string") {
      return { action: fieldDecl, legalBasis: decl.legalBasis };
    }
    return { action: fieldDecl.action, legalBasis: fieldDecl.legalBasis ?? decl.legalBasis };
  }

  return { action: decl.action ?? "DELETE", legalBasis: decl.legalBasis };
}
