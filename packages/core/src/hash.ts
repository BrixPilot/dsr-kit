import { createHash } from "node:crypto";
import type { SubjectId } from "./types.js";

export function hashSubjectId(subject: SubjectId): string {
  return createHash("sha256")
    .update(`${subject.key}:${subject.value}`)
    .digest("hex");
}

export function hashContent(payload: unknown): string {
  const normalized = JSON.stringify(payload, Object.keys(payload as object).sort());
  return createHash("sha256").update(normalized).digest("hex");
}

export function chainProofHash(prevHash: string | null, contentHash: string): string {
  const input = prevHash ? `${prevHash}:${contentHash}` : contentHash;
  return createHash("sha256").update(input).digest("hex");
}
