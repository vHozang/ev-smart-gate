import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useFeedback } from '@/shared/feedback';
import { getSession, loginSession, logoutSession } from '../../api/session';
import { AuthContext } from '../../model/context';
import type { LoginInput } from '../../model/types';
const identityKey = ['identity', 'current'] as const;
export function AuthProvider({ children }: PropsWithChildren) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const query = useQuery({
    queryKey: identityKey,
    queryFn: ({ signal }) => getSession(signal),
    staleTime: Infinity,
    retry: false,
  });
  const login = useCallback(
    async (input: LoginInput) => {
      await client.cancelQueries();
      const user = await loginSession(input);
      client.clear();
      feedback.reset();
      client.setQueryData(identityKey, user);
    },
    [client, feedback],
  );
  const logout = useCallback(async () => {
    await client.cancelQueries();
    try {
      await logoutSession();
    } finally {
      client.clear();
      feedback.reset();
      client.setQueryData(identityKey, null);
    }
  }, [client, feedback]);
  const principal = query.data ?? null;
  const value = useMemo(
    () => ({
      principal,
      loading: query.isPending,
      error: query.error,
      login,
      logout,
      can: (permission: string) => principal?.permissions.includes(permission) ?? false,
    }),
    [principal, query.isPending, query.error, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
