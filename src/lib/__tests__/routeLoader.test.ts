// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

/**
 * Green ActivityIndicators used to sit on the boot screen, earnings, ride documents and the OTA
 * row. They are the road-shaped mark now. The map overlay used to paint a full chrome slab behind
 * that mark; a comment that names the old fill must not bring the import back, so this reads the
 * import line, not a mention in prose.
 */

const REPO_ROOT = process.cwd();

const SPINNER_SURFACES = [
  'app/(tabs)/earnings.tsx',
  'app/ride-document.tsx',
  'src/components/OtaUpdatePanel.tsx',
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

describe('the route loader', () => {
  it('replaces the green spinners with the compact mark', () => {
    for (const relativePath of SPINNER_SURFACES) {
      const body = readSource(relativePath);
      expect({ path: relativePath, spinner: body.includes('ActivityIndicator') }).toEqual({
        path: relativePath,
        spinner: false,
      });
      expect(body).toContain('VRouteMark');
    }
    const home = readSource('app/(tabs)/index.tsx');
    expect(home.includes('ActivityIndicator')).toBe(false);
    expect(home).toContain('MapWake');
    expect(readSource('src/components/MapWake.tsx')).toContain('VGpsLoader');
  });

  it('does not put a chrome slab behind the map overlay', () => {
    const loader = readSource('src/components/VGpsLoader.tsx');
    expect(loader).not.toMatch(/import\s+\{[^}]*AppChromeBackground/);
    expect(loader).not.toContain('APP_CHROME');
    expect(loader).toContain("backgroundColor: 'transparent'");
    expect(loader).toContain('export function VRouteMark');
  });

  it('keeps the preparing caption in dark ink and fades the chrome off the basemap', () => {
    const loader = readSource('src/components/VGpsLoader.tsx');
    const wake = readSource('src/components/MapWake.tsx');
    const dashboard = readSource('app/(tabs)/index.tsx');

    // White at low opacity was the caption on the beige canvas. Dark ink, revealed
    // only as the veil leaves, is what stays readable on that ground.
    expect(loader).toContain("const MAP_HINT_INK = '#1c1917'");
    expect(loader).not.toContain('rgba(255,255,255,0.45)');
    expect(loader).toContain('captionReveal');

    expect(wake).toContain('APP_CHROME.surface');
    expect(wake).toContain('withTiming');
    expect(wake).toContain('1 - cover.value');

    // The map is mounted under the veil, not swapped in when boot ends.
    expect(dashboard).toContain('<MapWake');
    expect(dashboard).toContain('<AnimatedPage instant>');
    const wakeAt = dashboard.indexOf('<MapWake');
    const fadeAt = dashboard.indexOf('<AnimatedPage instant>');
    const fadeEnd = dashboard.indexOf('</AnimatedPage>');
    expect(wakeAt).toBeGreaterThan(-1);
    expect(fadeAt).toBeGreaterThan(wakeAt);
    expect(fadeEnd).toBeGreaterThan(fadeAt);
    expect(fadeEnd).toBeLessThan(dashboard.indexOf('</MapWake>'));
  });
});
