import {
  ARRIVAL_CHIP_DISTANCE_CAPTION_KEY,
  ARRIVAL_CHIP_ETA_CAPTION_KEY,
  formatArrivalClock,
  formatRemainingDistance,
  maneuverActionPhrase,
  maneuverBannerParts,
  maneuverToFeatherIcon,
  nextManeuverAlongTrack,
  optimisticEtaMinutes,
  steppedManeuverDistance,
  tripStageBannerParts,
  type OsrmStepLike,
} from '../utils/navProgress';

describe('navProgress', () => {
  it('optimisticEtaMinutes applies 0.85 factor', () => {
    // 600s * 0.85 = 510s → 9 min
    expect(optimisticEtaMinutes(600, 5000)).toBe(9);
  });

  it('optimisticEtaMinutes floors at 1 min when far enough', () => {
    expect(optimisticEtaMinutes(10, 200)).toBe(1);
    expect(optimisticEtaMinutes(0, 50)).toBe(0);
  });

  it('formatRemainingDistance switches units', () => {
    expect(formatRemainingDistance(850)).toBe('850 m');
    expect(formatRemainingDistance(1500)).toBe('1.5 km');
  });

  it('steppedManeuverDistance only moves at the announcement steps', () => {
    // A 3 m change at 500 m must not rewrite the sentence; crossing 100 m must.
    expect(steppedManeuverDistance(348)).toBe(350);
    expect(steppedManeuverDistance(345)).toBe(350);
    expect(steppedManeuverDistance(2320)).toBe(2300);
    expect(steppedManeuverDistance(104)).toBe(100);
    expect(steppedManeuverDistance(96)).toBe(100);
    expect(steppedManeuverDistance(24)).toBe(20);
    expect(steppedManeuverDistance(17)).toBe(15);
    expect(steppedManeuverDistance(null)).toBeNull();
  });

  it('tripStageBannerParts still names the target with no maneuver', () => {
    // Non-vacuity for the HUD gate: with no step from the router this is the only line the
    // driver gets, and it must not be empty.
    expect(tripStageBannerParts('to_pickup', 1200)).toEqual({
      action: { key: 'nav.stage.toPickup' },
      distance: { key: 'nav.distance.bare', params: { distance: '1.2 km' } },
    });
    expect(tripStageBannerParts('to_dropoff', 348)).toEqual({
      action: { key: 'nav.stage.toDropoff' },
      distance: { key: 'nav.distance.bare', params: { distance: '350 m' } },
    });
    expect(tripStageBannerParts('to_pickup', null)).toEqual({
      action: { key: 'nav.stage.toPickup' },
      distance: null,
    });
    // An unknown stage is the pickup leg rather than an empty card.
    expect(tripStageBannerParts(null, 0).action).toEqual({
      key: 'nav.stage.toPickup',
    });
  });

  it('formatArrivalClock adds eta minutes to local clock', () => {
    const now = new Date(2026, 7, 25, 14, 5, 0); // local 14:05
    expect(formatArrivalClock(9, now)).toBe('14:14');
    expect(formatArrivalClock(0, now)).toBe('14:05');
  });

  it('names each figure of the arrival chip', () => {
    // The chip read `5,8 km · 14h25`, and the report was that neither number could be read: "you
    // cannot tell that it means 5.8 km from the arrival point and that you get there at 14:25".
    // Two bare figures with a dot between them look like the same kind of thing. Copy, not
    // styling — so it is asserted like the rest of the driver-facing lines here.
    expect(ARRIVAL_CHIP_DISTANCE_CAPTION_KEY).toBe('nav.arrival.remaining');
    expect(ARRIVAL_CHIP_ETA_CAPTION_KEY).toBe('nav.arrival.eta');
  });

  it('maneuverToFeatherIcon maps turns', () => {
    expect(maneuverToFeatherIcon('turn', 'left')).toBe('corner-up-left');
    expect(maneuverToFeatherIcon('turn', 'right')).toBe('corner-up-right');
    expect(maneuverToFeatherIcon('continue', 'straight')).toBe('arrow-up');
    expect(maneuverToFeatherIcon('arrive')).toBe('flag');
  });

  it('splits the instruction where it is read, as keys a translator can reach', () => {
    // The halves are keys rather than sentences: this module holds no locale, so the French,
    // English or Spanish wording lives in the bundles and is chosen by the phone. What is pinned
    // here is the decision, which is what used to be a French string.
    expect(maneuverBannerParts('turn', 'right', 60)).toEqual({
      action: { key: 'nav.maneuver.right' },
      distance: { key: 'nav.distance.in', params: { distance: '60 m' } },
    });
    expect(maneuverBannerParts('turn', 'slight left', 200)).toEqual({
      action: { key: 'nav.maneuver.slightLeft' },
      distance: { key: 'nav.distance.in', params: { distance: '200 m' } },
    });
    expect(maneuverActionPhrase('continue', 'straight')).toEqual({
      key: 'nav.maneuver.straight',
    });
    // Arrival is not something to be "in 12 m": the action is the whole sentence. The rule reads
    // the *key*, so rewording or translating the sentence cannot switch it back on — which is
    // exactly what the French-string comparison it replaced would have done.
    expect(maneuverBannerParts('arrive', undefined, 12)).toEqual({
      action: { key: 'nav.maneuver.arrive' },
      distance: null,
    });
    // A roundabout exit goes out as a count, so each locale builds its own ordinal suffix from
    // `Intl.PluralRules`: "1re", "1st", "1ª", and "21e" / "21st" rather than a fixed table.
    expect(maneuverBannerParts('roundabout', undefined, 80, 2)).toEqual({
      action: {
        key: 'nav.maneuver.roundaboutExit',
        params: { count: 2, ordinal: true },
      },
      distance: { key: 'nav.distance.in', params: { distance: '80 m' } },
    });
    expect(maneuverBannerParts('rotary', undefined, 30)).toEqual({
      action: { key: 'nav.maneuver.roundabout' },
      distance: { key: 'nav.distance.in', params: { distance: '30 m' } },
    });
    // A spent distance is not announced as zero: the action carries the card alone.
    expect(maneuverBannerParts('turn', 'right', 0).distance).toBeNull();
  });

  const steps: OsrmStepLike[] = [
    { distance: 100, name: 'Rue A', maneuver: { type: 'depart' } },
    {
      distance: 80,
      name: 'Rue B',
      maneuver: { type: 'turn', modifier: 'right' },
    },
    {
      distance: 20,
      name: 'Rue C',
      maneuver: { type: 'turn', modifier: 'left' },
    },
    { distance: 0, name: 'Arrivée', maneuver: { type: 'arrive' } },
  ];

  it('names the turn still ahead along the route', () => {
    const next = nextManeuverAlongTrack(steps, 40);
    expect(next).toMatchObject({
      type: 'turn',
      modifier: 'right',
      distanceMeters: 60,
      name: 'Rue B',
    });
  });

  it('skips a turn already passed, including one only a few metres back', () => {
    const passed = nextManeuverAlongTrack(steps, 110);
    expect(passed).toMatchObject({
      modifier: 'left',
      distanceMeters: 70,
      name: 'Rue C',
    });
    const close = nextManeuverAlongTrack(steps, 175);
    expect(close).toMatchObject({
      modifier: 'left',
      distanceMeters: 5,
      name: 'Rue C',
    });
  });

  it('reports arrival from the remaining along-track distance', () => {
    expect(nextManeuverAlongTrack(steps, 190)).toMatchObject({
      type: 'arrive',
      distanceMeters: 10,
    });
    expect(nextManeuverAlongTrack(steps, 250)).toMatchObject({
      type: 'arrive',
      distanceMeters: 0,
    });
    expect(nextManeuverAlongTrack([], 0)).toBeNull();
  });
});

/**
 * « EXIT ROUNDABOUT » EST UN ROND-POINT, PAS UN TOUT DROIT.
 *
 * OSRM pose DEUX manœuvres pour un rond-point : `roundabout` à l'entrée (avec le numéro de sortie),
 * puis `exit roundabout` SUR l'anneau. Ce second type n'avait aucune branche dans
 * `maneuverActionPhrase`, donc il tombait dans le `return` final — **« continuez tout droit »** —
 * pendant que le chauffeur tournait sur le rond-point. Et `isRoundabout` avait la même liste, donc
 * le HUD dessinait une flèche tout droit.
 *
 * Rapport du propriétaire : « parfois je passais un rond-point et ça n'affichait pas le rond-point ».
 * Corrigé, et ce test échoue sur l'état d'avant : la phrase y était celle du tout droit.
 */
describe("a roundabout is announced on the ring too", () => {
  it("nomme le rond-point quand on est dessus, pas le tout droit", () => {
    const phrase = maneuverActionPhrase('exit roundabout');

    expect(phrase.key).toBe('nav.maneuver.roundaboutLeave');
    // Non-vacuité : c'est exactement ce que rendait l'ancien code.
    expect(phrase.key).not.toBe('nav.maneuver.straight');
  });

  it("reconnaît aussi la variante rotary", () => {
    expect(maneuverActionPhrase('exit rotary').key).toBe('nav.maneuver.roundaboutLeave');
  });

  it("garde l'entrée du rond-point, avec son numéro de sortie", () => {
    // La manœuvre d'entrée porte le numéro : elle ne doit pas avoir été emportée par le correctif.
    expect(maneuverActionPhrase('roundabout', undefined, 2)).toEqual({
      key: 'nav.maneuver.roundaboutExit',
      params: { count: 2, ordinal: true },
    });
    expect(maneuverActionPhrase('roundabout', undefined, undefined).key).toBe(
      'nav.maneuver.roundabout',
    );
  });
});

/**
 * AUCUN TYPE OSRM NE DOIT TOMBER DANS « TOUT DROIT » PAR ACCIDENT.
 *
 * Le défaut du rond-point (round 8) n'était pas une erreur de logique : c'était un **silence**.
 * `maneuverActionPhrase` finit par `return { key: 'nav.maneuver.straight' }`, donc **tout type non
 * prévu devient « continuez tout droit »** — une phrase qui a l'air d'une réponse et qui envoie au
 * mauvais endroit. `exit roundabout` a vécu des mois dans ce trou.
 *
 * Ce test énumère les types de manœuvre d'OSRM et exige, pour chacun, une décision ÉCRITE : soit une
 * phrase propre, soit l'aveu explicite que « tout droit » est la bonne réponse. Un type nouveau
 * échoue ici au lieu de se taire sur le pare-brise.
 *
 * Les branches de modificateur rattrapent la plupart des types (`end of road` + « right »,
 * `ramp` + « slight right ») : c'est pourquoi le rond-point était le SEUL à tomber — il n'a pas de
 * modificateur.
 */
describe("every OSRM maneuver type is a written decision", () => {
  /**
   * Les types qui veulent légitimement dire « continuez » : la route change de nom, le routeur
   * signale une notification, ou il n'y a rien à faire. Cette liste est une DÉCISION, pas un oubli.
   */
  // `depart` n'y est PAS : il a sa propre phrase (« Départ »), et c'est mon test qui me l'a
  // appris — je l'avais range dans les exceptions par etourderie.
  const MEANS_STRAIGHT = new Set(['continue', 'new name', 'notification', 'turn']);

  /** Les types d'OSRM, avec un modificateur absent — le pire cas, celui du rond-point. */
  const OSRM_TYPES = [
    'turn',
    'new name',
    'depart',
    'arrive',
    'merge',
    'ramp',
    'fork',
    'end of road',
    'continue',
    'roundabout',
    'rotary',
    'roundabout turn',
    'notification',
    'exit roundabout',
    'exit rotary',
  ];

  it.each(OSRM_TYPES)("« %s » a une phrase, ou assume le tout droit", (type) => {
    const phrase = maneuverActionPhrase(type);

    if (MEANS_STRAIGHT.has(type)) {
      // Une décision écrite : ces types-là DOIVENT dire tout droit.
      expect(phrase.key).toBe('nav.maneuver.straight');
      return;
    }

    // Tous les autres portent une phrase propre. « straight » ici serait le silence d'avant.
    expect(phrase.key).not.toBe('nav.maneuver.straight');
  });

  it("n'oublie pas les deux types du rond-point dans les exceptions", () => {
    // Non-vacuité : si quelqu'un ajoutait `exit roundabout` aux exceptions pour faire passer le
    // test, il affirmerait que « tout droit » est la bonne réponse SUR un rond-point.
    expect(MEANS_STRAIGHT.has('exit roundabout')).toBe(false);
    expect(MEANS_STRAIGHT.has('roundabout')).toBe(false);
  });
});
