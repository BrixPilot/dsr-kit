# Changelog

## Unreleased

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
