import type {
  ErasureAction,
  SchemaIntrospection,
  SubjectId,
} from "./types.js";

export interface BatchResult {
  affected: number;
  retained: number;
}

export interface ResidueMatch {
  model: string;
  field: string;
  count: number;
}

export interface RedactSentinels {
  string?: string;
  email?: string;
  number?: number;
}

export interface StorageAdapter {
  introspectSchema(): Promise<SchemaIntrospection>;

  countBySubject(subject: SubjectId, model: string): Promise<number>;

  deleteBySubject(
    subject: SubjectId,
    model: string,
    options?: { batchSize?: number },
  ): Promise<BatchResult>;

  redactBySubject(
    subject: SubjectId,
    model: string,
    fields: Record<string, ErasureAction>,
    options?: { batchSize?: number; sentinels?: RedactSentinels },
  ): Promise<BatchResult>;

  exportBySubject(
    subject: SubjectId,
    model: string,
    fields: string[],
    options?: { batchSize?: number },
  ): Promise<Record<string, unknown>[]>;

  findResidue(
    subject: SubjectId,
    model: string,
    fields: string[],
  ): Promise<ResidueMatch[]>;

  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
