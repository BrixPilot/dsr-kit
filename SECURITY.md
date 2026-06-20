# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in dsr-kit, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Email the maintainer with a description of the issue, steps to reproduce, and impact assessment.
3. Allow up to 90 days for a fix before public disclosure.

We will acknowledge receipt within 5 business days.

## Scope

Security reports related to:

- Incorrect erasure (data not deleted when declared)
- Proof record tampering or PII leakage in proofs
- Identity verification bypass
- Unexpected outbound network calls

are in scope. General GDPR compliance questions are out of scope for security reports.

## Threat Model

See [docs/threat-model.md](docs/threat-model.md) for destructive-operation threats and mitigations.
