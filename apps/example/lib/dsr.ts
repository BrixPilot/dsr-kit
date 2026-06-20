import { PrismaClient } from "@prisma/client";
import { createPrismaAdapter } from "@dsr-kit/adapter-prisma";
import { createStripeConnector } from "@dsr-kit/connector-stripe";
import { createResendConnector } from "@dsr-kit/connector-resend";
import {
  SubjectMutex,
  type ProofRecord,
  type ProofStore,
  type RequestRecord,
  type RequestStore,
  chainProofHash,
  hashContent,
  proofRecordBody,
} from "@dsr-kit/core";
import { createDsrHandler, type DsrRequest } from "@dsr-kit/next";
import { exampleDataMap } from "./data-map";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const proofAppendMutex = new SubjectMutex();

class PrismaProofStore implements ProofStore {
  async getLastHash(subjectIdHash: string): Promise<string | null> {
    const last = await prisma.dsrProof.findFirst({
      where: { subjectIdHash },
      orderBy: { id: "desc" },
    });
    return last?.contentHash ?? null;
  }

  async append(
    partial: Omit<ProofRecord, "id" | "prevHash" | "contentHash">,
  ): Promise<ProofRecord> {
    return proofAppendMutex.run(partial.subjectIdHash, () =>
      prisma.$transaction(
        async (tx) => {
          const last = await tx.dsrProof.findFirst({
            where: { subjectIdHash: partial.subjectIdHash },
            orderBy: { id: "desc" },
          });
          const prevHash = last?.contentHash ?? null;
          const contentHash = hashContent(proofRecordBody(partial));
          const record = await tx.dsrProof.create({
            data: {
              requestType: partial.requestType,
              subjectIdHash: partial.subjectIdHash,
              timestamp: new Date(partial.timestamp),
              perModelOutcomes: partial.perModelOutcomes,
              perProcessorOutcomes: partial.perProcessorOutcomes,
              retainedItems: partial.retainedItems,
              operator: partial.operator,
              prevHash,
              contentHash: chainProofHash(prevHash, contentHash),
            },
          });
          return {
            id: record.id,
            requestType: record.requestType as ProofRecord["requestType"],
            subjectIdHash: record.subjectIdHash,
            timestamp: record.timestamp.toISOString(),
            perModelOutcomes: record.perModelOutcomes as ProofRecord["perModelOutcomes"],
            perProcessorOutcomes:
              record.perProcessorOutcomes as ProofRecord["perProcessorOutcomes"],
            retainedItems: record.retainedItems as ProofRecord["retainedItems"],
            operator: record.operator ?? undefined,
            prevHash: record.prevHash,
            contentHash: record.contentHash,
          };
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  async getById(id: string) {
    const r = await prisma.dsrProof.findUnique({ where: { id } });
    if (!r) return null;
    return {
      id: r.id,
      requestType: r.requestType as ProofRecord["requestType"],
      subjectIdHash: r.subjectIdHash,
      timestamp: r.timestamp.toISOString(),
      perModelOutcomes: r.perModelOutcomes as ProofRecord["perModelOutcomes"],
      perProcessorOutcomes: r.perProcessorOutcomes as ProofRecord["perProcessorOutcomes"],
      retainedItems: r.retainedItems as ProofRecord["retainedItems"],
      operator: r.operator ?? undefined,
      prevHash: r.prevHash,
      contentHash: r.contentHash,
    };
  }

  async exportProof(id: string) {
    return this.getById(id);
  }

  async list() {
    const rows = await prisma.dsrProof.findMany({ orderBy: { id: "asc" } });
    return rows.map((r) => ({
      id: r.id,
      requestType: r.requestType as ProofRecord["requestType"],
      subjectIdHash: r.subjectIdHash,
      timestamp: r.timestamp.toISOString(),
      perModelOutcomes: r.perModelOutcomes as ProofRecord["perModelOutcomes"],
      perProcessorOutcomes: r.perProcessorOutcomes as ProofRecord["perProcessorOutcomes"],
      retainedItems: r.retainedItems as ProofRecord["retainedItems"],
      operator: r.operator ?? undefined,
      prevHash: r.prevHash,
      contentHash: r.contentHash,
    }));
  }
}

class PrismaRequestStore implements RequestStore {
  async create(partial: Omit<RequestRecord, "id" | "createdAt" | "status">) {
    const r = await prisma.dsrRequest.create({
      data: {
        type: partial.type,
        subjectHash: partial.subjectHash,
        status: "open",
        deadlineAt: partial.deadlineAt,
        proofId: partial.proofId,
      },
    });
    return {
      id: r.id,
      type: r.type as "erasure" | "export",
      subjectHash: r.subjectHash,
      status: r.status as "open" | "fulfilled" | "overdue",
      deadlineAt: r.deadlineAt,
      fulfilledAt: r.fulfilledAt ?? undefined,
      proofId: r.proofId ?? undefined,
      createdAt: r.createdAt,
    };
  }

  async update(id: string, patch: Partial<RequestRecord>) {
    const r = await prisma.dsrRequest.update({
      where: { id },
      data: {
        status: patch.status,
        fulfilledAt: patch.fulfilledAt,
        proofId: patch.proofId,
      },
    });
    return {
      id: r.id,
      type: r.type as "erasure" | "export",
      subjectHash: r.subjectHash,
      status: r.status as "open" | "fulfilled" | "overdue",
      deadlineAt: r.deadlineAt,
      fulfilledAt: r.fulfilledAt ?? undefined,
      proofId: r.proofId ?? undefined,
      createdAt: r.createdAt,
    };
  }

  async get(id: string) {
    const r = await prisma.dsrRequest.findUnique({ where: { id } });
    if (!r) return null;
    return {
      id: r.id,
      type: r.type as "erasure" | "export",
      subjectHash: r.subjectHash,
      status: r.status as "open" | "fulfilled" | "overdue",
      deadlineAt: r.deadlineAt,
      fulfilledAt: r.fulfilledAt ?? undefined,
      proofId: r.proofId ?? undefined,
      createdAt: r.createdAt,
    };
  }
}

const adapter = createPrismaAdapter({ prisma, dataMap: exampleDataMap });
const proofStore = new PrismaProofStore();
const requestStore = new PrismaRequestStore();

export const dsrHandlers = createDsrHandler({
  dataMap: exampleDataMap,
  adapter,
  proofStore,
  requestStore,
  processors: [
    createStripeConnector({ secretKey: process.env.STRIPE_SECRET_KEY }),
    // Suppression-only limits demo — not equivalent to Stripe erasure (see docs/GUARANTEES-AND-LIMITS.md)
    createResendConnector({ apiKey: process.env.RESEND_API_KEY }),
  ],
  identityVerify: async (req) => {
    const verified = req.headers.get("x-dsr-verified") === "true";
    return {
      verified,
      verifiedAt: verified ? new Date().toISOString() : undefined,
      method: verified ? "header-x-dsr-verified" : undefined,
    };
  },
});

export { exampleDataMap, adapter, proofStore, type DsrRequest };
