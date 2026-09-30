// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

/**
 * The CLI the preview OTA job runs.
 *
 * The job installs its own CLI, and *how* it does that decides whether the job runs at all.
 * `expo/expo-github-action` resolved eas-cli's whole dependency tree from the registry at run
 * time, in a lockfile-less temp directory, so a transitive dependency the registry was advertising
 * but could not serve — `browserslist` → `electron-to-chromium` 1.5.443, `dist-tags.latest`, its
 * tarball `404 Not Found` — killed the job in 20 s, before `npm ci`, on a package that is not ours.
 * Three attempts with waits covered the npm-side window; a committed lockfile removes it, because
 * `npm ci` never consults a dist-tag.
 *
 * What a source test can hold, and what is asserted here: that the lockfile is the only source of
 * the CLI, that the pin is exact so the tree cannot drift under a `^`, that the install lands
 * outside the project tree Metro bundles, and that the token the CLI needs reaches the one step
 * that publishes. A `latest` creeping back in is the regression.
 */

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const WORKFLOW = '.github/workflows/eas-update-preview.yml';
const CI_WORKFLOW = '.github/workflows/ci.yml';
const APP_PACKAGE = 'package.json';
const TOOL_PACKAGE = 'tools/eas-cli/package.json';
const TOOL_LOCK = 'tools/eas-cli/package-lock.json';

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * Source with its comments removed.
 *
 * The assertions below pin the *absence* of an installer and of a `latest`, and the prose right
 * above them names both — the action by name, `dist-tags.latest` in full. A naive `not.toContain`
 * would fail on the explanation rather than on the code, which is the failure mode this helper
 * exists to prevent (the same reason `glassOverlay.test.ts` has one). `#` is a YAML comment here,
 * and the blocks that carry commands hold no `#` of their own.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/.*$/gm, '$1')
    .replace(/(^|\s)#.*$/gm, '$1');
}

type ToolManifest = { dependencies: Record<string, string> };
type ToolLock = {
  packages: Record<
    string,
    { version?: string; dependencies?: Record<string, string> }
  >;
};

describe('the preview OTA pipeline', () => {
  const workflow = readSource(WORKFLOW);
  const code = stripComments(workflow);
  const tool = JSON.parse(readSource(TOOL_PACKAGE)) as ToolManifest;
  const lock = JSON.parse(readSource(TOOL_LOCK)) as ToolLock;

  it('installs the CLI from the committed lockfile, and never from a dist-tag', () => {
    expect(code).toContain('tools/eas-cli/package-lock.json');
    expect(code).toContain('npm ci');
    // The registry no longer gets a vote: no `latest`, and no third-party installer deciding what
    // the tree is. The action was worth keeping while it installed the CLI; once it did not, all
    // it still did was export the token, which `EXPO_TOKEN` does explicitly.
    expect(code).not.toContain('expo/expo-github-action');
    expect(code).not.toContain('eas-version');
    expect(code).not.toMatch(/eas-cli@latest/);
  });

  it('keeps the deployment tool out of the app it deploys', () => {
    // The other way to pin the CLI is a dependency of the app, and it is the worse one: 526 extra
    // packages in the graph every `npm ci` walks, on every PR, plus a `scripts/`-only tool showing
    // up in what EAS and Metro resolve. The tool has its own lockfile so that the app's stays the
    // app's.
    expect(readSource(APP_PACKAGE)).not.toContain('eas-cli');
    expect(Object.keys(tool.dependencies)).toEqual(['eas-cli']);
  });

  it('pins an exact version, so the tree cannot move on its own', () => {
    const pinned = tool.dependencies['eas-cli'];
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    // The lockfile's root entry has to agree with the manifest — `npm ci` validates one against
    // the other and refuses to install otherwise. Asserted here so the failure names the pin
    // rather than arriving as an npm error somewhere in a workflow.
    expect(lock.packages[''].dependencies?.['eas-cli']).toBe(pinned);
    expect(lock.packages['node_modules/eas-cli'].version).toBe(pinned);
  });

  it('installs outside the project tree Metro bundles', () => {
    // 160 MB of tool under the root would join every file map — this job's and a developer's —
    // for a job whose only output is a bundle. The checkout stays what the lockfile describes.
    expect(workflow).toContain('$RUNNER_TEMP/eas-cli');
    expect(workflow).toMatch(
      /cp tools\/eas-cli\/package\.json tools\/eas-cli\/package-lock\.json "\$RUNNER_TEMP/,
    );
    // And the CLI has to be reachable as `eas`: the OTA script calls it by name.
    expect(workflow).toContain('$RUNNER_TEMP/eas-cli/node_modules/.bin');
    expect(workflow).toContain('GITHUB_PATH');
  });

  it('hands the token to the step that publishes, not to an earlier one', () => {
    const publish = workflow.slice(workflow.indexOf('EAS Update (preview'));
    expect(publish).toContain('EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}');
    expect(publish).toContain('scripts/eas-update-preview.sh');
  });

  it('runs the suite that reads the pin when only the pin changes', () => {
    // The non-vacuity rule the `scripts/**` entry already follows. Without it, bumping eas-cli
    // alone changes nothing that CI watches, and the assertions above stop seeing the file they
    // exist to guard.
    expect(readSource(CI_WORKFLOW).match(/- "tools\/\*\*"/g)).toHaveLength(2);
  });
});
