import { normalizeFolderStatus, isUnsubmittedDossier } from '../folderStatus';
import {
  getUserRole,
  isUserDriver,
  isUserAdmin,
  ROLES,
} from '../utils/auth-helpers';
import type { User } from '@supabase/supabase-js';

describe('normalizeFolderStatus', () => {
  it('maps legacy submitted/pending_validation to pending_review', () => {
    expect(normalizeFolderStatus('submitted')).toBe('pending_review');
    expect(normalizeFolderStatus('pending_validation')).toBe('pending_review');
  });

  it('maps validated to active', () => {
    expect(normalizeFolderStatus('validated')).toBe('active');
  });

  it('maps incomplete to draft', () => {
    expect(normalizeFolderStatus('incomplete')).toBe('draft');
  });

  it('keeps canonical statuses', () => {
    expect(normalizeFolderStatus('draft')).toBe('draft');
    expect(normalizeFolderStatus('pending_review')).toBe('pending_review');
    expect(normalizeFolderStatus('rejected')).toBe('rejected');
  });
});

describe('isUnsubmittedDossier', () => {
  it('treats draft and rejected as unlocked', () => {
    expect(isUnsubmittedDossier('draft')).toBe(true);
    expect(isUnsubmittedDossier('incomplete')).toBe(true);
    expect(isUnsubmittedDossier('rejected')).toBe(true);
  });

  it('locks pending_review and active', () => {
    expect(isUnsubmittedDossier('pending_review')).toBe(false);
    expect(isUnsubmittedDossier('active')).toBe(false);
  });
});

describe('auth-helpers', () => {
  const userWithRole = (role: string): User =>
    ({
      id: 'u1',
      app_metadata: { role },
      user_metadata: {},
      aud: 'authenticated',
      created_at: '',
    }) as User;

  it('detects driver role', () => {
    expect(isUserDriver(userWithRole(ROLES.DRIVER))).toBe(true);
    expect(getUserRole(userWithRole(ROLES.DRIVER))).toBe('app_driver');
  });

  it('detects admin roles', () => {
    expect(isUserAdmin(userWithRole(ROLES.ADMIN))).toBe(true);
    expect(isUserAdmin(userWithRole(ROLES.SUPER_ADMIN))).toBe(true);
    expect(isUserAdmin(userWithRole(ROLES.DRIVER))).toBe(false);
  });

  it('defaults to customer when missing', () => {
    expect(getUserRole(null)).toBe('app_customer');
  });
});
