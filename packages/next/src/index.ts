import {
  IdentityNotVerifiedError,
  type DataMap,
  type ExportBundle,
  type ErasureReport,
  type IdentityVerification,
  type ProofStore,
  type RequestStore,
  type StorageAdapter,
  type SubjectId,
  createLifecycleEmitter,
  createProcessorRegistry,
  createRequest,
  getRequestStatus,
  markRequestFulfilled,
  runErasure,
  runExport,
  assertErasureVerified,
  type ProcessorConnector,
} from "@dsr-kit/core";

export type DsrRequest = Request;

export type IdentityVerifyFn = (
  req: DsrRequest,
  subject: SubjectId,
) => Promise<IdentityVerification>;

export const defaultIdentityVerify: IdentityVerifyFn = async () => ({
  verified: false,
});

export interface DsrHandlerConfig {
  dataMap: DataMap;
  adapter: StorageAdapter;
  proofStore: ProofStore;
  requestStore: RequestStore;
  processors?: ProcessorConnector[];
  identityVerify?: IdentityVerifyFn;
}

export interface DsrHandlers {
  handleErasure: (req: DsrRequest) => Promise<Response>;
  handleExport: (req: DsrRequest) => Promise<Response>;
  handleProof: (req: DsrRequest, proofId: string) => Promise<Response>;
  handleStatus: (req: DsrRequest, requestId: string) => Promise<Response>;
}

function parseSubject(req: DsrRequest): SubjectId {
  const url = new URL(req.url);
  const key = url.searchParams.get("subjectKey") ?? "userId";
  const value = url.searchParams.get("subjectValue");
  if (!value) {
    throw new Error("subjectValue query parameter is required");
  }
  return { key, value };
}

export function createDsrHandler(config: DsrHandlerConfig): DsrHandlers {
  const identityVerify = config.identityVerify ?? defaultIdentityVerify;
  const processors = createProcessorRegistry(config.processors ?? []);
  const lifecycle = createLifecycleEmitter();

  const engineBase = {
    dataMap: config.dataMap,
    adapter: config.adapter,
    processors,
    proofStore: config.proofStore,
  };

  return {
    async handleErasure(req) {
      const subject = parseSubject(req);
      const execute = new URL(req.url).searchParams.get("execute") === "true";
      const request = await createRequest(config.requestStore, "erasure", subject);
      lifecycle.emit("received", request.id);

      const verification = await identityVerify(req, subject);
      if (execute && !verification.verified) {
        throw new IdentityNotVerifiedError();
      }
      if (verification.verified) {
        lifecycle.emit("verified", request.id, verification.method);
      }

      const mode = execute ? "execute" : "dry-run";
      lifecycle.emit(mode === "dry-run" ? "dry-run" : "executed", request.id);

      const report: ErasureReport = await runErasure(engineBase, subject, {
        mode,
        operator: req.headers.get("x-dsr-operator") ?? undefined,
      });

      if (execute) {
        const verifyResult = await assertErasureVerified(
          config.dataMap,
          config.adapter,
          subject,
        );
        lifecycle.emit("post-verified", request.id, JSON.stringify(verifyResult));
        const proofs = await config.proofStore.list();
        const proof = proofs.at(-1);
        await markRequestFulfilled(config.requestStore, request.id, proof?.id);
        lifecycle.emit("completed", request.id);
      }

      return Response.json({ requestId: request.id, report });
    },

    async handleExport(req) {
      const subject = parseSubject(req);
      const request = await createRequest(config.requestStore, "export", subject);
      lifecycle.emit("received", request.id);

      const verification = await identityVerify(req, subject);
      if (!verification.verified) {
        throw new IdentityNotVerifiedError();
      }
      lifecycle.emit("verified", request.id, verification.method);

      const bundle: ExportBundle = await runExport(engineBase, subject, {
        operator: req.headers.get("x-dsr-operator") ?? undefined,
      });

      const proofs = await config.proofStore.list();
      const proof = proofs.at(-1);
      await markRequestFulfilled(config.requestStore, request.id, proof?.id);
      lifecycle.emit("completed", request.id);

      return Response.json({ requestId: request.id, bundle });
    },

    async handleProof(_req, proofId) {
      const proof = await config.proofStore.exportProof(proofId);
      if (!proof) {
        return Response.json({ error: "Proof not found" }, { status: 404 });
      }
      return Response.json(proof);
    },

    async handleStatus(_req, requestId) {
      const status = await getRequestStatus(config.requestStore, requestId);
      if (!status) {
        return Response.json({ error: "Request not found" }, { status: 404 });
      }
      const record = await config.requestStore.get(requestId);
      return Response.json({ requestId, status, deadlineAt: record?.deadlineAt });
    },
  };
}

export { defaultIdentityVerify as failClosedIdentityVerify };
