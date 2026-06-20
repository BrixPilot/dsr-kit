import type { StorageAdapter } from "./adapter.js";
import type { DataMap, ErasureAction, SubjectId, VerificationResult } from "./types.js";
import { getFieldAction, getModelAction } from "./data-map.js";
import { VerificationFailedError } from "./errors.js";

export async function verifyErasure(
  dataMap: DataMap,
  adapter: StorageAdapter,
  subject: SubjectId,
): Promise<VerificationResult> {
  const residues: VerificationResult["residues"] = [];

  for (const [modelName] of Object.entries(dataMap.models)) {
    const { fields } = getModelAction(dataMap, modelName);
    const checkFields: string[] = [];

    for (const [fieldName] of Object.entries(fields)) {
      const fieldAction = getFieldAction(dataMap, modelName, fieldName);
      if (fieldAction.action !== "RETAIN") {
        checkFields.push(fieldName);
      }
    }

    if (checkFields.length === 0) continue;

    const matches = await adapter.findResidue(subject, modelName, checkFields);
    for (const match of matches) {
      if (match.count > 0) {
        residues.push(match);
      }
    }
  }

  return { passed: residues.length === 0, residues };
}

export async function assertErasureVerified(
  dataMap: DataMap,
  adapter: StorageAdapter,
  subject: SubjectId,
): Promise<VerificationResult> {
  const result = await verifyErasure(dataMap, adapter, subject);
  if (!result.passed) {
    throw new VerificationFailedError(result.residues);
  }
  return result;
}

export function isRetainAction(action: ErasureAction): boolean {
  return action === "RETAIN";
}
