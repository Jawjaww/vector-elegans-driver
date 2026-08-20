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
  | "pending_validation";

export function normalizeFolderStatus(
  status: string | null | undefined,
): DriverFolderStatus {
  const s = (status || "draft").toLowerCase();
  if (s === "submitted" || s === "pending_validation") return "pending_review";
  if (s === "validated" || s === "approved") return "active";
  if (s === "incomplete") return "draft";
  if (
    s === "draft" ||
    s === "submitting" ||
    s === "pending_review" ||
    s === "active" ||
    s === "rejected" ||
    s === "locked"
  ) {
    return s;
  }
  return "draft";
}
