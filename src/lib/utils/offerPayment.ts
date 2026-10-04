/**
 * L'icône de paiement de la carte d'offre, et son libellé.
 *
 * Pourquoi ce module existe, et pas un `if` dans le JSX : c'est la logique qui décide **ce que le
 * chauffeur voit avant d'accepter**, et la règle est piégeuse. « Payé » ne se déduit PAS du mode de
 * paiement : une course carte dont la carte n'a pas été débitée n'est pas payée. Se tromper là
 * ferait perdre au chauffeur l'argent qu'il n'a pas réclamé — le pire échec possible de ce volet.
 *
 * Elle est donc testée hors du rendu, table de vérité comprise (`__tests__/offerPayment.test.ts`).
 */

export type OfferPaymentMethod = "cash" | "card";

export type OfferPaymentTone = "cash" | "due" | "paid";

export const OFFER_PAYMENT_LABEL_KEYS = {
  cashToCollect: "offer.payment.cashToCollect",
  cashCollected: "offer.payment.cashCollected",
  cardNoCash: "offer.payment.cardNoCash",
  cardPaid: "offer.payment.cardPaid",
} as const;

export interface OfferPaymentBadge {
  /** La famille d'icône : un billet, ou une carte. */
  icon: OfferPaymentMethod;
  tone: OfferPaymentTone;
  labelKey: string;
  /** Vrai quand l'argent est déjà encaissé — par le chauffeur, ou en ligne. */
  settled: boolean;
}

/**
 * La valeur vient d'une colonne texte ; on ne veut pas d'une icône absente parce qu'un jour
 * quelqu'un a écrit « Cash » ou « card ».
 */
function normalizeMethod(method: string | null | undefined): OfferPaymentMethod | null {
  if (typeof method !== "string") return null;

  const value = method.trim().toLowerCase();
  if (value === "cash") return "cash";
  if (value === "card") return "card";

  return null;
}

/**
 * Rend `null` quand le mode est inconnu : inventer une icône serait pire que ne rien afficher,
 * parce que le chauffeur croirait savoir.
 */
export function offerPaymentBadge(
  method: string | null | undefined,
  status: string | null | undefined,
): OfferPaymentBadge | null {
  const icon = normalizeMethod(method);
  if (!icon) return null;

  // Le statut est la SEULE source de « payé ». Tout ce qui n'est pas explicitement `paid` — un
  // statut inconnu, vide, absent — est traité comme non payé.
  const settled =
    typeof status === "string" && status.trim().toLowerCase() === "paid";

  if (icon === "cash") {
    return {
      icon,
      tone: settled ? "paid" : "cash",
      settled,
      labelKey: settled
        ? OFFER_PAYMENT_LABEL_KEYS.cashCollected
        : OFFER_PAYMENT_LABEL_KEYS.cashToCollect,
    };
  }

  return {
    icon,
    tone: settled ? "paid" : "due",
    settled,
    labelKey: settled
      ? OFFER_PAYMENT_LABEL_KEYS.cardPaid
      : OFFER_PAYMENT_LABEL_KEYS.cardNoCash,
  };
}
