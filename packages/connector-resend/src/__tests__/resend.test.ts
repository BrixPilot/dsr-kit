import { describe, expect, it, vi } from "vitest";
import { createResendConnector } from "../index.js";

describe("resend connector", () => {
  it("dry-run does not call API", async () => {
    const fetchFn = vi.fn();
    const connector = createResendConnector({ fetchFn, apiKey: "re_test" });
    const outcome = await connector.erase({ key: "email", value: "a@b.com" }, "dry-run");
    expect(outcome.status).toBe("planned");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
