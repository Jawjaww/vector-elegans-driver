import {
  documentErrorMessageKey,
  toRideDocument,
  RIDE_DOCUMENT_LABEL_KEYS,
} from "../utils/rideDocument";

describe("toRideDocument", () => {
  const invoice = {
    id: "d1",
    kind: "invoice",
    number: "FA-2026-000001",
    issued_at: "2026-10-04T10:00:00Z",
    total_amount: 100,
    driver_earning: 80,
    operator_share: 6,
    platform_share: 14,
    payment_method: "card",
    issuer: {
      legal_name: "Vector Elegans SAS",
      siret: "98765432100011",
      address_line1: "10 avenue de la Paix",
      city: "Paris",
    },
    client: { first_name: "Jean", last_name: "Dupont" },
    ride: { pickup_address: "A", dropoff_address: "B" },
  };

  it("lit une facture et son émetteur", () => {
    const doc = toRideDocument(invoice);
    expect(doc).toMatchObject({
      kind: "invoice",
      number: "FA-2026-000001",
      totalAmount: 100,
      driverEarning: 80,
    });
    expect(doc?.issuer.name).toBe("Vector Elegans SAS");
    expect(doc?.clientName).toBe("Jean Dupont");
  });

  it("lit un reçu émis par le chauffeur, dont l'émetteur est la société du chauffeur", () => {
    const doc = toRideDocument({
      ...invoice,
      kind: "receipt",
      number: "RC-2026-000001",
      issuer: { company_name: "Chauffeur SARL", siret: "12345678900011" },
    });
    expect(doc?.kind).toBe("receipt");
    expect(doc?.issuer.name).toBe("Chauffeur SARL");
  });

  it("rend null sur une ligne qu'on ne comprend pas", () => {
    // Un document à moitié inventé serait pire qu'une absence de document.
    expect(toRideDocument(null)).toBeNull();
    expect(toRideDocument({})).toBeNull();
    expect(toRideDocument({ id: "d1", number: "X", kind: "credit_note" })).toBeNull();
    expect(toRideDocument({ id: "d1", kind: "invoice" })).toBeNull();
  });

  it("accepte un document sans nom de client", () => {
    const doc = toRideDocument({ ...invoice, client: {} });
    expect(doc?.clientName).toBeNull();
  });

  it("expose une clé de libellé par nature", () => {
    expect(RIDE_DOCUMENT_LABEL_KEYS.invoice).toBe("rideDocuments.invoice");
    expect(RIDE_DOCUMENT_LABEL_KEYS.receipt).toBe("rideDocuments.receipt");
  });
});

describe("documentErrorMessageKey", () => {
  it("traduit chaque refus connu en une phrase", () => {
    expect(documentErrorMessageKey("issuer_not_configured")).toBe(
      "rideDocuments.issuerNotConfigured",
    );
    expect(documentErrorMessageKey("wrong_document_for_payment")).toBe(
      "rideDocuments.wrongKind",
    );
    expect(documentErrorMessageKey("ride_not_paid")).toBe("rideDocuments.notPaid");
  });

  it("retombe sur une phrase générique plutôt que sur rien", () => {
    expect(documentErrorMessageKey("weird_new_error")).toBe("rideDocuments.unknownError");
    expect(documentErrorMessageKey(null)).toBe("rideDocuments.unknownError");
  });
});
