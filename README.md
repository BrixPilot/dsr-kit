# dsr-kit

**GDPR Data Subject Rights Kit** — auditable erasure, access/export, and proof-of-compliance for Next.js + Prisma apps.

[![CI](https://github.com/BrixPilot/dsr-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/BrixPilot/dsr-kit/actions/workflows/ci.yml)

> **This is not legal advice.** dsr-kit provides engineering tooling to help implement GDPR data subject rights workflows. Consult qualified counsel for compliance obligations specific to your organization.
>
> **Read first:** [Guarantees and limits](docs/GUARANTEES-AND-LIMITS.md) · [Threat model](docs/threat-model.md)

## What it guarantees

- **Declarative data map** — every personal-data location is explicit, reviewable TypeScript config
- **Dry-run by default** — first erasure reports what would happen; no silent mutations
- **Correct cascades** — relation-aware deletion order; delete vs redact vs retain
- **Legal-hold / retention** — RETAIN items are never deleted; reason recorded in proof
- **Processor propagation** — pluggable connectors; erasure never deletes data you are legally required to keep
- **Tamper-evident proof** — per-subject hash chains with serialized append; no raw PII
- **Post-erasure verification** — re-scan fails loudly if personal data residue remains on mapped primary-store fields
- **Identity gate** — erasure/export blocked until integrator confirms requester identity
- **Coverage check** — build/test warns on undeclared personal-data columns (structural, not semantic)

`REDACT` replaces field values with sentinels — **pseudonymization, not legal anonymization**. See [Guarantees and limits](docs/GUARANTEES-AND-LIMITS.md).

## What it does NOT do

- Provide legal advice or guarantee GDPR compliance
- Replace a hosted DSR portal, audit PDF reports, or evidence platforms (Vanta/Drata)
- Cover regulations beyond GDPR DSR in the OSS core (CCPA, SOC2, AI Act → commercial layer)
- Phone home or require external SaaS accounts
- Treat `REDACT` as legal anonymization — replacing email/name with a sentinel while a stable `userId` remains is still personal data under GDPR
- Auto-erasure outside declared paths — coverage is **primary store + registered processors**; logs, caches, search, analytics/warehouse, and backups/replicas are declarable but not auto-erased
- Semantic PII detection — the coverage check is **structural** (model/column names), not content-aware; it will not see PII inside JSON/text columns
- Prove every copy is gone — verification covers the **mapped primary-store surface only**
- **Resume across crashes** — v0.1 has no durable step ledger; a mid-run failure may leave partial deletion without proof (see [Guarantees §7](docs/GUARANTEES-AND-LIMITS.md#7-atomicity-crashes-and-resumability-v01-limit))

Full limits: [docs/GUARANTEES-AND-LIMITS.md](docs/GUARANTEES-AND-LIMITS.md)

## Tests and CI

Destructive paths are covered by Vitest suites in `packages/*` (dry-run zero-mutation, per-subject proof-chain concurrency, RETAIN, idempotent re-run, processor dry-run). Run locally:

```bash
npm run build && npm test
```

CI runs the same on push via [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (Postgres service + full package test matrix).

## GDPR article mapping

| Feature | Articles |
|---------|----------|
| Right to erasure | Art. 17 |
| Right of access | Art. 15 |
| Data portability | Art. 20 |
| Response deadline tracking | Art. 12(3) |

## Try the demo app

The repo includes a runnable example at [`apps/example`](apps/example) — a Next.js + Prisma app with a small UI and API routes. Use this to explore dsr-kit before wiring it into your own app.

```bash
# 1. Clone and install
git clone git@github.com:BrixPilot/dsr-kit.git && cd dsr-kit
npm install

# 2. Start Postgres
docker compose up -d

# 3. Set up the demo database
cp apps/example/.env.example apps/example/.env
npm run build
cd apps/example && npx prisma db push && npm run db:seed

# 4. Start the demo UI
cd .. && npm run dev:example
# open http://localhost:3000 — paste the User id printed by db:seed

# 5. Or call the API directly (dry-run first — no mutations)
curl -X POST "http://localhost:3000/api/dsr/erasure?subjectValue=USER_ID_FROM_SEED"

# Execute only after identity verification
curl -X POST "http://localhost:3000/api/dsr/erasure?subjectValue=USER_ID&execute=true" \
  -H "x-dsr-verified: true"
```

The demo uses `x-dsr-verified: true` as a stand-in identity check. **Do not use that in production** — implement real verification (see below).

Run the demo coverage check (validates the example data map against its schema):

```bash
npm run coverage
```

---

## Use in your project

dsr-kit ships as npm workspace packages. In a **Next.js App Router + Prisma + Postgres** app:

### 1. Install packages

```bash
npm install @dsr-kit/core @dsr-kit/adapter-prisma @dsr-kit/next
# optional processor connectors
npm install @dsr-kit/connector-stripe @dsr-kit/connector-resend
```

### 2. Declare your data map

Create a TypeScript config listing every model/column that holds personal data, and what happens on erasure. This is the auditable source of truth — review it like any other security-sensitive config.

**Action precedence:** declared field actions win; undeclared columns inherit the model `action`; if every field is `RETAIN`, the model is `RETAIN`. Details in [Guarantees and limits](docs/GUARANTEES-AND-LIMITS.md#data-map-action-precedence).

```typescript
// lib/dsr/data-map.ts
import { defineDataMap } from "@dsr-kit/core";

export const dataMap = defineDataMap({
  subjectKey: "userId",       // FK column on child tables
  subjectModel: "User",       // root entity — matched by `id`
  models: {
    User: {
      fields: { email: "REDACT", name: "REDACT" },
      action: "REDACT",        // pseudonymization — NOT legal anonymization
    },
    Session: { parent: "User", cascade: "DELETE", subjectLink: "userId" },
    Invoice: {
      fields: { amount: "RETAIN", taxId: "RETAIN" },
      legalBasis: "tax_retention_7y",
      subjectLink: "userId",
    },
  },
  processors: ["stripe", "resend"],
});
```

See [`apps/example/lib/data-map.ts`](apps/example/lib/data-map.ts) for a full example.

### 3. Wire the Prisma adapter

```typescript
// lib/dsr/adapter.ts
import { PrismaClient } from "@prisma/client";
import { createPrismaAdapter } from "@dsr-kit/adapter-prisma";
import { dataMap } from "./data-map";

const prisma = new PrismaClient();

export const adapter = createPrismaAdapter({ prisma, dataMap });
```

### 4. Add proof + request storage

Proof records must be persisted (hash-chained, no raw PII). The demo stores them in Postgres — copy the `DsrProof` and `DsrRequest` models from [`apps/example/prisma/schema.prisma`](apps/example/prisma/schema.prisma) and implement `ProofStore` / `RequestStore`, or see [`apps/example/lib/dsr.ts`](apps/example/lib/dsr.ts) for a working implementation.

For local prototyping only, `@dsr-kit/core` exports `InMemoryProofStore` and `InMemoryRequestStore`.

### 5. Register processor connectors (optional)

**Stripe** — reference connector with meaningful erasure (customer identity deleted; billing artifacts retained where legally required).

**Resend** — reference connector demonstrating **limits**: send logs are immutable; only future suppression is possible. Not parity with Stripe — included to show honest processor boundaries.

Erasure never means deleting data you are legally required to keep — connectors mark RETAIN items in the proof, same as the primary store.

```typescript
import { createStripeConnector } from "@dsr-kit/connector-stripe";
import { createResendConnector } from "@dsr-kit/connector-resend";

const processors = [
  createStripeConnector({ secretKey: process.env.STRIPE_SECRET_KEY }),
  createResendConnector({ apiKey: process.env.RESEND_API_KEY }), // suppression-only demo
];
```

Connectors are no-ops in dry-run mode — outbound API calls only happen on execute.

### 6. Create route handlers

```typescript
// lib/dsr/handlers.ts
import { createDsrHandler } from "@dsr-kit/next";
import { createStripeConnector } from "@dsr-kit/connector-stripe";
import { createResendConnector } from "@dsr-kit/connector-resend";
import { adapter } from "./adapter";
import { dataMap } from "./data-map";
import { proofStore, requestStore } from "./stores";

export const dsrHandlers = createDsrHandler({
  dataMap,
  adapter,
  proofStore,
  requestStore,
  processors: [
    createStripeConnector({ secretKey: process.env.STRIPE_SECRET_KEY }),
    createResendConnector({ apiKey: process.env.RESEND_API_KEY }),
  ],
  identityVerify: async (req, subject) => {
    // REQUIRED: verify the requester before execute/export.
    // Return { verified: false } until your auth flow confirms identity.
    const session = await getSession(req);
    return {
      verified: session?.userId === subject.value,
      verifiedAt: new Date().toISOString(),
      method: "session",
    };
  },
});
```

Wire into App Router routes:

```typescript
// app/api/dsr/erasure/route.ts
import { dsrHandlers } from "@/lib/dsr/handlers";

export async function POST(req: Request) {
  return dsrHandlers.handleErasure(req);
}
```

Add matching routes for export, proof, and status — see [`apps/example/app/api/dsr/`](apps/example/app/api/dsr/).

### 7. Dry-run first, then execute

| Action | Request |
|--------|---------|
| Dry-run erasure (default, safe) | `POST /api/dsr/erasure?subjectValue=<user-id>` |
| Execute erasure | `POST /api/dsr/erasure?subjectValue=<user-id>&execute=true` + verified identity |
| Export personal data | `POST /api/dsr/export?subjectValue=<user-id>` + verified identity |
| Export proof record | `GET /api/dsr/proof/<proof-id>` |
| Request deadline status | `GET /api/dsr/status/<request-id>` |

**Always dry-run first.** Execution requires your `identityVerify` hook to return `{ verified: true }`. Export always requires verification.

### 8. Run the coverage check in CI

Compare your data map against your Prisma schema so undeclared personal-data columns fail at build/test time. Adapt [`apps/example/scripts/coverage-check.ts`](apps/example/scripts/coverage-check.ts) for your schema and add it to CI. Remember: structural check only — see [limits](docs/GUARANTEES-AND-LIMITS.md#coverage-check-structural-not-semantic).

---

## Packages

| Package | Purpose |
|---------|---------|
| `@dsr-kit/core` | Engine, data map, erasure, export, proof |
| `@dsr-kit/adapter-prisma` | Prisma + Postgres adapter |
| `@dsr-kit/connector-stripe` | Stripe customer erasure (billing RETAIN where required) |
| `@dsr-kit/connector-resend` | Resend suppression-only limits demo (not full erasure) |
| `@dsr-kit/next` | Next.js App Router handlers |

## Reference implementation

[`apps/example`](apps/example) is the canonical integration: data map, Prisma adapter, proof/request stores, API routes, and coverage script. Start there when wiring dsr-kit into your app.

## License

Apache-2.0 — see [LICENSE](LICENSE).
