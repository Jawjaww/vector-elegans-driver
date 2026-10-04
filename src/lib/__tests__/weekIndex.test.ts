import {
  currentWeekEntry,
  toWeekIndex,
  weekEntryFor,
  weekStartOf,
} from "../utils/weekIndex";

const payload = {
  success: true,
  weeks: [
    { starts_on: "2026-09-28", ends_on: "2026-10-04", rides: 3, net_earnings: 120,
      cash_collected: 40, card_due: 80, unclassified: 0 },
    { starts_on: "2026-09-21", ends_on: "2026-09-27", rides: 5, net_earnings: 300,
      cash_collected: 300, card_due: 0, unclassified: 0 },
    { starts_on: "2026-09-14", ends_on: "2026-09-20", rides: 0, net_earnings: 0,
      cash_collected: 0, card_due: 0, unclassified: 0 },
  ],
};

describe("toWeekIndex", () => {
  it("lit les semaines, la plus récente d'abord", () => {
    const weeks = toWeekIndex(payload);
    expect(weeks).toHaveLength(3);
    expect(weeks?.[0]).toMatchObject({ startsOn: "2026-09-28", netEarnings: 120, rides: 3 });
  });

  it("garde une semaine sans course : un trou doit se voir", () => {
    const weeks = toWeekIndex(payload);
    expect(weeks?.[2]).toMatchObject({ rides: 0, netEarnings: 0 });
  });

  it("rend null sur une charge utile incomprise, jamais une liste vide", () => {
    // « aucune semaine » et « je n'ai pas su lire » n'appellent pas le même geste.
    expect(toWeekIndex(null)).toBeNull();
    expect(toWeekIndex({ success: false, error: "not_a_driver" })).toBeNull();
    expect(toWeekIndex({ success: true })).toBeNull();
    expect(toWeekIndex({ success: true, weeks: [] })).toEqual([]);
  });

  it("ignore une entrée sans date plutôt que d'inventer une semaine", () => {
    const weeks = toWeekIndex({ success: true, weeks: [{ rides: 4 }, payload.weeks[0]] });
    expect(weeks).toHaveLength(1);
    expect(weeks?.[0].startsOn).toBe("2026-09-28");
  });
});

describe("currentWeekEntry", () => {
  it("prend la plus récente — c'est la semaine en cours", () => {
    expect(currentWeekEntry(toWeekIndex(payload) ?? [])?.startsOn).toBe("2026-09-28");
  });

  it("rend null sur un index vide", () => {
    expect(currentWeekEntry([])).toBeNull();
  });
});

describe("weekStartOf", () => {
  it("rend le lundi de la semaine, quel que soit le jour", () => {
    // Dimanche 4 octobre 2026 -> lundi 28 septembre (semaine ISO).
    expect(weekStartOf(new Date(2026, 9, 4))).toBe("2026-09-28");
    // Lundi 28 septembre -> lui-même.
    expect(weekStartOf(new Date(2026, 8, 28))).toBe("2026-09-28");
    // Le dimanche appartient à la semaine qui commence le lundi PRÉCÉDENT, pas au lendemain.
    expect(weekStartOf(new Date(2026, 9, 4))).not.toBe("2026-10-05");
  });

  it("retrouve l'entrée de l'index sans requête", () => {
    const weeks = toWeekIndex(payload) ?? [];
    expect(weekEntryFor(weeks, new Date(2026, 9, 1))?.rides).toBe(3);
    expect(weekEntryFor(weeks, new Date(2026, 8, 24))?.rides).toBe(5);
    expect(weekEntryFor(weeks, new Date(2026, 6, 1))).toBeNull();
  });
});
