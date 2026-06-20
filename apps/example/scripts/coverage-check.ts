import { assertCoverage } from "@dsr-kit/core";
import { adapter, exampleDataMap } from "../lib/dsr";

async function main() {
  const schema = await adapter.introspectSchema();
  const personalColumns = {
    User: ["email", "name"],
    Profile: ["bio", "phone"],
  };

  try {
    assertCoverage(exampleDataMap, schema, { personalColumns });
    console.log("Coverage check passed.");
    process.exit(0);
  } catch (err) {
    console.error("Coverage check failed:", err);
    process.exit(1);
  }
}

main();
