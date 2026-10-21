import { createContext, useContext } from 'react';
import type { AuthContextValue } from './types';
export const AuthContext = createContext<AuthContextValue | null>(null);
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('Thiếu AuthProvider');
  return context;
}
export function useAuthorization() {
  const { can, principal } = useAuth();
  return {
    can,
    canAny: (permissions: readonly string[]) => permissions.some(can),
    canAll: (permissions: readonly string[]) => permissions.every(can),
    principal,
  };
}
