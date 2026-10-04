import {
  cashInHand,
  isWeekSummaryConsistent,
  stillToCollect,
  toWeekSummary,
} from "../utils/weekSummary";

/**
 * Le relevé est ce que le chauffeur regarde pour savoir ce qu'il a gagné. La version précédente de
 * l'écran multipliait les gains du jour par 3,5 et par 12 pour « estimer » la semaine et le mois.
 * Ces tests tiennent la ligne : tout vient du serveur, et une charge utile incomprise ne devient
 * jamais un chiffre plausible.
 */
describe("toWeekSummary", () => {
  const payload = {
    success: true,
    week: { starts_on: "2026-09-28", ends_on: "2026-10-04" },
    totals: {
      rides: 2,
      net_earnings: 120,
      cash_collected: 40,
      cash_to_collect: 0,
      card_due: 80,
      card_pending: 0,
      due_by_platform: 80,
    },
    rides: [
      {
        ride_id: "r1",
        pickup_time: "2026-09-29T12:00:00Z",
        pickup_address: "A",
        dropoff_address: "B",
        client_price: 100,
        driver_earning: 80,
        payment_method: "card",
        payment_status: "paid",
        has_document: true,
        document_number: "FA-2026-000001",
      },
      {
        ride_id: "r2",
        pickup_time: "2026-09-30T12:00:00Z",
        pickup_address: "C",
        dropoff_address: "D",
        client_price: 50,
        driver_earning: 40,
        payment_method: "cash",
        payment_status: "paid",
        has_document: false,
        document_number: null,
      },
    ],
  };

  it("lit le relevé et ses deux courses", () => {
    const summary = toWeekSummary(payload);
    expect(summary?.totals.netEarnings).toBe(120);
    expect(summary?.rides).toHaveLength(2);
    expect(summary?.rides[0]).toMatchObject({
      rideId: "r1",
      paymentMethod: "card",
      paid: true,
      hasDocument: true,
      documentNumber: "FA-2026-000001",
    });
  });

  it("rend null sur une charge utile incomprise, jamais des zéros", () => {
    // Un écran qui affiche 0 € est moins dangereux qu'un écran qui affiche un chiffre faux.
    expect(toWeekSummary(null)).toBeNull();
    expect(toWeekSummary({})).toBeNull();
    expect(toWeekSummary({ success: false, error: "not_a_driver" })).toBeNull();
    expect(toWeekSummary({ success: true })).toBeNull();
  });

  it("tient les conversions, y compris les montants renvoyés en texte", () => {
    const summary = toWeekSummary({
      ...payload,
      totals: { ...payload.totals, net_earnings: "120.50" },
    });
    expect(summary?.totals.netEarnings).toBe(120.5);
  });

  it("range un mode inconnu dans `unknown` plutôt que de l'inventer", () => {
    const summary = toWeekSummary({
      ...payload,
      rides: [{ ...payload.rides[0], payment_method: "cheque" }],
    });
    expect(summary?.rides[0].paymentMethod).toBe("unknown");
  });

  it("ignore une course sans identifiant", () => {
    const summary = toWeekSummary({
      ...payload,
      rides: [{ ...payload.rides[0], ride_id: null }],
    });
    expect(summary?.rides).toEqual([]);
  });
});

describe("isWeekSummaryConsistent", () => {
  const base = {
    success: true,
    week: {},
    totals: {
      rides: 1,
      net_earnings: 120,
      cash_collected: 40,
      cash_to_collect: 0,
      card_due: 80,
      card_pending: 0,
      due_by_platform: 80,
    },
    rides: [],
  };

  it("accepte un relevé cohérent", () => {
    const summary = toWeekSummary(base);
    expect(summary && isWeekSummaryConsistent(summary)).toBe(true);
  });

  it("refuse un relevé dont les compartiments ne totalisent pas le net", () => {
    const summary = toWeekSummary({
      ...base,
      totals: { ...base.totals, net_earnings: 500 },
    });
    expect(summary && isWeekSummaryConsistent(summary)).toBe(false);
  });

  it("refuse un relevé où la plateforme doit autre chose que ce qu'elle a encaissé", () => {
    const summary = toWeekSummary({
      ...base,
      totals: { ...base.totals, due_by_platform: 120 },
    });
    expect(summary && isWeekSummaryConsistent(summary)).toBe(false);
  });
});

describe("what the driver actually has", () => {
  it("distingue l'argent en poche de l'argent à réclamer", () => {
    const summary = toWeekSummary({
      success: true,
      week: {},
      totals: {
        rides: 2,
        net_earnings: 90,
        cash_collected: 40,
        cash_to_collect: 50,
        card_due: 0,
        card_pending: 0,
        due_by_platform: 0,
      },
      rides: [],
    });

    expect(summary).not.toBeNull();
    expect(cashInHand(summary!)).toBe(40);
    expect(stillToCollect(summary!)).toBe(50);
  });
});

/**
 * Le câblage, et une garde contre un retour en arrière précis.
 *
 * L'écran « Gains » multipliait les gains du jour par 3,5 et par 12 pour « estimer » la semaine et
 * le mois. Ces deux multiplicateurs ne doivent pas revenir : ils affichaient des montants qui
 * n'existaient nulle part.
 */
describe("earnings screen wiring", () => {
  const { readFileSync } = require("fs") as {
    readFileSync: (path: string, encoding: string) => string;
  };
  const { join } = require("path") as { join: (...parts: string[]) => string };
  const screen = readFileSync(join(process.cwd(), "app", "(tabs)", "earnings.tsx"), "utf8");

  it("lit le relevé du serveur", () => {
    expect(screen).toContain("driver_week_summary");
  });

  it("n'invente plus la semaine ni le mois", () => {
    // On vise le CODE, pas le mot : l'en-tête du fichier cite la formule historique pour expliquer
    // ce qui a été retiré, et cette explication a de la valeur.
    expect(screen).not.toContain("stats.todayEarnings");
    expect(screen).not.toContain("* 3.5");
    expect(screen).not.toContain("* 12");
    expect(screen).not.toContain("monthlyEarnings");
    expect(screen).not.toContain("weeklyEarnings");
  });

  it("refuse d'afficher un relevé incohérent", () => {
    expect(screen).toContain("isWeekSummaryConsistent");
  });
});
