import { randomUUID } from "node:crypto";
import { chainProofHash, hashContent } from "./hash.js";
import type { ErasureReport, JobType, ProofRecord } from "./types.js";

export interface ProofStore {
  /** Last content hash in the per-subject chain (not global). */
  getLastHash(subjectIdHash: string): Promise<string | null>;
  append(record: Omit<ProofRecord, "id" | "prevHash" | "contentHash">): Promise<ProofRecord>;
  getById(id: string): Promise<ProofRecord | null>;
  exportProof(id: string): Promise<ProofRecord | null>;
  list(): Promise<ProofRecord[]>;
}

export function proofRecordBody(
  partial: Omit<ProofRecord, "id" | "prevHash" | "contentHash">,
): Record<string, unknown> {
  return {
    requestType: partial.requestType,
    subjectIdHash: partial.subjectIdHash,
    timestamp: partial.timestamp,
    perModelOutcomes: partial.perModelOutcomes,
    perProcessorOutcomes: partial.perProcessorOutcomes,
    retainedItems: partial.retainedItems,
    operator: partial.operator,
  };
}

/** Serializes async work per key (e.g. one proof chain per subject). */
export class SubjectMutex {
  private tails = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.tails.get(key) ?? Promise.resolve();
    this.tails.set(
      key,
      prev.then(
        () => gate,
        () => gate,
      ),
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export class InMemoryProofStore implements ProofStore {
  private chains = new Map<string, ProofRecord[]>();
  private mutex = new SubjectMutex();

  async getLastHash(subjectIdHash: string): Promise<string | null> {
    const chain = this.chains.get(subjectIdHash) ?? [];
    return chain.at(-1)?.contentHash ?? null;
  }

  async append(
    partial: Omit<ProofRecord, "id" | "prevHash" | "contentHash">,
  ): Promise<ProofRecord> {
    return this.mutex.run(partial.subjectIdHash, async () => {
      const prevHash = await this.getLastHash(partial.subjectIdHash);
      const contentHash = hashContent(proofRecordBody(partial));
      const record: ProofRecord = {
        id: randomUUID(),
        ...partial,
        prevHash,
        contentHash: chainProofHash(prevHash, contentHash),
      };
      const chain = this.chains.get(partial.subjectIdHash) ?? [];
      chain.push(record);
      this.chains.set(partial.subjectIdHash, chain);
      return record;
    });
  }

  async getById(id: string): Promise<ProofRecord | null> {
    for (const chain of this.chains.values()) {
      const found = chain.find((r) => r.id === id);
      if (found) return found;
    }
    return null;
  }

  async exportProof(id: string): Promise<ProofRecord | null> {
    return this.getById(id);
  }

  async list(): Promise<ProofRecord[]> {
    return [...this.chains.values()]
      .flat()
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /** Verify hash chain integrity for one subject or all subjects. */
  verifyChain(subjectIdHash?: string): boolean {
    const subjects = subjectIdHash
      ? [subjectIdHash]
      : [...this.chains.keys()];
    for (const subject of subjects) {
      let prev: string | null = null;
      for (const record of this.chains.get(subject) ?? []) {
        const contentHash = hashContent(
          proofRecordBody({
            requestType: record.requestType,
            subjectIdHash: record.subjectIdHash,
            timestamp: record.timestamp,
            perModelOutcomes: record.perModelOutcomes,
            perProcessorOutcomes: record.perProcessorOutcomes,
            retainedItems: record.retainedItems,
            operator: record.operator,
          }),
        );
        const expected = chainProofHash(prev, contentHash);
        if (record.contentHash !== expected || record.prevHash !== prev) {
          return false;
        }
        prev = record.contentHash;
      }
    }
    return true;
  }
}

export async function writeProofFromReport(
  store: ProofStore,
  report: ErasureReport,
  requestType: JobType,
  operator?: string,
): Promise<ProofRecord> {
  return store.append({
    requestType,
    subjectIdHash: report.subjectHash,
    timestamp: new Date().toISOString(),
    perModelOutcomes: report.models,
    perProcessorOutcomes: report.processors,
    retainedItems: report.retainedItems,
    operator,
  });
}
