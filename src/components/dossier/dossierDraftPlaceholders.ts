/**
 * DB CHECK placeholders — treated as empty in the form and by completeness RPCs.
 *
 * The persist path never writes NULL into required driver columns; these sentinels satisfy the
 * CHECKs while the wizard still shows a blank field. Completeness RPCs and `toForm*` treat them
 * as empty so a draft does not look filled.
 */

export const DRAFT_PLACEHOLDER_TEXT = 'À compléter';
export const DRAFT_PLACEHOLDER_PHONE = '+00000000000';
export const DRAFT_PLACEHOLDER_DATE = '2099-12-31';

export const emptyToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const isPlaceholderText = (value: string | null | undefined): boolean =>
  !value || value === DRAFT_PLACEHOLDER_TEXT;

export const isPlaceholderPhone = (value: string | null | undefined): boolean =>
  !value ||
  value === DRAFT_PLACEHOLDER_TEXT ||
  value === DRAFT_PLACEHOLDER_PHONE;

export const isPlaceholderDate = (value: string | null | undefined): boolean =>
  !value || value === DRAFT_PLACEHOLDER_DATE;

export const toFormText = (value: string | null | undefined): string =>
  isPlaceholderText(value) ? '' : (value ?? '');

export const toFormPhone = (value: string | null | undefined): string =>
  isPlaceholderPhone(value) ? '' : (value ?? '');

export const toFormDate = (value: string | null | undefined): string =>
  isPlaceholderDate(value) ? '' : (value ?? '');

/** Never NULL — satisfies drivers.required_fields and related CHECK constraints. */
export const requiredDriverText = (value: string): string => {
  const trimmed = value.trim();
  return trimmed === '' ? DRAFT_PLACEHOLDER_TEXT : trimmed;
};

export const requiredDriverPhone = (value: string): string => {
  const trimmed = value.trim();
  return trimmed === '' ? DRAFT_PLACEHOLDER_PHONE : trimmed;
};

export const requiredDriverDate = (value: string): string => {
  const trimmed = value.trim();
  return trimmed === '' ? DRAFT_PLACEHOLDER_DATE : trimmed;
};
