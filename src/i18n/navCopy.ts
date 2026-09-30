import type { TFunction } from 'i18next';

import type { NavCopy } from '../lib/utils/navProgress';

/**
 * Renders one driver-facing sentence in the phone's language.
 *
 * `t` is passed in rather than imported, and that is the whole point of this module being three
 * lines: the components already call `useTranslation`, so going through *their* `t` is what makes
 * the maneuver card and the arrival chip re-render when the language changes. A module-level
 * `i18n.t` would render the right sentence once and then never update.
 *
 * Keeping the translation here rather than in `navProgress` is what lets that module stay pure:
 * it decides *what* is said, as a key, and this decides in which language. `tripGuidance` already
 * draws that line for the guidance bar's titles.
 */
export function navCopyText(
  t: TFunction,
  copy: NavCopy,
): string {
  return t(copy.key, copy.params);
}
