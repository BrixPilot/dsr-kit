import type {
  ExecutionMode,
  ProcessorCapabilities,
  ProcessorExport,
  ProcessorOutcome,
  SubjectId,
} from "./types.js";

export interface ProcessorConnector {
  readonly id: string;
  capabilities(): ProcessorCapabilities;
  erase(subject: SubjectId, mode: ExecutionMode): Promise<ProcessorOutcome>;
  export(subject: SubjectId, mode: ExecutionMode): Promise<ProcessorExport | null>;
}

export interface ProcessorConnectorRegistry {
  get(id: string): ProcessorConnector | undefined;
  list(): ProcessorConnector[];
}

export function createProcessorRegistry(
  connectors: ProcessorConnector[],
): ProcessorConnectorRegistry {
  const map = new Map(connectors.map((c) => [c.id, c]));
  return {
    get: (id) => map.get(id),
    list: () => [...connectors],
  };
}
