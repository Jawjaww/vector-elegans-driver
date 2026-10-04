/**
 * Lecture du relevé hebdomadaire renvoyé par `driver_week_summary` (F-03).
 *
 * Ce module existe parce que la version précédente de l'écran « Gains » **inventait** ses chiffres :
 * `weekEst = todayEarnings × 3.5` et `monthEst = todayEarnings × 12`, avec le commentaire
 * « Simulated multiplier ». Un chauffeur lisait donc un montant hebdomadaire qui n'existait nulle
 * part. Ici, tout vient du serveur, et une charge utile qu'on ne comprend pas rend `null` plutôt
 * qu'un zéro : **un écran qui affiche 0 € est moins dangereux qu'un écran qui affiche un chiffre
 * plausible et faux**, parce que le second ne se voit pas.
 *
 * La séparation espèces / carte est l'information, pas un détail : 200 € encaissés et 300 € à
 * recevoir, ce n'est pas « 500 € gagnés ».
 */

export type WeekPaymentBucket = "cash" | "card" | "unknown";

export interface WeekSummaryRide {
  rideId: string;
  pickupAt: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  clientPrice: number;
  driverEarning: number;
  paymentMethod: WeekPaymentBucket;
  paid: boolean;
  hasDocument: boolean;
  documentNumber: string | null;
}

export interface WeekSummaryTotals {
  rides: number;
  netEarnings: number;
  cashCollected: number;
  cashToCollect: number;
  cardDue: number;
  cardPending: number;
  /**
   * Gains dont le mode de paiement n'a JAMAIS ete enregistre (courses anterieures a F-01). Le net
   * les compte, donc l'ecran doit les compter aussi — sinon il refuse d'afficher un releve juste.
   */
  unclassified: number;
  dueByPlatform: number;
}

export interface WeekSummary {
  weekStart: string | null;
  weekEnd: string | null;
  totals: WeekSummaryTotals;
  rides: WeekSummaryRide[];
}

function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function bucket(value: unknown): WeekPaymentBucket {
  const normalized = text(value).trim().toLowerCase();
  if (normalized === "cash") return "cash";
  if (normalized === "card") return "card";
  return "unknown";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function toRide(value: unknown): WeekSummaryRide | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const rideId = text(raw.ride_id);
  if (!rideId) return null;

  return {
    rideId,
    pickupAt: typeof raw.pickup_time === "string" ? raw.pickup_time : null,
    pickupAddress: text(raw.pickup_address),
    dropoffAddress: text(raw.dropoff_address),
    clientPrice: num(raw.client_price),
    driverEarning: num(raw.driver_earning),
    paymentMethod: bucket(raw.payment_method),
    paid: text(raw.payment_status) === "paid",
    hasDocument: raw.has_document === true,
    documentNumber: typeof raw.document_number === "string" ? raw.document_number : null,
  };
}

/** Rend `null` sur une charge utile qu'on ne comprend pas — jamais des zéros trompeurs. */
export function toWeekSummary(payload: unknown): WeekSummary | null {
  const raw = asRecord(payload);
  if (!raw || raw.success !== true) return null;

  const totals = asRecord(raw.totals);
  if (!totals) return null;

  const week = asRecord(raw.week) ?? {};
  const rides = Array.isArray(raw.rides)
    ? raw.rides.map(toRide).filter((ride): ride is WeekSummaryRide => ride !== null)
    : [];

  return {
    weekStart: typeof week.starts_on === "string" ? week.starts_on : null,
    weekEnd: typeof week.ends_on === "string" ? week.ends_on : null,
    totals: {
      rides: num(totals.rides),
      netEarnings: num(totals.net_earnings),
      cashCollected: num(totals.cash_collected),
      cashToCollect: num(totals.cash_to_collect),
      cardDue: num(totals.card_due),
      cardPending: num(totals.card_pending),
      unclassified: num(totals.unclassified),
      dueByPlatform: num(totals.due_by_platform),
    },
    rides,
  };
}

/**
 * L'invariant du relevé : les quatre compartiments s'additionnent au net, et la plateforme ne doit
 * que ce qu'elle a encaissé. L'écran s'en sert pour **refuser d'afficher** un relevé incohérent
 * plutôt que de le présenter comme la vérité.
 */
export function isWeekSummaryConsistent(summary: WeekSummary): boolean {
  const t = summary.totals;
  const buckets =
    t.cashCollected + t.cashToCollect + t.cardDue + t.cardPending + t.unclassified;
  return (
    Math.abs(buckets - t.netEarnings) < 0.01 &&
    Math.abs(t.dueByPlatform - t.cardDue) < 0.01
  );
}

/** Ce qui est déjà dans la poche du chauffeur : les espèces encaissées. */
export function cashInHand(summary: WeekSummary): number {
  return summary.totals.cashCollected;
}

/** Ce qu'il lui reste à réclamer à des clients. */
export function stillToCollect(summary: WeekSummary): number {
  return summary.totals.cashToCollect;
}

/**
 * Le MOTIF d'un refus, quand la charge utile n'est pas un relevé exploitable.
 *
 * Sans cela, l'écran affichait « relevé incohérent » pour **toutes** les causes — y compris une
 * session expirée ou un compte sans chauffeur. Le propriétaire a cherché un bug de cohérence qui
 * n'existait pas : un message qui ne distingue pas les causes envoie au mauvais endroit.
 */
export function readWeekSummaryRefusal(payload: unknown): string | null {
  const raw = asRecord(payload);
  if (!raw) return null;
  if (raw.success === true) return null;
  return typeof raw.error === "string" ? raw.error : "unknown";
}
