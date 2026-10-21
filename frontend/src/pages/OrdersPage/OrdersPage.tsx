import { useState, useMemo, useEffect } from 'react';
import {
  ArrowClockwiseIcon,
  EyeIcon,
  PlusIcon,
  PencilSimpleIcon,
  ProhibitIcon,
  TrashIcon,
  PlayIcon,
  QrCodeIcon,
  PackageIcon,
  ClipboardTextIcon,
} from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { useOrdersScreen } from '@/features/warehouse-orders';
import type { WarehouseOrder, DockSessionDetail } from '@/features/warehouse-orders';
import { normalizeError } from '@/shared/api';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DataTable, DataTableFilter, DataTablePagination } from '@/shared/ui/DataTable';
import type { TableColumn } from '@/shared/ui/DataTable';
import { DecryptedText } from '@/shared/ui/DecryptedText';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import { Select } from '@/shared/ui/Select';
import { Skeleton } from '@/shared/ui/Skeleton';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import { StatePanel, EmptyState } from '@/shared/ui/StatePanel';
import { AsyncBoundary } from '@/shared/ui/AsyncBoundary';
import { formatDate } from '@/shared/lib';

const labels: Record<WarehouseOrder['status'], string> = {
  PENDING: 'Chờ xử lý',
  LOADING: 'Đang xếp hàng',
  READY_FOR_EXIT: 'Sẵn sàng xuất',
  SLIP_ISSUED: 'Đã cấp phiếu',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

type OrdersTab = 'orders' | 'docks';

export function OrdersPage() {
  const { data, state, actions } = useOrdersScreen();
  const [activeTab, setActiveTab] = useState<OrdersTab>('orders');
  const [statusFilter, setStatusFilter] = useState<'ALL' | WarehouseOrder['status']>('ALL');
  const [dockStatusFilter, setDockStatusFilter] = useState<'ALL' | DockSessionDetail['status']>(
    'ALL',
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const columns: TableColumn<WarehouseOrder>[] = useMemo(
    () => [
      {
        id: 'code',
        header: 'Mã đơn hàng',
        render: (row) => {
          const vehicle = data.vehiclesMap.get(row.assigned_vehicle_id);
          const driver = data.driversMap.get(row.assigned_driver_id);
          return (
            <div>
              <DecryptedText text={row.order_id} className="table-main mono" />
              <span className="table-secondary">
                {vehicle
                  ? `Xe: ${vehicle.plate_number}`
                  : `Xe #${row.assigned_vehicle_id.slice(0, 8)}`}
                {driver ? ` · ${driver.full_name}` : ''}
              </span>
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Trạng thái',
        render: (row) => (
          <div className="space-y-1">
            <Badge
              tone={
                row.status === 'CANCELLED'
                  ? 'danger'
                  : row.status === 'COMPLETED'
                    ? 'success'
                    : row.status === 'SLIP_ISSUED' || row.status === 'READY_FOR_EXIT'
                      ? 'info'
                      : 'neutral'
              }
            >
              {labels[row.status]}
            </Badge>
            {row.slip_version > 0 && (
              <span className="table-secondary mono">Phiếu v{row.slip_version}</span>
            )}
          </div>
        ),
      },
      { id: 'from', header: 'Hiệu lực từ', render: (row) => formatDate(row.valid_from) },
      { id: 'until', header: 'Hiệu lực đến', render: (row) => formatDate(row.valid_until) },
      {
        id: 'dock',
        header: 'Phiên tại kho',
        render: (row) =>
          row.dock_session_id ? (
            <span className="mono">{row.dock_session_id}</span>
          ) : (
            'Chưa có phiên'
          ),
      },
      {
        id: 'actions',
        header: 'Thao tác',
        render: (row) => {
          const isEditable = row.status !== 'COMPLETED' && row.status !== 'CANCELLED';
          return (
            <div className="table-actions">
              <Button
                size="sm"
                variant="ghost"
                icon={<EyeIcon size={16} />}
                onClick={() => actions.openDetail(row)}
              >
                Chi tiết
              </Button>

              {state.canUpdate && isEditable && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<PencilSimpleIcon size={16} />}
                  onClick={() => actions.openEdit(row)}
                >
                  Sửa
                </Button>
              )}

              {state.canStartDock && !row.dock_session_id && row.status === 'PENDING' && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<PlayIcon size={16} />}
                  onClick={() => void actions.startDock(row)}
                >
                  Vào Dock
                </Button>
              )}

              {state.canReadDock && row.dock_session_id && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ClipboardTextIcon size={16} />}
                  onClick={() => actions.openDockModal(row.dock_session_id!)}
                >
                  Kiểm hàng
                </Button>
              )}

              {state.canIssueSlip &&
                (row.status === 'READY_FOR_EXIT' || row.status === 'LOADING') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<QrCodeIcon size={16} />}
                    onClick={() => void actions.issueSlip(row)}
                  >
                    Cấp phiếu
                  </Button>
                )}

              {state.canReissueSlip && row.status === 'SLIP_ISSUED' && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<QrCodeIcon size={16} />}
                  onClick={() => void actions.reissueSlip(row)}
                >
                  Cấp lại phiếu
                </Button>
              )}

              {state.canCancel && isEditable && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ProhibitIcon size={16} />}
                  onClick={() => actions.confirmCancel(row)}
                >
                  Hủy đơn
                </Button>
              )}

              {state.canCancel && actions.confirmDelete && (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<TrashIcon size={16} />}
                  onClick={() => actions.confirmDelete?.(row)}
                >
                  Xóa
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [actions, data.driversMap, data.vehiclesMap, state],
  );

  const dockColumns: TableColumn<DockSessionDetail>[] = useMemo(
    () => [
      {
        id: 'id',
        header: 'Mã phiên Dock',
        render: (row) => (
          <div>
            <span className="table-main mono">{row.id.slice(0, 12)}…</span>
            <span className="table-secondary mono">Đơn: {row.order_id}</span>
          </div>
        ),
      },
      {
        id: 'cargo_state',
        header: 'Trạng thái hàng hóa',
        render: (row) => <Badge tone="info">{row.current_cargo_state}</Badge>,
      },
      {
        id: 'status',
        header: 'Trạng thái phiên',
        render: (row) => (
          <Badge
            tone={
              row.status === 'APPROVED'
                ? 'success'
                : row.status === 'REVIEW_REQUIRED'
                  ? 'warning'
                  : row.status === 'CANCELLED'
                    ? 'danger'
                    : 'neutral'
            }
          >
            {row.status}
          </Badge>
        ),
      },
      {
        id: 'captures',
        header: 'Ảnh chụp & Ghi chú',
        render: (row) => (
          <div>
            <span className="table-main">{row.capture_count} lần chụp</span>
            <span className="table-secondary">{row.operator_note || 'Chưa có ghi chú'}</span>
          </div>
        ),
      },
      {
        id: 'actions',
        header: 'Thao tác',
        render: (row) => (
          <div className="table-actions">
            <Button
              size="sm"
              variant="ghost"
              icon={<EyeIcon size={16} />}
              onClick={() => actions.openDockModal(row.id, row)}
            >
              Kiểm tra / Chốt Dock
            </Button>
          </div>
        ),
      },
    ],
    [actions],
  );

  const filteredRows = useMemo(() => {
    if (statusFilter === 'ALL') return data.rows;
    return data.rows.filter((row) => row.status === statusFilter);
  }, [data.rows, statusFilter]);

  const filteredDocks = useMemo(() => {
    const term = state.search.trim().toLocaleLowerCase('vi');
    return data.dockSessions.filter((dock) => {
      if (dockStatusFilter !== 'ALL' && dock.status !== dockStatusFilter) return false;
      if (!term) return true;
      return [dock.id, dock.order_id, dock.current_cargo_state, dock.operator_note].some((val) =>
        val?.toLocaleLowerCase('vi').includes(term),
      );
    });
  }, [data.dockSessions, dockStatusFilter, state.search]);

  useEffect(() => {
    setPage(1);
  }, [state.search, statusFilter, dockStatusFilter, activeTab]);

  const activeTotal = activeTab === 'orders' ? filteredRows.length : filteredDocks.length;
  const totalPages = Math.max(1, Math.ceil(activeTotal / pageSize));
  const safePage = Math.min(page, totalPages);

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  const pagedDocks = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredDocks.slice(start, start + pageSize);
  }, [filteredDocks, safePage, pageSize]);

  const hasActiveFilters = Boolean(
    state.search || statusFilter !== 'ALL' || dockStatusFilter !== 'ALL',
  );

  const handleResetFilters = () => {
    actions.setSearch('');
    setStatusFilter('ALL');
    setDockStatusFilter('ALL');
  };

  const error = state.error ? normalizeError(state.error) : null;

  return (
    <ListPageLayout
      title="Đơn hàng xuất kho"
      description="Quản lý vòng đời đơn hàng, kiểm đếm hàng hóa tại Dock và phát hành phiếu xuất kho."
      actions={
        <>
          <Button
            pending={state.fetching}
            icon={<ArrowClockwiseIcon size={17} />}
            onClick={() => void actions.refresh()}
          >
            Làm mới
          </Button>
          {state.canCreate && (
            <Button variant="primary" icon={<PlusIcon size={17} />} onClick={actions.openCreate}>
              Tạo đơn xuất kho
            </Button>
          )}
        </>
      }
      toolbar={
        <div className="space-y-3 w-full">
          {state.canReadDock && (
            <SegmentedTabs
              ariaLabel="Phân khu vận hành kho"
              items={[
                {
                  id: 'orders',
                  label: `Đơn hàng xuất kho (${data.rows.length})`,
                  icon: <PackageIcon size={16} />,
                },
                {
                  id: 'docks',
                  label: `Phiên kiểm hàng Dock (${data.dockSessions.length})`,
                  icon: <ClipboardTextIcon size={16} />,
                },
              ]}
              value={activeTab}
              onChange={setActiveTab}
            />
          )}

          <DataTableFilter
            search={state.search}
            onSearchChange={actions.setSearch}
            searchPlaceholder={
              activeTab === 'orders'
                ? 'Tìm mã đơn hàng, biển số xe, tài xế…'
                : 'Tìm mã phiên Dock, mã đơn hàng, ghi chú…'
            }
            hasActiveFilters={hasActiveFilters}
            onReset={handleResetFilters}
          >
            {activeTab === 'orders' ? (
              <div style={{ minWidth: '170px' }}>
                <Select
                  aria-label="Lọc theo trạng thái đơn hàng"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="PENDING">Chờ xử lý</option>
                  <option value="LOADING">Đang xếp hàng</option>
                  <option value="READY_FOR_EXIT">Sẵn sàng xuất</option>
                  <option value="SLIP_ISSUED">Đã cấp phiếu</option>
                  <option value="COMPLETED">Hoàn tất</option>
                  <option value="CANCELLED">Đã hủy</option>
                </Select>
              </div>
            ) : (
              <div style={{ minWidth: '170px' }}>
                <Select
                  aria-label="Lọc theo trạng thái phiên Dock"
                  value={dockStatusFilter}
                  onChange={(e) => setDockStatusFilter(e.target.value as typeof dockStatusFilter)}
                >
                  <option value="ALL">Tất cả trạng thái Dock</option>
                  <option value="ACTIVE">Đang kiểm hàng (ACTIVE)</option>
                  <option value="REVIEW_REQUIRED">Cần rà soát (REVIEW_REQUIRED)</option>
                  <option value="APPROVED">Đã phê duyệt (APPROVED)</option>
                  <option value="CANCELLED">Đã hủy (CANCELLED)</option>
                </Select>
              </div>
            )}
          </DataTableFilter>
        </div>
      }
      footer={
        activeTotal > 0 ? (
          <DataTablePagination
            page={safePage}
            pageSize={pageSize}
            total={activeTotal}
            pageSizeOptions={[10, 20, 50]}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
          />
        ) : null
      }
    >
      <AsyncBoundary onReset={() => void actions.refresh()}>
        <SpotlightCard padded={false}>
          {state.loading ? (
            <Skeleton />
          ) : error ? (
            <StatePanel
              kind={error.status === 403 ? 'forbidden' : 'error'}
              title="Chưa tải được đơn hàng"
              requestId={error.requestId}
              action={<Button onClick={() => void actions.refresh()}>Thử lại</Button>}
            >
              {error.message}
            </StatePanel>
          ) : activeTab === 'orders' ? (
            pagedRows.length ? (
              <DataTable
                label="Danh sách đơn hàng xuất kho"
                columns={columns}
                rows={pagedRows}
                rowKey={(row) => row.id}
                maxHeight="520px"
              />
            ) : (
              <EmptyState
                title={hasActiveFilters ? 'Không có đơn hàng phù hợp' : 'Chưa có đơn hàng'}
                action={
                  hasActiveFilters ? (
                    <Button onClick={handleResetFilters}>Xóa bộ lọc</Button>
                  ) : state.canCreate ? (
                    <Button variant="primary" onClick={actions.openCreate}>
                      Tạo đơn xuất kho đầu tiên
                    </Button>
                  ) : undefined
                }
              >
                {hasActiveFilters
                  ? 'Thử mã đơn hàng hoặc bộ lọc trạng thái khác.'
                  : 'Các đơn hàng xuất kho sẽ xuất hiện tại đây.'}
              </EmptyState>
            )
          ) : pagedDocks.length ? (
            <DataTable
              label="Danh sách phiên kiểm hàng tại Dock"
              columns={dockColumns}
              rows={pagedDocks}
              rowKey={(row) => row.id}
              maxHeight="520px"
            />
          ) : (
            <EmptyState
              title={
                hasActiveFilters ? 'Không có phiên Dock phù hợp' : 'Chưa có phiên kiểm hàng Dock'
              }
              action={
                hasActiveFilters ? (
                  <Button onClick={handleResetFilters}>Xóa bộ lọc</Button>
                ) : undefined
              }
            >
              {hasActiveFilters
                ? 'Thử từ khóa hoặc bộ lọc trạng thái khác.'
                : 'Khi bắt đầu phiên kiểm hàng từ một đơn xuất kho, phiên làm việc sẽ xuất hiện tại đây.'}
            </EmptyState>
          )}
        </SpotlightCard>
      </AsyncBoundary>
    </ListPageLayout>
  );
}
