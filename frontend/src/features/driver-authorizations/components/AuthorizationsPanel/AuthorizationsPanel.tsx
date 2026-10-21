import { useState, useMemo, useEffect } from 'react';
import {
  ArrowClockwiseIcon,
  PencilSimpleIcon,
  PlusIcon,
  ProhibitIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { normalizeError } from '@/shared/api';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DataTable, DataTableFilter, DataTablePagination } from '@/shared/ui/DataTable';
import type { TableColumn } from '@/shared/ui/DataTable';
import { Select } from '@/shared/ui/Select';
import { Skeleton } from '@/shared/ui/Skeleton';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import { StatePanel, EmptyState } from '@/shared/ui/StatePanel';
import { AsyncBoundary } from '@/shared/ui/AsyncBoundary';
import { useAuthorizationsScreen } from '../../useAuthorizationsScreen';
import type { AuthorizationsScreen } from '../../useAuthorizationsScreen';
import type { DriverVehicleAuthorization } from '../../api';

export interface AuthorizationsPanelProps {
  screen?: AuthorizationsScreen;
  hideHeaderActions?: boolean;
}

export function AuthorizationsPanel({
  screen,
  hideHeaderActions = false,
}: AuthorizationsPanelProps = {}) {
  const internalScreen = useAuthorizationsScreen({ enabled: !screen });
  const { data, state, actions } = screen ?? internalScreen;
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredRows = useMemo(() => {
    if (statusFilter === 'ALL') return data.rows;
    return data.rows.filter((row) => row.status === statusFilter);
  }, [data.rows, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [state.search, statusFilter]);

  const safePage = Math.min(page, Math.max(1, Math.ceil(filteredRows.length / pageSize)));

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  const hasActiveFilters = Boolean(state.search || statusFilter !== 'ALL');

  const handleResetFilters = () => {
    actions.setSearch('');
    setStatusFilter('ALL');
  };

  const columns: TableColumn<DriverVehicleAuthorization>[] = [
    {
      id: 'driver',
      header: 'Tài xế được ủy quyền',
      render: (row) => {
        const driver = data.driversMap.get(row.driver_id);
        return (
          <>
            <span className="table-main">
              {driver ? driver.full_name : `Tài xế #${row.driver_id.slice(0, 8)}`}
            </span>
            <span className="table-secondary mono">
              {driver?.employee_code ? `Mã NV: ${driver.employee_code}` : row.driver_id}
            </span>
          </>
        );
      },
    },
    {
      id: 'vehicle',
      header: 'Phương tiện',
      render: (row) => {
        const vehicle = data.vehiclesMap.get(row.vehicle_id);
        return (
          <>
            <span className="table-main mono">
              {vehicle ? vehicle.plate_number : `Xe #${row.vehicle_id.slice(0, 8)}`}
            </span>
            <span className="table-secondary">
              {vehicle
                ? [vehicle.vehicle_type, vehicle.make, vehicle.model].filter(Boolean).join(' · ')
                : row.vehicle_id}
            </span>
          </>
        );
      },
    },
    {
      id: 'validity',
      header: 'Thời hạn hiệu lực',
      render: (row) => (
        <>
          <span>Từ: {new Date(row.valid_from).toLocaleString('vi-VN')}</span>
          <span className="table-secondary">
            {row.valid_until
              ? `Đến: ${new Date(row.valid_until).toLocaleString('vi-VN')}`
              : 'Không giới hạn ngày kết thúc'}
          </span>
        </>
      ),
    },
    {
      id: 'status',
      header: 'Trạng thái',
      render: (row) => (
        <Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {row.status === 'ACTIVE' ? 'Đang hiệu lực' : 'Đã thu hồi'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Thao tác',
      render: (row) => (
        <div className="table-actions">
          {state.canCreate && actions.edit && (
            <Button
              size="sm"
              variant="ghost"
              icon={<PencilSimpleIcon size={16} />}
              onClick={() => actions.edit?.(row)}
            >
              Sửa
            </Button>
          )}
          {state.canRevoke && row.status === 'ACTIVE' && (
            <Button
              size="sm"
              variant="ghost"
              icon={<ProhibitIcon size={16} />}
              onClick={() => actions.revoke(row)}
            >
              Thu hồi
            </Button>
          )}
          {state.canRevoke && actions.remove && (
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
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}
      >
        <DataTableFilter
          search={state.search}
          onSearchChange={actions.setSearch}
          searchPlaceholder="Tìm tài xế, GPLX, biển số xe…"
          hasActiveFilters={hasActiveFilters}
          onReset={handleResetFilters}
        >
          <div style={{ minWidth: '160px' }}>
            <Select
              aria-label="Lọc trạng thái ủy quyền"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang hiệu lực</option>
              <option value="INACTIVE">Đã thu hồi</option>
            </Select>
          </div>
        </DataTableFilter>
        {!hideHeaderActions && (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              icon={<ArrowClockwiseIcon size={17} />}
              onClick={() => void actions.refresh()}
              pending={state.fetching}
            >
              Làm mới ủy quyền
            </Button>
            {state.canCreate && (
              <Button variant="primary" icon={<PlusIcon size={17} />} onClick={actions.create}>
                Cấp quyền Tài xế – Xe
              </Button>
            )}
          </div>
        )}
      </div>

      <AsyncBoundary onReset={() => void actions.refresh()}>
        <SpotlightCard padded={false}>
          {state.loading ? (
            <Skeleton />
          ) : error ? (
            <StatePanel
              kind={error.status === 403 ? 'forbidden' : 'error'}
              title="Chưa tải được danh sách ủy quyền"
              requestId={error.requestId}
              action={<Button onClick={() => void actions.refresh()}>Thử lại</Button>}
            >
              {error.message}
            </StatePanel>
          ) : pagedRows.length ? (
            <DataTable
              label="Danh sách ủy quyền Tài xế – Phương tiện"
              rows={pagedRows}
              columns={columns}
              rowKey={(row) => row.id}
              maxHeight="520px"
            />
          ) : (
            <EmptyState
              title={
                hasActiveFilters ? 'Không có ủy quyền phù hợp' : 'Chưa có ủy quyền Tài xế – Xe'
              }
              action={
                hasActiveFilters ? (
                  <Button onClick={handleResetFilters}>Xóa bộ lọc</Button>
                ) : state.canCreate ? (
                  <Button variant="primary" onClick={actions.create}>
                    Cấp quyền đầu tiên
                  </Button>
                ) : undefined
              }
            >
              {hasActiveFilters
                ? 'Thử thay đổi từ khóa hoặc trạng thái lọc.'
                : 'Các liên kết ủy quyền vận hành giữa tài xế và phương tiện sẽ hiển thị tại đây.'}
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
  );
}
