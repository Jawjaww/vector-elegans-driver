// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};

import { buildMapHtmlTemplate } from '../mapHtmlTemplate';

/**
 * The prefetch must fetch the tile path the map's own source announces, not one written down here.
 *
 * Measured 2026-10-06 against the style the document loads
 * (`https://tiles.openfreemap.org/styles/liberty`, whose `openmaptiles` source points at the
 * TileJSON `https://tiles.openfreemap.org/planet`):
 *
 *   /planet/{z}/{x}/{y}.pbf                 -> 200, content-length 0, `x-ofm-debug: empty tile wildcard`
 *   /planet/20260927_080001_pt/4/8/5.pbf    -> 200, 784601 bytes
 *   /planet/20260927_080001_pt/7/64/43.pbf  -> 200, 319005 bytes
 *
 * The document used to build the first URL from a hard-coded constant, 142 times, and cache the
 * emptiness in a Cache API bucket nothing reads back. So the template is READ from the TileJSON
 * now, and prefetching stays OFF when that read fails: a guessed path is the bug, not the fix.
 *
 * The fragment runs between the VE_TILE_PREFETCH markers. It is extracted from the built HTML and
 * evaluated in a scope holding nothing but fetch, caches and navigator — the technique the
 * guidance helpers already use, because importing a helper here would test the module and not
 * what the document actually receives.
 */
const TEMPLATE = 'src/map/mapHtmlTemplate.ts';
const START = '// VE_TILE_PREFETCH_START';
const END = '// VE_TILE_PREFETCH_END';

/** The TileJSON body measured above, reduced to what matters here. */
const TILEJSON = {
  tiles: ['https://tiles.openfreemap.org/planet/20260927_080001_pt/{z}/{x}/{y}.pbf'],
  attribution: 'Data from OpenStreetMap',
};

/** The two sources of the Liberty style: one raster with inline tiles, one TileJSON-driven vector. */
const LIBERTY_STYLE = {
  sources: {
    ne2_shaded: {
      type: 'raster',
      tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'],
    },
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
};

const VERSIONED = 'https://tiles.openfreemap.org/planet/20260927_080001_pt/';

function extractBetween(html: string, startMarker: string, endMarker: string) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

interface TileFetch {
  (url: string, init?: unknown): Promise<unknown>;
}

/** A Response stand-in: `ok`, a JSON body, and a body length for the emptiness guard. */
function fakeTileResponse(url: string, body: ArrayBuffer | null = new ArrayBuffer(784601)) {
  return {
    ok: true,
    url,
    clone: () => ({ arrayBuffer: async () => body ?? new ArrayBuffer(0) }),
  };
}

function prefetchScope(deps: {
  fetch: TileFetch;
  caches?: unknown;
  connection?: Record<string, unknown> | null;
}) {
  const html = buildMapHtmlTemplate({ lat: 48.85, lng: 2.35 });
  const fragment = extractBetween(html, START, END);
  const puts: string[] = [];
  const cache = {
    match: async () => undefined,
    put: async (url: string) => {
      puts.push(url);
    },
  };
  const factory = new Function(
    'fetch',
    'caches',
    'navigator',
    'console',
    'PREFETCH_ENABLED',
    `${fragment}
    return {
      WEST_EUROPE_BOUNDS: WEST_EUROPE_BOUNDS,
      tileUrlTemplate: function () { return tileUrlTemplate; },
      resolveTileUrlTemplate: resolveTileUrlTemplate,
      tilesForBounds: tilesForBounds,
      collectTileUrls: collectTileUrls,
      prefetchTileUrls: prefetchTileUrls,
    };`,
  );
  const scope = factory(
    deps.fetch,
    deps.caches ?? { open: async () => cache },
    { connection: deps.connection ?? null },
    { warn: () => {}, log: () => {}, error: () => {} },
    true,
  ) as {
    WEST_EUROPE_BOUNDS: number[][];
    tileUrlTemplate: () => string | null;
    resolveTileUrlTemplate: (style: unknown) => Promise<string | null>;
    tilesForBounds: (bounds: number[][], z: number) => string[];
    collectTileUrls: (bounds: number[][], zooms: number[]) => string[];
    prefetchTileUrls: (urls: string[]) => Promise<void>;
  };
  return { scope, puts };
}

/** Routes the TileJSON read and the tile reads of one prefetch pass. */
function routedFetch(tileBody: ArrayBuffer | null) {
  const calls: string[] = [];
  const fetchImpl: TileFetch = async (url: string) => {
    calls.push(url);
    if (url === 'https://tiles.openfreemap.org/planet') {
      return { ok: true, json: async () => TILEJSON };
    }
    return fakeTileResponse(url, tileBody);
  };
  return { calls, fetchImpl };
}

describe('tile prefetch reads the versioned path from the TileJSON', () => {
  it('resolves the template from the style source, and builds the versioned URLs', async () => {
    const { calls, fetchImpl } = routedFetch(new ArrayBuffer(319005));
    const { scope } = prefetchScope({ fetch: fetchImpl });

    const template = await scope.resolveTileUrlTemplate(LIBERTY_STYLE);

    // The raster source comes first in the style and has no {z} TileJSON; the vector source's
    // TileJSON is what must be read, once.
    expect(calls).toEqual(['https://tiles.openfreemap.org/planet']);
    expect(template).toBe(`${VERSIONED}{z}/{x}/{y}.pbf`);
    expect(scope.tileUrlTemplate()).toBe(template);

    const urls = scope.collectTileUrls(scope.WEST_EUROPE_BOUNDS, [4]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(
        /^https:\/\/tiles\.openfreemap\.org\/planet\/20260927_080001_pt\/4\/\d+\/\d+\.pbf$/,
      );
    }
    // The empty wildcard path is what the old constant produced; nothing may be built from it.
    expect(urls.some((url) => /\/planet\/4\//.test(url))).toBe(false);
  });

  it('prefetches, and caches, only the non-empty versioned tiles', async () => {
    const { fetchImpl } = routedFetch(new ArrayBuffer(319005));
    const { scope, puts } = prefetchScope({ fetch: fetchImpl });

    await scope.resolveTileUrlTemplate(LIBERTY_STYLE);
    await scope.prefetchTileUrls(scope.collectTileUrls(scope.WEST_EUROPE_BOUNDS, [4]));

    expect(puts.length).toBeGreaterThan(0);
    for (const url of puts) expect(url).toContain(VERSIONED);
  });

  it('caches nothing when the tile URL answers with an empty body', async () => {
    // The measured failure: 200 OK, content-length 0, x-ofm-debug: empty tile wildcard.
    const { fetchImpl } = routedFetch(null);
    const { scope, puts } = prefetchScope({ fetch: fetchImpl });

    await scope.resolveTileUrlTemplate(LIBERTY_STYLE);
    await scope.prefetchTileUrls([`${VERSIONED}4/8/5.pbf`]);

    expect(puts).toEqual([]);
  });

  it('prefetches nothing at all when the TileJSON cannot be read', async () => {
    // Non-vacuity: on the old document this array was 142 URLs long, built from the constant.
    // A path that cannot be established leaves prefetching off — it does not get guessed.
    const { scope } = prefetchScope({
      fetch: async () => {
        throw new Error('offline');
      },
    });

    expect(await scope.resolveTileUrlTemplate(LIBERTY_STYLE)).toBeNull();
    expect(scope.collectTileUrls(scope.WEST_EUROPE_BOUNDS, [4, 5, 6, 7])).toEqual([]);
  });

  it('prefetches nothing when the TileJSON carries no tiles', async () => {
    const { scope } = prefetchScope({
      fetch: async () => ({ ok: true, json: async () => ({ attribution: 'nobody' }) }),
    });

    expect(await scope.resolveTileUrlTemplate(LIBERTY_STYLE)).toBeNull();
    expect(scope.tilesForBounds(scope.WEST_EUROPE_BOUNDS, 5)).toEqual([]);
  });

  it('does not carry the empty wildcard path in the template any more', () => {
    const source = readFileSync(TEMPLATE, 'utf8');
    // Boolean, not toContain: a failure prints one line instead of the whole 3000-line template.
    expect(source.includes('https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf')).toBe(false);
    expect(source.includes(START)).toBe(true);
    expect(source.includes(END)).toBe(true);
  });
});
