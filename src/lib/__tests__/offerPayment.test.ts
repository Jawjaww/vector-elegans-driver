import {
  offerPaymentBadge,
  OFFER_PAYMENT_LABEL_KEYS,
} from "../utils/offerPayment";

/**
 * La table de vérité de l'icône de paiement sur la carte d'offre.
 *
 * C'est la logique qui décide CE QUE LE CHAUFFEUR VOIT avant d'accepter, et elle vit hors du JSX
 * pour être testable ici. Le point qui compte, et qui a failli être faux : « payé » ne se déduit
 * PAS du mode de paiement. Une course carte non débitée n'est pas payée.
 */
describe("offerPaymentBadge", () => {
  it("n'affiche rien quand le mode de paiement est inconnu", () => {
    // Inventer une icône serait pire que ne rien afficher : le chauffeur croirait savoir.
    expect(offerPaymentBadge(null, null)).toBeNull();
    expect(offerPaymentBadge(undefined, undefined)).toBeNull();
  });

  it("annonce les espèces à encaisser", () => {
    const badge = offerPaymentBadge("cash", "pending");

    expect(badge).toMatchObject({
      icon: "cash",
      tone: "cash",
      settled: false,
      labelKey: OFFER_PAYMENT_LABEL_KEYS.cashToCollect,
    });
  });

  it("dit qu'une carte non débitée n'a RIEN à encaisser — sans prétendre qu'elle est payée", () => {
    const badge = offerPaymentBadge("card", "pending");

    expect(badge).toMatchObject({ icon: "card", tone: "due", settled: false });
    expect(badge?.labelKey).toBe(OFFER_PAYMENT_LABEL_KEYS.cardNoCash);
  });

  it("dit qu'une carte débitée est déjà payée", () => {
    const badge = offerPaymentBadge("card", "paid");

    expect(badge).toMatchObject({ icon: "card", tone: "paid", settled: true });
    expect(badge?.labelKey).toBe(OFFER_PAYMENT_LABEL_KEYS.cardPaid);
  });

  it("distingue les espèces déjà encaissées des espèces à encaisser", () => {
    // Cas réel : le chauffeur a encaissé, la course est passée `paid` (N-05). Le libellé doit
    // changer, sinon il réclamerait deux fois.
    const badge = offerPaymentBadge("cash", "paid");

    expect(badge).toMatchObject({ icon: "cash", tone: "paid", settled: true });
    expect(badge?.labelKey).toBe(OFFER_PAYMENT_LABEL_KEYS.cashCollected);
    expect(badge?.labelKey).not.toBe(OFFER_PAYMENT_LABEL_KEYS.cashToCollect);
  });

  it("traite un statut inconnu comme non payé, jamais comme payé", () => {
    // Le pire échec possible : annoncer « déjà payé » sur une course qui ne l'est pas — le
    // chauffeur ne réclame pas, et perd l'argent.
    expect(offerPaymentBadge("card", null)?.settled).toBe(false);
    expect(offerPaymentBadge("card", "pending")?.settled).toBe(false);
    expect(offerPaymentBadge("cash", undefined)?.settled).toBe(false);
    expect(offerPaymentBadge("cash", "weird_status")?.settled).toBe(false);
  });

  it("ne considère payé que le statut `paid`", () => {
    expect(offerPaymentBadge("card", "paid")?.settled).toBe(true);
    for (const status of ["pending", "refunded", "failed", "", null, undefined]) {
      expect(offerPaymentBadge("card", status)?.settled).toBe(false);
    }
  });

  it("accepte un mode de paiement en majuscules ou avec espaces", () => {
    // La valeur vient d'une colonne texte libre côté payload : on ne veut pas d'une icône absente
    // parce qu'un jour quelqu'un a écrit « Cash ».
    expect(offerPaymentBadge("Cash", "pending")?.icon).toBe("cash");
    expect(offerPaymentBadge(" card ", "pending")?.icon).toBe("card");
  });

  it("ignore un mode de paiement inconnu", () => {
    expect(offerPaymentBadge("bitcoin", "pending")).toBeNull();
  });
});

/**
 * Le câblage, pas la règle.
 *
 * Une table de vérité parfaite que personne n'affiche ne vaut rien : ce sont ces assertions qui
 * relient la règle à l'écran et à la donnée. Elles lisent la source, comme le fait déjà
 * `offerArrival.test.ts` pour l'ordre de rendu.
 */
describe("offer payment wiring", () => {
  // Comme `offerArrival.test.ts` : la racine est le cwd de Jest, et les chemins partent du depot.
  const { readFileSync } = require("fs") as {
    readFileSync: (path: string, encoding: string) => string;
  };
  const { join } = require("path") as { join: (...parts: string[]) => string };
  const read = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

  const card = read(join("src", "components", "OfferRideCard.tsx"));
  const badge = read(join("src", "components", "OfferPaymentBadge.tsx"));
  const toAppRide = read(join("src", "lib", "utils", "toAppRide.ts"));
  const outcome = read(join("src", "lib", "utils", "offerOpenOutcome.ts"));

  it("la carte d'offre rend l'icône, et lui passe le mode ET le statut", () => {
    expect(card).toContain("<OfferPaymentBadge");
    expect(card).toContain("paymentMethod={ride.payment_method}");
    expect(card).toContain("paymentStatus={ride.payment_status}");
  });

  it("l'icône n'affiche son libellé qu'après le tap", () => {
    // Le libellé est conditionné à l'état ouvert, sinon il serait toujours à l'écran et le tap
    // ne révélerait rien.
    expect(badge).toMatch(/\{open \?/);
    expect(badge).toContain("onPress={() => setOpen");
    expect(badge).toContain("accessibilityLabel={t(badge.labelKey)}");
  });

  it("le mode vient de la colonne, le statut du payload d'offre", () => {
    expect(toAppRide).toContain("payment_method: row.payment_method");
    expect(outcome).toContain("raw.payment?.status");
    expect(outcome).toContain("raw.snapshot?.payment_status");
  });
});
