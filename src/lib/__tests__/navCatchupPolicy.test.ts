import {
  NAV_CATCHUP_DEFAULTS,
  navPolicyFromSnapshot,
  navPolicyPayload,
} from "../utils/navCatchupPolicy";

describe("navPolicyFromSnapshot", () => {
  it("lit les quatre réglages du snapshot", () => {
    const policy = navPolicyFromSnapshot({
      nav_catchup_share: 0.08,
      nav_spring_per_s: 2,
      nav_catchup_max_dv: 0.3,
      nav_max_catchup_m: 40,
    });

    expect(policy).toEqual({
      catchupShare: 0.08,
      springPerS: 2,
      catchupMaxDv: 0.3,
      maxCatchupM: 40,
    });
  });

  it("retombe sur les défauts quand le snapshot est vide ou d'un autre âge", () => {
    // Les courses créées avant D-23 n'ont pas ces clés : elles doivent continuer de rouler, avec
    // les valeurs par défaut, pas avec des zéros.
    expect(navPolicyFromSnapshot(null)).toEqual(NAV_CATCHUP_DEFAULTS);
    expect(navPolicyFromSnapshot({})).toEqual(NAV_CATCHUP_DEFAULTS);
    expect(navPolicyFromSnapshot({ gps_fresh_seconds: 120 })).toEqual(NAV_CATCHUP_DEFAULTS);
  });

  it("refuse une valeur aberrante plutôt que de la croire", () => {
    // Une part de 5 ferait rugir la flèche 5 fois plus vite que la voiture ; une part de 0 la
    // figerait. Les deux sont refusées, et le défaut reprend la main.
    expect(navPolicyFromSnapshot({ nav_catchup_share: 5 }).catchupShare).toBe(0.15);
    expect(navPolicyFromSnapshot({ nav_catchup_share: 0 }).catchupShare).toBe(0);
    expect(navPolicyFromSnapshot({ nav_catchup_share: -1 }).catchupShare).toBe(0.15);
    expect(navPolicyFromSnapshot({ nav_catchup_max_dv: 0 }).catchupMaxDv).toBe(0.6);
    expect(navPolicyFromSnapshot({ nav_max_catchup_m: 5000 }).maxCatchupM).toBe(25);
  });

  it("accepte un nombre venu en texte, comme le fait jsonb", () => {
    expect(navPolicyFromSnapshot({ nav_catchup_share: "0.2" }).catchupShare).toBe(0.2);
  });

  it("accepte la borne exacte, et pas au-delà", () => {
    expect(navPolicyFromSnapshot({ nav_catchup_share: 1 }).catchupShare).toBe(1);
    expect(navPolicyFromSnapshot({ nav_catchup_share: 1.001 }).catchupShare).toBe(0.15);
  });
});

describe("navPolicyPayload", () => {
  it("rend les clés que le document attend", () => {
    expect(navPolicyPayload(NAV_CATCHUP_DEFAULTS)).toEqual({
      catchupShare: 0.15,
      springPerS: 1.4,
      catchupMaxDv: 0.6,
      maxCatchupM: 25,
    });
  });
});

/**
 * LA POLITIQUE DOIT ATTEINDRE LE DOCUMENT, MAILLON PAR MAILLON.
 *
 * D-23 n'a de sens que si le proprietaire peut ajuster le ressenti depuis la base. Un seul maillon
 * manquant et tout le reste devient decor : une colonne que personne ne lit ressemble exactement a
 * une constante, sauf qu'elle coute une migration.
 *
 * C'est precisement ce qui manquait : `select('*')` ramenait deja le snapshot, mais le mapping le
 * jetait. Chaque maillon est donc verrouille ici — ligne de base, course de l'app, ecran, modele.
 */
describe("the policy reaches the map document", () => {
  const { readFileSync } = require("fs") as {
    readFileSync: (path: string, encoding: string) => string;
  };
  const { join } = require("path") as { join: (...parts: string[]) => string };
  const read = (relative: string) =>
    readFileSync(join(process.cwd(), relative), "utf8");

  it("le mapping de course transporte le snapshot de frais", () => {
    expect(read(join("src", "lib", "utils", "toAppRide.ts"))).toContain(
      "fee_policy_snapshot: row.fee_policy_snapshot",
    );
  });

  it("l'ecran de navigation passe la politique a la carte", () => {
    const screen = read(join("app", "(tabs)", "index.tsx"));

    expect(screen).toContain("navPolicy={navPolicyPayload(");
    expect(screen).toContain("navPolicyFromSnapshot(activeRide?.fee_policy_snapshot)");
  });

  it("le modele de carte pose la politique dans le document", () => {
    expect(read(join("src", "map", "mapHtmlTemplate.ts"))).toContain(
      "window.__veNavPolicy = ${JSON.stringify(navPolicy ?? {})}",
    );
  });

  it("le fragment lit cette politique", () => {
    expect(read(join("src", "map", "navGuidanceSource.ts"))).toContain(
      'navPolicyNumber("catchupShare", NAV_CATCHUP_SHARE)',
    );
  });
});
