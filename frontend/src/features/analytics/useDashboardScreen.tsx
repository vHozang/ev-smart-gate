import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { normalizeError, queryKeys } from '@/shared/api';
import { getDashboardAnalytics, listMetricDefinitions, resolveSupportedDrilldown } from './api';

export type DashboardPeriodPreset = 'today' | '7d' | '30d' | 'year2026';

export function useDashboardScreen() {
  const { principal, can } = useAuth();
  const identity = principal?.id ?? 'anonymous';

  const [from, setFrom] = useState('2026-01-01T00:00:00Z');
  const [to, setTo] = useState('2026-12-31T23:59:59Z');
  const [timezone, setTimezone] = useState<'Asia/Bangkok' | 'UTC'>('Asia/Bangkok');
  const [accessMode, setAccessMode] = useState<'pedestrian' | 'motorcycle' | 'car' | 'truck' | ''>(
    '',
  );
  const [direction, setDirection] = useState<'ENTRY' | 'EXIT' | ''>('');
  const [accessPointId, setAccessPointId] = useState('');
  const [showTableEquivalent, setShowTableEquivalent] = useState(true);

  const lastRefreshRef = useRef<number>(0);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.analytics(identity, 'dashboard', `${from}:${to}:${timezone}`, {
      access_mode: accessMode || null,
      direction: direction || null,
      access_point_id: accessPointId.trim() || null,
    }),
    queryFn: ({ signal }) =>
      getDashboardAnalytics(
        {
          from,
          to,
          timezone,
          access_mode: accessMode,
          direction,
          access_point_id: accessPointId,
        },
        signal,
      ),
    enabled: Boolean(principal),
  });

  const definitionsQuery = useQuery({
    queryKey: queryKeys.resource(identity, 'metric-definitions', {}),
    queryFn: ({ signal }) => listMetricDefinitions(signal),
    enabled: Boolean(principal),
  });

  const reloadDashboard = () => {
    const now = Date.now();
    // Rate-limit invalidate (tối thiểu 1.5s giữa các lần bấm tay)
    if (now - lastRefreshRef.current < 1500) return;
    lastRefreshRef.current = now;
    void dashboardQuery.refetch();
    void definitionsQuery.refetch();
  };

  const applyPreset = (preset: DashboardPeriodPreset) => {
    const now = new Date();
    const endIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59),
    ).toISOString();
    if (preset === 'today') {
      const startIso = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0),
      ).toISOString();
      setFrom(startIso);
      setTo(endIso);
      return;
    }
    if (preset === '7d') {
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const startIso = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0),
      ).toISOString();
      setFrom(startIso);
      setTo(endIso);
      return;
    }
    if (preset === '30d') {
      const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      const startIso = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0),
      ).toISOString();
      setFrom(startIso);
      setTo(endIso);
      return;
    }
    setFrom('2026-01-01T00:00:00Z');
    setTo('2026-12-31T23:59:59Z');
  };

  return {
    data: {
      dashboard: dashboardQuery.data ?? null,
      definitions: definitionsQuery.data?.items ?? [],
      from,
      to,
      timezone,
      accessMode,
      direction,
      accessPointId,
      showTableEquivalent,
    },
    state: {
      unavailable: !principal,
      loading: Boolean(principal) && (dashboardQuery.isPending || definitionsQuery.isPending),
      error: dashboardQuery.error ? normalizeError(dashboardQuery.error).message : null,
    },
    actions: {
      setFrom,
      setTo,
      setTimezone,
      setAccessMode,
      setDirection,
      setAccessPointId,
      setShowTableEquivalent,
      applyPreset,
      reloadDashboard,
      resolveDrilldown: (metricId: string) => resolveSupportedDrilldown(metricId, can),
    },
  };
}
