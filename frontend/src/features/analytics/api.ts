import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { http, parsePayload, queryKeys } from '@/shared/api';
import { paths } from '@/shared/config';

export const periodSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    timezone: z.enum(['Asia/Bangkok', 'UTC']).default('Asia/Bangkok'),
  })
  .strict();

export type Period = z.infer<typeof periodSchema>;

export const analyticsFiltersSchema = z
  .object({
    access_point_id: z.string().min(1).max(128).nullable().optional(),
    access_mode: z.enum(['pedestrian', 'motorcycle', 'car', 'truck']).nullable().optional(),
    direction: z.enum(['ENTRY', 'EXIT']).nullable().optional(),
  })
  .strict();

export type AnalyticsFilters = z.infer<typeof analyticsFiltersSchema>;

export const metricValueSchema = z
  .object({
    metric_id: z.string().min(1).max(128),
    value: z.number().nullable(),
    unit: z.enum(['count', 'percent', 'seconds']),
    status: z.enum(['available', 'partial', 'unavailable']),
    unavailable_reason: z.string().nullable(),
    sample_size: z.number().int().min(0).nullable(),
    excluded_count: z.number().int().min(0).nullable(),
    source_ref: z.string(),
  })
  .strict();

export type MetricValue = z.infer<typeof metricValueSchema>;

export const dashboardViewSchema = z
  .object({
    snapshot_id: z.uuid(),
    generated_at: z.string(),
    data_as_of: z.string(),
    period: periodSchema,
    metric_definition_version: z.string().min(1).max(128),
    authz_version: z.number().int().min(1),
    metrics: z.array(metricValueSchema),
    coverage: z.enum(['complete', 'partial']),
    source_watermarks: z.record(z.string(), z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export type DashboardView = z.infer<typeof dashboardViewSchema>;

export const metricDefinitionSchema = z
  .object({
    metric_id: z.string().min(1).max(128),
    version: z.string().min(1).max(128),
    unit: z.enum(['count', 'percent', 'seconds']),
    formula: z.string(),
    source: z.string(),
    kind: z.enum(['event_flow', 'current_snapshot']),
    required_permissions: z.array(z.string()),
    supported_filters: z.array(z.string()),
  })
  .strict();

export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;

export const metricDefinitionCursorPageSchema = z
  .object({
    items: z.array(metricDefinitionSchema),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
    coverage: z.enum(['complete', 'partial']),
    total: z.number().int().min(0).nullable(),
  })
  .strict();

export type MetricDefinitionCursorPage = z.infer<typeof metricDefinitionCursorPageSchema>;

export interface DashboardQueryParams {
  from: string;
  to: string;
  timezone?: 'Asia/Bangkok' | 'UTC';
  access_point_id?: string | null;
  access_mode?: 'pedestrian' | 'motorcycle' | 'car' | 'truck' | '';
  direction?: 'ENTRY' | 'EXIT' | '';
}

export interface MetricDisplayMeta {
  title: string;
  subtitle: string;
  category: string;
}

const METRIC_DISPLAY_META: Record<string, MetricDisplayMeta> = {
  total_access_events: {
    title: 'Tổng lượt ra / vào cổng',
    subtitle: 'Tổng hợp phương tiện và nhân viên đi bộ qua cổng trong kỳ',
    category: 'Lưu lượng cổng',
  },
  vehicle_access_events: {
    title: 'Lượt phương tiện qua cổng',
    subtitle: 'Ô tô, xe tải và xe máy được kiểm soát tại làn phương tiện',
    category: 'Phương tiện',
  },
  pedestrian_access_events: {
    title: 'Lượt nhân viên đi bộ',
    subtitle: 'Nhân viên xác thực thẻ RFID và khuôn mặt tại cổng đi bộ',
    category: 'Đi bộ',
  },
  permit_denied_rate: {
    title: 'Tỷ lệ từ chối cấp phép',
    subtitle: 'Tỷ lệ lượt bị chặn theo cơ chế Fail-Closed trên tổng sự kiện',
    category: 'An ninh',
  },
  open_security_alerts: {
    title: 'Cảnh báo an ninh đang mở',
    subtitle: 'Sự cố an ninh mức OPEN / ACTIVE cần xử lý tại hiện trường',
    category: 'An ninh',
  },
  active_exit_orders: {
    title: 'Đơn hàng xuất kho đang xử lý',
    subtitle: 'Đơn hàng kho đang ở trạng thái chờ hoặc đang bốc xếp tại Dock',
    category: 'Kho hàng',
  },
};

export function getMetricDisplayMeta(metricId: string): MetricDisplayMeta {
  return (
    METRIC_DISPLAY_META[metricId] ?? {
      title: metricId,
      subtitle: 'Chỉ số vận hành được tổng hợp từ máy chủ',
      category: 'Vận hành',
    }
  );
}

export function formatMetricValueDisplay(metric: MetricValue): string {
  if (metric.value === null || metric.status === 'unavailable') {
    return 'Không khả dụng';
  }
  if (metric.unit === 'percent') {
    return `${metric.value.toFixed(1)}%`;
  }
  if (metric.unit === 'seconds') {
    return `${metric.value.toFixed(2)} giây`;
  }
  return new Intl.NumberFormat('vi-VN').format(metric.value);
}

const DRILLDOWN_ALLOWLIST: Record<
  string,
  { path: string; label: string; requiredPermission?: string }
> = {
  total_access_events: {
    path: paths.overview,
    label: 'Xem nhật ký cổng',
    requiredPermission: 'gate_logs:read',
  },
  vehicle_access_events: {
    path: paths.overview,
    label: 'Xem nhật ký phương tiện',
    requiredPermission: 'gate_logs:read',
  },
  pedestrian_access_events: {
    path: paths.pedestrian,
    label: 'Xem nhật ký đi bộ',
  },
  open_security_alerts: {
    path: paths.overview,
    label: 'Xem cảnh báo an ninh',
    requiredPermission: 'alerts:read',
  },
  permit_denied_rate: {
    path: paths.overview,
    label: 'Đối chiếu lượt từ chối',
    requiredPermission: 'gate_logs:read',
  },
  active_exit_orders: {
    path: paths.orders,
    label: 'Xem đơn hàng xuất kho',
    requiredPermission: 'orders:read',
  },
};

export function resolveSupportedDrilldown(
  metricId: string,
  can: (permission: string) => boolean,
): { path: string; label: string } | null {
  const item = DRILLDOWN_ALLOWLIST[metricId];
  if (!item) return null;
  if (
    item.requiredPermission &&
    !can(item.requiredPermission) &&
    !can(item.requiredPermission.replace(/_/g, '-')) &&
    !can(item.requiredPermission.replace(/-/g, '_'))
  ) {
    return null;
  }
  return { path: item.path, label: item.label };
}

export async function getDashboardAnalytics(
  params: DashboardQueryParams,
  signal?: AbortSignal,
): Promise<DashboardView> {
  const query: Record<string, string> = {
    from: params.from,
    to: params.to,
    timezone: params.timezone ?? 'Asia/Bangkok',
  };
  if (params.access_point_id?.trim()) query.access_point_id = params.access_point_id.trim();
  if (params.access_mode) query.access_mode = params.access_mode;
  if (params.direction) query.direction = params.direction;

  const response = await http.get<unknown>('/api/v1/analytics/dashboard', {
    params: query,
    signal,
  });
  return parsePayload(dashboardViewSchema, response.data, response.headers['x-request-id']);
}

export async function listMetricDefinitions(
  signal?: AbortSignal,
): Promise<MetricDefinitionCursorPage> {
  const response = await http.get<unknown>('/api/v1/analytics/metric-definitions', {
    signal,
  });
  return parsePayload(
    metricDefinitionCursorPageSchema,
    response.data,
    response.headers['x-request-id'],
  );
}

export interface QuickMasterSummary {
  vehiclesTotal: number;
  vehiclesActive: number;
  driversTotal: number;
  driversActive: number;
  cardsTotal: number;
  cardsActive: number;
  cardsBlockedOrLost: number;
  authorizationsTotal: number;
  authorizationsActive: number;
  ordersTotal: number;
  ordersActive: number;
  ordersCompleted: number;
}

async function safeGetArray(url: string, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  try {
    const res = await http.get<unknown>(url, { signal });
    if (Array.isArray(res.data)) {
      return res.data as Record<string, unknown>[];
    }
    if (
      res.data &&
      typeof res.data === 'object' &&
      'items' in res.data &&
      Array.isArray((res.data as { items: unknown }).items)
    ) {
      return (res.data as { items: Record<string, unknown>[] }).items;
    }
    return [];
  } catch {
    return [];
  }
}

export async function fetchQuickMasterSummary(signal?: AbortSignal): Promise<QuickMasterSummary> {
  const [vehicles, drivers, cards, authorizations, orders] = await Promise.all([
    safeGetArray('/api/v1/vehicles', signal),
    safeGetArray('/api/v1/drivers', signal),
    safeGetArray('/api/v1/employee-cards', signal),
    safeGetArray('/api/v1/driver-vehicle-authorizations', signal),
    safeGetArray('/api/v1/warehouse/orders', signal),
  ]);

  return {
    vehiclesTotal: vehicles.length,
    vehiclesActive: vehicles.filter((v) => String(v.status ?? 'ACTIVE').toUpperCase() === 'ACTIVE')
      .length,
    driversTotal: drivers.length,
    driversActive: drivers.filter((d) => String(d.status ?? 'ACTIVE').toUpperCase() === 'ACTIVE')
      .length,
    cardsTotal: cards.length,
    cardsActive: cards.filter((c) => String(c.status ?? 'ACTIVE').toUpperCase() === 'ACTIVE')
      .length,
    cardsBlockedOrLost: cards.filter((c) =>
      ['BLOCKED', 'LOST', 'REVOKED'].includes(String(c.status ?? '').toUpperCase()),
    ).length,
    authorizationsTotal: authorizations.length,
    authorizationsActive: authorizations.filter(
      (a) => String(a.status ?? 'ACTIVE').toUpperCase() === 'ACTIVE',
    ).length,
    ordersTotal: orders.length,
    ordersActive: orders.filter(
      (o) =>
        !['COMPLETED', 'CANCELED', 'CANCELLED'].includes(String(o.status ?? '').toUpperCase()),
    ).length,
    ordersCompleted: orders.filter(
      (o) => String(o.status ?? '').toUpperCase() === 'COMPLETED',
    ).length,
  };
}

export function useQuickMasterSummaryQuery(identity: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resource(identity, 'quick-master-summary', {}),
    queryFn: ({ signal }) => fetchQuickMasterSummary(signal),
    enabled,
  });
}
