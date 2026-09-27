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

/** French ordinal for a roundabout exit: 1re, 2e, 3e. */
export function frenchExitOrdinal(exit: number): string {
  if (exit === 1) return '1re';
  return `${exit}e`;
}

/**
 * The action the driver reads first, without distance or street name.
 * Slight and sharp modifiers are checked before a bare left/right.
 */
export function maneuverActionPhrase(
  type: string,
  modifier?: string,
  exit?: number,
): string {
  const mod = (modifier || '').toLowerCase();
  const t = (type || '').toLowerCase();
  if (t === 'arrive' || t === 'destination') return 'Vous êtes arrivé';
  if (t === 'depart') return 'Départ';
  if (t === 'roundabout' || t === 'rotary') {
    if (typeof exit === 'number' && exit >= 1) {
      return `Prendre la ${frenchExitOrdinal(exit)} sortie`;
    }
    return 'Rond-point';
  }
  if (mod.includes('uturn') || mod.includes('u-turn')) return 'Faire demi-tour';
  if (mod.includes('slight left')) return 'Tourner légèrement à gauche';
  if (mod.includes('slight right')) return 'Tourner légèrement à droite';
  if (mod.includes('sharp left')) return 'Tourner franchement à gauche';
  if (mod.includes('sharp right')) return 'Tourner franchement à droite';
  if (mod.includes('left')) return 'Tourner à gauche';
  if (mod.includes('right')) return 'Tourner à droite';
  if (t === 'merge') return "S'insérer";
  if (t === 'fork') return 'Prendre la bifurcation';
  return 'Continuer tout droit';
}

/**
 * First line of the maneuver banner: the action, then the distance when it still matters.
 * The street name is rendered on its own line by the HUD.
 */
export function maneuverBannerLine(
  type: string,
  modifier: string | undefined,
  distanceMeters: number | null | undefined,
  exit?: number,
): string {
  const action = maneuverActionPhrase(type, modifier, exit);
  const arrived = action === 'Vous êtes arrivé';
  const distance = steppedManeuverDistance(distanceMeters);
  if (!arrived && distance !== null && distance > 0) {
    return `${action} dans ${formatRemainingDistance(distance)}`;
  }
  return action;
}

/**
 * The banner when the router has delivered no step yet.
 *
 * Withholding the whole card until a maneuver exists is what made it absent for the entire
 * trip whenever the routing request failed: the driver got no instruction at all, not a rough
 * one. The stage phrase is always available — it comes from the ride, not from a router — so it
 * is what the card falls back to, distance stepped like any other.
 */
export function tripStageBannerLine(
  stage: string | null,
  distanceMeters: number | null | undefined,
): string {
  const target =
    stage === 'to_dropoff'
      ? 'Rejoindre la destination'
      : 'Rejoindre le point de prise en charge';
  const distance = steppedManeuverDistance(distanceMeters);
  if (distance === null || distance <= 0) return target;
  return `${target} — ${formatRemainingDistance(distance)}`;
}
