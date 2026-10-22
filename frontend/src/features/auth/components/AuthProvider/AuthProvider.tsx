import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useFeedback } from '@/shared/feedback';
import { ApiError, clearSensitiveCache, getAuthToken, setTokenRefreshHandler } from '@/shared/api';
import {
  bootstrapSession,
  changePasswordSession,
  clearSession,
  loginSession,
  loginSessionV2,
  logoutSession,
  refreshSessionV2,
} from '../../api/session';
import { broadcastAuthEvent, subscribeAuthBroadcast } from '../../api/authBroadcast';
import { AuthContext } from '../../model/context';
import type { ChangePasswordInput, LoginInput, SessionPrincipal } from '../../model/types';

const identityKey = ['identity', 'current'] as const;

export function AuthProvider({ children }: PropsWithChildren) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const query = useQuery({
    queryKey: identityKey,
    queryFn: ({ signal }) => bootstrapSession(signal),
    staleTime: Infinity,
    retry: false,
  });

  // Lắng nghe sự kiện đồng bộ đa tab (LOGOUT, REFRESH_SUCCESS)
  useEffect(() => {
    return subscribeAuthBroadcast((event) => {
      if (event.type === 'LOGOUT') {
        void client.cancelQueries();
        clearSensitiveCache(client);
        clearSession();
        feedback.reset();
        client.setQueryData(identityKey, null);
      } else if (event.type === 'REFRESH_SUCCESS') {
        void client.invalidateQueries({ queryKey: identityKey });
      }
    });
  }, [client, feedback]);

  const principal = query.data ?? null;

  useEffect(() => {
    if (principal?.source !== 'jwt') {
      setTokenRefreshHandler(null);
      return;
    }
    setTokenRefreshHandler(async () => {
      const refreshed = await refreshSessionV2();
      if (refreshed) {
        client.setQueryData(identityKey, refreshed);
        broadcastAuthEvent('REFRESH_SUCCESS');
        return getAuthToken();
      }
      void client.cancelQueries();
      clearSensitiveCache(client);
      clearSession();
      feedback.reset();
      client.setQueryData(identityKey, null);
      broadcastAuthEvent('LOGOUT');
      return null;
    });
    return () => {
      setTokenRefreshHandler(null);
    };
  }, [principal?.source, client, feedback]);

  const login = useCallback(
    async (input: LoginInput) => {
      await client.cancelQueries();
      let user: SessionPrincipal;
      try {
        user = await loginSessionV2(input);
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.status === 404 || error.code === 'CONTRACT_INVALID')
        ) {
          user = await loginSession(input);
        } else {
          throw error;
        }
      }
      clearSensitiveCache(client);
      feedback.reset();
      client.setQueryData(identityKey, user);
      broadcastAuthEvent('REFRESH_SUCCESS');
    },
    [client, feedback],
  );

  const changePassword = useCallback(
    async (input: ChangePasswordInput) => {
      await changePasswordSession(input);
      client.setQueryData<SessionPrincipal | null>(identityKey, (prev) =>
        prev ? { ...prev, must_change_password: false } : prev,
      );
      broadcastAuthEvent('REFRESH_SUCCESS');
    },
    [client],
  );

  const logout = useCallback(async () => {
    await client.cancelQueries();
    try {
      await logoutSession(principal?.source);
    } catch {
      // Đảm bảo fail-safe dọn dẹp phiên nội bộ kể cả khi backend không phản hồi
    } finally {
      clearSensitiveCache(client);
      clearSession();
      feedback.reset();
      client.setQueryData(identityKey, null);
      broadcastAuthEvent('LOGOUT');
    }
  }, [client, feedback, principal?.source]);

  const value = useMemo(
    () => ({
      principal,
      loading: query.isPending,
      error: query.error,
      login,
      logout,
      changePassword,
      can: (permission: string) => {
        if (!principal) return false;
        if (principal.permissions.includes(permission)) return true;
        const aliases: Record<string, string[]> = {
          'audit:read': ['audit-logs:read'],
          'audit-logs:read': ['audit:read'],
          'analytics:read': ['dashboard:read'],
          'dashboard:read': ['analytics:read'],
          'assistant:read': ['reports:read'],
          'reports:read': ['assistant:read'],
          'assistant:create': ['reports:generate'],
          'reports:generate': ['assistant:create'],
        };
        for (const alias of aliases[permission] || []) {
          if (principal.permissions.includes(alias)) return true;
        }
        const hyphenated = permission.replace(/_/g, '-');
        if (hyphenated !== permission && principal.permissions.includes(hyphenated)) return true;
        const underscored = permission.replace(/-/g, '_');
        if (underscored !== permission && principal.permissions.includes(underscored)) return true;
        return false;
      },
    }),
    [principal, query.isPending, query.error, login, logout, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
