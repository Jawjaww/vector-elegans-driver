import {
  BOOKING_ORDER_SPECIMEN,
  bookingOrderRows,
  toBookingOrder,
  type BookingOrder,
} from "../utils/bookingOrder";

/**
 * LE BON DE COMMANDE — les mentions obligatoires, et leur ORDRE.
 *
 * D-25. Au contrôle routier, ce qui est exigé n'est pas la facture mais la preuve que la course a
 * été commandée AVANT la prise en charge (L. 3120-2 du Code des transports, maraude interdite).
 * Le document doit donc porter, dans cet ordre : l'exploitant (nom, SIREN, SIRET, n° EVTC), le
 * chauffeur (nom, carte professionnelle), le client (nom, téléphone), l'horodatage STRICT
 * (émission puis prise en charge prévue), le trajet (départ ET arrivée, séparés), et le tarif TTC.
 */
const payload = {
  success: true,
  operator: {
    legal_name: "La Ligue des VTC",
    siret: "123 456 789 00011",
    siren: "123456789",
    evtc_number: "EVTC0123456789",
  },
  driver: { first_name: "Karim", last_name: "Benali", vtc_card_number: "VTC-2019-0421" },
  client: { first_name: "Camille", last_name: "Dupont", phone: "+33612345678" },
  ride: {
    id: "r1",
    pickup_address: "Gare de Lyon, Paris",
    dropoff_address: "Tour Eiffel, Paris",
    ordered_at: "2026-10-06T08:00:00.000Z",
    pickup_at: "2026-10-06T10:00:00.000Z",
    ordered_before_pickup: true,
    price_ttc: 42,
    payment_method: "card",
  },
};

describe("toBookingOrder", () => {
  it("lit la charge utile du document", () => {
    const order = toBookingOrder(payload);

    expect(order?.operator.legalName).toBe("La Ligue des VTC");
    expect(order?.operator.evtcNumber).toBe("EVTC0123456789");
    expect(order?.driver.vtcCardNumber).toBe("VTC-2019-0421");
    expect(order?.client.phone).toBe("+33612345678");
    expect(order?.ride.priceTtc).toBe(42);
  });

  it("rend null sur un refus, jamais un document à moitié vide", () => {
    // Un document incomplet ne protège pas le chauffeur : mieux vaut ne rien afficher.
    expect(toBookingOrder({ success: false, error: "not_your_ride" })).toBeNull();
    expect(toBookingOrder({ success: false, error: "issuer_not_configured" })).toBeNull();
    expect(toBookingOrder(null)).toBeNull();
  });
});

describe("les mentions obligatoires", () => {
  const order = toBookingOrder(payload) as BookingOrder;
  const rows = bookingOrderRows(order, "fr");
  const keys = rows.map((row) => row.labelKey);

  it("porte les six familles de mentions", () => {
    for (const key of [
      "bookingOrder.operatorName",
      "bookingOrder.siren",
      "bookingOrder.evtc",
      "bookingOrder.driverName",
      "bookingOrder.professionalCard",
      "bookingOrder.clientName",
      "bookingOrder.clientPhone",
      "bookingOrder.orderedAt",
      "bookingOrder.pickupAt",
      "bookingOrder.pickupAddress",
      "bookingOrder.dropoffAddress",
      "bookingOrder.priceTtc",
    ]) {
      expect(keys).toContain(key);
    }
  });

  it("sépare le départ de l'arrivée", () => {
    // « Trajet. Gare de Lyon » ne dit ni d'où l'on part ni où l'on va.
    const pickup = rows.find((row) => row.labelKey === "bookingOrder.pickupAddress");
    const dropoff = rows.find((row) => row.labelKey === "bookingOrder.dropoffAddress");

    expect(pickup?.value).toBe("Gare de Lyon, Paris");
    expect(dropoff?.value).toBe("Tour Eiffel, Paris");
    expect(pickup?.value).not.toBe(dropoff?.value);
  });

  it("suit l'ordre de la loi", () => {
    const section = (key: string) => rows.find((row) => row.labelKey === key)?.section;
    const at = (key: string) => keys.indexOf(key);

    // Exploitant, puis chauffeur, puis client, puis la course.
    expect(section("bookingOrder.operatorName")).toBe("operator");
    expect(section("bookingOrder.driverName")).toBe("driver");
    expect(section("bookingOrder.clientName")).toBe("client");
    expect(section("bookingOrder.pickupAddress")).toBe("ride");

    // L'émission AVANT la prise en charge : c'est tout l'objet du document.
    expect(at("bookingOrder.orderedAt")).toBeLessThan(at("bookingOrder.pickupAt"));
    // Et le départ avant l'arrivée.
    expect(at("bookingOrder.pickupAddress")).toBeLessThan(at("bookingOrder.dropoffAddress"));
  });

  it("ne met pas le moyen de paiement en dernier", () => {
    // Retour du propriétaire : « tu mets paiement en carte, mais c'est pas là qu'il faut le mettre.
    // Tu le mets en dernier, c'est bizarre. »
    const payment = keys.indexOf("bookingOrder.payment");
    const price = keys.indexOf("bookingOrder.priceTtc");

    expect(payment).toBeGreaterThanOrEqual(0);
    expect(payment).toBeLessThan(keys.length - 1);
    expect(payment).toBeLessThan(price);
  });

  it("dit quand la commande n'est PAS antérieure à la prise en charge", () => {
    const late = toBookingOrder({
      ...payload,
      ride: { ...payload.ride, ordered_before_pickup: false },
    }) as BookingOrder;
    const lateRows = bookingOrderRows(late, "fr");

    // Un document qui a l'air conforme sans l'être est pire qu'une absence de document.
    expect(lateRows).toContainEqual(
      expect.objectContaining({
        labelKey: "bookingOrder.orderNotPrior",
        tone: "warning",
      }),
    );
  });

  it("ne signale rien quand la commande est antérieure", () => {
    expect(keys).not.toContain("bookingOrder.orderNotPrior");
  });
});

describe("le specimen", () => {
  it("a des numéros crédibles, pas des zéros", () => {
    // « Ce n'est pas parce que c'est un spécimen qu'il faut que ça ait l'air d'un truc vide. »
    expect(BOOKING_ORDER_SPECIMEN.operator.siret).not.toBe("000 000 000 00000");
    expect(BOOKING_ORDER_SPECIMEN.operator.siret).toMatch(/\d{3} \d{3} \d{3} \d{5}/);
    expect(BOOKING_ORDER_SPECIMEN.operator.evtcNumber).toMatch(/^EVTC\d+$/);
    expect(BOOKING_ORDER_SPECIMEN.number).toMatch(/^BC-\d{4}-\d{6}$/);
  });

  it("reste un specimen, et ne peut pas passer pour un document émis", () => {
    const order = BOOKING_ORDER_SPECIMEN;

    expect(order.specimen).toBe(true);
    expect(order.number).not.toBeNull();

    // Le numéro n'appartient PAS à la série réelle de la plateforme (FA- / RC-).
    const number = order.number ?? "";
    expect(number.startsWith("FA-")).toBe(false);
    expect(number.startsWith("RC-")).toBe(false);
  });

  it("montre un trajet complet, même en exemple", () => {
    expect(BOOKING_ORDER_SPECIMEN.ride.pickupAddress).toBeTruthy();
    expect(BOOKING_ORDER_SPECIMEN.ride.dropoffAddress).toBeTruthy();
    expect(BOOKING_ORDER_SPECIMEN.ride.pickupAddress).not.toBe(
      BOOKING_ORDER_SPECIMEN.ride.dropoffAddress,
    );
  });

  it("rend ses lignes comme un vrai document", () => {
    const rows = bookingOrderRows(BOOKING_ORDER_SPECIMEN, "fr");

    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((row) => row.value.length > 0)).toBe(true);
  });
});
