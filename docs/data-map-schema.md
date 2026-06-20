# Export Bundle Schema (v1.0)

Stable, machine-readable format for GDPR access/portability requests.

## Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | `"1.0"` | Schema version identifier |
| `exportedAt` | ISO 8601 string | Export timestamp |
| `subjectHash` | string | SHA-256 hash of `subjectKey:subjectValue` (no raw PII) |
| `data` | object | Keys are model names; values are arrays of records |
| `processors` | object | Per-processor export data or `requiresSeparateRequest` note |

## Example

```json
{
  "schemaVersion": "1.0",
  "exportedAt": "2026-06-19T12:00:00.000Z",
  "subjectHash": "abc123...",
  "data": {
    "User": [{ "email": "user@example.com", "name": "Jane" }],
    "Order": [{ "product": "Pro Plan", "amount": 29.99 }]
  },
  "processors": {
    "stripe": [{ "id": "cus_xxx", "email": "user@example.com" }],
    "resend": { "requiresSeparateRequest": true, "reason": "..." }
  }
}
```

## Determinism

- Model keys in `data` are sorted alphabetically when using `stableExportBundle()` for testing.
- Field order within records follows adapter/DB column order.

## Proof record schema

Proof records contain hashed subject IDs only. Fields:

- `subjectIdHash`, `timestamp`, `perModelOutcomes`, `perProcessorOutcomes`
- `retainedItems` (model, legalBasis, count)
- `prevHash`, `contentHash` (hash chain)

Raw email, name, or other PII must never appear in proof records.
