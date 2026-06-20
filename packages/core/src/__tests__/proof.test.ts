import { describe, expect, it } from "vitest";
import { InMemoryProofStore } from "../proof.js";

describe("InMemoryProofStore", () => {
  it("maintains independent per-subject chains", async () => {
    const store = new InMemoryProofStore();
    const first = await store.append({
      requestType: "erasure",
      subjectIdHash: "subject-a",
      timestamp: "2026-01-01T00:00:00.000Z",
      perModelOutcomes: [],
      perProcessorOutcomes: [],
      retainedItems: [],
    });
    const second = await store.append({
      requestType: "erasure",
      subjectIdHash: "subject-b",
      timestamp: "2026-01-01T00:00:01.000Z",
      perModelOutcomes: [],
      perProcessorOutcomes: [],
      retainedItems: [],
    });
    expect(first.prevHash).toBeNull();
    expect(second.prevHash).toBeNull();
    expect(store.verifyChain()).toBe(true);
  });

  it("links consecutive proofs for the same subject", async () => {
    const store = new InMemoryProofStore();
    const a = await store.append({
      requestType: "erasure",
      subjectIdHash: "subject-a",
      timestamp: "2026-01-01T00:00:00.000Z",
      perModelOutcomes: [],
      perProcessorOutcomes: [],
      retainedItems: [],
    });
    const b = await store.append({
      requestType: "export",
      subjectIdHash: "subject-a",
      timestamp: "2026-01-01T00:00:01.000Z",
      perModelOutcomes: [],
      perProcessorOutcomes: [],
      retainedItems: [],
    });
    expect(b.prevHash).toBe(a.contentHash);
    expect(store.verifyChain("subject-a")).toBe(true);
  });

  it("serializes concurrent appends for the same subject", async () => {
    const store = new InMemoryProofStore();
    const subjectIdHash = "concurrent-subject";
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.append({
          requestType: "erasure",
          subjectIdHash,
          timestamp: `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
          perModelOutcomes: [{ model: "User", action: "DELETE", affected: 1, status: "completed" }],
          perProcessorOutcomes: [],
          retainedItems: [],
        }),
      ),
    );
    expect(store.verifyChain(subjectIdHash)).toBe(true);
    const listed = (await store.list()).filter((r) => r.subjectIdHash === subjectIdHash);
    expect(listed).toHaveLength(20);
    for (let i = 1; i < listed.length; i++) {
      expect(listed[i].prevHash).toBe(listed[i - 1].contentHash);
    }
  });
});
