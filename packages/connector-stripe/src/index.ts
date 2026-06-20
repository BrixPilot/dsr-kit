import type {
  ExecutionMode,
  ProcessorConnector,
  ProcessorExport,
  ProcessorOutcome,
  SubjectId,
} from "@dsr-kit/core";

export interface StripeConnectorConfig {
  secretKey?: string;
  fetchFn?: typeof fetch;
  metadataKey?: string;
}

interface StripeCustomer {
  id: string;
  email?: string | null;
  metadata?: Record<string, string>;
}

export function createStripeConnector(config: StripeConnectorConfig = {}): ProcessorConnector {
  const fetchFn = config.fetchFn ?? fetch;
  const metadataKey = config.metadataKey ?? "userId";

  async function findCustomers(subject: SubjectId): Promise<StripeCustomer[]> {
    if (!config.secretKey) return [];

    const params = new URLSearchParams({ limit: "10" });
    if (subject.key === "email") {
      params.set("email", subject.value);
    }

    const res = await fetchFn(`https://api.stripe.com/v1/customers?${params}`, {
      headers: { Authorization: `Bearer ${config.secretKey}` },
    });

    if (!res.ok) return [];

    const body = (await res.json()) as { data: StripeCustomer[] };
    return body.data.filter(
      (c) =>
        c.metadata?.[metadataKey] === subject.value ||
        (subject.key === "email" && c.email === subject.value),
    );
  }

  return {
    id: "stripe",

    capabilities() {
      return { erase: true, export: true };
    },

    async erase(subject: SubjectId, mode: ExecutionMode): Promise<ProcessorOutcome> {
      if (mode === "dry-run") {
        return {
          processorId: "stripe",
          action: "erase",
          status: "planned",
          detail: `Would delete Stripe customer identity for ${subject.key}=${subject.value}; billing/invoices marked RETAIN where legally required`,
        };
      }

      if (!config.secretKey) {
        return {
          processorId: "stripe",
          action: "erase",
          status: "skipped",
          detail: "STRIPE_SECRET_KEY not configured",
        };
      }

      try {
        const customers = await findCustomers(subject);
        for (const customer of customers) {
          await fetchFn(`https://api.stripe.com/v1/customers/${customer.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${config.secretKey}` },
          });
        }
        return {
          processorId: "stripe",
          action: "erase",
          status: "completed",
          detail: `Deleted ${customers.length} Stripe customer identity record(s); billing artifacts retained per legal hold`,
        };
      } catch (err) {
        return {
          processorId: "stripe",
          action: "erase",
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async export(subject: SubjectId, mode: ExecutionMode): Promise<ProcessorExport | null> {
      if (mode === "dry-run") return null;

      if (!config.secretKey) return null;

      const customers = await findCustomers(subject);
      return {
        processorId: "stripe",
        data: customers.map((c) => ({
          id: c.id,
          email: c.email,
          metadata: c.metadata,
        })),
      };
    },
  };
}
