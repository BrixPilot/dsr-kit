import { describe, expect, it } from "vitest";
import { defineDataMap } from "../data-map.js";
import { runErasure } from "../erasure.js";
import { InMemoryProofStore } from "../proof.js";
import type { StorageAdapter } from "../adapter.js";
import type { ErasureAction, SubjectId } from "../types.js";

function createMockAdapter(store: Record<string, Record<string, unknown>[]>): StorageAdapter {
  return {
    async introspectSchema() {
      return {
        models: Object.keys(store).map((name) => ({
          name,
          columns: Object.keys(store[name]?.[0] ?? {}).map((c) => ({ name: c })),
        })),
      };
    },
    async countBySubject(subject: SubjectId, model: string) {
      return (store[model] ?? []).filter((r) => r.userId === subject.value).length;
    },
    async deleteBySubject(subject: SubjectId, model: string) {
      const before = store[model]?.length ?? 0;
      store[model] = (store[model] ?? []).filter((r) => r.userId !== subject.value);
      return { affected: before - store[model].length, retained: 0 };
    },
    async redactBySubject(
      subject: SubjectId,
      model: string,
      fields: Record<string, ErasureAction>,
    ) {
      let affected = 0;
      for (const row of store[model] ?? []) {
        if (row.userId !== subject.value) continue;
        for (const [field, action] of Object.entries(fields)) {
          if (action === "REDACT") row[field] = "[redacted]";
        }
        affected++;
      }
      return { affected, retained: 0 };
    },
    async exportBySubject(subject: SubjectId, model: string, _fields: string[]) {
      return (store[model] ?? []).filter((r) => r.userId === subject.value);
    },
    async findResidue(subject: SubjectId, model: string, fields: string[]) {
      const rows = (store[model] ?? []).filter((r) => r.userId === subject.value);
      return fields
        .map((field: string) => ({
          model,
          field,
          count: rows.filter((r) => r[field] && r[field] !== "[redacted]").length,
        }))
        .filter((r: { count: number }) => r.count > 0);
    },
    async transaction<T>(fn: () => Promise<T>) {
      return fn();
    },
  };
}

describe("runErasure", () => {
  const dataMap = defineDataMap({
    subjectKey: "userId",
    models: {
      Session: { parent: "User", cascade: "DELETE", subjectLink: "userId" },
      User: { fields: { email: "DELETE", name: "DELETE" }, action: "DELETE" },
      Invoice: {
        fields: { amount: "RETAIN" },
        legalBasis: "tax_retention",
        subjectLink: "userId",
      },
    },
    processors: [],
  });

  it("dry-run reports counts without mutation", async () => {
    const store = {
      User: [{ id: "1", userId: "u1", email: "a@b.com", name: "A" }],
      Session: [{ id: "s1", userId: "u1", token: "t" }],
      Invoice: [{ id: "i1", userId: "u1", amount: 10 }],
    };
    const adapter = createMockAdapter(store);
    const report = await runErasure({ dataMap, adapter }, { key: "userId", value: "u1" });
    expect(report.mode).toBe("dry-run");
    expect(store.User).toHaveLength(1);
    expect(report.models.find((m) => m.model === "Session")?.affected).toBe(1);
    expect(report.retainedItems.some((r) => r.model === "Invoice")).toBe(true);
  });

  it("execute deletes and is idempotent", async () => {
    const store = {
      User: [{ id: "1", userId: "u1", email: "a@b.com", name: "A" }],
      Session: [{ id: "s1", userId: "u1", token: "t" }],
      Invoice: [{ id: "i1", userId: "u1", amount: 10 }],
    };
    const adapter = createMockAdapter(store);
    const proofStore = new InMemoryProofStore();

    await runErasure(
      { dataMap, adapter, proofStore },
      { key: "userId", value: "u1" },
      { mode: "execute" },
    );
    expect(store.User).toHaveLength(0);
    expect(store.Session).toHaveLength(0);
    expect(store.Invoice).toHaveLength(1);

    const second = await runErasure(
      { dataMap, adapter, proofStore },
      { key: "userId", value: "u1" },
      { mode: "execute" },
    );
    expect(second.models.every((m) => m.status === "skipped" || m.affected === 0)).toBe(true);
  });
});
