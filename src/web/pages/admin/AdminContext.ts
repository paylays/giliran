import { createContext, useContext } from 'react';
import type { AuthUser } from '../../../shared/contracts.ts';

export const AdminContext = createContext<{ user: AuthUser } | null>(null);

export function useAdminUser(): AuthUser {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdminUser must be used inside AdminPage');
  return value.user;
}
