import { useState } from 'react';
import { paths } from '@/shared/config';
import { Link } from 'react-router';
import {
  ArrowUpRightIcon,
  ArrowRightIcon,
  ScanIcon,
  CarProfileIcon,
  PackageIcon,
  ShieldCheckIcon,
  ArrowClockwiseIcon,
  ChartBarIcon,
  IdentificationCardIcon,
  PersonSimpleWalkIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { WorkspaceLayout } from '@/layouts/WorkspaceLayout';
import { useAuth } from '@/features/auth';
import { useSystemHealth } from '@/features/system';
import { GateLogsPanel, useGateLogsScreen } from '@/features/gate-logs';
import { AlertsPanel, AlertSyncBadge, useAlertsScreen } from '@/features/alerts';
import {
  formatMetricValueDisplay,
  getMetricDisplayMeta,
  useDashboardScreen,
  useQuickMasterSummaryQuery,
} from '@/features/analytics';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DecryptedText } from '@/shared/ui/DecryptedText';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import type { SegmentedTabItem } from '@/shared/ui/SegmentedTabs';
import { Skeleton } from '@/shared/ui/Skeleton';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import { formatDate } from '@/shared/lib';

type OverviewSection = 'summary' | 'gate-logs' | 'alerts';

export function OverviewPage() {
  const { principal, can } = useAuth();
  const { data, state, actions } = useSystemHealth();
  const [activeSection, setActiveSection] = useState<OverviewSection>('summary');
  const canReadGateLogs = Boolean(principal && can('gate-logs:read'));
  const canReadAlerts = Boolean(principal && can('alerts:read'));

  const dashboardScreen = useDashboardScreen();
  const masterSummaryQuery = useQuickMasterSummaryQuery(
    principal?.id ?? 'anonymous',
    Boolean(principal),
  );

  const gateLogsScreen = useGateLogsScreen({
    enabled: activeSection === 'gate-logs' && canReadGateLogs,
  });
  const alertsScreen = useAlertsScreen({
    enabled: activeSection === 'alerts' && canReadAlerts,
  });

  const tabItems: SegmentedTabItem<OverviewSection>[] = [
    { id: 'summary', label: 'Tổng quan & Thống kê nhanh' },
    ...(canReadGateLogs ? [{ id: 'gate-logs' as const, label: 'Nhật ký cổng & Bằng chứng' }] : []),
    ...(canReadAlerts ? [{ id: 'alerts' as const, label: 'Cảnh báo an ninh (Realtime)' }] : []),
  ];

  const handleRefreshAll = () => {
    void actions.refresh();
    dashboardScreen.actions.reloadDashboard();
    void masterSummaryQuery.refetch();
  };

  const masterSummary = masterSummaryQuery.data;
  const dashboardMetrics = dashboardScreen.data.dashboard?.metrics ?? [];

  return (
    <ListPageLayout
      title="Không gian điều hành"
      description="Theo dõi thống kê nhanh toàn hệ thống, giám sát ra vào cổng, quản lý hồ sơ và điều phối kho."
      actions={
        activeSection === 'gate-logs' && canReadGateLogs ? (
          <Button
            icon={<ArrowClockwiseIcon size={17} />}
            pending={gateLogsScreen.state.fetching}
            onClick={() => void gateLogsScreen.actions.refresh()}
          >
            Làm mới nhật ký
          </Button>
        ) : activeSection === 'alerts' && canReadAlerts ? (
          <>
            <AlertSyncBadge
              syncStatus={alertsScreen.state.syncStatus}
              hasHistoryGap={alertsScreen.state.hasHistoryGap}
            />
            {alertsScreen.state.invalidEventCount > 0 && (
              <Badge tone="warning">
                Đã cô lập {alertsScreen.state.invalidEventCount} gói tin lỗi
              </Badge>
            )}
            <Button
              icon={<ArrowClockwiseIcon size={17} />}
              pending={alertsScreen.state.syncStatus === 'syncing'}
              onClick={() => void alertsScreen.actions.resync()}
            >
              Đồng bộ lại
            </Button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link to={paths.dashboard} className="button button--secondary button--sm">
              <ChartBarIcon size={16} />
              Dashboard chi tiết
            </Link>
            <Button
              icon={<ArrowClockwiseIcon size={17} />}
              pending={state.fetching || dashboardScreen.state.loading}
              onClick={handleRefreshAll}
            >
              Cập nhật số liệu
            </Button>
          </div>
        )
      }
      toolbar={
        canReadGateLogs || canReadAlerts ? (
          <SegmentedTabs
            ariaLabel="Phân hệ điều hành trung tâm"
            items={tabItems}
            value={activeSection}
            onChange={setActiveSection}
          />
        ) : undefined
      }
    >
      {activeSection === 'gate-logs' && canReadGateLogs ? (
        <GateLogsPanel screen={gateLogsScreen} hideHeaderActions />
      ) : activeSection === 'alerts' && canReadAlerts ? (
        <AlertsPanel screen={alertsScreen} hideHeaderActions />
      ) : (
        <>
          <WorkspaceLayout
            primary={
              <section className="overview-welcome">
                <div>
                  <div className="overview-telemetry" aria-hidden="true">
                    <span className="overview-telemetry__chip">
                      <DecryptedText text="GATE-CORE · FAIL-CLOSED" />
                    </span>
                    <span className="overview-telemetry__chip">
                      <DecryptedText text="CAPTURE BUNDLE VERIFIED" />
                    </span>
                  </div>
                  <div className="overview-welcome__icon">
                    <ScanIcon size={29} />
                  </div>
                  <h2>
                    {principal
                      ? `Chào ${principal.username}, sẵn sàng cho ca vận hành.`
                      : 'Bắt đầu ca vận hành của bạn.'}
                  </h2>
                  <p>
                    {principal
                      ? 'Theo dõi trực tiếp các chỉ số vận hành bên dưới. Mỗi quyết định ra vào cổng đều được kiểm chứng theo cơ chế Fail-Closed.'
                      : 'Đăng nhập để xem bảng thống kê nhanh, truy cập hồ sơ nhân viên, phương tiện và công việc được phân quyền.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    className="button button--primary"
                    to={principal ? paths.dashboard : paths.login}
                  >
                    {principal ? 'Mở Dashboard thống kê' : 'Đăng nhập hệ thống'}
                    <ArrowRightIcon size={17} />
                  </Link>
                  {principal && (
                    <Link className="button button--secondary" to={paths.gate}>
                      Kiểm soát cổng phương tiện
                    </Link>
                  )}
                </div>
              </section>
            }
            secondary={
              <SpotlightCard padded={false}>
                <header className="section-heading">
                  <div>
                    <h2>Kết nối vận hành</h2>
                    <p>Phản hồi trực tiếp từ dịch vụ</p>
                  </div>
                  <ShieldCheckIcon size={21} className="muted" />
                </header>
                {state.loading ? (
                  <Skeleton rows={2} />
                ) : (
                  <div className="health-list">
                    <div className="health-row">
                      <div>
                        <h3>Ứng dụng</h3>
                        <p>Kết nối dịch vụ nền tảng</p>
                      </div>
                      <Badge
                        tone={data.live?.status === 'ok' ? 'success' : 'warning'}
                        pulse={data.live?.status === 'ok'}
                      >
                        {data.live?.status === 'ok' ? 'Có phản hồi' : 'Chưa kết nối'}
                      </Badge>
                    </div>
                    <div className="health-row">
                      <div>
                        <h3>Cơ sở dữ liệu</h3>
                        <p>Khả năng phục vụ dữ liệu</p>
                      </div>
                      <Badge
                        tone={data.ready?.status === 'ready' ? 'success' : 'warning'}
                        pulse={data.ready?.status === 'ready'}
                      >
                        {data.ready?.status === 'ready' ? 'Sẵn sàng' : 'Chưa xác định'}
                      </Badge>
                    </div>
                  </div>
                )}
                <div className="px-6 py-4 text-xs text-muted border-t border-border flex flex-wrap items-center justify-between gap-2">
                  <span>{data.updatedAt ? formatDate(data.updatedAt) : 'Chưa có phản hồi'}</span>
                  <Link
                    to={paths.system}
                    className="text-accent font-medium flex items-center gap-1"
                  >
                    Chi tiết
                    <ArrowUpRightIcon size={14} />
                  </Link>
                </div>
              </SpotlightCard>
            }
          />

          {/* BẢNG THỐNG KÊ NHANH CÁC SỐ LIỆU (QUICK STATS DASHBOARD) */}
          {principal && (
            <section
              className="mt-6 space-y-4"
              aria-label="Thống kê nhanh các số liệu hệ thống"
              data-testid="overview-quick-stats"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <ChartBarIcon size={19} />
                    Thống kê nhanh số liệu vận hành & hồ sơ danh mục
                  </h2>
                  <p className="text-xs text-[var(--color-muted)]">
                    Tổng hợp thời gian thực từ hồ sơ phương tiện, tài xế, thẻ RFID, kho hàng và lưu
                    lượng kiểm soát tại cổng.
                  </p>
                </div>
                <Link
                  to={paths.dashboard}
                  className="text-xs font-semibold text-[var(--color-primary)] hover:underline flex items-center gap-1"
                >
                  Xem bộ lọc & bảng đối soát đầy đủ
                  <ArrowUpRightIcon size={14} />
                </Link>
              </div>

              {/* Hàng 1: Số liệu Hồ sơ Danh mục & Kho hàng */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SpotlightCard className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--color-muted)]">
                      Phương tiện đăng ký
                    </span>
                    <Badge tone="info">Hồ sơ xe</Badge>
                  </div>
                  <p className="text-2xl font-bold tracking-tight">
                    {masterSummary ? masterSummary.vehiclesTotal : '—'}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    Đang hoạt động:{' '}
                    <strong>{masterSummary ? masterSummary.vehiclesActive : '—'}</strong> · Ủy quyền
                    xe: <strong>{masterSummary ? masterSummary.authorizationsActive : '—'}</strong>
                  </p>
                  <div className="pt-1">
                    <Link
                      to={paths.vehicles}
                      className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      Quản lý phương tiện →
                    </Link>
                  </div>
                </SpotlightCard>

                <SpotlightCard className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--color-muted)]">
                      Hồ sơ nhận diện tài xế
                    </span>
                    <Badge tone="info">Nhân sự</Badge>
                  </div>
                  <p className="text-2xl font-bold tracking-tight">
                    {masterSummary ? masterSummary.driversTotal : '—'}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    Đang hoạt động:{' '}
                    <strong>{masterSummary ? masterSummary.driversActive : '—'}</strong> hồ sơ khuôn
                    mặt
                  </p>
                  <div className="pt-1">
                    <Link
                      to={paths.drivers}
                      className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      Quản lý hồ sơ tài xế →
                    </Link>
                  </div>
                </SpotlightCard>

                <SpotlightCard className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--color-muted)]">
                      Thẻ RFID nhân viên
                    </span>
                    <Badge
                      tone={
                        masterSummary && masterSummary.cardsBlockedOrLost > 0
                          ? 'warning'
                          : 'success'
                      }
                    >
                      RFID
                    </Badge>
                  </div>
                  <p className="text-2xl font-bold tracking-tight">
                    {masterSummary ? masterSummary.cardsTotal : '—'}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    Hoạt động: <strong>{masterSummary ? masterSummary.cardsActive : '—'}</strong> ·
                    Khóa/Mất:{' '}
                    <strong>{masterSummary ? masterSummary.cardsBlockedOrLost : '—'}</strong>
                  </p>
                  <div className="pt-1">
                    <Link
                      to={paths.drivers}
                      className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      Quản lý thẻ RFID →
                    </Link>
                  </div>
                </SpotlightCard>

                <SpotlightCard className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--color-muted)]">
                      Đơn hàng xuất kho
                    </span>
                    <Badge tone="info">Kho hàng</Badge>
                  </div>
                  <p className="text-2xl font-bold tracking-tight">
                    {masterSummary ? masterSummary.ordersTotal : '—'}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    Đang xử lý: <strong>{masterSummary ? masterSummary.ordersActive : '—'}</strong>{' '}
                    · Hoàn tất:{' '}
                    <strong>{masterSummary ? masterSummary.ordersCompleted : '—'}</strong>
                  </p>
                  <div className="pt-1">
                    <Link
                      to={paths.orders}
                      className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      Điều phối xuất kho →
                    </Link>
                  </div>
                </SpotlightCard>
              </div>

              {/* Hàng 2: 6 Chỉ số lưu lượng & an ninh từ Analytics Snapshot */}
              {dashboardMetrics.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dashboardMetrics.map((metric) => {
                    const meta = getMetricDisplayMeta(metric.metric_id);
                    const drilldown = dashboardScreen.actions.resolveDrilldown(metric.metric_id);
                    return (
                      <SpotlightCard
                        key={metric.metric_id}
                        className="space-y-1.5 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-[var(--color-muted)]">
                              {meta.title}
                            </span>
                            <Badge
                              tone={
                                metric.status === 'available'
                                  ? 'success'
                                  : metric.status === 'partial'
                                    ? 'warning'
                                    : 'neutral'
                              }
                            >
                              {meta.category}
                            </Badge>
                          </div>
                          <p className="text-2xl font-bold tracking-tight mt-1">
                            {formatMetricValueDisplay(metric)}
                          </p>
                          <p className="text-xs text-[var(--color-muted)]">{meta.subtitle}</p>
                        </div>
                        <div className="pt-2 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                          <span className="mono">{metric.metric_id}</span>
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
                </div>
              )}
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 mt-6 xl:grid-cols-2">
            <SpotlightCard padded={false}>
              <header className="section-heading">
                <div>
                  <h2>Truy cập nhanh</h2>
                  <p>Hồ sơ và nghiệp vụ thường dùng</p>
                </div>
              </header>
              <Link to={paths.vehicles} className="module-link">
                <CarProfileIcon size={24} />
                <div>
                  <h3>Phương tiện & Ủy quyền</h3>
                  <p>Đăng ký, cập nhật, xóa hồ sơ xe và cấp quyền tài xế – xe.</p>
                </div>
                <ArrowUpRightIcon size={18} />
              </Link>
              <Link to={paths.drivers} className="module-link">
                <IdentificationCardIcon size={24} />
                <div>
                  <h3>Hồ sơ nhận diện & Thẻ RFID</h3>
                  <p>Quản lý sinh trắc học tài xế và vòng đời thẻ nhân viên.</p>
                </div>
                <ArrowUpRightIcon size={18} />
              </Link>
              <Link to={paths.pedestrian} className="module-link">
                <PersonSimpleWalkIcon size={24} />
                <div>
                  <h3>Kiểm soát cổng đi bộ</h3>
                  <p>Xác minh nhân viên đi bộ, cấp quyền và tạo gói CaptureBundle.</p>
                </div>
                <ArrowUpRightIcon size={18} />
              </Link>
              <Link to={paths.orders} className="module-link">
                <PackageIcon size={24} />
                <div>
                  <h3>Quản lý kho hàng</h3>
                  <p>Theo dõi đơn hàng, điều phối Dock và trạng thái xuất kho.</p>
                </div>
                <ArrowUpRightIcon size={18} />
              </Link>
            </SpotlightCard>

            <SpotlightCard padded={false}>
              <header className="section-heading">
                <div>
                  <h2>Báo cáo & Phân tích chuyên sâu</h2>
                  <p>Dashboard thống kê đa chiều & Trợ lý AI vận hành</p>
                </div>
                <Badge tone="success">Trực tuyến</Badge>
              </header>
              <div className="p-6 space-y-4">
                <p className="text-sm text-muted leading-relaxed">
                  Tra cứu số liệu thống kê theo khung thời gian, phương thức di chuyển (đi bộ, xe
                  máy, ô tô, xe tải), chiều ra/vào kèm biểu đồ trực quan và bảng dữ liệu đối soát
                  văn bản (ANA-07).
                </p>
                {dashboardScreen.data.dashboard && (
                  <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">Snapshot mới nhất:</span>
                      <Badge
                        tone={
                          dashboardScreen.data.dashboard.coverage === 'complete'
                            ? 'success'
                            : 'warning'
                        }
                      >
                        {dashboardScreen.data.dashboard.coverage === 'complete'
                          ? 'Độ phủ đầy đủ'
                          : 'Độ phủ một phần'}
                      </Badge>
                    </div>
                    <p className="text-[var(--color-muted)] mono">
                      ID: {dashboardScreen.data.dashboard.snapshot_id} · Cập nhật:{' '}
                      {formatDate(dashboardScreen.data.dashboard.data_as_of)}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Link className="button button--primary" to={paths.dashboard}>
                    <ChartBarIcon size={16} />
                    Mở Dashboard thống kê
                    <ArrowUpRightIcon size={16} />
                  </Link>
                  <Link className="button button--secondary" to={paths.assistant}>
                    <SparkleIcon size={16} />
                    Tạo báo cáo bằng AI Assistant
                  </Link>
                </div>
              </div>
            </SpotlightCard>
          </div>
        </>
      )}
    </ListPageLayout>
  );
}
