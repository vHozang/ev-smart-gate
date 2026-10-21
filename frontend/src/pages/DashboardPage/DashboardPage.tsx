import { Link } from 'react-router';
import {
  ArrowsClockwiseIcon,
  ChartBarIcon,
  SparkleIcon,
  TableIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import {
  formatMetricValueDisplay,
  getMetricDisplayMeta,
  useDashboardScreen,
} from '@/features/analytics';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { paths } from '@/shared/config';
import { formatDate, fromDateInputValue, toDateInputValue } from '@/shared/lib';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DecryptedText } from '@/shared/ui/DecryptedText';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { Skeleton } from '@/shared/ui/Skeleton';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import { StatePanel } from '@/shared/ui/StatePanel';

export function DashboardPage() {
  const { data, state, actions } = useDashboardScreen();

  if (state.unavailable) {
    return (
      <StatePanel
        kind="unavailable"
        title="Chức năng đang được hoàn thiện"
        action={
          <Link to={paths.overview} className="button button--secondary button--sm">
            Quay lại trang Tổng quan
          </Link>
        }
      >
        Không gian thống kê vận hành (FE-G04) yêu cầu phiên đăng nhập hợp lệ và dịch vụ tổng hợp số
        liệu từ máy chủ.
      </StatePanel>
    );
  }

  const definitionMap = new Map(data.definitions.map((d) => [d.metric_id, d]));
  const maxCountValue = Math.max(
    1,
    ...(data.dashboard?.metrics
      .filter((m) => m.unit === 'count' && typeof m.value === 'number')
      .map((m) => m.value ?? 0) ?? [1]),
  );

  return (
    <ListPageLayout
      title="Dashboard thống kê hoạt động"
      description="Thống kê nhanh lưu lượng ra vào cổng, phương tiện, nhân viên đi bộ, cảnh báo an ninh và đơn hàng xuất kho theo kỳ báo cáo."
      actions={
        <>
          <Link to={paths.assistant} className="button button--secondary button--sm">
            <SparkleIcon size={16} />
            Phân tích bằng AI Assistant
          </Link>
          <Button
            variant="secondary"
            icon={<TableIcon size={17} />}
            onClick={() => actions.setShowTableEquivalent(!data.showTableEquivalent)}
          >
            {data.showTableEquivalent
              ? 'Ẩn bảng văn bản tương đương'
              : 'Hiện bảng văn bản tương đương'}
          </Button>
          <Button
            variant="primary"
            icon={<ArrowsClockwiseIcon size={17} />}
            onClick={actions.reloadDashboard}
          >
            Làm mới số liệu
          </Button>
        </>
      }
      toolbar={
        <div className="space-y-3 w-full">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[var(--color-muted)]">
                Chọn nhanh kỳ thống kê:
              </span>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => actions.applyPreset('today')}
              >
                Hôm nay
              </Button>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => actions.applyPreset('7d')}
              >
                7 ngày qua
              </Button>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => actions.applyPreset('30d')}
              >
                30 ngày qua
              </Button>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => actions.applyPreset('year2026')}
              >
                Cả năm 2026
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
            <Field id="dash-from" label="Từ ngày">
              <Input
                id="dash-from"
                type="date"
                value={toDateInputValue(data.from)}
                onChange={(e) => actions.setFrom(fromDateInputValue(e.target.value, false))}
              />
            </Field>
            <Field id="dash-to" label="Đến ngày">
              <Input
                id="dash-to"
                type="date"
                value={toDateInputValue(data.to)}
                onChange={(e) => actions.setTo(fromDateInputValue(e.target.value, true))}
              />
            </Field>
            <Field id="dash-tz" label="Múi giờ báo cáo">
              <Select
                id="dash-tz"
                value={data.timezone}
                onChange={(e) => actions.setTimezone(e.target.value as 'Asia/Bangkok' | 'UTC')}
              >
                <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                <option value="UTC">UTC</option>
              </Select>
            </Field>
            <Field id="dash-mode" label="Phương thức truy cập">
              <Select
                id="dash-mode"
                value={data.accessMode}
                onChange={(e) =>
                  actions.setAccessMode(
                    e.target.value as 'pedestrian' | 'motorcycle' | 'car' | 'truck' | '',
                  )
                }
              >
                <option value="">Tất cả phương thức</option>
                <option value="pedestrian">Đi bộ (pedestrian)</option>
                <option value="motorcycle">Xe máy (motorcycle)</option>
                <option value="car">Ô tô (car)</option>
                <option value="truck">Xe tải (truck)</option>
              </Select>
            </Field>
            <Field id="dash-direction" label="Chiều di chuyển">
              <Select
                id="dash-direction"
                value={data.direction}
                onChange={(e) => actions.setDirection(e.target.value as 'ENTRY' | 'EXIT' | '')}
              >
                <option value="">Cả hai chiều (ENTRY + EXIT)</option>
                <option value="ENTRY">Lối vào (ENTRY)</option>
                <option value="EXIT">Lối ra (EXIT)</option>
              </Select>
            </Field>
          </div>
        </div>
      }
    >
      {state.loading && <Skeleton label="Đang tải số liệu thống kê tổng hợp..." />}

      {!state.loading && state.error && (
        <StatePanel kind="error" title="Không thể tải số liệu thống kê">
          {state.error}
        </StatePanel>
      )}

      {!state.loading && !state.error && data.dashboard && (
        <div className="space-y-6">
          {/* Provenance & Coverage Banner */}
          <SpotlightCard className="space-y-2 text-xs" data-testid="dashboard-provenance-banner">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Snapshot đối soát:</span>
                <DecryptedText text={data.dashboard.snapshot_id} className="mono" />
                <span className="text-[var(--color-muted)]">·</span>
                <span>Cập nhật dữ liệu đến: {formatDate(data.dashboard.data_as_of)}</span>
                <span className="text-[var(--color-muted)]">·</span>
                <span className="mono">Catalog: {data.dashboard.metric_definition_version}</span>
              </div>
              <Badge tone={data.dashboard.coverage === 'complete' ? 'success' : 'warning'}>
                {data.dashboard.coverage === 'complete'
                  ? 'Độ phủ đầy đủ (complete)'
                  : 'Độ phủ một phần (partial)'}
              </Badge>
            </div>

            {data.dashboard.warnings.length > 0 && (
              <div
                role="alert"
                className="p-2.5 rounded border border-[var(--color-warning)] bg-[var(--color-warning-subtle)] flex items-start gap-2"
                data-testid="dashboard-warnings"
              >
                <WarningCircleIcon
                  size={16}
                  className="shrink-0 mt-0.5 text-[var(--color-warning)]"
                />
                <div>
                  <p className="font-semibold">Cảnh báo độ phủ & nguồn dữ liệu:</p>
                  <ul className="list-disc pl-4">
                    {data.dashboard.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </SpotlightCard>

          {/* MetricStrip */}
          <section
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            data-testid="dashboard-metric-strip"
            aria-label="Chỉ số thống kê tổng hợp"
          >
            {data.dashboard.metrics.map((metric) => {
              const def = definitionMap.get(metric.metric_id);
              const meta = getMetricDisplayMeta(metric.metric_id);
              const drilldown = actions.resolveDrilldown(metric.metric_id);
              return (
                <SpotlightCard
                  as="article"
                  key={metric.metric_id}
                  className="space-y-2.5 flex flex-col justify-between"
                  data-testid={`metric-card-${metric.metric_id}`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="info">{meta.category}</Badge>
                      <Badge
                        tone={
                          metric.status === 'available'
                            ? 'success'
                            : metric.status === 'partial'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {metric.status === 'available'
                          ? 'Sẵn sàng'
                          : metric.status === 'partial'
                            ? 'Một phần'
                            : 'Không khả dụng'}
                      </Badge>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{meta.title}</h3>
                      <DecryptedText
                        text={metric.metric_id}
                        className="text-[11px] font-medium mono text-[var(--color-muted)]"
                      />
                    </div>
                    <p className="text-3xl font-bold tracking-tight">
                      {formatMetricValueDisplay(metric)}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">{meta.subtitle}</p>
                    {def && (
                      <p className="text-xs text-[var(--color-muted)]">
                        Công thức: <span className="mono">{def.formula}</span>
                      </p>
                    )}
                    {metric.unavailable_reason && (
                      <p className="text-xs text-[var(--color-warning)]">
                        Lý do thiếu dữ liệu: {metric.unavailable_reason}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-muted)]">
                    <span>
                      Nguồn: <code className="mono">{metric.source_ref}</code>
                      {metric.sample_size !== null ? ` · Mẫu: ${metric.sample_size}` : ''}
                      {metric.excluded_count !== null && metric.excluded_count > 0
                        ? ` · Loại trừ: ${metric.excluded_count}`
                        : ''}
                    </span>
                    {drilldown && (
                      <Link
                        to={drilldown.path}
                        className="font-semibold text-[var(--color-primary)] hover:underline"
                      >
                        {drilldown.label} →
                      </Link>
                    )}
                  </div>
                </SpotlightCard>
              );
            })}
          </section>

          {/* ChartPanel + Accessible Text/Table Equivalent */}
          <SpotlightCard className="space-y-4" data-testid="dashboard-chart-panel">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ChartBarIcon size={18} />
                <h2 className="text-base font-semibold">
                  Biểu đồ trực quan & Bảng dữ liệu văn bản tương đương (ANA-07)
                </h2>
              </div>
              <Badge tone="neutral">{data.dashboard.metrics.length} chỉ số</Badge>
            </div>

            {/* Visual horizontal bar chart */}
            <div className="space-y-3 pt-1" aria-label="Biểu đồ thanh so sánh chỉ số">
              {data.dashboard.metrics.map((m) => {
                const meta = getMetricDisplayMeta(m.metric_id);
                const numericVal = typeof m.value === 'number' ? m.value : 0;
                const percentWidth =
                  m.unit === 'percent'
                    ? Math.min(100, Math.max(0, numericVal))
                    : Math.min(100, Math.round((numericVal / maxCountValue) * 100));
                return (
                  <div key={`bar-${m.metric_id}`} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {meta.title}{' '}
                        <span className="mono text-[11px] text-[var(--color-muted)]">
                          ({m.metric_id})
                        </span>
                      </span>
                      <span className="font-bold mono">{formatMetricValueDisplay(m)}</span>
                    </div>
                    <div
                      className="w-full h-2.5 rounded-full overflow-hidden"
                      style={{ background: 'var(--color-border)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${m.value === null ? 0 : Math.max(percentWidth, numericVal > 0 ? 6 : 0)}%`,
                          background:
                            m.metric_id === 'open_security_alerts' ||
                            m.metric_id === 'permit_denied_rate'
                              ? 'var(--color-warning)'
                              : 'var(--color-primary)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {data.showTableEquivalent && (
              <div
                className="overflow-x-auto pt-2"
                data-testid="dashboard-equivalent-table"
                role="region"
                aria-label="Bảng dữ liệu thống kê tương đương"
                tabIndex={0}
              >
                <table className="data-table w-full text-xs">
                  <caption className="sr-only">
                    Bảng dữ liệu văn bản tương đương cho các chỉ số thống kê trong kỳ
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Tên chỉ số</th>
                      <th scope="col">Mã chỉ số (metric_id)</th>
                      <th scope="col">Giá trị</th>
                      <th scope="col">Đơn vị</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Kích thước mẫu</th>
                      <th scope="col">Bản ghi loại trừ</th>
                      <th scope="col">Nguồn dữ liệu (source_ref)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dashboard.metrics.map((m) => (
                      <tr key={m.metric_id}>
                        <td className="font-medium">{getMetricDisplayMeta(m.metric_id).title}</td>
                        <td className="mono font-semibold">{m.metric_id}</td>
                        <td className="font-semibold">{formatMetricValueDisplay(m)}</td>
                        <td className="mono">{m.unit}</td>
                        <td>{m.status}</td>
                        <td className="mono">{m.sample_size ?? '—'}</td>
                        <td className="mono">{m.excluded_count ?? '—'}</td>
                        <td className="mono">{m.source_ref}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SpotlightCard>
        </div>
      )}
    </ListPageLayout>
  );
}
