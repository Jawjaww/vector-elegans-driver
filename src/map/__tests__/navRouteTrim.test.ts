import { buildMapHtmlTemplate } from "../mapHtmlTemplate";

/**
 * LA FLÈCHE BOUFFE LE TRACÉ, COMME PAC-MAN — sans reconstruire la géométrie.
 *
 * Retour du propriétaire : « le tracé bleu disparaît très mal derrière la flèche comparé à Waze :
 * la flèche devrait donner l'impression de bouffer le tracé comme le jeu Pac-Man, ce qui veut dire
 * que derrière la flèche il ne doit pas y avoir de tracé [...] on devrait même pas voir de tracé
 * bleu derrière la flèche quand elle est passée ».
 *
 * Ce fichier gardait la première réponse à cette demande : un ROGNAGE géométrique de la ligne
 * (`trimNavLineFrom` / `syncNavRouteStart`), étranglé à 5 m (ROUTE_TRIM_MIN_METERS). Le rognage
 * rendait la géométrie juste et coûtait trop cher : chaque recoupe refaisait un `setData` de la
 * ligne entière — mesuré à 2,8 ré-upload par seconde à 50 km/h — ce qui figeait la flèche et
 * faisait clignoter des bouts de route (travail de reconstruction dans le worker, invalidation des
 * tuiles, reconstruction du bucket, ré-upload du buffer de sommets).
 *
 * Le remède est le DÉGRADÉ DE PEINTURE : la source de route est créée avec `lineMetrics`, et
 * chaque couche de route reçoit une peinture `line-gradient` construite sur `["line-progress"]` —
 * transparent avant la fraction parcourue, couleur de route après. La mise à jour est un
 * `setPaintProperty` (appelable à chaque image, sans toucher à la géométrie), jamais un `setData`.
 *
 * Les deux moitiés de la règle restent tenues, parce qu'aucune ne suffit seule :
 *   - la coupure doit tomber sur la position AFFICHÉE de la flèche (`progressM`, pas le dernier
 *     point GPS), sinon le tracé court devant elle ;
 *   - son étranglement doit rester à l'échelle de la flèche, sinon la ligne reste dessinée sous
 *     elle pendant la distance parcourue entre deux mises à jour.
 *
 * Le second point est ici vérifié en conduite simulée : on compte les appels, on mesure l'écart
 * maximal entre la coupure et la flèche, et on vérifie qu'aucun `setData` n'a lieu — y compris en
 * rejouant l'état d'avant (le rognage à 5 m), qui doit être VU par le même compteur.
 */
const html = () => buildMapHtmlTemplate({ lat: 48.85, lng: 2.35 });

function extractBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

const ROUTE_LAYERS = ["route-line-glow", "route-casing", "route-line"];

type PaintCall = { layer: string; property: string; value: unknown };

/** Un document de carte réduit à ce que le dégradé touche : des couches et une source. */
function fakeMap() {
  const paints: PaintCall[] = [];
  const setDatas: unknown[] = [];
  const layers = new Set(ROUTE_LAYERS);
  return {
    paints,
    setDatas,
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    setPaintProperty: (layer: string, property: string, value: unknown) => {
      paints.push({ layer, property, value });
    },
    getSource: (id: string) =>
      id === "route" ? { setData: (data: unknown) => setDatas.push(data) } : undefined,
  };
}

type FakeMap = ReturnType<typeof fakeMap>;

type NavForEaten = {
  navigating: boolean;
  hasRoad: boolean;
  progressM: number | null;
  eatenFraction: number | null;
  eatenPaints: number;
};

/** L'API que le fragment expose au document — et au test, dans un scope qui ne contient rien d'autre. */
function eatenApi() {
  const fragment = extractBetween(
    html(),
    "/* VE_NAV_EATEN_START */",
    "/* VE_NAV_EATEN_END */",
  );
  // eslint-disable-next-line no-new-func
  return new Function(
    `${fragment}
    return {
      navEatenFraction: navEatenFraction,
      navEatenGradient: navEatenGradient,
      syncNavEatenRoute: syncNavEatenRoute,
      NAV_EATEN_MIN_METERS: NAV_EATEN_MIN_METERS,
      NAV_EATEN_LAYERS: NAV_EATEN_LAYERS,
    };`,
  )() as {
    navEatenFraction: (nav: NavForEaten, cum: number[] | null) => number | null;
    navEatenGradient: (fraction: number, color: string) => unknown[];
    syncNavEatenRoute: (
      mapRef: FakeMap,
      nav: NavForEaten,
      cum: number[] | null,
      force: boolean,
    ) => boolean;
    NAV_EATEN_MIN_METERS: number;
    NAV_EATEN_LAYERS: [string, string][];
  };
}

/**
 * L'ÉTAT D'AVANT, réduit à la propriété mesurée.
 *
 * C'est le rognage de #137 : garder l'ancre de la dernière recoupe et refaire un `setData` de la
 * géométrie dès que la flèche a couvert ROUTE_TRIM_MIN_METERS = 5 m. La géométrie recoupée n'est
 * pas reconstruite ici — c'est le NOMBRE de ré-uploads qui est en cause, et il est le même (un
 * `setData` par recoupe, avec toute la ligne dedans).
 */
const OLD_TRIM_MIN_METERS = 5;
function oldPerMeterTrim(map: FakeMap, nav: NavForEaten & { trimAnchorM?: number }) {
  if (!nav.navigating || !nav.hasRoad) return false;
  if (typeof nav.progressM !== "number") return false;
  const anchor = nav.trimAnchorM;
  if (anchor != null && nav.progressM - anchor < OLD_TRIM_MIN_METERS) return false;
  nav.trimAnchorM = nav.progressM;
  map.getSource("route")?.setData({ type: "Feature", properties: {}, geometry: {} });
  return true;
}

const LINE_TOTAL = 2000;
const CUM = [0, 500, 1000, 1500, LINE_TOTAL];

/** 50 km/h, la vitesse de la mesure d'origine : 13,9 m parcourus par seconde. */
const SPEED_MPS = 50 / 3.6;

/**
 * Une minute de conduite, échantillonnée comme la boucle d'affichage du document : 20 images par
 * seconde (NAV_DISPLAY_MIN_MS = 50).
 */
function drive(apply: (nav: NavForEaten, map: FakeMap) => void, seconds = 60, hz = 20) {
  const map = fakeMap();
  const nav: NavForEaten = {
    navigating: true,
    hasRoad: true,
    progressM: 0,
    eatenFraction: null,
    eatenPaints: 0,
  };
  let frames = 0;
  let worstLagMeters = 0;
  for (let i = 1; i <= seconds * hz; i++) {
    nav.progressM = Math.min(LINE_TOTAL, (SPEED_MPS * i) / hz);
    apply(nav, map);
    frames++;
    const hidden = nav.eatenFraction;
    if (typeof hidden === "number") {
      worstLagMeters = Math.max(
        worstLagMeters,
        (nav.progressM / LINE_TOTAL - hidden) * LINE_TOTAL,
      );
    }
  }
  return { map, nav, frames, worstLagMeters };
}

describe("the route is eaten at the arrow, by paint and not by geometry", () => {
  it("creates the route source with lineMetrics, which line-progress requires", () => {
    const source = html();

    // Sans lineMetrics, la source ne porte pas de progres par sommet : MapLibre retombe sur une
    // rampe vide et la division par zero du nuanceur (u_image_height = 0). Le tracé disparait.
    expect(source).toMatch(/lineMetrics:\s*sourceId === "route"/);
  });

  it("paints the eaten part on every route layer that would show behind the arrow", () => {
    const source = html();

    // Le casing et le glow partagent la source : un casing visible derriere la fleche ruinerait
    // l'effet. Les trois couches portent donc le degrade, chacune avec sa propre couleur — le
    // programme lineGradient n'utilise pas line-color, c'est la rampe qui peint.
    expect(source).toContain("VE_NAV_EATEN_START");
    expect(source).toContain('setPaintProperty(');
    expect(source).toContain('"line-gradient"');
    expect(source).toMatch(/"step", \["line-progress"\]/);
    expect(source).toMatch(/NAV_EATEN_LAYERS = \[/);

    const api = eatenApi();
    expect(api.NAV_EATEN_LAYERS.map(([id]) => id)).toEqual([
      "route-line-glow",
      "route-casing",
      "route-line",
    ]);
    // Chaque couche garde sa couleur : un degrade unique peindrait le casing a la teinte du trait.
    const colors = api.NAV_EATEN_LAYERS.map(([, color]) => color);
    expect(new Set(colors).size).toBe(3);
  });

  it("hides before the arrow and shows the road after it, as a hard step", () => {
    const api = eatenApi();
    const transparent = "rgba(0,0,0,0)";
    const road = "#1f6feb";
    const expr = api.navEatenGradient(0.25, road) as unknown[];
    const evaluate = (progress: number) => (progress < (expr[3] as number) ? expr[2] : expr[4]);

    expect(expr[0]).toBe("step");
    // `step` et non `interpolate` : avec une interpolation, MapLibre garde une rampe de 256 px
    // etiree sur toute la ligne et filtree lineairement, donc la coupure s'etale sur 1/256 de la
    // longueur (30 m sur une ligne de 8 km). `step` fait choisir une rampe a la resolution du
    // trait, echantillonnee au plus proche : la coupure tombe sur le pixel de la fleche.
    expect(expr[1]).toEqual(["line-progress"]);
    expect(expr[2]).toBe(transparent);
    expect(expr[3]).toBe(0.25);
    expect(expr[4]).toBe(road);
    expect(evaluate(0)).toBe(transparent);
    expect(evaluate(0.24)).toBe(transparent);
    expect(evaluate(0.26)).toBe(road);
    expect(evaluate(1)).toBe(road);
  });

  it("cannot hide anything without a road line or a position to hide before", () => {
    const api = eatenApi();
    const nav: NavForEaten = {
      navigating: true,
      hasRoad: true,
      progressM: 500,
      eatenFraction: null,
      eatenPaints: 0,
    };

    expect(api.navEatenFraction(nav, CUM)).toBeCloseTo(500 / LINE_TOTAL, 6);
    expect(api.navEatenFraction({ ...nav, hasRoad: false }, CUM)).toBeNull();
    expect(api.navEatenFraction({ ...nav, navigating: false }, CUM)).toBeNull();
    expect(api.navEatenFraction({ ...nav, progressM: null }, CUM)).toBeNull();
    expect(api.navEatenFraction(nav, null)).toBeNull();
    // La fleche au depart : rien n'est efface, et la ligne commence a la fleche.
    expect(api.navEatenFraction({ ...nav, progressM: 0 }, CUM)).toBe(0);
    // Au-dela du bout : tout est derriere, la ligne ne doit pas depasser.
    expect(api.navEatenFraction({ ...nav, progressM: LINE_TOTAL * 2 }, CUM)).toBe(1);
  });

  it("re-uploads no route geometry, and paints the cut instead", () => {
    const api = eatenApi();
    const { map, nav, frames, worstLagMeters } = drive((state, fake) =>
      api.syncNavEatenRoute(fake, state, CUM, false),
    );

    // Aucun setData : la geometrie n'est plus touchee une seule fois pendant une minute de
    // conduite. C'est le garde qui doit echouer si le rognage par metre revient.
    expect(map.setDatas).toHaveLength(0);
    // Les trois couches sont repeintes a chaque mise a jour, uniquement en peinture.
    expect(map.paints.every((p) => p.property === "line-gradient")).toBe(true);
    expect(nav.eatenPaints).toBeGreaterThan(0);
    expect(map.paints).toHaveLength(nav.eatenPaints * 3);
    expect(nav.eatenPaints).toBeLessThanOrEqual(frames);
    // Mesure : 600 repeints par minute, soit un tous les 1,39 m et non tous les 1 m — la condition
    // est lue a chaque image d'affichage (20 Hz), donc la coupure avance par pas de deux images.
    // Trois setPaintProperty par repeint (un par couche), et aucun setData.
    expect(nav.eatenPaints).toBeGreaterThanOrEqual(590);
    expect(nav.eatenPaints).toBeLessThanOrEqual(610);
    // La coupure reste derriere la fleche d'au plus l'etranglement : c'est ce qui la cache SOUS
    // elle plutot que de laisser un morceau de bleu qui depasse.
    expect(worstLagMeters).toBeLessThanOrEqual(api.NAV_EATEN_MIN_METERS);
    expect(worstLagMeters).toBeGreaterThan(0);
  });

  it("sees the old per-metre rognage, so the guard above is not vacuous", () => {
    // Le meme compteur, la meme minute, l'etat d'avant : le rognage a 5 m re-uploade la geometrie.
    // Mesure : 150 setData par minute (2,5 par seconde), et non les 2,8 de l'arithmetique du seuil
    // — la condition etant lue a chaque image d'affichage (20 Hz), la recoupe tombe tous les
    // 5,56 m et non tous les 5 m. Si ce test passait avec zero, le garde precedent ne prouverait
    // rien.
    const { map, frames } = drive((state, fake) => oldPerMeterTrim(fake, state));

    expect(frames).toBe(1200);
    expect(map.setDatas.length).toBeGreaterThanOrEqual(145);
    expect(map.setDatas.length).toBeLessThanOrEqual(155);
    expect(map.paints).toHaveLength(0);
  });

  it("puts the cut back immediately when the position jumps backwards", () => {
    const api = eatenApi();
    const map = fakeMap();
    const nav: NavForEaten = {
      navigating: true,
      hasRoad: true,
      progressM: 1000,
      eatenFraction: null,
      eatenPaints: 0,
    };

    expect(api.syncNavEatenRoute(map, nav, CUM, false)).toBe(true);
    const afterJump = { ...nav, progressM: 400 };
    // Un resync (reroute, teleportation GPS) doit remettre la coupure en place tout de suite :
    // l'etranglement ne vaut que pour une avancee, jamais pour un recul.
    expect(api.syncNavEatenRoute(map, afterJump, CUM, false)).toBe(true);
    expect(afterJump.eatenFraction).toBeCloseTo(0.2, 6);
  });

  it("repaints when the layers were rebuilt, even at the same position", () => {
    const api = eatenApi();
    const map = fakeMap();
    const nav: NavForEaten = {
      navigating: true,
      hasRoad: true,
      progressM: 640,
      eatenFraction: null,
      eatenPaints: 0,
    };

    expect(api.syncNavEatenRoute(map, nav, CUM, false)).toBe(true);
    // Meme position, mais setOrAddLine vient de recreer les couches : leur peinture est perdue.
    expect(api.syncNavEatenRoute(map, nav, CUM, false)).toBe(false);
    expect(api.syncNavEatenRoute(map, nav, CUM, true)).toBe(true);
    expect(map.paints).toHaveLength(6);
  });
});

describe("the per-metre trim is gone from the document", () => {
  it("keeps no trim threshold, anchor or geometry cut", () => {
    const source = html();

    // Le seuil bas qui reconstruisait la geometrie tous les 5 m : sa reapparition est le defaut.
    // Les sondes visent le CODE, jamais les commentaires — l'histoire du rognage reste racontee
    // dans le document, et nommer une fonction disparue ne doit pas faire echouer ce garde.
    expect(source).not.toContain("var ROUTE_TRIM_MIN_METERS");
    expect(source).not.toMatch(/function (trimNavLineFrom|syncNavRouteStart)\(/);
    expect(source).not.toContain("nav.trimAnchor");
    // La source de route n'est plus jamais re-nourrie : aucune lecture de la source pour la
    // remplir. C'est le seul chemin qui re-uploade la geometrie entiere.
    expect(source).not.toContain('map.getSource("route")');
  });

  it("never calls setData from the display loop, nor from a guidance tick", () => {
    const source = html();
    const display = extractBetween(
      source,
      "/* VE_NAV_DISPLAY_START */",
      "/* VE_NAV_DISPLAY_END */",
    );
    const planned = extractBetween(
      source,
      "    function guideTickPlanned(coords, opts) {",
      "    /**\n     * Where the tick just placed the puck vertically",
    );

    expect(display).toContain("syncNavEatenRoute(");
    expect(display).not.toContain(".setData(");
    expect(planned).toContain("syncNavEatenRoute(");
    expect(planned).not.toContain(".setData(");
  });
});
