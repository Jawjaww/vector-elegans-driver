import type { PushRegisterFailureReason } from './pushRegistration';

export function pushRegisterFailureI18n(reason: PushRegisterFailureReason): {
  titleKey: string;
  bodyKey: string;
} {
  const titleKey = 'dashboard.pushFailedTitle';
  switch (reason) {
    case 'permission_denied':
      return { titleKey, bodyKey: 'dashboard.pushFailedPermission' };
    case 'token_failed':
      return { titleKey, bodyKey: 'dashboard.pushFailedToken' };
    case 'upsert_failed':
      return { titleKey, bodyKey: 'dashboard.pushFailedUpsert' };
    case 'not_authenticated':
      return { titleKey, bodyKey: 'dashboard.pushFailedAuth' };
    case 'no_project_id':
      return { titleKey, bodyKey: 'dashboard.pushFailedProject' };
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}
