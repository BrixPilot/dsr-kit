# Guarantees & Limits

This document states precisely what dsr-kit does, what it deliberately does **not** do, and
where the boundaries of your responsibility begin. It is written to be read by a skeptical
engineer or auditor *before* trusting the tool. If anything here reads as a hedge, that is
intentional — overclaiming on a deletion/compliance tool is worse than underclaiming, because
it produces false confidence in a legal obligation.

> **This is not legal advice and not a guarantee of GDPR compliance.** dsr-kit is engineering
> tooling for implementing data-subject-rights workflows. Your compliance obligations depend on
> your data, your jurisdiction, and counsel you should consult independently.

---

## 1. What dsr-kit guarantees

Within the scope of the **primary database** (Prisma/Postgres) and **registered processor
connectors**, and only for data described in your data map, dsr-kit guarantees:

- **Explicitness.** Nothing is acted on unless it is declared in the data map. The map is plain,
  reviewable TypeScript — your auditable source of truth.
- **Safe by default.** The first run is a dry-run that mutates nothing and makes no processor
  calls. Execution requires an explicit `execute` flag *and* a passing identity check.
- **Relation-correct order.** Deletions follow a topologically sorted relation graph so
  referential integrity is preserved.
- **Honored retention.** `RETAIN` items are never deleted; the reason (`legalBasis`) is recorded
  in the proof.
- **Per-subject tamper-evident proof.** Proof records are hash-chained **per subject** (not one
  global chain), appended under per-subject serialization, and contain no raw personal data.
- **Scoped verification.** After execution, the mapped non-`RETAIN` surface in the primary store
  is re-scanned; residue causes a loud failure, not a silent pass.
- **Idempotent re-runs (best effort).** Re-executing erasure converges toward the declared end
  state when rows are already deleted or redacted — but see §7 for crash limits.

---

## 2. The anonymization vs. pseudonymization distinction (read this first)

dsr-kit's field action is named **`REDACT`**, not "anonymize", and the difference is legal, not
cosmetic.

`REDACT` replaces a field's value with a non-identifying sentinel (or null). If your records
still contain a stable identifier (a user id, a foreign key), or quasi-identifiers (IP address,
precise timestamps, device data, behavioral rows that can be linked back), then the result is
**pseudonymized**, and **pseudonymized data is still personal data under GDPR**.

dsr-kit does **not** perform legal anonymization. Achieving true anonymization requires removing
or generalizing quasi-identifiers across your *whole* dataset — a data-modeling decision only you
can make. Use `DELETE` where you need data gone; use `REDACT` knowingly, understanding it is a
risk-reduction step, not a compliance endpoint.

---

## 3. Data beyond the primary store

Personal data routinely lives outside your application database. dsr-kit's automatic handling in
the OSS core covers **only the primary database and registered processor connectors**.

The following are **declarable** in the data map as `OUT_OF_BAND` / `MANUAL` so they appear in the
plan and the proof — but dsr-kit does **not** erase them for you:

- application logs and log aggregators
- caches (e.g. Redis) and CDNs
- search indexes (e.g. Elasticsearch/OpenSearch)
- analytics and data warehouses
- object/file storage
- **database backups and read replicas**

On **backups specifically**, the widely accepted position is that backups are not subject to
immediate erasure provided you operate a documented policy to suppress restored data and to let
backups age out on a defined rotation. dsr-kit records the declared out-of-band sinks in the
proof so your process is visible; it does not implement that policy for you. Silently ignoring
these sinks would be a credibility failure — declaring them honestly is the point.

---

## 4. Coverage is structural, not semantic

The coverage check compares your declared data map against the introspected database schema and
fails when a table or column is undeclared. This catches the most common real-world mistake: a
forgotten table.

It **cannot** detect personal data hiding *inside* untyped columns — an email in a `metadata`
JSONB blob, PII in a free-text `notes` field, identifiers in an array column. Such columns are
flagged "review manually." Coverage tells you the map is *structurally* complete; it cannot tell
you it is *semantically* complete. That judgment is yours.

---

## 5. Verification scope

The post-erasure verification pass re-scans the **mapped, non-`RETAIN` fields in the primary
store** at the moment it runs. It does **not** assert anything about:

- read replicas (which may lag) or backups
- third-party processors (whose deletion may be asynchronous on their side)
- out-of-band sinks
- data in untyped columns it cannot see (see §4)

A green verification means "the mapped primary-store surface is clean now," nothing wider.

---

## 6. Processor erasure is bounded

Processor connectors can only do what each provider's API permits, and they honor `RETAIN`. Two
consequences:

- **Bounded by the provider.** If a processor's API only suppresses rather than deletes, or
  retains data in immutable logs, dsr-kit cannot do better than the API allows. The reference
  Resend connector is suppression-only for exactly this reason and is included to demonstrate the
  limit, not to imply deletion.
- **Bounded by law.** Some processor data must be kept — e.g. billing records held for financial
  retention. The Stripe connector therefore deletes/redacts the customer identity where permitted
  but marks legally-retained billing data as `RETAIN` with a recorded basis. "Erase" never means
  "delete data you are legally required to keep."

---

## 7. Atomicity, crashes, and resumability (v0.1 limit)

Local database changes and external processor calls **cannot be atomic** — you cannot roll back a
third-party deletion inside a database transaction. In v0.1:

- **Primary-store steps** run inside a per-request database transaction (all mapped models in one
  transaction callback).
- **Processor steps** run **after** that transaction completes (verified in tests).

**There is no durable step ledger in v0.1.** If a run crashes after some models are deleted or
after Stripe is called but before proof is written, there is no persisted checkpoint to resume
from — only a partial deletion and a possible proof gap. Re-running erasure is idempotent at the
row level (already-deleted rows are skipped), but that is not the same as saga-style resumability.
Treat v0.1 as suitable for controlled execution; do not rely on it for crash-safe, auditable
recovery until a step ledger lands in a future release.

---

## 8. Proof is tamper-evident, not tamper-proof

Proof records are hash-chained (per subject) and contain no raw PII, so undetected modification of
the chain is hard. But by default they live in your own database, which a sufficiently privileged
operator could rewrite. For higher assurance, point the pluggable `ProofStore` at an append-only
or external store. dsr-kit gives you tamper-*evidence*; it does not make your database immutable.

---

## 9. Your responsibilities

dsr-kit is a tool; the obligation remains yours. You are responsible for:

- keeping the data map accurate and current as your schema evolves (run coverage in CI)
- the semantic completeness the coverage check cannot provide (§4)
- implementing real identity verification (the default hook is fail-closed and returns
  `verified: false`)
- handling out-of-band sinks and backups per your documented policy (§3)
- the legal interpretation of your retention bases and erasure obligations — with counsel

---

## 10. GDPR article mapping

| Capability | Articles |
|------------|----------|
| Right to erasure ("right to be forgotten") | Art. 17 |
| Retention exceptions (legal obligation, etc.) | Art. 17(3) |
| Right of access | Art. 15 |
| Data portability | Art. 20 |
| Response deadline tracking (one month) | Art. 12(3) |

This mapping describes which workflows the tooling supports. It does not assert that using
dsr-kit satisfies these articles for your organization.

---

## 11. Scope of the OSS core

The open-source core covers **GDPR data subject rights only** (erasure, access, portability) for
**Next.js + Prisma + Postgres**. Other regulations (CCPA/CPRA, SOC 2 evidence, EU AI Act),
hosted DSR portals, audit-PDF generation, long-tail processor connectors, and the ongoing
"stay-current" updates layer are out of scope for the OSS core.

---

*Found a gap or an overclaim in this document? That is a security-relevant issue — please report
it per [SECURITY.md](../SECURITY.md). Honesty about limits is a feature here, and we treat
inaccuracies in it as bugs.*
