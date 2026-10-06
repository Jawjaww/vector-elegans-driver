import { formatWeekEdge, formatWeekRange } from "../utils/weekLabel";

/**
 * « SEMAINE DU 5 AU 11 OCTOBRE 2026 », ET LE MOT SEMAINE ÉCRIT.
 *
 * Retour du propriétaire sur les cartes qui glissent : « c'est de la merde […] j'aurais préféré
 * qu'il y ait marqué plus clairement semaine du 5 octobre au 11 ou semaine du 5 au 11 octobre 2026.
 * Ça me paraît plus clair. Tu vois, mettre le mot *semaine* pour tout de suite comprendre. »
 *
 * Le connecteur est dans les traductions ; ce module ne rend que les deux bornes, mises en forme
 * par la plateforme — une phrase construite ici serait française dans les trois langues.
 */
describe("formatWeekEdge", () => {
  it("rend le jour et le mois", () => {
    expect(formatWeekEdge("2026-10-05", "fr", false)).toBe("5 octobre");
    expect(formatWeekEdge("2026-10-11", "fr", true)).toBe("11 octobre 2026");
  });

  it("suit la langue du téléphone", () => {
    // L'ORDRE appartient à la plateforme : `en` rend « October 5 » (ordre US) et c'est elle qui a
    // raison. On vérifie donc la substance — le jour et le mois présents — et pas un ordre écrit
    // d'avance, qui ne serait vrai que dans une variante régionale.
    const english = formatWeekEdge("2026-10-05", "en", false);
    const spanish = formatWeekEdge("2026-10-05", "es", false);

    expect(english).toContain("October");
    expect(english).toContain("5");
    expect(spanish).toContain("octubre");
    expect(spanish).toContain("5");
    // Et les trois langues ne rendent pas la même chose : la mise en forme dépend bien du locale.
    expect(english).not.toBe(formatWeekEdge("2026-10-05", "fr", false));
  });

  it("n'ajoute l'année que là où on le lui demande", () => {
    const without = formatWeekEdge("2026-10-11", "fr", false);
    const withYear = formatWeekEdge("2026-10-11", "fr", true);

    expect(without).not.toContain("2026");
    expect(withYear).toContain("2026");
  });

  it("rend une chaîne vide sur une date illisible plutôt qu'une date inventée", () => {
    expect(formatWeekEdge("n/a", "fr", false)).toBe("");
  });
});

describe("formatWeekRange", () => {
  it("donne les deux bornes d'une semaine, l'année sur la seconde", () => {
    const range = formatWeekRange("2026-10-05", "2026-10-11", "fr");

    expect(range.start).toBe("5 octobre");
    expect(range.end).toBe("11 octobre 2026");
  });

  it("reste lisible dans les trois langues", () => {
    for (const locale of ["fr", "en", "es"]) {
      const range = formatWeekRange("2026-10-05", "2026-10-11", locale);
      expect(range.start.length).toBeGreaterThan(3);
      expect(range.end).toContain("2026");
    }
  });
});
