/**
 * Les réglages du rattrapage de la flèche, lus depuis le snapshot de frais de la course (D-23).
 *
 * Ce sont des réglages de **sensation** : « le rattrapage doit être invisible » se juge en roulant.
 * Ils vivent donc en base, dans la politique de frais, figés dans le snapshot de la course — et
 * cette fonction est le seul endroit qui les traduit pour le document de la carte.
 *
 * Deux règles :
 *   - une valeur absente ou illisible retombe sur le défaut, jamais sur zéro : une part de 0 %
 *     figerait la correction, une accélération de 0 la ferait sauter d'un coup ;
 *   - les bornes de la base sont reprises ici. Elles protègent du même danger, mais la base peut
 *     être contournée par un snapshot ancien ou écrit à la main — et une flèche qui rugit se voit,
 *     alors qu'une valeur aberrante en base ne se voit pas.
 */

export interface NavCatchupPolicy {
  /** Part de la vitesse courante que la correction ne peut pas dépasser. */
  catchupShare: number;
  /** Taux du ressort de correction, en 1/s. */
  springPerS: number;
  /** Accélération maximale de la correction, en m/s². */
  catchupMaxDv: number;
  /** Plafond de progression, en mètres. */
  maxCatchupM: number;
}

/** Les valeurs de D-23, et celles du document quand rien n'est injecté. */
export const NAV_CATCHUP_DEFAULTS: NavCatchupPolicy = {
  catchupShare: 0.15,
  springPerS: 1.4,
  catchupMaxDv: 0.6,
  maxCatchupM: 25,
};

function numberIn(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

/** Lit les quatre réglages du snapshot de frais, avec les bornes de la base. */
export function navPolicyFromSnapshot(snapshot: unknown): NavCatchupPolicy {
  const raw =
    typeof snapshot === "object" && snapshot !== null
      ? (snapshot as Record<string, unknown>)
      : {};

  return {
    catchupShare: numberIn(
      raw.nav_catchup_share,
      NAV_CATCHUP_DEFAULTS.catchupShare,
      0,
      1,
    ),
    springPerS: numberIn(raw.nav_spring_per_s, NAV_CATCHUP_DEFAULTS.springPerS, 0.01, 10),
    catchupMaxDv: numberIn(
      raw.nav_catchup_max_dv,
      NAV_CATCHUP_DEFAULTS.catchupMaxDv,
      0.01,
      5,
    ),
    maxCatchupM: numberIn(raw.nav_max_catchup_m, NAV_CATCHUP_DEFAULTS.maxCatchupM, 1, 200),
  };
}

/** La charge utile attendue par le document de la carte (`window.__veNavPolicy`). */
export function navPolicyPayload(
  policy: NavCatchupPolicy,
): Record<string, number> {
  return {
    catchupShare: policy.catchupShare,
    springPerS: policy.springPerS,
    catchupMaxDv: policy.catchupMaxDv,
    maxCatchupM: policy.maxCatchupM,
  };
}
