// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import i18next from 'i18next';

import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import { navCopyText } from '../navCopy';
import {
  ARRIVAL_CHIP_DISTANCE_CAPTION_KEY,
  ARRIVAL_CHIP_ETA_CAPTION_KEY,
  maneuverActionPhrase,
  maneuverBannerParts,
  tripStageBannerParts,
  type NavCopy,
} from '../../lib/utils/navProgress';

/**
 * A real i18next, built from the shipped bundles.
 *
 * The app's own instance is not imported on purpose: `src/i18n/index.ts` pulls
 * `expo-localization`, which does not exist under Jest's node environment. What has to hold here
 * is the *content* of the bundles and the plural configuration, and both are the same files — with
 * a test below pinning the one option that decides how an ordinal is spelled, so this cannot
 * quietly stop testing what the app runs.
 */
function makeI18n(lng: string) {
  const instance = i18next.createInstance();
  instance.init({
    lng,
    fallbackLng: 'fr',
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      es: { translation: es },
    },
    compatibilityJSON: 'v4',
    showSupportNotice: false,
  });
  return instance;
}

const LOCALES = ['fr', 'en', 'es'] as const;

/**
 * Every maneuver input the map can hand the card, so the keys are *derived* rather than listed.
 *
 * A hand-written list of keys would be a second copy of `maneuverActionPhrase`, and the branch
 * it forgot is the branch that would render its key on the windscreen. Each tuple is a distinct
 * branch of that function; the assertion below is what proves the set is complete.
 */
const MANEUVER_INPUTS: Array<[string, string | undefined, number | undefined]> = [
  // Direction modifiers. They are read before anything else, which is why the U-turn arrives as
  // `type: 'turn'` plus a modifier and not the other way round — and why a `merge` that does
  // carry a direction is announced as that direction.
  ['turn', 'uturn', undefined],
  ['turn', 'slight left', undefined],
  ['turn', 'slight right', undefined],
  ['turn', 'sharp left', undefined],
  ['turn', 'sharp right', undefined],
  ['turn', 'left', undefined],
  ['turn', 'right', undefined],
  // No direction at all.
  ['turn', undefined, undefined],
  ['continue', 'straight', undefined],
  ['new name', undefined, undefined],
  ['end of road', 'right', undefined],
  // Junctions, reachable only with no direction modifier for the branch to be taken.
  ['merge', undefined, undefined],
  ['fork', undefined, undefined],
  // Anything unrecognised with no usable modifier is "straight on".
  ['notification', undefined, undefined],
  // Roundabouts: the exit is what makes it an ordinal instead of a bare "roundabout".
  ['roundabout', undefined, 1],
  ['roundabout', undefined, 3],
  ['rotary', undefined, undefined],
  // Terminal steps.
  ['arrive', undefined, undefined],
  ['destination', undefined, undefined],
  ['depart', undefined, undefined],
];

/** Every key the dashboard can put on screen, gathered the way the dashboard gathers them. */
function allCopies(): NavCopy[] {
  const copies: NavCopy[] = [
    { key: ARRIVAL_CHIP_DISTANCE_CAPTION_KEY },
    { key: ARRIVAL_CHIP_ETA_CAPTION_KEY },
  ];
  for (const [type, modifier, exit] of MANEUVER_INPUTS) {
    const action = maneuverActionPhrase(type, modifier, exit);
    copies.push(action);
    const parts = maneuverBannerParts(type, modifier, 750, exit);
    copies.push(parts.action);
    if (parts.distance) copies.push(parts.distance);
  }
  for (const stage of ['to_pickup', 'to_dropoff', null]) {
    const parts = tripStageBannerParts(stage, 750);
    copies.push(parts.action);
    if (parts.distance) copies.push(parts.distance);
  }
  return copies;
}

/** The distinct keys, which is what the locale bundles are checked against. */
function allKeys(): string[] {
  return [...new Set(allCopies().map((copy) => copy.key))];
}

describe('the sentences the map cards show the driver', () => {
  it('has a translation for every sentence, in every locale', () => {
    // The failure this stands in for is a missing key, and i18next answers a missing key with the
    // key itself: `nav.maneuver.roundaboutExit` printed across the windscreen while the driver is
    // looking for a roundabout. Asserted on the resolved string, not on the key, because the key
    // is exactly what comes back when it is missing.
    for (const lng of LOCALES) {
      const t = makeI18n(lng).t;
      for (const copy of allCopies()) {
        const sentence = navCopyText(t, copy);
        expect(sentence).not.toBe(copy.key);
        expect(sentence.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('reaches every branch of the maneuver picker, so no key goes unchecked', () => {
    // Non-vacuity for the test above: if `MANEUVER_INPUTS` stopped producing the roundabout keys,
    // the completeness check would pass by checking nothing.
    const keys = allKeys();
    for (const expected of [
      'nav.maneuver.arrive',
      'nav.maneuver.roundabout',
      'nav.maneuver.roundaboutExit',
      'nav.maneuver.left',
      'nav.maneuver.right',
      'nav.maneuver.slightLeft',
      'nav.maneuver.slightRight',
      'nav.maneuver.sharpLeft',
      'nav.maneuver.sharpRight',
      'nav.maneuver.uturn',
      'nav.maneuver.merge',
      'nav.maneuver.fork',
      'nav.maneuver.straight',
      'nav.maneuver.depart',
      'nav.distance.in',
      'nav.distance.bare',
      'nav.stage.toPickup',
      'nav.stage.toDropoff',
      'nav.arrival.remaining',
      'nav.arrival.eta',
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it('says a turn in the language of the phone, not in French', () => {
    // The bug this closes: the maneuver card was written in French by `navProgress`, while the
    // guidance bar above it was translated — so an English or Spanish phone read its turn
    // instructions in a language its driver may not have.
    const turn = maneuverActionPhrase('turn', 'right');
    const road = maneuverBannerParts('turn', 'right', 60);
    const pickup = tripStageBannerParts('to_pickup', 750);

    expect(navCopyText(makeI18n('fr').t, turn)).toBe('Tourner à droite');
    expect(navCopyText(makeI18n('en').t, turn)).toBe('Turn right');
    expect(navCopyText(makeI18n('es').t, turn)).toBe('Gire a la derecha');

    expect(navCopyText(makeI18n('fr').t, road.distance!)).toBe('dans 60 m');
    expect(navCopyText(makeI18n('en').t, road.distance!)).toBe('in 60 m');
    expect(navCopyText(makeI18n('es').t, road.distance!)).toBe('en 60 m');

    expect(navCopyText(makeI18n('fr').t, pickup.action)).toBe(
      'Rejoindre le point de prise en charge',
    );
    expect(navCopyText(makeI18n('en').t, pickup.action)).toBe(
      'Head to the pickup point',
    );
    expect(navCopyText(makeI18n('es').t, pickup.action)).toBe(
      'Ir al punto de recogida',
    );
  });

  it('builds the roundabout exit ordinal the way each language spells it', () => {
    // Not a suffix table: `count` plus `ordinal: true` makes i18next pick the plural category
    // from `Intl.PluralRules(locale, { type: 'ordinal' })`. The 21st/21e cases are the reason —
    // a naive `n === 1 ? '1re' : n + 'e'` gets English wrong from 21 onwards, and a naive
    // English table gets "21th".
    const exit = (n: number) => maneuverActionPhrase('roundabout', undefined, n);
    const frT = makeI18n('fr').t;
    const enT = makeI18n('en').t;
    const esT = makeI18n('es').t;

    expect(navCopyText(frT, exit(1))).toBe('Prendre la 1re sortie');
    expect(navCopyText(frT, exit(2))).toBe('Prendre la 2e sortie');
    expect(navCopyText(frT, exit(21))).toBe('Prendre la 21e sortie');

    expect(navCopyText(enT, exit(1))).toBe('Take the 1st exit');
    expect(navCopyText(enT, exit(2))).toBe('Take the 2nd exit');
    expect(navCopyText(enT, exit(3))).toBe('Take the 3rd exit');
    expect(navCopyText(enT, exit(4))).toBe('Take the 4th exit');
    expect(navCopyText(enT, exit(21))).toBe('Take the 21st exit');

    expect(navCopyText(esT, exit(1))).toBe('Tome la 1ª salida');
    expect(navCopyText(esT, exit(21))).toBe('Tome la 21ª salida');
  });

  it('names the two figures of the arrival chip in the phone language', () => {
    expect(
      navCopyText(makeI18n('fr').t, { key: ARRIVAL_CHIP_DISTANCE_CAPTION_KEY }),
    ).toBe('restant');
    expect(
      navCopyText(makeI18n('en').t, { key: ARRIVAL_CHIP_DISTANCE_CAPTION_KEY }),
    ).toBe('left');
    expect(
      navCopyText(makeI18n('es').t, { key: ARRIVAL_CHIP_ETA_CAPTION_KEY }),
    ).toBe('llegada');
  });

  it('translates the reroute banner in every shipped language', () => {
    for (const lng of LOCALES) {
      const t = makeI18n(lng).t;
      const text = t('nav.reroute');
      expect(text).not.toBe('nav.reroute');
      expect(text.length).toBeGreaterThan(4);
    }
  });

  it('is configured for the plural form this test assumes', () => {
    // `_one` / `_two` / `_few` / `_other` are the v4 suffixes. Under the v3 format i18next looks
    // for `_1` / `_2`, finds none of them, and silently renders the *base* key — which for a
    // roundabout would drop the exit number entirely. Pinned against the app's own initialisation
    // so this test cannot pass while the phone runs something else.
    // `process.cwd()` is the repo root under Jest, the same anchor the other source-reading
    // tests use.
    const source = readFileSync(
      join(process.cwd(), 'src/i18n/index.ts'),
      'utf8',
    );
    expect(source).toContain("compatibilityJSON: 'v4'");
  });
});
