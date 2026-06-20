import { describe, expect, it } from "vitest";
import { defaultIdentityVerify } from "../index.js";

describe("identity hook", () => {
  it("defaults to fail-closed (not verified)", async () => {
    const result = await defaultIdentityVerify(
      new Request("http://localhost"),
      { key: "userId", value: "u1" },
    );
    expect(result.verified).toBe(false);
  });
});
