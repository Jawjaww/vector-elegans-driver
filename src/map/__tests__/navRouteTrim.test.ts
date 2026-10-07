import { buildMapHtmlTemplate } from "../mapHtmlTemplate";

/**
 * LA FLÈCHE BOUFFE LE TRACÉ, COMME PAC-MAN — SANS ÉTOUFFER LA BOUCLE D'AFFICHAGE.
 *
 * Retour du propriétaire : « le tracé bleu disparaît très mal derrière la flèche comparé à Waze :
 * la flèche devrait donner l'impression de bouffer le tracé comme le jeu Pac-Man, ce qui veut dire
 * que derrière la flèche il ne doit pas y avoir de tracé [...] on ne devrait même pas voir de tracé
 * bleu derrière la flèche quand elle est passée ».
 *
 * Ce test tient les TROIS moitiés de la règle, parce qu'aucune ne suffit seule :
 *   - le rognage doit partir de la position AFFICHÉE de la flèche, pas du dernier point GPS ;
 *   - son étranglement doit rester à l'échelle de la flèche, sinon la ligne reste dessinée
 *     sous elle pendant la distance parcourue entre deux rognages ;
 *   - et il doit rester BORNÉ en fréquence : `syncNavRouteStart` ré-uploaderait sinon toute la
 *     géométrie de route à chaque mètre, sur la boucle d'affichage — c'est la régression qui a
 *     été signalée (« la flèche se bloque au bout de quelques secondes »).
 *
 * Régression mesurée en pilotant le vrai code extrait du document (voir `drive()`), à 50 km/h,
 * 20 Hz, sur 60 s : 400 setData/60 s (6,7/s) à 2 m contre 33 (0,6/s) à 25 m. La valeur livrée doit
 * donc être un compromis : sous l'empreinte de la flèche (sinon le défaut Pac-Man revient) et pas
 * à chaque mètre (sinon la boucle étouffe).
 */
const html = () => buildMapHtmlTemplate({ lat: 48.85, lng: 2.35 });

function extractBetween(document: string, startMarker: string, endMarker: string) {
  const start = document.indexOf(startMarker);
  const end = document.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return document.slice(start, end);
}

/** Slice one function out of the document text, braces balanced. */
function sliceFunction(document: string, signature: string): string {
  const start = document.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = document.indexOf("{", start); i < document.length; i++) {
    if (document[i] === "{") depth++;
    else if (document[i] === "}") {
      depth--;
      if (depth === 0) return document.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced function: ${signature}`);
}

const LAT = 48.85;
const LNG0 = 2.35;
/** Metres per degree of longitude at LAT — the same flat-local metric the helpers use. */
const M_PER_DEG = 111320 * Math.cos((LAT * Math.PI) / 180);

/** A router-like road: vertices every 25 m, due east. */
function straightRoute(metres: number): number[][] {
  const out: number[][] = [];
  for (let d = 0; d <= metres; d += 25) out.push([LNG0 + d / M_PER_DEG, LAT]);
  return out;
}

function coordsAt(distanceM: number): number[] {
  return [LNG0 + distanceM / M_PER_DEG, LAT];
}

/**
 * The real `syncNavRouteStart` / `trimNavLineFrom` / `lineFeature`, sliced out of the built
 * document and evaluated with a `map` stub that counts uploads — so the measurement is of the
 * code the phone runs, not of a model of it.
 */
function trimScope(metres: number, line: number[][]) {
  const document = html();
  const helpers = extractBetween(
    document,
    "/* VE_NAV_HELPERS_START */",
    "/* VE_NAV_HELPERS_END */",
  );
  const fns = [
    sliceFunction(document, "function lineFeature(coords)"),
    sliceFunction(document, "function trimNavLineFrom(coords)"),
    sliceFunction(document, "function syncNavRouteStart(coords)"),
  ].join("\n");
  const uploads: string[] = [];
  const nav: Record<string, unknown> = {
    navigating: true,
    hasRoad: true,
    generation: 1,
    line,
    trimAnchor: null,
  };
  const fakeWindow = { __veNav: nav };
  const map = {
    getSource: () => ({
      setData: (feature: unknown) => uploads.push(JSON.stringify(feature)),
    }),
  };
  // eslint-disable-next-line no-new-func
  const api = new Function(
    "window",
    "map",
    "ROUTE_TRIM_MIN_METERS",
    `${helpers}\n${fns}\nreturn { syncNavRouteStart: syncNavRouteStart };`,
  )(fakeWindow, map, metres) as {
    syncNavRouteStart: (coords: number[]) => boolean;
  };
  return { api, nav, uploads };
}

/** Drive the display loop: 20 Hz, constant speed, the interpolated point handed to the trim. */
function drive(metres: number, seconds: number, speedMps: number) {
  const line = straightRoute(speedMps * seconds + 50);
  const { api, uploads, nav } = trimScope(metres, line);
  const hz = 20;
  let cuts = 0;
  for (let i = 0; i < seconds * hz; i++) {
    const travelled = (speedMps * i) / hz;
    if (api.syncNavRouteStart(coordsAt(travelled))) cuts++;
  }
  return {
    metres,
    cuts,
    perSecond: cuts / seconds,
    uploadBytes: uploads.reduce((sum, json) => sum + json.length, 0),
    lineVertices: line.length,
    nav,
  };
}

/** The throttle value the document actually ships, read from the built HTML. */
function shippedTrimMetres(): number {
  const match = html().match(/var ROUTE_TRIM_MIN_METERS = (\d+(?:\.\d+)?);/);
  expect(match).not.toBeNull();
  return Number(match?.[1]);
}

describe("the route is eaten at the arrow", () => {
  it("rogne la ligne depuis la position affichée de la flèche", () => {
    const source = html();

    // `paintPoint` est la position interpolée que la flèche affiche ; `coords` est le point GPS.
    // Rogner depuis le second laisserait la ligne courir jusqu'au fix, donc devant la flèche.
    expect(source).toContain("syncNavRouteStart(onLine ? paintPoint : coords)");
  });

  it("garde l'étranglement à l'échelle de la flèche", () => {
    const metres = shippedTrimMetres();

    // Une flèche de guidage couvre une dizaine de mètres à l'écran : en deçà, le reste de ligne
    // est caché SOUS elle. Au-delà, il dépasse derrière et se voit — c'est le défaut rapporté.
    // La borne basse exclut 2 m, la régression qui étouffait la boucle d'affichage.
    expect(metres).toBeGreaterThanOrEqual(5);
    expect(metres).toBeLessThanOrEqual(10);
    // La valeur qui produisait le défaut Pac-Man, nommée pour que la régression soit lisible.
    expect(metres).not.toBe(25);
  });

  it("borne le coût du rognage sur la boucle d'affichage (mesure, pas déduction)", () => {
    // 50 km/h = 13,9 m/s, la vitesse d'une rue urbaine dégagée ; le pas de 2 m est celui de la
    // régression, 25 m celui de l'état d'avant.
    const measured = [2, 5, 6, 10, 25].map((value) => drive(value, 60, 13.9));
    const ligne = measured
      .map(
        (m) =>
          `${m.metres} m : ${m.cuts} setData/60 s (${m.perSecond.toFixed(1)}/s, ` +
          `${(m.uploadBytes / 1024).toFixed(0)} Kio ré-uploadés)`,
      )
      .join(" | ");
    // eslint-disable-next-line no-console
    console.log(`[mesure] rognage à 50 km/h : ${ligne}`);

    const shipped = drive(shippedTrimMetres(), 60, 13.9);
    const atTwo = measured.find((m) => m.metres === 2)!;

    // La valeur livrée ne doit pas refaire un setData de la géométrie à chaque seconde de trajet.
    expect(shipped.perSecond).toBeLessThanOrEqual(3);
    // Non-vacuité : à 2 m, c'est bien la boucle qui est étouffée — le test échoue sur cet état.
    expect(atTwo.cuts).toBeGreaterThan(shipped.cuts * 2);
  });

  it("compte les rognages et les publie dans le diagnostic de guidage", () => {
    const shipped = drive(shippedTrimMetres(), 60, 13.9);

    // Le compteur suit exactement les setData : le delta entre deux nav_tick sur le téléphone
    // mesure donc la même chose que la mesure hors ligne de ce fichier.
    expect(shipped.nav.trimCuts).toBe(shipped.cuts);

    const source = html();
    expect(source).toContain("nav.trimCuts = (nav.trimCuts || 0) + 1;");
    expect(source).toContain("trim_cuts: nav.trimCuts || 0");
  });

  it("rocrne la géométrie, il ne se contente pas d'effacer la source", () => {
    const source = html();

    // Le premier sommet du tracé dessiné est le point de la flèche : c'est ce qui fait qu'il n'y a
    // rien derrière elle, plutôt qu'une ligne masquée à une certaine opacité.
    expect(source).toContain("const rest = [snap.point];");
    expect(source).toContain("if (walked > snap.traveledMeters + 1) rest.push(line[i + 1]);");
  });
});
