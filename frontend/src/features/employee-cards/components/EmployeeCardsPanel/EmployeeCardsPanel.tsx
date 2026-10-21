import { useState, useMemo, useEffect } from 'react';
import {
  ArrowClockwiseIcon,
  PlusIcon,
  EyeIcon,
  PencilSimpleIcon,
  TrashIcon,
  LockSimpleIcon,
  WarningCircleIcon,
  ArrowsLeftRightIcon,
} from '@phosphor-icons/react';
import { normalizeError } from '@/shared/api';
import { useFeedback, openDetailModal } from '@/shared/feedback';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DataTable, DataTableFilter, DataTablePagination } from '@/shared/ui/DataTable';
import type { TableColumn } from '@/shared/ui/DataTable';
import { Select } from '@/shared/ui/Select';
import { Skeleton } from '@/shared/ui/Skeleton';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import { StatePanel, EmptyState } from '@/shared/ui/StatePanel';
import { AsyncBoundary } from '@/shared/ui/AsyncBoundary';
import { useEmployeeCardsScreen } from '../../useEmployeeCardsScreen';
import type { EmployeeCardsScreen } from '../../useEmployeeCardsScreen';
import { CardDetail } from '../CardDetail';
import type { EmployeeCard, CardStatus } from '../../api';

const statusToneMap: Record<CardStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  ACTIVE: 'success',
  BLOCKED: 'danger',
  LOST: 'warning',
  REPLACED: 'neutral',
};

const statusLabelMap: Record<CardStatus, string> = {
  ACTIVE: 'Đang hoạt động',
  BLOCKED: 'Đã khóa',
  LOST: 'Báo mất',
  REPLACED: 'Đã thay thế',
};

export interface EmployeeCardsPanelProps {
  screen?: EmployeeCardsScreen;
  hideHeaderActions?: boolean;
}

export function EmployeeCardsPanel({
  screen,
  hideHeaderActions = false,
}: EmployeeCardsPanelProps = {}) {
  const internalScreen = useEmployeeCardsScreen({ enabled: !screen });
  const { data, state, actions } = screen ?? internalScreen;
  const feedback = useFeedback();
  const [statusFilter, setStatusFilter] = useState<'ALL' | CardStatus>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredRows = useMemo(() => {
    if (statusFilter === 'ALL') return data.rows;
    return data.rows.filter((row) => row.status === statusFilter);
  }, [data.rows, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [state.search, state.driverFilter, statusFilter]);

  const safePage = Math.min(page, Math.max(1, Math.ceil(filteredRows.length / pageSize)));

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  const hasActiveFilters = Boolean(state.search || state.driverFilter || statusFilter !== 'ALL');

  const handleResetFilters = () => {
    actions.setSearch('');
    actions.setDriverFilter('');
    setStatusFilter('ALL');
  };

  const columns: TableColumn<EmployeeCard>[] = [
    {
      id: 'uid',
      header: 'UID thẻ (đã che)',
      render: (row) => (
        <>
          <span className="table-main mono">{row.card_uid_masked}</span>
          <span className="table-secondary">
            {row.issued_at
              ? `Cấp: ${new Date(row.issued_at).toLocaleDateString('vi-VN')}`
              : 'Thẻ định danh RFID'}
          </span>
        </>
      ),
    },
    {
      id: 'driver',
      header: 'Nhân sự / Tài xế',
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
      id: 'status',
      header: 'Trạng thái',
      render: (row) => (
        <>
          <Badge tone={statusToneMap[row.status]}>{statusLabelMap[row.status]}</Badge>
          {row.status_reason && <span className="table-secondary">{row.status_reason}</span>}
        </>
      ),
    },
    {
      id: 'actions',
      header: 'Thao tác',
      render: (row) => {
        const driver = data.driversMap.get(row.driver_id);
        const driverLabel = driver ? driver.full_name : row.driver_id;
        return (
          <div className="table-actions">
            <Button
              size="sm"
              variant="ghost"
              icon={<EyeIcon size={16} />}
              onClick={() =>
                openDetailModal(feedback, {
                  id: `card-detail-${row.id}`,
                  title: `Chi tiết thẻ: ${row.card_uid_masked}`,
                  description: 'Thông tin vòng đời và lịch sử thay thế của thẻ định danh.',
                  renderContent: () => <CardDetail card={row} driverLabel={driverLabel} />,
                })
              }
            >
              Chi tiết
            </Button>
            {row.status === 'ACTIVE' && state.canBlock && (
              <Button
                size="sm"
                variant="ghost"
                icon={<LockSimpleIcon size={16} />}
                onClick={() => actions.runLifecycleAction(row, 'block')}
              >
                Khóa
              </Button>
            )}
            {row.status === 'ACTIVE' && state.canReportLost && (
              <Button
                size="sm"
                variant="ghost"
                icon={<WarningCircleIcon size={16} />}
                onClick={() => actions.runLifecycleAction(row, 'report-lost')}
              >
                Báo mất
              </Button>
            )}
            {(row.status === 'ACTIVE' || row.status === 'BLOCKED' || row.status === 'LOST') &&
              state.canReplace && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ArrowsLeftRightIcon size={16} />}
                  onClick={() => actions.runLifecycleAction(row, 'replace')}
                >
                  Thay thế
                </Button>
              )}
            {state.canBlock && (
              <Button
                size="sm"
                variant="ghost"
                icon={<PencilSimpleIcon size={16} />}
                onClick={() => actions.runLifecycleAction(row, 'edit')}
              >
                Sửa
              </Button>
            )}
            {state.canBlock && (
              <Button
                size="sm"
                variant="danger"
                icon={<TrashIcon size={16} />}
                onClick={() => actions.runLifecycleAction(row, 'delete')}
              >
                Xóa
              </Button>
            )}
          </div>
        );
      },
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
          searchPlaceholder="Tìm UID đã che, tên tài xế, mã nhân viên…"
          hasActiveFilters={hasActiveFilters}
          onReset={handleResetFilters}
        >
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '170px' }}>
              <Select
                aria-label="Lọc trạng thái thẻ"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="BLOCKED">Đã khóa</option>
                <option value="LOST">Báo mất</option>
                <option value="REPLACED">Đã thay thế</option>
              </Select>
            </div>
            {data.driversMap.size > 0 && (
              <div style={{ minWidth: '180px' }}>
                <Select
                  aria-label="Lọc theo tài xế"
                  value={state.driverFilter}
                  onChange={(e) => actions.setDriverFilter(e.target.value)}
                >
                  <option value="">Tất cả nhân sự / tài xế</option>
                  {Array.from(data.driversMap.values()).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} {d.employee_code ? `(${d.employee_code})` : ''}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </DataTableFilter>
        {!hideHeaderActions && (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              icon={<ArrowClockwiseIcon size={17} />}
              onClick={() => void actions.refresh()}
              pending={state.fetching}
            >
              Làm mới thẻ
            </Button>
            {state.canIssue && (
              <Button variant="primary" icon={<PlusIcon size={17} />} onClick={actions.issue}>
                Phát hành thẻ mới
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
              title="Chưa tải được danh sách thẻ nhân viên"
              requestId={error.requestId}
              action={<Button onClick={() => void actions.refresh()}>Thử lại</Button>}
            >
              {error.message}
            </StatePanel>
          ) : pagedRows.length ? (
            <DataTable
              label="Danh sách thẻ nhân viên (RFID)"
              rows={pagedRows}
              columns={columns}
              rowKey={(row) => row.id}
              maxHeight="520px"
            />
          ) : (
            <EmptyState
              title={
                hasActiveFilters ? 'Không có thẻ nhân viên phù hợp' : 'Chưa phát hành thẻ nhân viên'
              }
              action={
                hasActiveFilters ? (
                  <Button onClick={handleResetFilters}>Xóa bộ lọc</Button>
                ) : state.canIssue ? (
                  <Button variant="primary" onClick={actions.issue}>
                    Phát hành thẻ đầu tiên
                  </Button>
                ) : undefined
              }
            >
              {hasActiveFilters
                ? 'Thử thay đổi từ khóa hoặc trạng thái thẻ.'
                : 'Thẻ RFID đã phát hành sẽ hiển thị với UID đã che bảo mật tại đây.'}
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
