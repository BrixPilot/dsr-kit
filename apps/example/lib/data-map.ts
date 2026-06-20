import { defineDataMap } from "@dsr-kit/core";

export const exampleDataMap = defineDataMap({
  subjectKey: "userId",
  subjectModel: "User",
  models: {
    User: {
      fields: { email: "REDACT", name: "REDACT" },
      action: "REDACT",
    },
    Profile: {
      parent: "User",
      fields: { bio: "REDACT", phone: "DELETE" },
      subjectLink: "userId",
    },
    Session: { parent: "User", cascade: "DELETE", subjectLink: "userId" },
    Order: { parent: "User", cascade: "DELETE", subjectLink: "userId" },
    Invoice: {
      fields: { amount: "RETAIN", taxId: "RETAIN" },
      legalBasis: "tax_retention_7y",
      subjectLink: "userId",
    },
  },
  processors: ["stripe", "resend"],
});
