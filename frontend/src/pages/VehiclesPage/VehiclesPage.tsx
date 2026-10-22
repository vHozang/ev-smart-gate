import { useState, useMemo, useEffect } from 'react';
import {
  ArrowClockwiseIcon,
  PlusIcon,
  PencilSimpleIcon,
  ProhibitIcon,
  TrashIcon,
  EyeIcon,
} from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { useVehiclesScreen, VehicleDetail } from '@/features/vehicles';
import type { Vehicle } from '@/features/vehicles';
import { AuthorizationsPanel, useAuthorizationsScreen } from '@/features/driver-authorizations';
import { useAuth } from '@/features/auth';
import { normalizeError } from '@/shared/api';
import { useFeedback, openDetailModal } from '@/shared/feedback';
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

export function VehiclesPage() {
  const { data, state, actions } = useVehiclesScreen();
  const { can } = useAuth();
  const feedback = useFeedback();
  const [activeTab, setActiveTab] = useState<'vehicles' | 'authorizations'>('vehicles');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const canReadAuthorizations = can('driver-vehicle-authorizations:read');
  const authScreen = useAuthorizationsScreen({
    enabled: activeTab === 'authorizations' && canReadAuthorizations,
  });

  // Lọc theo trạng thái
  const filteredRows = useMemo(() => {
    if (statusFilter === 'ALL') return data.rows;
    return data.rows.filter((row) => row.status === statusFilter);
  }, [data.rows, statusFilter]);

  // Reset trang khi thay đổi từ khóa hoặc bộ lọc
  useEffect(() => {
    setPage(1);
  }, [state.search, statusFilter]);

  const safePage = Math.min(page, Math.max(1, Math.ceil(filteredRows.length / pageSize)));

  // Phân trang dữ liệu
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  const hasActiveFilters = Boolean(state.search || statusFilter !== 'ALL');

  const handleResetFilters = () => {
    actions.setSearch('');
    setStatusFilter('ALL');
  };

  const columns: TableColumn<Vehicle>[] = [
    {
      id: 'plate',
      header: 'Biển số',
      render: (row) => <DecryptedText text={row.plate_number} className="table-main mono" />,
    },
    { id: 'type', header: 'Loại phương tiện', render: (row) => row.vehicle_type },
    {
      id: 'model',
      header: 'Thông tin xe',
      render: (row) => (
        <>
          <span>{[row.make, row.model].filter(Boolean).join(' · ') || 'Chưa cập nhật'}</span>
          <span className="table-secondary">{row.color || 'Chưa có màu xe'}</span>
        </>
      ),
    },
    {
      id: 'status',
      header: 'Trạng thái',
      render: (row) => (
        <Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {row.status === 'ACTIVE' ? 'Hoạt động' : 'Ngừng hoạt động'}
        </Badge>
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
            onClick={() => {
              openDetailModal(feedback, {
                id: `detail-vehicle-${row.id}`,
                title: `Hồ sơ xe: ${row.plate_number}`,
                description: 'Chi tiết thông số kỹ thuật và thẻ nhận diện.',
                renderContent: () => <VehicleDetail vehicle={row} />,
              });
            }}
          >
            Chi tiết
          </Button>
          {state.canUpdate && (
            <Button
              size="sm"
              variant="ghost"
              icon={<PencilSimpleIcon size={16} />}
              onClick={() => actions.edit(row)}
            >
              Sửa
            </Button>
          )}
          {state.canDeactivate && row.status === 'ACTIVE' && (
            <button
              className="icon-button"
              title="Ngừng hoạt động"
              aria-label={`Ngừng hoạt động ${row.plate_number}`}
              onClick={() => actions.deactivate(row)}
            >
              <ProhibitIcon size={18} />
            </button>
          )}
          {state.canDeactivate && actions.remove && (
            <Button
              size="sm"
              variant="danger"
              icon={<TrashIcon size={16} />}
              onClick={() => actions.remove?.(row)}
            >
              Xóa
            </Button>
          )}
        </div>
      ),
    },
  ];

  const error = state.error ? normalizeError(state.error) : null;

  return (
    <ListPageLayout
      title="Quản lý phương tiện"
      description="Hồ sơ xe máy, ô tô, xe tải được đăng ký và ủy quyền Tài xế – Phương tiện."
      actions={
        activeTab === 'authorizations' && canReadAuthorizations ? (
          <>
            <Button
              icon={<ArrowClockwiseIcon size={17} />}
              onClick={() => void authScreen.actions.refresh()}
              pending={authScreen.state.fetching}
            >
              Làm mới ủy quyền
            </Button>
            {authScreen.state.canCreate && (
              <Button
                variant="primary"
                icon={<PlusIcon size={17} />}
                onClick={authScreen.actions.create}
              >
                Cấp quyền Tài xế – Xe
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              icon={<ArrowClockwiseIcon size={17} />}
              onClick={() => void actions.refresh()}
              pending={state.fetching}
            >
              Làm mới
            </Button>
            {state.canCreate && (
              <Button variant="primary" icon={<PlusIcon size={17} />} onClick={actions.create}>
                Thêm phương tiện
              </Button>
            )}
          </>
        )
      }
      toolbar={
        canReadAuthorizations ? (
          <SegmentedTabs
            ariaLabel="Phân hệ quản lý phương tiện"
            items={[
              { id: 'vehicles', label: 'Danh mục phương tiện' },
              { id: 'authorizations', label: 'Ủy quyền Tài xế – Xe' },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
        ) : undefined
      }
    >
      {activeTab === 'authorizations' && canReadAuthorizations ? (
        <AuthorizationsPanel screen={authScreen} hideHeaderActions />
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <DataTableFilter
            search={state.search}
            onSearchChange={actions.setSearch}
            searchPlaceholder="Tìm biển số, loại xe, hãng xe…"
            hasActiveFilters={hasActiveFilters}
            onReset={handleResetFilters}
          >
            <div style={{ minWidth: '160px' }}>
              <Select
                aria-label="Lọc theo trạng thái"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </Select>
            </div>
          </DataTableFilter>

          <AsyncBoundary onReset={() => void actions.refresh()}>
            <SpotlightCard padded={false}>
              {state.loading ? (
                <Skeleton />
              ) : error ? (
                <StatePanel
                  kind={error.status === 403 ? 'forbidden' : 'error'}
                  title="Chưa tải được phương tiện"
                  requestId={error.requestId}
                  action={<Button onClick={() => void actions.refresh()}>Thử lại</Button>}
                >
                  {error.message}
                </StatePanel>
              ) : pagedRows.length ? (
                <DataTable
                  label="Danh sách phương tiện"
                  rows={pagedRows}
                  columns={columns}
                  rowKey={(row) => row.id}
                  maxHeight="520px"
                />
              ) : (
                <EmptyState
                  title={hasActiveFilters ? 'Không có kết quả phù hợp' : 'Chưa có phương tiện'}
                  action={
                    hasActiveFilters ? (
                      <Button onClick={handleResetFilters}>Xóa bộ lọc</Button>
                    ) : state.canCreate ? (
                      <Button variant="primary" onClick={actions.create}>
                        Thêm phương tiện đầu tiên
                      </Button>
                    ) : undefined
                  }
                >
                  {hasActiveFilters
                    ? 'Thử biển số hoặc từ khóa khác trong danh sách đã tải.'
                    : 'Các phương tiện đã đăng ký sẽ xuất hiện tại đây.'}
                </EmptyState>
              )}
            </SpotlightCard>
          </AsyncBoundary>

          {filteredRows.length > 0 && (
            <DataTablePagination
              page={page}
              pageSize={pageSize}
              total={filteredRows.length}
              pageSizeOptions={[10, 20, 50]}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
            />
          )}
        </div>
      )}
    </ListPageLayout>
  );
}
