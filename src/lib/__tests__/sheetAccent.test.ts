// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import { MAP_PALETTE } from '../mapPalette';
import { APP_CHROME, VE_BLUE } from '../theme';

/**
 * The colours the home sheet speaks in.
 *
 * The sheet is the one screen where a driver reads a ride before deciding: a card outline, a
 * pickup time, a pin, a flag, a switch that says whether they are working. Every one of those had
 * a colour of its own and none of them was the app's blue, which is what made the screen read as
 * a pile of one-off yellows and greens rather than as one app.
 *
 * What is pinned here is not "use blue". It is *which* blues, and the one distinction the whole
 * change rests on: **blue is what the app asserts, amber is what it warns about.** Two amber
 * sites are deliberately left standing — the matching status badge and the text that says push
 * registration failed — and the last test fails if they are painted over.
 */

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const DASHBOARD = 'app/(tabs)/index.tsx';
/** Every card that names a place: the full-screen offer, the provisional one, and the sheet's. */
const RIDE_CARDS = [
  'src/components/OfferRideCard.tsx',
  'src/components/ProvisionalOfferCard.tsx',
  'src/components/ActiveTripSheet.tsx',
];
const OPTION_CHIPS = 'src/components/RideOfferExtras.tsx';

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/** Source with its comments removed, so an assertion cannot be satisfied by the prose above it. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

/**
 * The body of a top-level function declaration, up to the next one.
 *
 * Braces are not balanced to find it: these declarations destructure an object parameter, so the
 * first `{` after the signature is the destructuring pattern and closes before the body opens. A
 * brace count would hand back the parameters and every `toContain` on them would pass vacuously.
 */
function declaration(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`signature not found: ${signature}`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

/** Every `color={…}` a `<Feather name="…">` is given, in source order. */
function featherColors(source: string, name: string): string[] {
  const pattern = new RegExp(
    `name="${name}"[\\s\\S]{0,120}?color=\\{([^}]+)\\}`,
    'g',
  );
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

const dashboard = stripComments(readSource(DASHBOARD));
const optionChips = stripComments(readSource(OPTION_CHIPS));
const rideCards = RIDE_CARDS.map((path) => ({
  path,
  source: stripComments(readSource(path)),
}));

describe('a place marker on a ride card', () => {
  it('takes its colour from the map palette, never a literal of its own', () => {
    // The card that names a place and the marker the driver then drives to are the same fact, and
    // one fact written in two colours is what a driver notices without being able to name. The
    // full-screen card already read the palette; the sheet's cards had picked their own `#f59e0b`
    // and `#34d399`, so the same address changed colour depending on which card it was read from
    // — and the approach pin had a fourth orange, `#fb923c`, beside the map's `#f97316`.
    const allowed = /^MAP_PALETTE\.(departure|arrival|approach)$/;
    const seen = new Set<string>();

    for (const { path, source } of [...rideCards, { path: DASHBOARD, source: dashboard }]) {
      for (const glyph of ['map-pin', 'flag']) {
        const colors = featherColors(source, glyph);
        expect({ path, glyph, colors }).toEqual({
          path,
          glyph,
          colors: expect.any(Array),
        });
        for (const color of colors) {
          if (!allowed.test(color)) {
            throw new Error(`${path}: a ${glyph} is drawn in ${color}`);
          }
          seen.add(color);
        }
      }
    }

    // Both ends of the trip are actually in use across the cards — the check above would pass on
    // a set of markers that had all quietly become the approach orange.
    expect(seen).toContain('MAP_PALETTE.departure');
    expect(seen).toContain('MAP_PALETTE.arrival');
    expect(seen).toContain('MAP_PALETTE.approach');
    expect(MAP_PALETTE.departure).not.toBe(MAP_PALETTE.arrival);
  });

  it('leaves no warm hex behind, outside the verdict palette it keeps on purpose', () => {
    // The whole sheet, minus the one function whose colours are a *verdict* rather than
    // decoration: `bannerAccentBackground` tells a driver their dossier was validated, refused,
    // or is expiring, and no single blue can carry those three apart. Everything else — the
    // cards, the day stats, the notices — has no excuse left for a warm hex.
    const withoutVerdicts = dashboard.replace(
      declaration(dashboard, 'function bannerAccentBackground('),
      '',
    );
    for (const warmth of [
      '#f59e0b',
      '#34d399',
      '#fb923c',
      '#6ee7b7',
      'text-amber-200',
      'text-emerald-200',
    ]) {
      expect(withoutVerdicts).not.toContain(warmth);
    }
  });

  it('draws the pickup time the same way on both cards', () => {
    // The construct that made the two cards disagree: the same "date + clock" row was amber on
    // the waiting card and soft emerald on the one in progress. Neither reading is wrong on its
    // own, and together they are the thing the whole change is about — the *card* carries the
    // state (a green wash and an EN COURS chip), the *data* is drawn in the app's accent.
    for (const name of ['DeferredRideCard', 'DashboardRidePreview']) {
      const card = declaration(dashboard, `function ${name}(`);
      expect({ name, clock: /name="clock"[^>]*color=\{VE_BLUE\.base\}/.test(card) }).toEqual({
        name,
        clock: true,
      });
    }
  });
});

describe('the card holding a deferred ride', () => {
  it('takes the accent for its edge, not the warning amber it had', () => {
    expect(dashboard).toContain('`${VE_BLUE.base}${VE_BLUE.strongAlpha}`');
    // The exact weight that was there before: the hue moved, the presence did not.
    expect(dashboard).not.toContain('rgba(251, 191, 36, 0.22)');
  });

  it('draws the pickup time in the accent, clock and text together', () => {
    const card = declaration(dashboard, 'function DeferredRideCard(');
    expect(card).toContain('name="clock" size={13} color={VE_BLUE.base}');
    expect(card).toContain('text-blue-200');
  });

  it('fills the waiting badge with the button gradient, in white', () => {
    const card = declaration(dashboard, 'function DeferredRideCard(');
    // The one element on the card that is *filled* with the accent, so it takes the pair the
    // portal's buttons are built from — the pair measured to carry white: the lifted glyph pair
    // is legible as a stroke on the chrome, not as a background under 10 px type.
    expect(card).toContain('colors={VE_BLUE.gradient}');
    expect(card).not.toContain('rgba(251, 191, 36, 0.2)');
    expect(card).not.toContain('#fbbf24');
    expect(card).toContain('"#ffffff"');
  });

  it('keeps the overdue badge rose, because that one is a warning', () => {
    // A status the driver has missed is the only thing on this card that is wrong rather than
    // pending, and a warning repainted in the app's own colour stops being a warning.
    const card = declaration(dashboard, 'function DeferredRideCard(');
    expect(card).toContain('#fb7185');
    expect(card).toContain('rgba(251, 113, 133, 0.2)');
  });
});

describe('the one control the sheet has', () => {
  it('has both halves in the accent, not a white grip on a blue track', () => {
    const row = declaration(dashboard, 'function OnlineStatusRow(');
    // The track is the accent at the edge weight and the grip is the accent itself: "a tint
    // behind, the accent in front", the same rule the option chips follow. A white grip passes
    // "the track is blue" and is exactly what the driver sees as a part left unpainted.
    expect(row).toContain('true: `${VE_BLUE.base}${VE_BLUE.strongAlpha}`');
    expect(row).toContain('thumbColor={isOnline ? VE_BLUE.base : "#f4f4f5"}');
    expect(row).not.toContain('rgba(16,185,129,0.55)');
    expect(row).not.toContain('#10b981');
  });
});

describe('the option chips', () => {
  it('carry the accent, and one palette instead of two', () => {
    // The chips read the accent from the theme. A chip tinted with `theme.colors.accent` would be
    // the same green the fare and the bonus already use, and "this ride has a pet" would read as
    // "this ride pays well" — two different statements, one colour.
    expect(optionChips).toContain('VE_BLUE.tintAlpha');
    expect(optionChips).toContain('VE_BLUE.glyphGradient[0]');
    expect(optionChips).not.toContain('16, 185, 129');
    expect(optionChips).not.toContain('34d399');
    // The unreachable light palette is gone, so there is no second set to keep in step.
    expect(optionChips).not.toContain('isDark');
    expect(optionChips).not.toContain('variant');
  });

  it('outline a selected chip with a stroked gradient, not a flat border colour', () => {
    // A flat border was the first attempt, at the accent's edge weight. The gradient is the point
    // of the change, and it cannot come from `borderColor`: React Native has no gradient border.
    expect(optionChips).toContain('<AccentOutline radius={chipRadius}');
    expect(optionChips).not.toContain('borderColor: SELECTED_BORDER');

    // Stroked rather than inset, and this is the reason: a chip's face is translucent glass over
    // the blurred map, so an inset — gradient laid down, face covering it — would let the gradient
    // show through the middle. A stroke covers nothing.
    expect(optionChips).toContain('const OUTLINED_BORDER = "transparent"');
    // The transparent border is not cosmetic: it is what sizes the chip, and dropping it would
    // resize every selected chip by two points against its unselected neighbours.
    expect(optionChips).toContain('borderColor: isSelected ? OUTLINED_BORDER : MUTED_BORDER');

    // And the gradient says "this ride has it", so it must not appear on a chip that does not.
    expect(optionChips).toContain('{isSelected ? outline : null}');
  });
});

describe('what amber is still for', () => {
  it('keeps the warning it means, so the accent did not simply win', () => {
    // Non-vacuity. What amber is left for after this change is the *warning* — the text that says
    // push registration failed — and the bonus badge, which is money and not a status. Had either
    // been painted over too, everything above would still pass while the sheet had lost the only
    // signal it has for "something is wrong".
    const row = declaration(dashboard, 'function OnlineStatusRow(');
    expect(row).toContain('color: "#fbbf24"');
    const card = declaration(dashboard, 'function DeferredRideCard(');
    expect(card).toContain('bg-amber-500/20');
  });

  it('is legible on the chrome it is drawn on', () => {
    // The claim the surviving amber sites rest on, measured rather than asserted: the chrome is
    // the thing that moved, and an amber that cleared 3:1 against the old near-black is not
    // automatically still clearing it against a lighter floor.
    const contrastRatio = (a: string, b: string): number => {
      const linearise = (value: number): number => {
        const channel = value / 255;
        return channel <= 0.03928
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (css: string): number => {
        const packed = parseInt(css.slice(1), 16);
        return (
          0.2126 * linearise((packed >> 16) & 255) +
          0.7152 * linearise((packed >> 8) & 255) +
          0.0722 * linearise(packed & 255)
        );
      };
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };

    expect(APP_CHROME.surface).toBe('#161616');
    expect(contrastRatio('#fbbf24', APP_CHROME.surface)).toBeGreaterThanOrEqual(3);
    // And the accent clears the same floor, which is what lets a clock glyph be blue at 13 px.
    expect(contrastRatio(VE_BLUE.base, APP_CHROME.surface)).toBeGreaterThanOrEqual(3);
  });
});

describe('the palette the dossier verdicts keep', () => {
  it('is a status palette, and stays one', () => {
    // The one place the accent was deliberately *not* applied. `bannerAccentBackground` reads a
    // banner's accent and hands back its tint, and its three inputs are a verdict on the driver's
    // dossier: validated, rejected, expiring. A driver has to tell "your dossier went through"
    // from "it was refused" without reading either, and no single accent colour can carry that.
    //
    // The line the whole file is drawn along, stated once: **blue is what the app asserts about
    // itself — a live offer, an offer still waiting, its own controls. Rose, emerald and amber
    // are what the world says back — refused, accepted, wrong.**
    const background = declaration(dashboard, 'function bannerAccentBackground(');
    expect(background).toContain('#fb7185');
    expect(background).toContain('#34d399');
    expect(background).toContain('rgba(251, 191, 36, 0.2)');
    expect(background).not.toContain('VE_BLUE');
  });
});
