export type ErasureAction = "DELETE" | "REDACT" | "RETAIN";

export type LegalBasis =
  | "tax_retention"
  | "legal_hold"
  | "contract_obligation"
  | string;

export interface SubjectId {
  key: string;
  value: string;
}

export interface FieldDeclaration {
  action: ErasureAction;
  legalBasis?: LegalBasis;
}

export interface ModelDeclaration {
  fields?: Record<string, ErasureAction | FieldDeclaration>;
  action?: ErasureAction;
  legalBasis?: LegalBasis;
  parent?: string;
  cascade?: ErasureAction;
  subjectLink?: string;
}

export interface DataMapInput {
  subjectKey: string;
  /** Root entity model (e.g. "User"). Uses subjectIdField (default "id") when subjectLink is omitted. */
  subjectModel?: string;
  /** Field on subjectModel that holds the subject identifier. Default: "id" */
  subjectIdField?: string;
  models: Record<string, ModelDeclaration>;
  processors?: string[];
}

export interface DataMap extends DataMapInput {
  models: Record<string, Required<Pick<ModelDeclaration, "fields">> & ModelDeclaration>;
}

export interface SchemaColumn {
  name: string;
  isPersonal?: boolean;
}

export interface SchemaModel {
  name: string;
  columns: SchemaColumn[];
  foreignKeys?: Array<{ column: string; referencesModel: string }>;
}

export interface SchemaIntrospection {
  models: SchemaModel[];
}

export interface ModelPlan {
  model: string;
  action: ErasureAction;
  order: number;
  legalBasis?: LegalBasis;
  fields: Record<string, ErasureAction>;
}

export interface ErasurePlan {
  subject: SubjectId;
  models: ModelPlan[];
  processors: string[];
}

export interface ModelOutcome {
  model: string;
  action: ErasureAction;
  affected: number;
  retained?: number;
  legalBasis?: LegalBasis;
  status: "planned" | "completed" | "skipped" | "failed";
  error?: string;
}

export interface ProcessorOutcome {
  processorId: string;
  action: "erase" | "export";
  status: "planned" | "completed" | "skipped" | "failed" | "requires_separate_request";
  detail?: string;
  error?: string;
}

export interface ErasureReport {
  mode: "dry-run" | "execute";
  subjectHash: string;
  models: ModelOutcome[];
  processors: ProcessorOutcome[];
  retainedItems: Array<{ model: string; field?: string; legalBasis: LegalBasis; count: number }>;
}

export type RequestStatus = "open" | "fulfilled" | "overdue";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type JobType = "erasure" | "export";

export interface JobCheckpoint {
  models: Record<string, ModelOutcome>;
  processors: Record<string, ProcessorOutcome>;
}

export interface DsrJob {
  id: string;
  type: JobType;
  subjectHash: string;
  status: JobStatus;
  checkpoints: JobCheckpoint;
  proofId?: string;
  deadlineAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProofRecord {
  id: string;
  requestType: JobType;
  subjectIdHash: string;
  timestamp: string;
  perModelOutcomes: ModelOutcome[];
  perProcessorOutcomes: ProcessorOutcome[];
  retainedItems: ErasureReport["retainedItems"];
  operator?: string;
  prevHash: string | null;
  contentHash: string;
}

export interface IdentityVerification {
  verified: boolean;
  verifiedAt?: string;
  method?: string;
}

export interface VerificationResult {
  passed: boolean;
  residues: Array<{ model: string; field: string; count: number }>;
}

export interface ExportBundle {
  schemaVersion: "1.0";
  exportedAt: string;
  subjectHash: string;
  data: Record<string, unknown[]>;
  processors: Record<string, unknown | { requiresSeparateRequest: true; reason: string }>;
}

export interface ProcessorCapabilities {
  erase: boolean;
  export: boolean;
}

export interface ProcessorExport {
  processorId: string;
  data: unknown;
}

export type ExecutionMode = "dry-run" | "execute";

export interface ErasureOptions {
  mode?: ExecutionMode;
  operator?: string;
  batchSize?: number;
}

export interface ExportOptions {
  operator?: string;
  batchSize?: number;
}

export interface RequestRecord {
  id: string;
  type: JobType;
  subjectHash: string;
  status: RequestStatus;
  deadlineAt: Date;
  fulfilledAt?: Date;
  proofId?: string;
  createdAt: Date;
}

export type LifecycleStage =
  | "received"
  | "verified"
  | "dry-run"
  | "executed"
  | "post-verified"
  | "completed"
  | "failed";

export interface LifecycleEvent {
  stage: LifecycleStage;
  requestId: string;
  timestamp: string;
  detail?: string;
}
