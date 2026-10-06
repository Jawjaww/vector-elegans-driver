/**
 * Le bon de commande — le justificatif de réservation préalable (D-25).
 *
 * Au contrôle routier, la facture n'est PAS le document exigé : ce qui est demandé, c'est la preuve
 * que la course a été commandée AVANT la prise en charge, parce que l'article L. 3120-2 du Code des
 * transports interdit la maraude. La facture intervient après la prestation ; elle ne répond pas à
 * la question posée au bord de la route.
 *
 * Ce module est PUR : il met en forme la charge utile de `get_ride_booking_order` (base) et ne
 * décide de rien d'autre. C'est lui qui porte les mentions obligatoires et leur ORDRE, et il se
 * teste sans écran — les deux raisons pour lesquelles il vit hors du composant.
 *
 * Ordre suivi, qui est celui de la loi : exploitant (nom, SIREN, SIRET, n° EVTC), chauffeur (nom,
 * carte professionnelle), client (nom, téléphone), horodatage STRICT (émission PUIS prise en charge
 * prévue), trajet (départ ET arrivée, séparés), tarif TTC forfaitaire. Le moyen de paiement est
 * dans le bloc course et NON en dernier — le propriétaire a jugé cette place bizarre, à raison :
 * le document se termine sur le montant convenu.
 */

export type BookingOrderSection = "operator" | "driver" | "client" | "ride";

export interface BookingOrderRow {
  section: BookingOrderSection;
  labelKey: string;
  value: string;
  /** `warning` porte ce qui empêche le document de protéger le chauffeur. */
  tone?: "warning";
}

export interface BookingOrder {
  specimen: boolean;
  number: string | null;
  operator: {
    legalName: string;
    siret: string | null;
    siren: string | null;
    evtcNumber: string | null;
    address: string | null;
  };
  driver: { firstName: string; lastName: string; vtcCardNumber: string | null };
  client: { firstName: string; lastName: string; phone: string | null };
  ride: {
    id: string;
    pickupAddress: string;
    dropoffAddress: string;
    orderedAt: string | null;
    pickupAt: string | null;
    orderedBeforePickup: boolean;
    priceTtc: number | null;
    paymentMethod: string | null;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  const value2 = text(value);
  return value2.length > 0 ? value2 : null;
}

function num(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rend `null` sur un refus du serveur, et jamais un document à moitié rempli : un bon de commande
 * incomplet ne protège pas le chauffeur, il lui donne seulement l'impression d'être en règle.
 */
export function toBookingOrder(payload: unknown): BookingOrder | null {
  const raw = asRecord(payload);
  if (!raw || raw.success !== true) return null;

  const operator = asRecord(raw.operator);
  const driver = asRecord(raw.driver);
  const client = asRecord(raw.client);
  const ride = asRecord(raw.ride);
  if (!operator || !driver || !client || !ride) return null;

  const legalName = text(operator.legal_name);
  const pickup = text(ride.pickup_address);
  const dropoff = text(ride.dropoff_address);
  if (!legalName || !pickup || !dropoff) return null;

  return {
    specimen: raw.specimen === true,
    number: nullableText(raw.number),
    operator: {
      legalName,
      siret: nullableText(operator.siret),
      siren: nullableText(operator.siren),
      evtcNumber: nullableText(operator.evtc_number),
      address: nullableText(operator.address),
    },
    driver: {
      firstName: text(driver.first_name),
      lastName: text(driver.last_name),
      vtcCardNumber: nullableText(driver.vtc_card_number),
    },
    client: {
      firstName: text(client.first_name),
      lastName: text(client.last_name),
      phone: nullableText(client.phone),
    },
    ride: {
      id: text(ride.id),
      pickupAddress: pickup,
      dropoffAddress: dropoff,
      orderedAt: nullableText(ride.ordered_at),
      pickupAt: nullableText(ride.pickup_at),
      orderedBeforePickup: ride.ordered_before_pickup === true,
      priceTtc: num(ride.price_ttc),
      paymentMethod: nullableText(ride.payment_method),
    },
  };
}

function fullName(first: string, last: string): string {
  return [first, last].map((part) => part.trim()).filter(Boolean).join(" ");
}

/** Une date lisible, dans la langue du téléphone. Options explicites : Hermes n'a pas `dateStyle`. */
function formatMoment(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function money(amount: number | null): string | null {
  return amount === null ? null : `€${amount.toFixed(2)}`;
}

/**
 * Les lignes du document, dans l'ordre de la loi. Une ligne sans valeur est OMISE plutôt que rendue
 * vide : un document qui montre des champs vides a l'air d'un document qu'on n'a pas rempli.
 */
export function bookingOrderRows(
  order: BookingOrder,
  locale: string,
): BookingOrderRow[] {
  const rows: BookingOrderRow[] = [];
  const push = (
    section: BookingOrderSection,
    labelKey: string,
    value: string | null,
    tone?: "warning",
  ) => {
    if (!value) return;
    rows.push(tone ? { section, labelKey, value, tone } : { section, labelKey, value });
  };

  // 1. L'exploitant.
  push("operator", "bookingOrder.operatorName", order.operator.legalName);
  push("operator", "bookingOrder.siren", order.operator.siren);
  push("operator", "bookingOrder.siret", order.operator.siret);
  push("operator", "bookingOrder.evtc", order.operator.evtcNumber);
  push("operator", "bookingOrder.address", order.operator.address);

  // 2. Le chauffeur, avec sa carte professionnelle.
  push("driver", "bookingOrder.driverName", fullName(order.driver.firstName, order.driver.lastName));
  push("driver", "bookingOrder.professionalCard", order.driver.vtcCardNumber);

  // 3. Le client — nom ET téléphone du donneur d'ordre, les deux étant exigés.
  push("client", "bookingOrder.clientName", fullName(order.client.firstName, order.client.lastName));
  push("client", "bookingOrder.clientPhone", order.client.phone);

  // 4. La course : d'abord l'horodatage STRICT, émission puis prise en charge.
  push("ride", "bookingOrder.orderedAt", formatMoment(order.ride.orderedAt, locale));
  push("ride", "bookingOrder.pickupAt", formatMoment(order.ride.pickupAt, locale));
  if (!order.ride.orderedBeforePickup) {
    // Le document ne doit pas avoir l'air conforme quand il ne l'est pas.
    push("ride", "bookingOrder.orderNotPrior", "⚠", "warning");
  }
  // Puis le trajet, en DEUX lignes : « Gare de Lyon » seule ne dit ni d'où l'on part ni où l'on va.
  push("ride", "bookingOrder.pickupAddress", order.ride.pickupAddress);
  push("ride", "bookingOrder.dropoffAddress", order.ride.dropoffAddress);
  // Le moyen de paiement est dans le bloc course, jamais en queue.
  push("ride", "bookingOrder.payment", order.ride.paymentMethod);
  // Et le document se termine sur le montant convenu à l'avance.
  push("ride", "bookingOrder.priceTtc", money(order.ride.priceTtc));

  return rows;
}

/**
 * Le spécimen — crédible à l'œil, jamais confondable avec un document émis.
 *
 * Les deux exigences se concilient : des numéros d'allure réaliste, un trajet complet, des
 * horodatages cohérents (la commande précède la prise en charge) — ET la marque SPÉCIMEN, plus un
 * numéro qui n'appartient PAS à la série réelle de la plateforme (`FA-` / `RC-`).
 */
export const BOOKING_ORDER_SPECIMEN: BookingOrder = {
  specimen: true,
  number: "BC-2026-000147",
  operator: {
    legalName: "La Ligue des VTC",
    siret: "123 456 789 00011",
    siren: "123456789",
    evtcNumber: "EVTC0123456789",
    address: "1 rue de l'Exemple, 75001 Paris",
  },
  driver: {
    firstName: "Karim",
    lastName: "Benali",
    vtcCardNumber: "VTC-2019-0421",
  },
  client: {
    firstName: "Camille",
    lastName: "Dupont",
    phone: "+33 6 12 34 56 78",
  },
  ride: {
    id: "specimen",
    pickupAddress: "Gare de Lyon, 4 place Louis-Armand, Paris",
    dropoffAddress: "Tour Eiffel, Champ de Mars, Paris",
    orderedAt: "2026-10-06T08:14:00.000Z",
    pickupAt: "2026-10-06T10:00:00.000Z",
    orderedBeforePickup: true,
    priceTtc: 42,
    paymentMethod: "card",
  },
};
