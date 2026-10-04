/**
 * L'index des semaines : de quoi CHOISIR une semaine sans télécharger les courses.
 *
 * `driver_week_index` renvoie, pour chaque semaine récente, ses totaux — et **aucune course**. Le
 * détail d'une semaine reste la requête paginée, déclenchée seulement quand elle est choisie.
 *
 * C'est la réponse à une remarque juste du propriétaire : « il n'y a pas besoin de tout télécharger
 * en masse à chaque fois ». L'index coûte une requête agrégée et donne au chauffeur de quoi
 * naviguer ; il ne remplace pas la liste, il la commande.
 */

export interface WeekIndexEntry {
  /** Lundi de la semaine, en ISO (`YYYY-MM-DD`). */
  startsOn: string;
  /** Dimanche de la semaine. */
  endsOn: string;
  rides: number;
  netEarnings: number;
  cashCollected: number;
  cardDue: number;
  unclassified: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Rend `null` sur une charge utile incomprise — jamais une liste vide, qui se lirait « aucune
 * semaine » alors que c'est « je n'ai pas su lire la réponse ». La nuance compte : l'une invite à
 * changer de semaine, l'autre à réessayer.
 */
export function toWeekIndex(payload: unknown): WeekIndexEntry[] | null {
  const raw = asRecord(payload);
  if (!raw || raw.success !== true || !Array.isArray(raw.weeks)) return null;

  return raw.weeks
    .map((entry) => {
      const week = asRecord(entry);
      if (!week) return null;
      const startsOn = text(week.starts_on);
      if (!startsOn) return null;

      return {
        startsOn,
        endsOn: text(week.ends_on),
        rides: num(week.rides),
        netEarnings: num(week.net_earnings),
        cashCollected: num(week.cash_collected),
        cardDue: num(week.card_due),
        unclassified: num(week.unclassified),
      };
    })
    .filter((week): week is WeekIndexEntry => week !== null);
}

/**
 * La semaine affichée par défaut : **la plus récente**, c'est-à-dire la semaine en cours. L'index
 * arrive du plus récent au plus ancien — on ne le trie donc pas, on prend la tête, et si l'index
 * est vide on rend `null` plutôt qu'une date inventée.
 */
export function currentWeekEntry(
  weeks: readonly WeekIndexEntry[],
): WeekIndexEntry | null {
  return weeks.length > 0 ? weeks[0] : null;
}

/**
 * La semaine d'une date, en ISO (lundi). Sert à retrouver, dans l'index, l'entrée qui correspond à
 * une plage déjà sélectionnée par le chauffeur — sans requête supplémentaire.
 */
export function weekStartOf(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offset);

  const month = `${monday.getMonth() + 1}`.padStart(2, "0");
  const day = `${monday.getDate()}`.padStart(2, "0");
  return `${monday.getFullYear()}-${month}-${day}`;
}

/** L'entrée de l'index qui correspond à une date donnée, ou `null` si elle sort de la fenêtre. */
export function weekEntryFor(
  weeks: readonly WeekIndexEntry[],
  date: Date,
): WeekIndexEntry | null {
  const key = weekStartOf(date);
  return weeks.find((week) => week.startsOn === key) ?? null;
}
