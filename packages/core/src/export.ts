import type { StorageAdapter } from "./adapter.js";
import type { ProcessorConnectorRegistry } from "./connector.js";
import type {
  DataMap,
  ExportBundle,
  ExportOptions,
  SubjectId,
} from "./types.js";
import { getModelAction } from "./data-map.js";
import { hashSubjectId } from "./hash.js";
import type { ProofStore } from "./proof.js";

export interface ExportEngineConfig {
  dataMap: DataMap;
  adapter: StorageAdapter;
  processors?: ProcessorConnectorRegistry;
  proofStore?: ProofStore;
}

export async function runExport(
  config: ExportEngineConfig,
  subject: SubjectId,
  options: ExportOptions = {},
): Promise<ExportBundle> {
  const batchSize = options.batchSize ?? 100;
  const subjectHash = hashSubjectId(subject);
  const data: Record<string, unknown[]> = {};

  for (const [modelName] of Object.entries(config.dataMap.models)) {
    const { fields } = getModelAction(config.dataMap, modelName);
    const fieldNames = Object.keys(fields);
    if (fieldNames.length === 0) {
      const count = await config.adapter.countBySubject(subject, modelName);
      if (count > 0) {
        data[modelName] = await config.adapter.exportBySubject(
          subject,
          modelName,
          ["*"],
          { batchSize },
        );
      } else {
        data[modelName] = [];
      }
    } else {
      data[modelName] = await config.adapter.exportBySubject(
        subject,
        modelName,
        fieldNames,
        { batchSize },
      );
    }
  }

  const processors: ExportBundle["processors"] = {};
  for (const processorId of config.dataMap.processors ?? []) {
    const connector = config.processors?.get(processorId);
    if (!connector) {
      processors[processorId] = {
        requiresSeparateRequest: true,
        reason: `Processor "${processorId}" connector not registered`,
      };
      continue;
    }

    const caps = connector.capabilities();
    if (!caps.export) {
      processors[processorId] = {
        requiresSeparateRequest: true,
        reason: `Processor "${processorId}" does not support automated export`,
      };
      continue;
    }

    const result = await connector.export(subject, "execute");
    processors[processorId] = result?.data ?? {
      requiresSeparateRequest: true,
      reason: "No exportable data returned",
    };
  }

  const bundle: ExportBundle = {
    schemaVersion: "1.0",
    exportedAt: new Date(0).toISOString().replace(/T.*/, "T00:00:00.000Z"),
    subjectHash,
    data,
    processors,
  };

  // Deterministic timestamp for testing — use actual time in production via override
  bundle.exportedAt = new Date().toISOString();

  if (config.proofStore) {
    const { writeProofFromReport } = await import("./proof.js");
    await writeProofFromReport(
      config.proofStore,
      {
        mode: "execute",
        subjectHash,
        models: Object.entries(data).map(([model, rows]) => ({
          model,
          action: "RETAIN" as const,
          affected: rows.length,
          status: "completed" as const,
        })),
        processors: Object.keys(processors).map((processorId) => ({
          processorId,
          action: "export" as const,
          status: "completed" as const,
        })),
        retainedItems: [],
      },
      "export",
      options.operator,
    );
  }

  return bundle;
}

export function stableExportBundle(bundle: ExportBundle): ExportBundle {
  const sortedData: Record<string, unknown[]> = {};
  for (const key of Object.keys(bundle.data).sort()) {
    sortedData[key] = bundle.data[key];
  }
  return {
    ...bundle,
    exportedAt: "1970-01-01T00:00:00.000Z",
    data: sortedData,
  };
}
