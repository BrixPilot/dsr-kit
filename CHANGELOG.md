# Changelog

## Unreleased

### Fixed

- Proof hash chains are **per-subject** (not one global chain) with serialized append
  (`SubjectMutex` + Serializable Prisma transactions) — prevents concurrent fork of tamper-evidence
- README CI badge and clone URL point at `BrixPilot/dsr-kit`
- `docs/GUARANTEES-AND-LIMITS.md` no longer claims v0.2 step-ledger resumability in v0.1

### Added

- Tests: proof-chain concurrency, dry-run zero-mutation, processor dry-run, processors outside DB txn
- README "Tests and CI" section

### Breaking

- Renamed erasure action `ANONYMIZE` → `REDACT` (pseudonymization, not legal anonymization)
- Renamed adapter method `anonymizeBySubject` → `redactBySubject`
- Renamed `AnonymizeSentinels` → `RedactSentinels`

### Added

- [docs/GUARANTEES-AND-LIMITS.md](docs/GUARANTEES-AND-LIMITS.md) — honest scope and limits documentation

## 0.1.0 — 2026-06-19

Initial release.

- `@dsr-kit/core` — data map, erasure engine, export, proof, verification
- `@dsr-kit/adapter-prisma` — Prisma + Postgres adapter
- `@dsr-kit/connector-stripe` — Stripe reference connector
- `@dsr-kit/connector-resend` — Resend reference connector
- `@dsr-kit/next` — Next.js App Router handlers with identity hook
- Example app with full erasure/export/proof demo
- Coverage check CLI
- CI workflow
