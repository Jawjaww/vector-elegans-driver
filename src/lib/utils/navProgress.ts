export type NavManeuver = {
  type: string;
  modifier?: string;
  distanceMeters: number;
  name?: string;
  /** OSRM roundabout exit, 1-based. Absent on ordinary turns. */
  exit?: number;
};

/** One OSRM step, only the fields the along-track picker reads. */
export type OsrmStepLike = {
  distance?: number;
  name?: string;
  maneuver?: {
    type?: string;
    modifier?: string | null;
    exit?: number | null;
  };
};

export type AlongTrackManeuver = {
  type: string;
  modifier: string | null;
  distanceMeters: number;
  name: string;
  exit: number | null;
};

/**
 * Next instruction measured along the route, not as the crow flies.
 *
 * OSRM places each maneuver at the start of its step. The distance to it is
 * the sum of the previous steps' lengths. A maneuver already reached
 * (cumulative <= traveled) is skipped, including two turns a few metres apart.
 */
export function nextManeuverAlongTrack(
  steps: OsrmStepLike[] | null | undefined,
  traveledMeters: number,
): AlongTrackManeuver | null {
  if (!steps?.length) return null;
  const traveled = Number.isFinite(traveledMeters)
    ? Math.max(0, traveledMeters)
    : 0;
  let cumulative = 0;
  let fallback: AlongTrackManeuver | null = null;
  for (const step of steps) {
    const man = step?.maneuver ?? {};
    const type = String(man.type || 'turn').toLowerCase();
    const at = cumulative;
    const stepDist = Number(step?.distance);
    if (Number.isFinite(stepDist) && stepDist > 0) cumulative += stepDist;
    if (type === 'depart') continue;
    const maneuver: AlongTrackManeuver = {
      type: man.type || 'turn',
      modifier: man.modifier || null,
      distanceMeters: Math.max(0, Math.round(at - traveled)),
      name: step?.name || '',
      exit: typeof man.exit === 'number' ? man.exit : null,
    };
    fallback = maneuver;
    if (at > traveled) return maneuver;
  }
  return fallback;
}

export type NavProgress = {
  distanceMeters: number;
  durationSeconds: number;
  nextManeuver?: NavManeuver | null;
  /** Metres already covered along the snapped polyline. */
  alongTrackMeters?: number | null;
};

type FeatherIconName =
  keyof typeof import('@expo/vector-icons').Feather.glyphMap;

/** Optimistic ETA in whole minutes (OSRM duration × 0.85). */
export function optimisticEtaMinutes(
  durationSeconds: number,
  distanceMeters: number,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return distanceMeters > 80 ? 1 : 0;
  }
  const optimistic = Math.ceil((durationSeconds * 0.85) / 60);
  if (optimistic < 1 && distanceMeters > 80) return 1;
  return Math.max(0, optimistic);
}

export function formatRemainingDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

/**
 * Round a distance to the step the banner is allowed to announce.
 *
 * The pushed progress is throttled and noisy, so a raw metre value rewrote the sentence every
 * time the car moved — "dans 348 m", "dans 345 m". Stepping the number is what makes the
 * instruction change when it matters (100 m, 50 m, 20 m) instead of when it can.
 */
export function steppedManeuverDistance(
  meters: number | null | undefined,
): number | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;
  if (meters <= 0) return 0;
  if (meters > 1000) return Math.round(meters / 100) * 100;
  if (meters > 100) return Math.round(meters / 50) * 50;
  if (meters > 20) return Math.round(meters / 10) * 10;
  return Math.round(meters / 5) * 5;
}

function iconFromTurnModifier(mod: string): FeatherIconName {
  if (mod.includes('uturn') || mod.includes('u-turn')) return 'rotate-ccw';
  if (mod.includes('left')) return 'corner-up-left';
  if (mod.includes('right')) return 'corner-up-right';
  return 'arrow-up';
}

const MANEUVER_TYPE_ICON: Record<string, FeatherIconName> = {
  arrive: 'flag',
  destination: 'flag',
  depart: 'navigation',
  notification: 'navigation',
  roundabout: 'refresh-cw',
  rotary: 'refresh-cw',
  merge: 'git-merge',
};

/** Map OSRM maneuver type + modifier to a Feather icon name. */
export function maneuverToFeatherIcon(
  type: string,
  modifier?: string,
): FeatherIconName {
  const mod = (modifier || '').toLowerCase();
  const t = (type || '').toLowerCase();

  const fixed = MANEUVER_TYPE_ICON[t];
  if (fixed) return fixed;

  if (t === 'fork') {
    if (mod.includes('left')) return 'corner-up-left';
    if (mod.includes('right')) return 'corner-up-right';
    return 'git-branch';
  }

  if (
    t === 'end of road' ||
    t === 'turn' ||
    t === 'new name' ||
    t === 'continue'
  ) {
    return iconFromTurnModifier(mod);
  }

  return iconFromTurnModifier(mod);
}

export function formatArrivalClock(
  etaMinutes: number,
  now: Date = new Date(),
): string {
  const arrival = new Date(now.getTime() + Math.max(0, etaMinutes) * 60_000);
  const hh = String(arrival.getHours()).padStart(2, '0');
  const mm = String(arrival.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * What each number in the arrival chip is, said in one word — as keys, rendered by the chip.
 *
 * The chip read `5,8 km · 14h25` and the report was blunt: "you cannot tell that it means 5.8 km
 * from the arrival point and that you get there at 14:25". Two bare figures with a dot between
 * them are read as the same kind of thing, so the reader looks for a unit they already know and
 * settles on the wrong one — the distance as a distance to anywhere, the clock as a departure.
 * The caption is the entire fix, which is why it is copy rather than a styling pass: it is kept
 * beside the rest of the driver-facing map lines so the wording can be asserted.
 */
export const ARRIVAL_CHIP_DISTANCE_CAPTION_KEY = 'nav.arrival.remaining';
export const ARRIVAL_CHIP_ETA_CAPTION_KEY = 'nav.arrival.eta';

/**
 * A driver-facing sentence before it is translated: an i18n key and its values.
 *
 * The module holds no locale, the same way `tripGuidance` holds none for its stage titles: the
 * sentence the driver reads is French, English or Spanish depending on the phone, so a string
 * built here would be one language chosen at build time. Callers render it with `navCopyText`
 * from the component that already owns a `t`.
 *
 * It also removes a trap. The banner used to decide whether to hide the distance by comparing the
 * action against the French words for "you have arrived" — so rewording or translating that
 * sentence would have quietly brought back a "in 12 m" beside an arrival. Control flow reads the
 * key now.
 */
export type NavCopy = {
  key: string;
  params?: Record<string, string | number | boolean>;
};

/** The arrival action, named so the distance rule can read it without reading the copy. */
const ARRIVAL_ACTION_KEY = 'nav.maneuver.arrive';

/**
 * The action the driver reads first, without distance or street name.
 * Slight and sharp modifiers are checked before a bare left/right.
 *
 * A roundabout with a known exit interpolates it as an **ordinal**, and the suffix is left to
 * i18next on purpose: `count` plus `ordinal: true` picks the plural category from
 * `Intl.PluralRules(locale, { type: 'ordinal' })`, which gives "1re" in French, "1st / 2nd / 3rd"
 * in English and "1ª" in Spanish — including "21st" and "21e", which a suffix table living in this
 * module would have got wrong.
 */
export function maneuverActionPhrase(
  type: string,
  modifier?: string,
  exit?: number,
): NavCopy {
  const mod = (modifier || '').toLowerCase();
  const t = (type || '').toLowerCase();
  if (t === 'arrive' || t === 'destination') return { key: ARRIVAL_ACTION_KEY };
  if (t === 'depart') return { key: 'nav.maneuver.depart' };
  if (t === 'roundabout' || t === 'rotary') {
    if (typeof exit === 'number' && exit >= 1) {
      return {
        key: 'nav.maneuver.roundaboutExit',
        params: { count: exit, ordinal: true },
      };
    }
    return { key: 'nav.maneuver.roundabout' };
  }
  // OSRM pose DEUX manoeuvres pour un rond-point : `roundabout` a l'entree (avec le numero de
  // sortie), puis `exit roundabout` SUR l'anneau. Ce second type n'avait aucune branche, donc il
  // tombait dans le `return` final — « continuez tout droit » — pendant que le chauffeur tournait
  // sur le rond-point. Rapport : « parfois je passais un rond-point et ca n'affichait pas le
  // rond-point ». Le bon type, et pas un repli, parce qu'un repli qui dit le contraire de ce qu'on
  // fait ne vaut pas mieux que le silence.
  if (t === 'exit roundabout' || t === 'exit rotary') {
    return { key: 'nav.maneuver.roundaboutLeave' };
  }
  if (mod.includes('uturn') || mod.includes('u-turn')) {
    return { key: 'nav.maneuver.uturn' };
  }
  if (mod.includes('slight left')) return { key: 'nav.maneuver.slightLeft' };
  if (mod.includes('slight right')) return { key: 'nav.maneuver.slightRight' };
  if (mod.includes('sharp left')) return { key: 'nav.maneuver.sharpLeft' };
  if (mod.includes('sharp right')) return { key: 'nav.maneuver.sharpRight' };
  if (mod.includes('left')) return { key: 'nav.maneuver.left' };
  if (mod.includes('right')) return { key: 'nav.maneuver.right' };
  if (t === 'merge') return { key: 'nav.maneuver.merge' };
  if (t === 'fork') return { key: 'nav.maneuver.fork' };
  // TROIS TYPES QUI TOMBAIENT DANS « TOUT DROIT », trouves par le test qui enumere les types OSRM
  // et exige une decision ecrite pour chacun. Sans modificateur, les branches de modificateur ne
  // les rattrapent pas — et « continuez tout droit » est alors faux dans les trois cas : on ne va
  // pas tout droit sur une bretelle, la route FINIT au bout de la route, et on tourne par
  // definition sur un rond-point.
  if (t === 'ramp') return { key: 'nav.maneuver.ramp' };
  if (t === 'end of road') return { key: 'nav.maneuver.endOfRoad' };
  if (t === 'roundabout turn') return { key: 'nav.maneuver.roundaboutTurn' };
  return { key: 'nav.maneuver.straight' };
}

/**
 * The instruction, split where it has to be read twice.
 *
 * The card draws the action and the distance as two pieces of type: the action is what the driver
 * does, the distance is the only figure that changes while they do it, and the second is worth the
 * accent colour. Splitting here rather than in the component keeps the sentence the driver reads
 * in one place — the two halves cannot drift apart, and a translator has one string per half.
 */
export type ManeuverBannerParts = {
  /** The action on its own: "Tourner à droite" / "Turn right". Never null. */
  action: NavCopy;
  /** `nav.distance.in` — "dans 60 m" — or null when spent or never given. */
  distance: NavCopy | null;
};

/**
 * A stepped distance as copy, in one of the two forms the card uses.
 *
 * `in` is the maneuver's ("dans 60 m") and `bare` is the stage fallback's ("1.2 km"). Two keys
 * rather than one plus a concatenation, so a locale can say "à 60 m" — or drop the preposition
 * entirely — without touching this module.
 */
function distanceCopy(
  meters: number | null | undefined,
  form: 'in' | 'bare',
): NavCopy | null {
  const distance = steppedManeuverDistance(meters);
  if (distance === null || distance <= 0) return null;
  return {
    key: form === 'in' ? 'nav.distance.in' : 'nav.distance.bare',
    params: { distance: formatRemainingDistance(distance) },
  };
}

/**
 * The instruction, when a maneuver exists.
 *
 * `maneuverActionPhrase` says what to do, `distanceCopy` says how far, and the street name is a
 * third line the HUD draws on its own.
 */
export function maneuverBannerParts(
  type: string,
  modifier: string | undefined,
  distanceMeters: number | null | undefined,
  exit?: number,
): ManeuverBannerParts {
  const action = maneuverActionPhrase(type, modifier, exit);
  // Arrival is not something to be "in 12 m": the action is the whole sentence. Read off the key
  // rather than off the rendered words, so translating or rewording it cannot turn this back on.
  if (action.key === ARRIVAL_ACTION_KEY) return { action, distance: null };
  return { action, distance: distanceCopy(distanceMeters, 'in') };
}

/**
 * The instruction when the router has delivered no step yet.
 *
 * Withholding the whole card until a maneuver exists is what made it absent for the entire trip
 * whenever the routing request failed: the driver got no instruction at all, not a rough one. The
 * stage phrase is always available — it comes from the ride, not from a router — so it is what the
 * card falls back to, distance stepped like any other.
 */
export function tripStageBannerParts(
  stage: string | null,
  distanceMeters: number | null | undefined,
): ManeuverBannerParts {
  return {
    action: {
      key:
        stage === 'to_dropoff' ? 'nav.stage.toDropoff' : 'nav.stage.toPickup',
    },
    distance: distanceCopy(distanceMeters, 'bare'),
  };
}
