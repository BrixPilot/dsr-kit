import type { StorageAdapter } from "./adapter.js";
import type { ProcessorConnectorRegistry } from "./connector.js";
import type {
  DataMap,
  ErasureOptions,
  ErasureReport,
  ExecutionMode,
  ModelOutcome,
  ProcessorOutcome,
  SubjectId,
} from "./types.js";
import { getModelAction } from "./data-map.js";
import { buildErasurePlan } from "./relation-graph.js";
import { hashSubjectId } from "./hash.js";
import type { JobStore } from "./request.js";
import type { ProofStore } from "./proof.js";
import { writeProofFromReport } from "./proof.js";
export interface ErasureEngineConfig {
  dataMap: DataMap;
  adapter: StorageAdapter;
  processors?: ProcessorConnectorRegistry;
  proofStore?: ProofStore;
  jobStore?: JobStore;
}

export async function runErasure(
  config: ErasureEngineConfig,
  subject: SubjectId,
  options: ErasureOptions = {},
): Promise<ErasureReport> {
  const mode: ExecutionMode = options.mode ?? "dry-run";
  const batchSize = options.batchSize ?? 100;
  const plan = buildErasurePlan(config.dataMap, subject);
  const subjectHash = hashSubjectId(subject);

  const models: ModelOutcome[] = [];
  const retainedItems: ErasureReport["retainedItems"] = [];

  let jobId: string | undefined;
  if (config.jobStore && mode === "execute") {
    const existingJobs = await config.jobStore.listBySubjectHash(subjectHash);
    const resumable = existingJobs.find(
      (j) => j.type === "erasure" && (j.status === "pending" || j.status === "running"),
    );
    if (resumable) {
      jobId = resumable.id;
      await config.jobStore.update(jobId, { status: "running" });
    }
  }

  const executeModel = async (modelPlan: (typeof plan.models)[number]): Promise<ModelOutcome> => {
    const { action, legalBasis, fields } = getModelAction(config.dataMap, modelPlan.model);

    if (action === "RETAIN") {
      const count = await config.adapter.countBySubject(subject, modelPlan.model);
      if (count > 0 && legalBasis) {
        retainedItems.push({
          model: modelPlan.model,
          legalBasis,
          count,
        });
      }
      return {
        model: modelPlan.model,
        action,
        affected: 0,
        retained: count,
        legalBasis,
        status: mode === "dry-run" ? "planned" : "skipped",
      };
    }

    const count = await config.adapter.countBySubject(subject, modelPlan.model);
    if (count === 0) {
      return {
        model: modelPlan.model,
        action,
        affected: 0,
        status: mode === "dry-run" ? "planned" : "skipped",
      };
    }

    if (mode === "dry-run") {
      const retainCount =
        action === "REDACT"
          ? 0
          : Object.values(fields).filter((f) => f === "RETAIN").length > 0
            ? count
            : 0;
      if (retainCount > 0 && legalBasis) {
        retainedItems.push({ model: modelPlan.model, legalBasis, count: retainCount });
      }
      return {
        model: modelPlan.model,
        action,
        affected: count - retainCount,
        retained: retainCount,
        legalBasis,
        status: "planned",
      };
    }

    try {
      let result: { affected: number; retained: number };
      if (action === "REDACT" || Object.values(fields).includes("REDACT")) {
        result = await config.adapter.redactBySubject(
          subject,
          modelPlan.model,
          fields,
          { batchSize },
        );
      } else {
        result = await config.adapter.deleteBySubject(subject, modelPlan.model, { batchSize });
      }

      if (result.retained > 0 && legalBasis) {
        retainedItems.push({
          model: modelPlan.model,
          legalBasis,
          count: result.retained,
        });
      }

      const outcome: ModelOutcome = {
        model: modelPlan.model,
        action,
        affected: result.affected,
        retained: result.retained,
        legalBasis,
        status: "completed",
      };

      if (jobId && config.jobStore) {
        const job = await config.jobStore.get(jobId);
        if (job) {
          job.checkpoints.models[modelPlan.model] = outcome;
          await config.jobStore.update(jobId, { checkpoints: job.checkpoints });
        }
      }

      return outcome;
    } catch (err) {
      return {
        model: modelPlan.model,
        action,
        affected: 0,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const runModels = async () => {
    for (const modelPlan of plan.models) {
      if (jobId && config.jobStore) {
        const job = await config.jobStore.get(jobId);
        if (job?.checkpoints.models[modelPlan.model]?.status === "completed") {
          models.push(job.checkpoints.models[modelPlan.model]);
          continue;
        }
      }
      models.push(await executeModel(modelPlan));
    }
  };

  if (mode === "execute") {
    await config.adapter.transaction(runModels);
  } else {
    await runModels();
  }

  const processors: ProcessorOutcome[] = [];
  for (const processorId of plan.processors) {
    const connector = config.processors?.get(processorId);
    if (!connector) {
      processors.push({
        processorId,
        action: "erase",
        status: mode === "dry-run" ? "planned" : "failed",
        error: `Processor connector "${processorId}" not registered`,
      });
      continue;
    }

    const outcome = await connector.erase(subject, mode);
    processors.push(outcome);

    if (jobId && config.jobStore) {
      const job = await config.jobStore.get(jobId);
      if (job) {
        job.checkpoints.processors[processorId] = outcome;
        await config.jobStore.update(jobId, { checkpoints: job.checkpoints });
      }
    }
  }

  const report: ErasureReport = {
    mode,
    subjectHash,
    models,
    processors,
    retainedItems,
  };

  if (mode === "execute" && config.proofStore) {
    await writeProofFromReport(config.proofStore, report, "erasure", options.operator);
  }

  if (jobId && config.jobStore) {
    const hasFailure =
      models.some((m) => m.status === "failed") ||
      processors.some((p) => p.status === "failed");
    await config.jobStore.update(jobId, {
      status: hasFailure ? "failed" : "completed",
    });
  }

  return report;
}
