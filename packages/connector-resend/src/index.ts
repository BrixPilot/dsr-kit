import type {
  ExecutionMode,
  ProcessorConnector,
  ProcessorExport,
  ProcessorOutcome,
  SubjectId,
} from "@dsr-kit/core";

export interface ResendConnectorConfig {
  apiKey?: string;
  fetchFn?: typeof fetch;
}

export function createResendConnector(config: ResendConnectorConfig = {}): ProcessorConnector {
  const fetchFn = config.fetchFn ?? fetch;

  return {
    id: "resend",

    capabilities() {
      return { erase: true, export: false };
    },

    async erase(subject: SubjectId, mode: ExecutionMode): Promise<ProcessorOutcome> {
      if (mode === "dry-run") {
        return {
          processorId: "resend",
          action: "erase",
          status: "planned",
          detail: `Would suppress Resend contact for ${subject.key}=${subject.value}`,
        };
      }

      if (!config.apiKey) {
        return {
          processorId: "resend",
          action: "erase",
          status: "skipped",
          detail: "RESEND_API_KEY not configured",
        };
      }

      if (subject.key !== "email") {
        return {
          processorId: "resend",
          action: "erase",
          status: "requires_separate_request",
          detail: "Resend erasure requires email identifier",
        };
      }

      try {
        const res = await fetchFn("https://api.resend.com/audiences/contacts", {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: subject.value }),
        });

        if (!res.ok && res.status !== 404) {
          throw new Error(`Resend API error: ${res.status}`);
        }

        return {
          processorId: "resend",
          action: "erase",
          status: "completed",
          detail: `Suppressed contact ${subject.value}`,
        };
      } catch (err) {
        return {
          processorId: "resend",
          action: "erase",
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async export(_subject: SubjectId, _mode: ExecutionMode): Promise<ProcessorExport | null> {
      return null;
    },
  };
}
