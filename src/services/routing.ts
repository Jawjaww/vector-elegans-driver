import type { LatLng } from '../map/types';
import type { OsrmStepLike } from '../lib/utils/navProgress';
import { logOfferStage } from '../lib/notifications/offerPipelineDiag';

/** One road instruction, in the shape the along-track maneuver picker already reads. */
export type RouteStep = OsrmStepLike;

export type RouteGeometry = {
  /** `[lng, lat]` pairs, the order MapLibre and the nav polyline already use. */
  coordinates: [number, number][];
  /** Whole-route distance in metres, as the router measured it. */
  distanceMeters: number;
  durationSeconds: number;
  /** Leg 0's steps, so the HUD can name the next turn. Empty when the router had none. */
  steps: RouteStep[];
};

export type RoutingFailureReason =
  | 'timeout'
  | 'network'
  | 'http'
  | 'no_route'
  | 'aborted';

export class RoutingError extends Error {
  readonly reason: RoutingFailureReason;
  readonly status: number | null;

  constructor(reason: RoutingFailureReason, status: number | null = null) {
    super(`routing failed: ${reason}${status === null ? '' : ` (${status})`}`);
    this.name = 'RoutingError';
    this.reason = reason;
    this.status = status;
  }
}

/**
 * Routing endpoints, in the order they are tried.
 *
 * `router.project-osrm.org` is OSRM's public demo server: best-effort, explicitly not for
 * production. `routing.openstreetmap.de/routed-car` is the endpoint the web client already
 * uses, so a failure there is a failure the rest of the fleet shares rather than a driver-only
 * mystery. Two endpoints is the whole point: no timeout and no fallback is what let a stalled
 * request leave the driver with a straight line and no explanation.
 */
const ENDPOINTS = [
  {
    id: 'project-osrm',
    base: 'https://router.project-osrm.org/route/v1/driving',
  },
  {
    id: 'openstreetmap-de',
    base: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  },
] as const;

export type RoutingEndpointId = (typeof ENDPOINTS)[number]['id'];

export const DEFAULT_ROUTING_DEADLINE_MS = 4000;

/** Build the OSRM request URL. Pure, so a test can pin the parameter set. */
export function buildRouteUrl(
  base: string,
  from: LatLng,
  to: LatLng,
): string {
  const pair = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  return `${base}/${pair}?geometries=geojson&overview=full&steps=true`;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Normalise an OSRM `routes[0]` payload.
 *
 * Returns null when there is no usable line: a route without geometry cannot be drawn, and
 * treating it as a route is how a straight chord ends up looking like a finished itinerary.
 */
export function toRouteGeometry(route: unknown): RouteGeometry | null {
  const raw = route as
    | {
        geometry?: { coordinates?: unknown };
        distance?: unknown;
        duration?: unknown;
        legs?: Array<{ steps?: OsrmStepLike[] }>;
      }
    | null
    | undefined;
  const coordinates = raw?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const steps = raw?.legs?.[0]?.steps;
  return {
    coordinates: coordinates as [number, number][],
    distanceMeters: toFiniteNumber(raw?.distance),
    durationSeconds: toFiniteNumber(raw?.duration),
    steps: Array.isArray(steps) ? steps : [],
  };
}

/** A request that can be abandoned, both by its caller and by its own deadline. */
function deadlineSignal(outer: AbortSignal | undefined, deadlineMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onOuterAbort);
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, deadlineMs);
  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    },
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function requestRoute(
  base: string,
  from: LatLng,
  to: LatLng,
  outer: AbortSignal | undefined,
  deadlineMs: number,
): Promise<RouteGeometry> {
  const deadline = deadlineSignal(outer, deadlineMs);
  try {
    const response = await fetch(buildRouteUrl(base, from, to), {
      signal: deadline.signal,
    });
    if (!response.ok) {
      throw new RoutingError('http', response.status);
    }
    const payload = (await response.json()) as { routes?: unknown[] };
    const geometry = toRouteGeometry(payload?.routes?.[0]);
    if (!geometry) throw new RoutingError('no_route');
    return geometry;
  } catch (error) {
    if (outer?.aborted) throw new RoutingError('aborted');
    if (deadline.didTimeOut()) throw new RoutingError('timeout');
    if (error instanceof RoutingError) throw error;
    throw new RoutingError('network');
  } finally {
    deadline.dispose();
  }
}

/**
 * Resolve the driving line between two points.
 *
 * One attempt per endpoint, in order, each bounded by `deadlineMs`. Only an abort by the
 * caller stops the walk: a timeout, a 429 or a 5xx on the demo server must fall through to the
 * next endpoint instead of leaving the driver with nothing. The last failure is rethrown as a
 * `RoutingError`, so the caller can say *why* rather than guessing.
 */
export async function fetchRoute(
  from: LatLng,
  to: LatLng,
  options: { signal?: AbortSignal; deadlineMs?: number } = {},
): Promise<RouteGeometry> {
  const deadlineMs = options.deadlineMs ?? DEFAULT_ROUTING_DEADLINE_MS;
  let lastFailure: RoutingError | null = null;

  for (const endpoint of ENDPOINTS) {
    const startedAt = Date.now();
    try {
      const geometry = await requestRoute(
        endpoint.base,
        from,
        to,
        options.signal,
        deadlineMs,
      );
      logOfferStage('nav_route_ok', {
        endpoint: endpoint.id,
        duration_ms: Date.now() - startedAt,
        points: geometry.coordinates.length,
        meters: Math.round(geometry.distanceMeters),
        steps: geometry.steps.length,
      });
      return geometry;
    } catch (error) {
      const failure =
        error instanceof RoutingError ? error : new RoutingError('network');
      if (failure.reason === 'aborted') {
        logOfferStage('nav_route_error', {
          endpoint: endpoint.id,
          reason: failure.reason,
          retryable: false,
        });
        throw failure;
      }
      lastFailure = failure;
      logOfferStage('nav_route_error', {
        endpoint: endpoint.id,
        reason: failure.reason,
        status: failure.status,
        duration_ms: Date.now() - startedAt,
        retryable: isRetryableStatus(failure.status ?? 0),
      });
    }
  }

  throw lastFailure ?? new RoutingError('no_route');
}
