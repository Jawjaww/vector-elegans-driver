jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  formatOptionPriceLabel,
  normalizeSelectedOptions,
  optionChipLabel,
  optionFeatherIcon,
} from '../services/optionsCatalog';

/**
 * Les options d'une course, telles que le client les a choisies dans le portail Next.js et telles
 * qu'elles arrivent au chauffeur.
 *
 * Les chaines ci-dessous sont celles **mesurees** sur le cloud le 2026-10-07, pas des exemples
 * inventes : `rides.options` de la course `4bb69d98-7729-40ea-8750-45f16f65b4cf`, et l'agregat de
 * 227 courses a options — 217 `Animaux domestiques`, 215 `Siège enfant`, plus 7 `childSeat` et
 * 6 `petFriendly` restes du premier catalogue.
 */
const REAL_RIDE_OPTIONS = ['Animaux domestiques', 'Siège enfant'];

describe('les options choisies cote client arrivent a l identique', () => {
  it('les noms canoniques traversent la normalisation sans bouger', () => {
    expect(normalizeSelectedOptions(REAL_RIDE_OPTIONS)).toEqual(REAL_RIDE_OPTIONS);
  });

  it('les cles historiques rejoignent ces memes noms', () => {
    // 13 courses du cloud portent encore les cles du premier catalogue. Le chauffeur doit lire la
    // meme option que le client a choisie, pas `childSeat`.
    expect(normalizeSelectedOptions(['childSeat', 'petFriendly'])).toEqual([
      'Siège enfant',
      'Animaux domestiques',
    ]);
  });

  it('chaque option mesuree a sa propre icone, jamais le repli generique', () => {
    for (const name of REAL_RIDE_OPTIONS) {
      expect(optionFeatherIcon(name)).not.toBe('package');
    }
    // Non-vacuite : le repli existe, et un nom hors catalogue le prendrait.
    expect(optionFeatherIcon('option-inconnue')).toBe('package');
  });
});

describe('le libelle revele au tap', () => {
  it('est le meme que la carte chauffeur Next.js : nom et prix', () => {
    // Next.js ecrit `${name} · ${price}` avec « +15 € » ou « Inclus ». L'app Expo doit dire la
    // meme chose, sinon le chauffeur lit une option que le client n'a pas payee.
    expect(optionChipLabel('Siège enfant', 15)).toBe('Siège enfant · +15 €');
    expect(optionChipLabel('WiFi à bord', 0)).toBe('WiFi à bord · Inclus');
    expect(formatOptionPriceLabel(10)).toBe('+10 €');
  });

  it('ne fabrique pas de prix quand le catalogue ne connait pas l option', () => {
    // Le catalogue cloud porte encore `childSeat`/`petFriendly` : un nom qui ne s'y resout pas
    // laisse le nom seul, jamais un « +0 € » invente.
    expect(optionChipLabel('Animaux domestiques', undefined)).toBe('Animaux domestiques');
    expect(formatOptionPriceLabel(undefined)).toBe('');
  });
});

/**
 * Le cablage, pas la regle. Une icone cliquable dans un composant que la carte n'utilise pas ne
 * vaut rien : ces assertions relient le tap a l'ecran, comme `offerPayment.test.ts` le fait pour
 * le badge de paiement.
 */
describe('le cablage du tap sur les icones de la carte d offre', () => {
  const { readFileSync } = require('fs') as {
    readFileSync: (path: string, encoding: string) => string;
  };
  const { join } = require('path') as { join: (...parts: string[]) => string };
  const read = (relative: string) =>
    readFileSync(join(process.cwd(), relative), 'utf8');
  /** Sans commentaires : une assertion ne doit pas pouvoir etre satisfaite par la prose. */
  const stripComments = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"])\/\/.*$/gm, '$1');

  const card = stripComments(read(join('src', 'components', 'OfferRideCard.tsx')));
  const chips = stripComments(
    read(join('src', 'components', 'RideOfferExtras.tsx')),
  );

  it("la carte rend les options de la course, et ne desactive plus le tap", () => {
    expect(card).toContain('options={ride.options}');
    // L'ancien etat : `interactive={false}` rendait les pastilles decoratives, sans libelle
    // atteignable. C'est exactement ce que le proprietaire a demande de retirer.
    expect(card).not.toContain('interactive={false}');
  });

  it('un tap revele le libelle, et rien ne l affiche avant', () => {
    expect(chips).toContain('onPress={() => toggleLabel(');
    expect(chips).toMatch(/\{isExpanded \?/);
    expect(chips).toContain('accessibilityRole="button"');
  });

  it('le libelle se referme seul, comme le badge de paiement de l offre', () => {
    expect(chips).toContain('AUTO_HIDE_MS = 5000');
    expect(chips).toContain('setTimeout(() => setExpandedKey(null)');
  });
});
