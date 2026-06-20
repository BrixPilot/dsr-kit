import { describe, expect, it } from "vitest";
import { defineDataMap, getSubjectLinkField } from "../data-map.js";
import { checkCoverage } from "../coverage.js";
import { buildErasurePlan, getDeletionOrder } from "../relation-graph.js";
import { InMemoryProofStore } from "../proof.js";
import { DataMapError } from "../errors.js";

describe("defineDataMap", () => {
  it("builds a valid data map", () => {
    const map = defineDataMap({
      subjectKey: "userId",
      models: {
        User: { fields: { email: "DELETE", name: "DELETE" }, action: "DELETE" },
        Invoice: {
          fields: { amount: "RETAIN" },
          legalBasis: "tax_retention_7y",
        },
        Session: { parent: "User", cascade: "DELETE" },
      },
      processors: ["stripe", "resend"],
    });
    expect(map.subjectKey).toBe("userId");
    expect(map.processors).toEqual(["stripe", "resend"]);
  });

  it("requires legalBasis for RETAIN fields", () => {
    expect(() =>
      defineDataMap({
        subjectKey: "userId",
        models: {
          Invoice: { fields: { amount: "RETAIN" } },
        },
      }),
    ).toThrow(DataMapError);
  });
});

describe("relation graph", () => {
  const map = defineDataMap({
    subjectKey: "userId",
    models: {
      User: { action: "DELETE" },
      Order: { parent: "User", cascade: "DELETE" },
      Session: { parent: "User", cascade: "DELETE" },
    },
  });

  it("orders children before parents for deletion", () => {
    const order = getDeletionOrder(map);
    expect(order.indexOf("Session")).toBeLessThan(order.indexOf("User"));
    expect(order.indexOf("Order")).toBeLessThan(order.indexOf("User"));
  });

  it("builds erasure plan with processors", () => {
    const plan = buildErasurePlan(map, { key: "userId", value: "u1" });
    expect(plan.models).toHaveLength(3);
    expect(plan.subject.value).toBe("u1");
  });
});

describe("coverage check", () => {
  it("flags undeclared personal column", () => {
    const map = defineDataMap({
      subjectKey: "userId",
      models: {
        User: { fields: { email: "DELETE" } },
      },
    });
    const gaps = checkCoverage(map, {
      models: [
        {
          name: "User",
          columns: [
            { name: "email", isPersonal: true },
            { name: "phone", isPersonal: true },
          ],
        },
      ],
    });
    expect(gaps.some((g: { message: string }) => g.message.includes("phone"))).toBe(true);
  });
});

describe("getSubjectLinkField", () => {
  it("uses id on subject model and subjectKey on children", () => {
    const map = defineDataMap({
      subjectKey: "userId",
      subjectModel: "User",
      models: {
        User: { fields: { email: "DELETE" } },
        Order: { parent: "User", subjectLink: "userId" },
      },
    });
    expect(getSubjectLinkField(map, "User")).toBe("id");
    expect(getSubjectLinkField(map, "Order")).toBe("userId");
  });
});

describe("proof store", () => {
  it("maintains hash chain integrity", async () => {
    const store = new InMemoryProofStore();
    await store.append({
      requestType: "erasure",
      subjectIdHash: "abc",
      timestamp: new Date().toISOString(),
      perModelOutcomes: [],
      perProcessorOutcomes: [],
      retainedItems: [],
    });
    await store.append({
      requestType: "erasure",
      subjectIdHash: "def",
      timestamp: new Date().toISOString(),
      perModelOutcomes: [],
      perProcessorOutcomes: [],
      retainedItems: [],
    });
    expect(store.verifyChain()).toBe(true);
  });
});
