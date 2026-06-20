import { describe, expect, it, vi } from "vitest";
import { createStripeConnector } from "../index.js";

describe("stripe connector", () => {
  it("dry-run does not call API", async () => {
    const fetchFn = vi.fn();
    const connector = createStripeConnector({ fetchFn, secretKey: "sk_test" });
    const outcome = await connector.erase({ key: "userId", value: "u1" }, "dry-run");
    expect(outcome.status).toBe("planned");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("execute deletes matching customers", async () => {
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("customers?")) {
        return new Response(
          JSON.stringify({
            data: [{ id: "cus_1", metadata: { userId: "u1" } }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ id: "cus_1", deleted: true }), { status: 200 });
    });

    const connector = createStripeConnector({ fetchFn, secretKey: "sk_test" });
    const outcome = await connector.erase({ key: "userId", value: "u1" }, "execute");
    expect(outcome.status).toBe("completed");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
