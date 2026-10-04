/**
 * Lecture d'un document de course — facture (plateforme → client) ou reçu (chauffeur → client).
 *
 * F-02 : le chauffeur doit pouvoir consulter le document de sa course. Ce module normalise ce que
 * la base renvoie et, surtout, **traduit les refus d'émission** en phrases utiles. Un refus n'est
 * pas une panne : « la plateforme n'a pas encore renseigné son identité légale » est une
 * information, et le chauffeur n'y peut rien — il doit le lire, pas deviner.
 */

export type RideDocumentKind = "invoice" | "receipt";

export interface RideDocumentIssuer {
  name: string;
  siret: string | null;
  address: string | null;
  city: string | null;
}

export interface RideDocument {
  id: string;
  kind: RideDocumentKind;
  number: string;
  issuedAt: string | null;
  totalAmount: number;
  driverEarning: number | null;
  operatorShare: number | null;
  platformShare: number | null;
  paymentMethod: string | null;
  issuer: RideDocumentIssuer;
  clientName: string | null;
  ridePickup: string | null;
  rideDropoff: string | null;
}

export const RIDE_DOCUMENT_LABEL_KEYS = {
  invoice: "rideDocuments.invoice",
  receipt: "rideDocuments.receipt",
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

function optionalNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

/** Rend `null` sur une ligne qu'on ne comprend pas — jamais un document à moitié inventé. */
export function toRideDocument(row: unknown): RideDocument | null {
  const raw = asRecord(row);
  if (!raw) return null;

  const id = text(raw.id);
  const number = text(raw.number);
  const kind = text(raw.kind);
  if (!id || !number || (kind !== "invoice" && kind !== "receipt")) return null;

  const issuerRaw = asRecord(raw.issuer) ?? {};
  const clientRaw = asRecord(raw.client) ?? {};
  const rideRaw = asRecord(raw.ride) ?? {};

  // Le nom de l'émetteur change selon qui émet : société du chauffeur, ou raison sociale.
  const issuerName =
    text(issuerRaw.company_name) || text(issuerRaw.legal_name) || "—";
  const clientName =
    [text(clientRaw.first_name), text(clientRaw.last_name)]
      .filter(Boolean)
      .join(" ") || null;

  return {
    id,
    kind,
    number,
    issuedAt: typeof raw.issued_at === "string" ? raw.issued_at : null,
    totalAmount: num(raw.total_amount),
    driverEarning: optionalNum(raw.driver_earning),
    operatorShare: optionalNum(raw.operator_share),
    platformShare: optionalNum(raw.platform_share),
    paymentMethod: text(raw.payment_method) || null,
    issuer: {
      name: issuerName,
      siret: text(issuerRaw.siret) || null,
      address: text(issuerRaw.address_line1) || null,
      city: text(issuerRaw.city) || null,
    },
    clientName,
    ridePickup: text(rideRaw.pickup_address) || null,
    rideDropoff: text(rideRaw.dropoff_address) || null,
  };
}

/**
 * Les refus d'émission, en clair. Chacun dit au chauffeur **ce qu'il peut faire**, et quand il n'y
 * peut rien, le dit aussi : c'est la plateforme qui doit renseigner son identité, pas lui.
 */
export const DOCUMENT_ERROR_KEYS: Record<string, string> = {
  issuer_not_configured: "rideDocuments.issuerNotConfigured",
  wrong_document_for_payment: "rideDocuments.wrongKind",
  ride_not_paid: "rideDocuments.notPaid",
  ride_not_found: "rideDocuments.rideNotFound",
  not_your_ride: "rideDocuments.notYours",
  not_authorized: "rideDocuments.notYours",
  invalid_kind: "rideDocuments.unknownError",
};

export function documentErrorMessageKey(error: string | null | undefined): string {
  if (!error) return "rideDocuments.unknownError";
  return DOCUMENT_ERROR_KEYS[error] ?? "rideDocuments.unknownError";
}
