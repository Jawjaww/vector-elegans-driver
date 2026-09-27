const mockLogOfferStage = jest.fn();

jest.mock('../notifications/offerPipelineDiag', () => ({
  logOfferStage: (...args: unknown[]) => mockLogOfferStage(...args),
}));

import {
  buildRouteUrl,
  fetchRoute,
  RoutingError,
  toRouteGeometry,
} from '../../services/routing';
import type { LatLng } from '../../map/types';

const PARIS: LatLng = { lat: 48.8566, lng: 2.3522 };
const LYON: LatLng = { lat: 45.764, lng: 4.8357 };

const ROUTE_PAYLOAD = {
  routes: [
    {
      geometry: {
        coordinates: [
          [2.3522, 48.8566],
          [2.36, 48.86],
          [4.8357, 45.764],
        ],
      },
      distance: 465_000,
      duration: 16_200,
      legs: [
        {
          steps: [
            {
              distance: 120,
              duration: 20,
              name: 'Rue de Rivoli',
              maneuver: { type: 'turn', modifier: 'left', location: [2.3522, 48.8566] },
            },
          ],
        },
      ],
    },
  ],
};

type FetchInit = { signal?: AbortSignal };

function okResponse(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload };
}

/** Rejects only when its signal aborts, like a platform fetch with no answer in sight. */
function stalledResponse(init?: FetchInit) {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
  });
}

function installFetch(
  handler: (url: string, init?: FetchInit) => Promise<unknown>,
) {
  const mock = jest.fn((url: string, init?: FetchInit) => {
    if (init?.signal?.aborted) return Promise.reject(new Error('Aborted'));
    return handler(url, init);
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('buildRouteUrl', () => {
  it('pins the geometry and step parameters the nav polyline needs', () => {
    expect(buildRouteUrl('https://host/route/v1/driving', PARIS, LYON)).toBe(
      'https://host/route/v1/driving/2.3522,48.8566;4.8357,45.764?geometries=geojson&overview=full&steps=true',
    );
  });
});

describe('toRouteGeometry', () => {
  it('keeps the line, the totals and the turn list', () => {
    const geometry = toRouteGeometry(ROUTE_PAYLOAD.routes[0]);
    expect(geometry).toMatchObject({
      distanceMeters: 465_000,
      durationSeconds: 16_200,
    });
    expect(geometry?.coordinates).toHaveLength(3);
    expect(geometry?.steps).toHaveLength(1);
  });

  it('refuses a route with no line', () => {
    // A payload without geometry cannot be drawn. Accepting it is how a straight chord ends
    // up presented as a finished itinerary.
    expect(toRouteGeometry({ distance: 10, duration: 10 })).toBeNull();
    expect(toRouteGeometry(undefined)).toBeNull();
  });

  it('tolerates a missing step list', () => {
    expect(
      toRouteGeometry({ geometry: { coordinates: [[0, 0], [1, 1]] }, distance: 5 })?.steps,
    ).toEqual([]);
  });
});

describe('fetchRoute', () => {
  beforeEach(() => {
    mockLogOfferStage.mockReset();
  });

  it('answers from the first endpoint when it accepts', async () => {
    const fetchMock = installFetch(() => Promise.resolve(okResponse(ROUTE_PAYLOAD)));

    const geometry = await fetchRoute(PARIS, LYON, { deadlineMs: 50 });

    expect(geometry.coordinates).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('router.project-osrm.org');
    expect(mockLogOfferStage).toHaveBeenCalledWith(
      'nav_route_ok',
      expect.objectContaining({ endpoint: 'project-osrm' }),
    );
  });

  it('falls back to the second endpoint on a 429', async () => {
    // Non-vacuity: without the fallback the driver keeps the demo server's refusal and sees a
    // straight line, which is the measured production symptom.
    const fetchMock = installFetch((url) =>
      url.includes('openstreetmap.de')
        ? Promise.resolve(okResponse(ROUTE_PAYLOAD))
        : Promise.resolve({ ok: false, status: 429, json: async () => ({}) }),
    );

    const geometry = await fetchRoute(PARIS, LYON, { deadlineMs: 50 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('routing.openstreetmap.de');
    expect(geometry.distanceMeters).toBe(465_000);
    expect(mockLogOfferStage).toHaveBeenCalledWith(
      'nav_route_error',
      expect.objectContaining({ endpoint: 'project-osrm', reason: 'http', status: 429 }),
    );
  });

  it('gives up with a timeout once both endpoints stall', async () => {
    const fetchMock = installFetch((_url, init) => stalledResponse(init));

    await expect(fetchRoute(PARIS, LYON, { deadlineMs: 20 })).rejects.toMatchObject({
      reason: 'timeout',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a network failure rather than a routing failure', async () => {
    installFetch(() => Promise.reject(new Error('Network request failed')));

    const failure = await fetchRoute(PARIS, LYON, { deadlineMs: 20 }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(RoutingError);
    expect((failure as RoutingError).reason).toBe('network');
  });

  it('stops the walk as soon as the caller aborts', async () => {
    const controller = new AbortController();
    const fetchMock = installFetch(() => Promise.resolve(okResponse(ROUTE_PAYLOAD)));
    controller.abort();

    await expect(
      fetchRoute(PARIS, LYON, { signal: controller.signal, deadlineMs: 50 }),
    ).rejects.toMatchObject({ reason: 'aborted' });
    // One attempt at most: an aborted request must not fall through to the second endpoint,
    // or every reroute would cost two live requests.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('rejects when an endpoint answers without a line and the other fails too', async () => {
    installFetch(() => Promise.resolve(okResponse({ routes: [] })));

    await expect(fetchRoute(PARIS, LYON, { deadlineMs: 50 })).rejects.toMatchObject({
      reason: 'no_route',
    });
  });
});
