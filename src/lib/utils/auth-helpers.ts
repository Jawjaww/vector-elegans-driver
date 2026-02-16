import { User } from '@supabase/supabase-js';

export type AppRole = 'app_customer' | 'app_driver' | 'app_admin' | 'app_super_admin';

export const ROLES = {
  CUSTOMER: 'app_customer',
  DRIVER: 'app_driver',
  ADMIN: 'app_admin',
  SUPER_ADMIN: 'app_super_admin'
} as const;

export function getUserRole(user: User | null): AppRole {
  if (!user) return ROLES.CUSTOMER;
  const role = user.app_metadata?.role as AppRole | undefined;
  return role || ROLES.CUSTOMER;
}

export function userHasRole(user: User | null, role: AppRole): boolean {
  return getUserRole(user) === role;
}

export function isUserDriver(user: User | null): boolean {
  return getUserRole(user) === ROLES.DRIVER;
}

export function isUserAdmin(user: User | null): boolean {
  const role = getUserRole(user);
  return role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
}

export function isUserSuperAdmin(user: User | null): boolean {
  return getUserRole(user) === ROLES.SUPER_ADMIN;
}

export function isUserCustomer(user: User | null): boolean {
  return getUserRole(user) === ROLES.CUSTOMER;
}
