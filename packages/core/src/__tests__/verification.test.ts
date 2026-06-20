import { describe, expect, it } from "vitest";
import { defineDataMap } from "../data-map.js";
import { VerificationFailedError } from "../errors.js";
import { verifyErasure, assertErasureVerified } from "../verification.js";
import type { StorageAdapter } from "../adapter.js";

describe("verifyErasure", () => {
  const dataMap = defineDataMap({
    subjectKey: "userId",
    models: {
      User: { fields: { email: "DELETE" } },
    },
  });

  it("fails when residue remains", async () => {
    const adapter: StorageAdapter = {
      async introspectSchema() {
        return { models: [] };
      },
      async countBySubject() {
        return 0;
      },
      async deleteBySubject() {
        return { affected: 0, retained: 0 };
      },
      async redactBySubject() {
        return { affected: 0, retained: 0 };
      },
      async exportBySubject() {
        return [];
      },
      async findResidue() {
        return [{ model: "User", field: "email", count: 1 }];
      },
      async transaction(fn) {
        return fn();
      },
    };

    const result = await verifyErasure(dataMap, adapter, { key: "userId", value: "u1" });
    expect(result.passed).toBe(false);
    await expect(
      assertErasureVerified(dataMap, adapter, { key: "userId", value: "u1" }),
    ).rejects.toThrow(VerificationFailedError);
  });
});
