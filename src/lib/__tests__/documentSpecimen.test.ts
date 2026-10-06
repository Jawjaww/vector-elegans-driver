import {
  isSpecimen,
  looksLikeRealNumber,
  SPECIMEN_DOCUMENT,
  SPECIMEN_MARKER,
  SPECIMEN_NUMBER,
  SPECIMEN_SIRET,
} from "../utils/documentSpecimen";

/**
 * Un spécimen sert à montrer. S'il pouvait passer pour un document émis, il serait dangereux : un
 * chauffeur, un client ou un comptable pourrait s'y fier. Ces tests tiennent les trois garde-fous.
 */
describe("specimen invoice", () => {
  it("porte le mot SPÉCIMEN, et son numéro ne peut pas passer pour un vrai", () => {
    expect(SPECIMEN_MARKER).toBe("SPÉCIMEN");
    expect(looksLikeRealNumber(SPECIMEN_NUMBER)).toBe(false);
    expect(SPECIMEN_NUMBER).toContain(SPECIMEN_MARKER);
  });

  it("reconnaît la forme d'un vrai numéro, pour que la garde ait un sens", () => {
    // Non-vacuité : si cette fonction renvoyait toujours faux, le test ci-dessus ne prouverait rien.
    expect(looksLikeRealNumber("FA-2026-000001")).toBe(true);
    expect(looksLikeRealNumber("RC-2026-000042")).toBe(true);
    expect(looksLikeRealNumber("FA-AAAA-SPECIMEN")).toBe(false);
  });

  it("n'utilise pas un SIRET plausible, qui pourrait désigner une vraie entreprise", () => {
    expect(SPECIMEN_SIRET.replace(/\s/g, "")).toBe("00000000000000");
    expect(SPECIMEN_DOCUMENT.issuer.siret).toBe(SPECIMEN_SIRET);
  });

  it("nomme un émetteur d'exemple explicite", () => {
    expect(SPECIMEN_DOCUMENT.issuer.name).toBe("La Ligue des VTC");
  });

  it("est reconnu comme spécimen par la garde d'affichage", () => {
    expect(isSpecimen(SPECIMEN_DOCUMENT)).toBe(true);
    expect(isSpecimen({ id: "un-vrai-document" })).toBe(false);
  });

  it("porte des montants qui se tiennent, pour que l'exemple soit lisible", () => {
    const { totalAmount, driverEarning, operatorShare, platformShare } = SPECIMEN_DOCUMENT;
    const sum = (driverEarning ?? 0) + (operatorShare ?? 0) + (platformShare ?? 0);
    expect(Math.round(sum * 100) / 100).toBe(totalAmount);
  });
});

/**
 * Le budget de requêtes des écrans d'argent.
 *
 * Deux optimisations qui se reperdent sans garde : le mode de paiement n'est lu que s'il n'y a rien
 * à afficher, et le relevé se recharge à la venue sur l'onglet plutôt qu'au montage. La seconde
 * n'est pas seulement une économie : un onglet reste monté, donc un chargement au montage affiche
 * un relevé périmé au chauffeur qui revient.
 */
describe("query budget of the money screens", () => {
  const { readFileSync } = require("fs") as {
    readFileSync: (path: string, encoding: string) => string;
  };
  const { join } = require("path") as { join: (...parts: string[]) => string };
  const read = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

  it("l'écran document ne lit le mode de paiement que s'il n'y a rien à afficher", () => {
    const screen = read(join("app", "ride-document.tsx"));

    expect(screen).not.toContain("Promise.all");
    expect(screen).toMatch(/if \(!parsed\) \{[\s\S]{0,200}from\('rides'\)/);
  });

  it("le relevé se recharge au focus, jamais au montage", () => {
    const screen = read(join("app", "(tabs)", "earnings.tsx"));

    expect(screen).toContain("useFocusEffect");
    expect(screen).not.toContain("useEffect(");
  });

  it("le spécimen reste marqué, et ne vient pas de la base", () => {
    const screen = read(join("app", "ride-document.tsx"));

    expect(screen).toContain("SPECIMEN_MARKER");
    // L'ecran affiche desormais le BON DE COMMANDE (D-25) : son specimen se reconnait a son
    // drapeau `order.specimen`. Le specimen de la facture — document COMPTABLE, dont le chemin est
    // conserve plus bas — reste reconnu par `isSpecimen`, et les deux portent la meme marque.
    expect(screen).toContain("order.specimen");
    // `isSpecimen(shown)` a disparu de CET ecran avec l'ancien corps de facture : le bon de
    // commande est le document du chauffeur, et la facture y garde seulement son chemin de repli.
    // Garder cette assertion aurait ete garder un mot, pas un comportement.
    // Aucune lecture de `platform_legal_identity` côté client : le spécimen ne coûte rien.
    expect(screen).not.toContain("platform_legal_identity");
  });
});
