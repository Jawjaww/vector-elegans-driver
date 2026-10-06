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

/**
 * L'EN-TÊTE TIENT SUR UNE LIGNE, ET LES PHRASES INUTILES SONT PARTIES.
 *
 * Retour du propriétaire : « la première carte est mal faite, mets spécimen à droite et bon de
 * commande sur la même ligne pour gagner de l'espace. Enlève les phrases superflues comme
 * *Justificatif de réservation préalable*. Ou alors ce qu'il y a en jaune en dessous […]
 * Dégage-moi ça, on s'en fout. Ainsi on gagnera de l'espace. »
 *
 * Deux lignes pour un titre et un badge, et deux phrases qui n'apprennent rien, sur un document
 * qu'on lit dans une voiture : la place se paie. Ce test tient les deux.
 */
describe("the booking order header", () => {
  // Aucun type Node dans ce projet, et ces requires sont locaux a ce describe — le motif du
  // fichier, qui les declare la ou ils servent.
  const { readFileSync } = require("fs") as {
    readFileSync: (path: string, encoding: string) => string;
  };
  const { join } = require("path") as { join: (...parts: string[]) => string };
  const screen = () =>
    readFileSync(join(process.cwd(), "app", "ride-document.tsx"), "utf8");

  it("met le titre et la marque sur une seule ligne, la marque à droite", () => {
    const source = screen();
    const titleAt = source.indexOf("bookingOrder.title");
    // On exprime la RELATION, pas une fenêtre de caracteres : une fenetre se fait deborder par un
    // commentaire — c'est ce qui est arrive a ma premiere version, qui cherchait la ligne dans les
    // 420 caracteres precedant le titre.
    const rowAt = source.lastIndexOf("justify-between", titleAt);
    const markerAt = source.indexOf("SPECIMEN_MARKER", titleAt);

    // Le titre est dans une ligne qui repartit ses enfants…
    expect(rowAt).toBeGreaterThan(-1);
    expect(titleAt - rowAt).toBeLessThan(700);
    // …et la marque vient APRES le titre, donc a sa droite.
    expect(markerAt).toBeGreaterThan(titleAt);
    expect(markerAt - titleAt).toBeLessThan(700);
  });

  it("n'affiche plus les phrases qui n'apprennent rien", () => {
    // Non-vacuité : ces deux chaînes étaient présentes avant ce lot.
    expect(screen()).not.toContain("bookingOrder.subtitle");
    expect(screen()).not.toContain("specimenNotice");
  });
});

/**
 * LES ADRESSES S'ÉCRIVENT EN ENTIER.
 *
 * Retour du propriétaire : « je t'ai déjà dit que la carte *course* était beaucoup trop compacte
 * car il y a un problème d'espace pour la ligne d'adresse de la prise en charge et la destination.
 * Pour le reste, c'est ok. »
 *
 * Le défaut était le mien, et il venait du lot précédent : en unifiant la densité, je n'avais pas
 * regardé la LONGUEUR des valeurs. Toutes les lignes passaient par un gabarit à `numberOfLines={1}`,
 * qui tronque — or une adresse tronquée ne dit plus où l'on prend le client, c'est-à-dire
 * exactement la mention que ce document existe pour porter.
 */
describe("the trip rows", () => {
  const { readFileSync } = require("fs") as {
    readFileSync: (path: string, encoding: string) => string;
  };
  const { join } = require("path") as { join: (...parts: string[]) => string };
  const screen = () =>
    readFileSync(join(process.cwd(), "app", "ride-document.tsx"), "utf8");

  it("fait passer les deux adresses par le gabarit empilé", () => {
    const source = screen();

    // Les deux clés, nommées ensemble : c'est ce qui les distingue des lignes courtes.
    const keys = source.slice(source.indexOf("const STACKED_ROW_KEYS"));
    expect(keys.slice(0, 200)).toContain("bookingOrder.pickupAddress");
    expect(keys.slice(0, 200)).toContain("bookingOrder.dropoffAddress");

    // Et elles sont RÉELLEMENT branchées : sans cet appel, le gabarit existe sans servir.
    expect(source).toContain("stacked={STACKED_ROW_KEYS.includes(row.labelKey)}");
  });

  it("n'impose aucune limite de lignes à l'adresse", () => {
    // La ligne EXACTE du gabarit empile : la valeur sur sa propre ligne, sans numberOfLines.
    // Une assertion par extraction de bloc s'est revelee fragile — elle partait jusqu'a la fin du
    // fichier quand le motif cherche n'etait pas trouve, et passait donc pour de mauvaises raisons.
    expect(screen()).toContain(
      '<Text className="text-slate-200 text-[12px] mt-0.5">{value}</Text>',
    );
  });

  it("garde les lignes courtes sur une seule ligne", () => {
    // La densité du reste est validée par le propriétaire : elle ne doit pas bouger.
    const source = screen();
    const lastRow = source.lastIndexOf("numberOfLines={1}");

    expect(lastRow).toBeGreaterThan(-1);
  });
});
