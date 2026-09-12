/** Folder / dossier status helpers (no React Native deps). */

export type DriverFolderStatus =
  | "draft"
  | "submitting"
  | "pending_review"
  | "active"
  | "rejected"
  | "locked"
  | "submitted"
  | "validated"
  | "incomplete"
  | "pending_validation"
  | "suspended"
  | "on_vacation"
  | "inactive";

const CANONICAL_STATUSES = new Set<string>([
  "draft",
  "submitting",
  "pending_review",
  "active",
  "rejected",
  "locked",
  "suspended",
  "on_vacation",
  "inactive",
]);

export function normalizeFolderStatus(
  status: string | null | undefined,
): DriverFolderStatus {
  const s = (status || "draft").toLowerCase();
  if (s === "submitted" || s === "pending_validation") return "pending_review";
  if (s === "validated" || s === "approved") return "active";
  if (s === "incomplete") return "draft";
  if (CANONICAL_STATUSES.has(s)) {
    return s as DriverFolderStatus;
  }
  return "draft";
}

/** Unsubmitted / rejected dossiers stay fully editable (profile + documents). */
export function isUnsubmittedDossier(status: string | null | undefined): boolean {
  const s = normalizeFolderStatus(status);
  return s === "draft" || s === "rejected";
}

/** Submit CTA is only for onboarding / admin-requested resubmit — never ops. */
export function canShowDossierSubmit(
  status: string | null | undefined,
  dossierUpdateRequested = false,
): boolean {
  const s = normalizeFolderStatus(status);
  if (s === "draft" || s === "rejected") return true;
  return s === "pending_review" && dossierUpdateRequested;
}

export type ValidationChecklistMode =
  | "ops"
  | "validated"
  | "missing"
  | "allReady"
  | "inReview";

export function resolveValidationChecklistMode(input: {
  status?: string | null;
  dossierUpdateRequested?: boolean;
  isComplete: boolean;
}): ValidationChecklistMode {
  const status = normalizeFolderStatus(input.status);
  if (
    status === "suspended" ||
    status === "on_vacation" ||
    status === "inactive"
  ) {
    return "ops";
  }
  if (status === "active") return "validated";
  if (!input.isComplete) return "missing";
  if (canShowDossierSubmit(status, Boolean(input.dossierUpdateRequested))) {
    return "allReady";
  }
  return "inReview";
}
