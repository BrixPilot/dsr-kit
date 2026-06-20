import { randomUUID } from "node:crypto";
import { chainProofHash, hashContent } from "./hash.js";
import type { ErasureReport, JobType, ProofRecord } from "./types.js";

export interface ProofStore {
  getLastHash(): Promise<string | null>;
  append(record: Omit<ProofRecord, "id" | "prevHash" | "contentHash">): Promise<ProofRecord>;
  getById(id: string): Promise<ProofRecord | null>;
  exportProof(id: string): Promise<ProofRecord | null>;
  list(): Promise<ProofRecord[]>;
}

export class InMemoryProofStore implements ProofStore {
  private records: ProofRecord[] = [];

  async getLastHash(): Promise<string | null> {
    const last = this.records.at(-1);
    return last?.contentHash ?? null;
  }

  async append(
    partial: Omit<ProofRecord, "id" | "prevHash" | "contentHash">,
  ): Promise<ProofRecord> {
    const prevHash = await this.getLastHash();
    const body = {
      requestType: partial.requestType,
      subjectIdHash: partial.subjectIdHash,
      timestamp: partial.timestamp,
      perModelOutcomes: partial.perModelOutcomes,
      perProcessorOutcomes: partial.perProcessorOutcomes,
      retainedItems: partial.retainedItems,
      operator: partial.operator,
    };
    const contentHash = hashContent(body);
    const record: ProofRecord = {
      id: randomUUID(),
      ...partial,
      prevHash,
      contentHash: chainProofHash(prevHash, contentHash),
    };
    this.records.push(record);
    return record;
  }

  async getById(id: string): Promise<ProofRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }

  async exportProof(id: string): Promise<ProofRecord | null> {
    return this.getById(id);
  }

  async list(): Promise<ProofRecord[]> {
    return [...this.records];
  }

  verifyChain(): boolean {
    let prev: string | null = null;
    for (const record of this.records) {
      const body = {
        requestType: record.requestType,
        subjectIdHash: record.subjectIdHash,
        timestamp: record.timestamp,
        perModelOutcomes: record.perModelOutcomes,
        perProcessorOutcomes: record.perProcessorOutcomes,
        retainedItems: record.retainedItems,
        operator: record.operator,
      };
      const contentHash = hashContent(body);
      const expected = chainProofHash(prev, contentHash);
      if (record.contentHash !== expected || record.prevHash !== prev) {
        return false;
      }
      prev = record.contentHash;
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
