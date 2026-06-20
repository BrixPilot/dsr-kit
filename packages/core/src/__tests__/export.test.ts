import { describe, expect, it } from "vitest";
import { defineDataMap } from "../data-map.js";
import { runExport, stableExportBundle } from "../export.js";
import type { StorageAdapter, SubjectId } from "../types.js";

function mockAdapter(data: Record<string, unknown[]>): StorageAdapter {
  return {
    async introspectSchema() {
      return { models: [] };
    },
    async countBySubject(subject, model) {
      return (data[model] ?? []).filter((r) => (r as { userId: string }).userId === subject.value).length;
    },
    async deleteBySubject() {
      return { affected: 0, retained: 0 };
    },
    async redactBySubject() {
      return { affected: 0, retained: 0 };
    },
    async exportBySubject(subject: SubjectId, model: string) {
      return (data[model] ?? []).filter(
        (r) => (r as { userId: string }).userId === subject.value,
      ) as Record<string, unknown>[];
    },
    async findResidue() {
      return [];
    },
    async transaction(fn) {
      return fn();
    },
  };
}

describe("runExport", () => {
  it("produces deterministic stable bundle", async () => {
    const dataMap = defineDataMap({
      subjectKey: "userId",
      models: {
        User: { fields: { email: "DELETE", name: "DELETE" } },
        Order: { parent: "User", fields: { product: "DELETE" }, subjectLink: "userId" },
      },
      processors: ["resend"],
    });

    const adapter = mockAdapter({
      User: [{ userId: "u1", email: "a@b.com", name: "A" }],
      Order: [{ userId: "u1", product: "Pro" }],
    });

    const bundle = await runExport({ dataMap, adapter }, { key: "userId", value: "u1" });
    const stable = stableExportBundle(bundle);

    expect(stable.schemaVersion).toBe("1.0");
    expect(stable.data.Order).toHaveLength(1);
    expect(stable.processors.resend).toEqual({
      requiresSeparateRequest: true,
      reason: 'Processor "resend" connector not registered',
    });
  });
});
