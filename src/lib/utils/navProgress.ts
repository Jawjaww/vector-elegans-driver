export type NavManeuver = {
  type: string;
  modifier?: string;
  distanceMeters: number;
  name?: string;
};

export type NavProgress = {
  distanceMeters: number;
  durationSeconds: number;
  nextManeuver?: NavManeuver | null;
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

export function maneuverInstructionLabel(
  type: string,
  modifier?: string,
): string {
  const mod = (modifier || '').toLowerCase();
  const t = (type || '').toLowerCase();
  if (t === 'arrive') return 'Arrivée';
  if (t === 'depart') return 'Départ';
  if (t === 'roundabout' || t === 'rotary') return 'Rond-point';
  if (mod.includes('uturn') || mod.includes('u-turn')) return 'Demi-tour';
  if (mod.includes('sharp left')) return 'À gauche';
  if (mod.includes('sharp right')) return 'À droite';
  if (mod.includes('slight left') || mod === 'left') return 'À gauche';
  if (mod.includes('slight right') || mod === 'right') return 'À droite';
  if (t === 'merge') return 'Insertion';
  if (t === 'fork') return 'Bifurcation';
  return 'Tout droit';
}
