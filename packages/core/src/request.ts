import { randomUUID } from "node:crypto";
import type {
  DsrJob,
  JobCheckpoint,
  JobStatus,
  JobType,
  RequestRecord,
  RequestStatus,
  SubjectId,
} from "./types.js";
import { hashSubjectId } from "./hash.js";

const DEFAULT_DEADLINE_DAYS = 30;

export interface JobStore {
  create(job: Omit<DsrJob, "id" | "createdAt" | "updatedAt">): Promise<DsrJob>;
  update(id: string, patch: Partial<DsrJob>): Promise<DsrJob>;
  get(id: string): Promise<DsrJob | null>;
  listBySubjectHash(hash: string): Promise<DsrJob[]>;
}

export class InMemoryJobStore implements JobStore {
  private jobs = new Map<string, DsrJob>();

  async create(
    partial: Omit<DsrJob, "id" | "createdAt" | "updatedAt">,
  ): Promise<DsrJob> {
    const now = new Date();
    const job: DsrJob = {
      ...partial,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async update(id: string, patch: Partial<DsrJob>): Promise<DsrJob> {
    const existing = this.jobs.get(id);
    if (!existing) {
      throw new Error(`Job ${id} not found`);
    }
    const updated = { ...existing, ...patch, updatedAt: new Date() };
    this.jobs.set(id, updated);
    return updated;
  }

  async get(id: string): Promise<DsrJob | null> {
    return this.jobs.get(id) ?? null;
  }

  async listBySubjectHash(hash: string): Promise<DsrJob[]> {
    return [...this.jobs.values()].filter((j) => j.subjectHash === hash);
  }
}

export interface RequestStore {
  create(record: Omit<RequestRecord, "id" | "createdAt" | "status">): Promise<RequestRecord>;
  update(id: string, patch: Partial<RequestRecord>): Promise<RequestRecord>;
  get(id: string): Promise<RequestRecord | null>;
}

export class InMemoryRequestStore implements RequestStore {
  private requests = new Map<string, RequestRecord>();

  async create(
    partial: Omit<RequestRecord, "id" | "createdAt" | "status">,
  ): Promise<RequestRecord> {
    const record: RequestRecord = {
      ...partial,
      id: randomUUID(),
      status: computeRequestStatus(partial.deadlineAt, partial.fulfilledAt),
      createdAt: new Date(),
    };
    this.requests.set(record.id, record);
    return record;
  }

  async update(id: string, patch: Partial<RequestRecord>): Promise<RequestRecord> {
    const existing = this.requests.get(id);
    if (!existing) {
      throw new Error(`Request ${id} not found`);
    }
    const merged = { ...existing, ...patch };
    merged.status = computeRequestStatus(merged.deadlineAt, merged.fulfilledAt);
    this.requests.set(id, merged);
    return merged;
  }

  async get(id: string): Promise<RequestRecord | null> {
    const r = this.requests.get(id);
    if (!r) return null;
    return { ...r, status: computeRequestStatus(r.deadlineAt, r.fulfilledAt) };
  }
}

export function computeRequestStatus(
  deadlineAt: Date,
  fulfilledAt?: Date,
): RequestStatus {
  if (fulfilledAt) return "fulfilled";
  if (new Date() > deadlineAt) return "overdue";
  return "open";
}

export function defaultDeadline(days = DEFAULT_DEADLINE_DAYS): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function createRequest(
  store: RequestStore,
  type: JobType,
  subject: SubjectId,
  deadlineDays = DEFAULT_DEADLINE_DAYS,
): Promise<RequestRecord> {
  return store.create({
    type,
    subjectHash: hashSubjectId(subject),
    deadlineAt: defaultDeadline(deadlineDays),
  });
}

export async function getRequestStatus(
  store: RequestStore,
  requestId: string,
): Promise<RequestStatus | null> {
  const record = await store.get(requestId);
  return record?.status ?? null;
}

export async function markRequestFulfilled(
  store: RequestStore,
  requestId: string,
  proofId?: string,
): Promise<RequestRecord> {
  return store.update(requestId, {
    fulfilledAt: new Date(),
    proofId,
    status: "fulfilled",
  });
}

export function emptyCheckpoint(): JobCheckpoint {
  return { models: {}, processors: {} };
}

export async function createJob(
  jobStore: JobStore,
  type: JobType,
  subject: SubjectId,
  deadlineDays = DEFAULT_DEADLINE_DAYS,
): Promise<DsrJob> {
  return jobStore.create({
    type,
    subjectHash: hashSubjectId(subject),
    status: "pending" as JobStatus,
    checkpoints: emptyCheckpoint(),
    deadlineAt: defaultDeadline(deadlineDays),
  });
}
