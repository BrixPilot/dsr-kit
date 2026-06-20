export class DsrError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "DsrError";
  }
}

export class IdentityNotVerifiedError extends DsrError {
  constructor() {
    super(
      "Identity verification required before executing erasure or export",
      "IDENTITY_NOT_VERIFIED",
    );
  }
}

export class VerificationFailedError extends DsrError {
  constructor(
    public readonly residues: Array<{ model: string; field: string; count: number }>,
  ) {
    super("Post-erasure verification found personal data residue", "VERIFICATION_FAILED");
  }
}

export class CoverageError extends DsrError {
  constructor(public readonly gaps: string[]) {
    super(`Data map coverage gaps: ${gaps.join("; ")}`, "COVERAGE_GAP");
  }
}

export class DataMapError extends DsrError {
  constructor(message: string) {
    super(message, "DATA_MAP_INVALID");
  }
}
