// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

/**
 * The dossier wizard used to paint itself in the portal's old emerald. The chrome is blue now, and
 * a leftover `#10b981` on this flow is the same inconsistency the tab bar already forbade.
 *
 * Comments in these files deliberately name the colours they left behind, so the assertion runs on
 * source with comments stripped.
 */

const REPO_ROOT = process.cwd();

const WIZARD_SOURCES = [
  'src/components/DriverProfileSetup.tsx',
  'src/components/DriverDocumentUploader.tsx',
  'src/components/DriverVehicleSection.tsx',
  'src/components/DossierValidationChecklist.tsx',
  'src/components/DriverAvatar.tsx',
  'src/components/NativeDateField.tsx',
  'src/components/dossier/DossierProgressFill.tsx',
  'src/components/dossier/DossierProfilSection.tsx',
  'src/components/dossier/DossierProfessionnelSection.tsx',
  'src/components/dossier/DossierDocumentsSection.tsx',
  'src/components/dossier/DossierValidationSection.tsx',
  'src/components/dossier/DossierWizardFooter.tsx',
] as const;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

describe('the dossier wizard accent', () => {
  it('does not keep the old emerald on the surfaces the driver still sees', () => {
    for (const relativePath of WIZARD_SOURCES) {
      const body = stripComments(readSource(relativePath));
      expect({ path: relativePath, emeraldHex: body.includes('#10b981') }).toEqual({
        path: relativePath,
        emeraldHex: false,
      });
      expect({ path: relativePath, emeraldDark: body.includes('#059669') }).toEqual({
        path: relativePath,
        emeraldDark: false,
      });
      expect({ path: relativePath, mint: body.includes('#34d399') }).toEqual({
        path: relativePath,
        mint: false,
      });
      expect({ path: relativePath, emeraldClass: /emerald-/.test(body) }).toEqual({
        path: relativePath,
        emeraldClass: false,
      });
    }
  });

  it('paints the progress fill and primary CTAs with the same gradient the chrome uses', () => {
    const fill = stripComments(readSource('src/components/dossier/DossierProgressFill.tsx'));
    expect(fill).toContain('VE_BLUE.gradient');
    expect(fill).toContain('VE_BLUE.base');
    expect(fill).not.toContain('EmeraldProgressFill');

    const setup = stripComments(readSource('src/components/DriverProfileSetup.tsx'));
    expect(setup).toContain('<DossierAccentGradientFill />');
    expect(setup).toContain('VE_BLUE.base');
  });

  it('paints field icons with the same gradient glyph the chrome uses', () => {
    const profil = stripComments(
      readSource('src/components/dossier/DossierProfilSection.tsx'),
    );
    expect(profil).toContain('<FeatherGlyph name="user" size={20} />');
    expect(profil).toContain('<FeatherGlyph name="phone" size={20} />');
    expect(profil).not.toMatch(/<Feather\s+name="user"/);
    expect(profil).not.toContain('VE_BLUE.glyphGradient[0]');
    expect(profil).toContain('<Feather name="chevron-right"');

    const setup = stripComments(readSource('src/components/DriverProfileSetup.tsx'));
    expect(setup).toContain('<FeatherGlyph');
    expect(setup).toContain('name={section.icon}');
    expect(setup).not.toMatch(/<Feather\s+name=\{section\.icon/);
  });
});
