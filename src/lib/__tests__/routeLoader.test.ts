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
  'app/(tabs)/index.tsx',
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
  });

  it('does not put a chrome slab behind the map overlay', () => {
    const loader = readSource('src/components/VGpsLoader.tsx');
    expect(loader).not.toMatch(/import\s+\{[^}]*AppChromeBackground/);
    expect(loader).not.toContain('APP_CHROME');
    expect(loader).toContain("backgroundColor: 'transparent'");
    expect(loader).toContain('export function VRouteMark');
  });
});
