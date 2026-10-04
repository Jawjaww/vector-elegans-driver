import type { RideDocument } from './rideDocument';

/**
 * Le spécimen de facture : montrer à quoi ressemble un document **sans jamais produire un document
 * qui aurait l'air valable**.
 *
 * La fonction d'émission refuse d'émettre tant que la plateforme n'a pas renseigné son identité
 * légale (`issuer_not_configured`), et c'est volontaire. Mais un chauffeur qui ne peut rien voir du
 * tout ne comprend pas ce qui lui manque. D'où le spécimen, avec trois garde-fous :
 *
 * 1. il porte le mot **SPÉCIMEN** à l'écran, en clair ;
 * 2. son numéro n'est **pas** de la forme d'un vrai (`FA-AAAA-SPÉCIMEN`, quand la série réelle est
 *    `FA-2026-000001`) — aucun contrôle comptable ne peut le confondre avec un document émis ;
 * 3. son SIRET est **tous zéros**, ce qu'un SIRET réel ne peut pas être. Un numéro *plausible*
 *    aurait été pire qu'inutile : il pourrait désigner une vraie entreprise.
 *
 * Il vit côté application, pas en base : un spécimen n'a aucune valeur légale, il ne doit donc
 * exister nulle part ailleurs que dans l'affichage, et il ne coûte **aucune requête**.
 */

export const SPECIMEN_MARKER = 'SPÉCIMEN';

/** Forme réelle : `FA-<exercice>-<séquence>`. Celle-ci ne peut pas passer pour un vrai numéro. */
export const SPECIMEN_NUMBER = 'FA-AAAA-SPÉCIMEN';

/** Tous zéros : un SIRET réel ne peut pas l'être. */
export const SPECIMEN_SIRET = '000 000 000 00000';

export const SPECIMEN_ISSUER_NAME = 'La Ligue des VTC';

export const SPECIMEN_DOCUMENT: RideDocument = {
  id: 'specimen',
  kind: 'invoice',
  number: SPECIMEN_NUMBER,
  issuedAt: null,
  // Calcules comme la vraie regle (D-15) : commission 20 % de 42 = 8,40 ; part operateur 30 % de
  // la commission = 2,52 ; plateforme le reste = 5,88 ; chauffeur 42 - 8,40 = 33,60.
  totalAmount: 42.0,
  driverEarning: 33.6,
  operatorShare: 2.52,
  platformShare: 5.88,
  paymentMethod: 'card',
  issuer: {
    name: SPECIMEN_ISSUER_NAME,
    siret: SPECIMEN_SIRET,
    address: '1 rue de l’Exemple',
    city: 'Paris',
  },
  clientName: 'Client Exemple',
  ridePickup: 'Gare de Lyon',
  rideDropoff: 'Tour Eiffel',
};

/** Un vrai numéro est `FA-2026-000001` : une série numérique, jamais des lettres. */
export function looksLikeRealNumber(number: string): boolean {
  return /^(FA|RC)-\d{4}-\d{6}$/.test(number);
}

/**
 * Garde d'affichage : un spécimen **doit** être reconnu comme tel. Si un jour quelqu'un remplace
 * son numéro par un numéro plausible, l'écran doit cesser de l'appeler un spécimen — et ce test
 * échoue avant que cela n'arrive en production.
 */
export function isSpecimen(document: Pick<RideDocument, 'id'>): boolean {
  return document.id === 'specimen';
}
