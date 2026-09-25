export type NavManeuver = {
  type: string;
  modifier?: string;
  distanceMeters: number;
  name?: string;
  /** OSRM roundabout exit, 1-based. Absent on ordinary turns. */
  exit?: number;
};

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
  if (
    !arrived &&
    typeof distanceMeters === 'number' &&
    Number.isFinite(distanceMeters) &&
    distanceMeters > 0
  ) {
    return `${action} dans ${formatRemainingDistance(distanceMeters)}`;
  }
  return action;
}
