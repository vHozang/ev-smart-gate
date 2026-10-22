import { useState, useMemo, useEffect } from 'react';
import {
  ArrowClockwiseIcon,
  EyeIcon,
  PlusIcon,
  PencilSimpleIcon,
  ProhibitIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { useDriversScreen, DriverDetail } from '@/features/drivers';
import type { Driver } from '@/features/drivers';
import { EmployeeCardsPanel, useEmployeeCardsScreen } from '@/features/employee-cards';
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
import { formatDate } from '@/shared/lib';

export function DriversPage() {
  const { data, state, actions } = useDriversScreen();
  const { can } = useAuth();
  const feedback = useFeedback();
  const [activeTab, setActiveTab] = useState<'drivers' | 'cards'>('drivers');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const canReadCards = can('employee-cards:read');
  const cardsScreen = useEmployeeCardsScreen({ enabled: activeTab === 'cards' && canReadCards });

  const columns: TableColumn<Driver>[] = useMemo(
    () => [
      {
        id: 'name',
        header: 'Họ và tên',
        render: (row) => <strong className="table-main">{row.full_name}</strong>,
      },
      {
        id: 'code',
        header: 'Mã nhân viên',
        render: (row) =>
          row.employee_code ? (
            <DecryptedText text={row.employee_code} className="mono" />
          ) : (
            <span className="mono">Chưa cập nhật</span>
          ),
      },
      { id: 'phone', header: 'Liên hệ', render: (row) => row.phone || 'Chưa cập nhật' },
      { id: 'enrolled', header: 'Đăng ký nhận diện', render: (row) => formatDate(row.enrolled_at) },
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
                  id: `detail-driver-${row.id}`,
                  title: `Hồ sơ nhận diện: ${row.full_name}`,
                  description: 'Thông tin tài khoản và mô hình nhận diện khuôn mặt AI.',
                  renderContent: () => <DriverDetail driver={row} />,
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
              <Button
                size="sm"
                variant="ghost"
                icon={<ProhibitIcon size={16} />}
                aria-label={`Ngừng hoạt động ${row.full_name}`}
                onClick={() => actions.deactivate(row)}
              >
                Ngừng
              </Button>
            )}
            {(state.canDeactivate || state.canUpdate) && (
              <Button
                size="sm"
                variant="ghost"
                icon={<TrashIcon size={16} />}
                aria-label={`Xóa hồ sơ ${row.full_name}`}
                onClick={() => actions.remove(row)}
              >
                Xóa
              </Button>
            )}
          </div>
        ),
      },
    ],
    [feedback, state.canUpdate, state.canDeactivate, actions],
  );

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

  const error = state.error ? normalizeError(state.error) : null;

  return (
    <ListPageLayout
      title="Hồ sơ nhận diện"
      description="Danh sách người đã đăng ký nhận diện và thẻ nhân viên (RFID). Hồ sơ này tách biệt với tài khoản đăng nhập và quyền quản trị."
      actions={
        activeTab === 'cards' && canReadCards ? (
          <>
            <Button
              pending={cardsScreen.state.fetching}
              icon={<ArrowClockwiseIcon size={17} />}
              onClick={() => void cardsScreen.actions.refresh()}
            >
              Làm mới thẻ
            </Button>
            {cardsScreen.state.canIssue && (
              <Button
                variant="primary"
                icon={<PlusIcon size={17} />}
                onClick={cardsScreen.actions.issue}
              >
                Phát hành thẻ mới
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              pending={state.fetching}
              icon={<ArrowClockwiseIcon size={17} />}
              onClick={() => void actions.refresh()}
            >
              Làm mới
            </Button>
            {state.canCreate && (
              <Button variant="primary" icon={<PlusIcon size={17} />} onClick={actions.create}>
                Đăng ký nhận diện
              </Button>
            )}
          </>
        )
      }
      toolbar={
        canReadCards ? (
          <SegmentedTabs
            ariaLabel="Phân hệ nhận diện và thẻ"
            items={[
              { id: 'drivers', label: 'Hồ sơ nhận diện khuôn mặt' },
              { id: 'cards', label: 'Thẻ nhân viên (RFID)' },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
        ) : undefined
      }
    >
      {activeTab === 'cards' && canReadCards ? (
        <EmployeeCardsPanel screen={cardsScreen} hideHeaderActions />
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <DataTableFilter
            search={state.search}
            onSearchChange={actions.setSearch}
            searchPlaceholder="Tìm họ tên, mã nhân viên…"
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
                  title="Chưa tải được hồ sơ"
                  requestId={error.requestId}
                  action={<Button onClick={() => void actions.refresh()}>Thử lại</Button>}
                >
                  {error.message}
                </StatePanel>
              ) : pagedRows.length ? (
                <DataTable
                  label="Danh sách hồ sơ nhận diện"
                  columns={columns}
                  rows={pagedRows}
                  rowKey={(row) => row.id}
                  maxHeight="520px"
                />
              ) : (
                <EmptyState
                  title={hasActiveFilters ? 'Không có kết quả phù hợp' : 'Chưa có hồ sơ nhận diện'}
                  action={
                    hasActiveFilters ? (
                      <Button onClick={handleResetFilters}>Xóa bộ lọc</Button>
                    ) : state.canCreate ? (
                      <Button variant="primary" onClick={actions.create}>
                        Đăng ký nhận diện đầu tiên
                      </Button>
                    ) : undefined
                  }
                >
                  {hasActiveFilters
                    ? 'Thử từ khóa hoặc bộ lọc trạng thái khác.'
                    : 'Các hồ sơ đã đăng ký sẽ xuất hiện tại đây.'}
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
