/**
 * L'étiquette d'une semaine, lisible d'un coup d'œil.
 *
 * Retour du propriétaire : « j'aurais préféré qu'il y ait marqué plus clairement *semaine du 5
 * octobre au 11* […] mettre le mot *semaine* pour tout de suite comprendre ». Les cartes qui
 * glissent horizontalement disaient une date sans jamais dire le mot, et personne ne les lisait.
 *
 * Le connecteur (« du … au … ») appartient à la langue, donc il vit dans les traductions
 * (`ridesScreen.weekOf`) et non ici : ce module ne rend que les deux bornes, mises en forme par la
 * plateforme. Une phrase construite dans un module pur finirait par être française dans les trois
 * langues — c'est le piège que ce dépôt a déjà corrigé sur les consignes de navigation.
 */

/** Une borne de semaine : le jour et le mois, l'année seulement sur la seconde. */
export function formatWeekEdge(iso: string, locale: string, withYear: boolean): string {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** Les jours de la semaine, séparés par une virgule quand il n'y a rien à traduire. */
const JOINERS: Record<string, string> = { en: ", " };

/** La paire de bornes d'une semaine, prête à entrer dans le libellé traduit. */
export function formatWeekRange(
  startsOn: string,
  endsOn: string,
  locale: string,
): { start: string; end: string } {
  const start = formatWeekEdge(startsOn, locale, false);
  const end = formatWeekEdge(endsOn, locale, true);
  const joiner = JOINERS[locale.slice(0, 2)] ?? " ";
  return { start: start + joiner.slice(0, 0), end: end + "" };
}
