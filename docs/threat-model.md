# Threat Model

This threat model covers dsr-kit's destructive and data-handling operations. Because the tool
deletes and exports personal data and produces proof relied on for a legal obligation, the threats
that matter most are: erasing or exporting the *wrong* subject, *incomplete* erasure that looks
complete, *leaking* personal data through the tool's own outputs, and *forged* proof. It is scoped
to the library; it does not cover the security of the host application, its auth system, or its
infrastructure (those are the integrator's responsibility).

---

## Assets to protect

1. **Correctness of erasure** — the right subject's mapped data is removed/redacted/retained as
   declared, and nothing else.
2. **Confidentiality of subject data** — no personal data leaks through proof records, logs, or
   export artifacts.
3. **Integrity of proof** — proof reflects what actually happened and cannot be silently altered.
4. **Authorization** — only verified requests cause erasure or export.
5. **Availability of others' data** — one subject's request cannot destroy another's data.

---

## Actors and trust boundaries

| Actor | Trusted? | Notes |
|-------|----------|-------|
| Data subject (requester) | No (until verified) | May attempt to erase/export someone else's data |
| Integrator application | Yes | Owns identity verification, auth, infra |
| dsr-kit library | Yes (auditable) | Apache-2.0, no telemetry, minimal pinned deps |
| Primary database | Semi | Holds proof by default; privileged operators can write to it |
| Third-party processors | Semi | Reachable only via their APIs; deletion bounded by them |
| External attacker | No | Network/API-level adversary |

**Primary trust boundary:** the identity-verification hook. Everything destructive sits behind a
fail-closed gate that defaults to `verified: false`.

---

## Assumptions

- The integrator implements real identity verification (the shipped default verifies nothing).
- The host app's auth, transport (TLS), and infrastructure security are sound.
- The data map is maintained honestly and kept current (coverage run in CI).
- Processor API credentials are stored as secrets, not in code.

---

## Threats and mitigations

| Threat | Vector | Mitigation | Residual risk |
|--------|--------|------------|---------------|
| **Unauthorized erasure** (griefing — erase another user) | Forged/replayed request | Fail-closed identity gate; per-subject scoping; dry-run default | Weak integrator identity hook defeats this — integrator's responsibility |
| **Unauthorized export** (exfiltrate PII via a DSAR) | Impersonation | Identity verification required for export (no dry-run bypass); ephemeral, encrypted export artifacts with TTL | Same dependence on the integrator's identity check |
| **Wrong-subject deletion** | Mis-scoped identifier / ambiguous map | Explicit `subjectKey`/`subjectModel`; dry-run report shows exact counts before execute; per-subject advisory lock | Operator ignores dry-run and executes a bad map |
| **Incomplete erasure that looks complete** | Undeclared table/column; PII in untyped columns; out-of-band sinks | Structural coverage check (fails on undeclared columns); post-erasure verification; out-of-band sinks declared in plan/proof | Semantic PII in JSON/text not auto-detected (§4 of Guarantees); backups/replicas not auto-erased — both documented, not silent |
| **Proof forgery / tampering** | Privileged DB write to rewrite the chain | Per-subject hash chain; content hashes; no raw PII; pluggable append-only/external `ProofStore` | Default in-DB store is tamper-*evident*, not tamper-proof |
| **PII leakage via proof or logs** | PII written into proof/structured logs | Subject ids hashed (SHA-256); proof/logs carry no raw PII by design | Integrator adding PII to their own logs around the calls |
| **PII leakage via export artifact** | Plaintext export left on disk | Exports streamed/encrypted with a TTL; temp buffers zeroized; never persisted as plaintext | Integrator copying the artifact elsewhere |
| **Inconsistent state across DB + processors** | Crash between local delete and processor call | Durable step ledger (saga); per-model DB transactions; processor steps idempotent and resumable | Eventual consistency, not cross-boundary atomicity (by design) |
| **Over-deletion of legally-retained data** | Connector deletes data that must be kept | `RETAIN` honored in DB *and* connectors (e.g. Stripe financial records) with recorded basis | Misconfigured map that marks retained data for deletion |
| **Concurrent requests on one subject** | Race between two erasures/exports | Per-subject advisory lock serializes; idempotent steps | — |
| **Supply-chain compromise** | Malicious dependency / build | Minimal pinned deps; signed releases; no telemetry/phone-home; auditable Apache-2.0 source | General ecosystem risk |
| **Destructive dry-run mistake** | Dry-run accidentally mutates / calls processors | Dry-run is the default and is hard-wired to make zero mutations and zero outbound calls | — |

---

## Residual risks (stated plainly)

These are the things dsr-kit **cannot** fully solve and that you must own:

1. **Semantic PII discovery** — data hidden in untyped columns is not auto-detected.
2. **Backups and replicas** — handled by your documented policy, not by the tool.
3. **Identity strength** — the security of the whole flow rests on the integrator's identity hook.
4. **Tamper-proof proof** — the default store is tamper-evident; immutability requires an external
   append-only store.
5. **Processor limits** — third-party deletion is bounded by each provider's API and by law.

---

## Out of scope for this model

Host application authentication and session security; network/TLS configuration; database and
infrastructure hardening; physical security; correctness of the integrator's own data map content;
regulations beyond GDPR DSR.

---

## Reporting

Security issues — including inaccuracies in [GUARANTEES-AND-LIMITS.md](GUARANTEES-AND-LIMITS.md),
which we treat as security-relevant — should be reported per [SECURITY.md](../SECURITY.md). Please
do not open public issues for vulnerabilities.
