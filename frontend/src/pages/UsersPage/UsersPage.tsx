import { useState, useMemo, useEffect } from 'react';
import {
  ArrowClockwiseIcon,
  PlusIcon,
  PencilSimpleIcon,
  KeyIcon,
  ShieldIcon,
  PowerIcon,
  EyeIcon,
} from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { useUsersScreen, type AdminUser } from '@/features/users';
import { normalizeError } from '@/shared/api';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DataTable, DataTableFilter, DataTablePagination } from '@/shared/ui/DataTable';
import type { TableColumn } from '@/shared/ui/DataTable';
import { DecryptedText } from '@/shared/ui/DecryptedText';
import { Select } from '@/shared/ui/Select';
import { Skeleton } from '@/shared/ui/Skeleton';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import { StatePanel, EmptyState } from '@/shared/ui/StatePanel';
import { AsyncBoundary } from '@/shared/ui/AsyncBoundary';
import { formatDate } from '@/shared/lib';

export function UsersPage() {
  const { data, state, actions } = useUsersScreen();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset trang khi thay đổi từ khóa hoặc bộ lọc
  useEffect(() => {
    setPage(1);
  }, [state.search, state.roleFilter, state.statusFilter]);

  const safePage = Math.min(page, Math.max(1, Math.ceil(data.rows.length / pageSize)));

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.rows.slice(start, start + pageSize);
  }, [data.rows, safePage, pageSize]);

  const hasActiveFilters = Boolean(state.search || state.roleFilter || state.statusFilter);

  const handleResetFilters = () => {
    actions.setSearch('');
    actions.setRoleFilter('');
    actions.setStatusFilter('');
  };

  const columns: TableColumn<AdminUser>[] = [
    {
      id: 'username',
      header: 'Tên đăng nhập',
      render: (row) => (
        <div>
          <DecryptedText text={row.username} className="table-main mono font-semibold" />
          {row.display_name && (
            <span className="text-xs text-[var(--color-muted)] block">{row.display_name}</span>
          )}
        </div>
      ),
    },
    {
      id: 'role',
      header: 'Vai trò',
      render: (row) => (
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[var(--color-surface-hover)] border border-[var(--color-border)]">
          {row.role_code}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Trạng thái',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Badge tone={row.is_active ? 'success' : 'neutral'}>
            {row.is_active ? 'Hoạt động' : 'Vô hiệu hóa'}
          </Badge>
          {row.must_change_password && <Badge tone="warning">Cần đổi MK</Badge>}
        </div>
      ),
    },
    {
      id: 'version',
      header: 'Phiên bản',
      render: (row) => (
        <span className="font-mono text-xs text-[var(--color-muted)]">v{row.version}</span>
      ),
      align: 'center',
    },
    {
      id: 'created_at',
      header: 'Ngày khởi tạo',
      render: (row) => (
        <span className="text-xs text-[var(--color-muted)]">{formatDate(row.created_at)}</span>
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
            onClick={() => actions.openDetail(row)}
          >
            Chi tiết
          </Button>

          {state.canManage && (
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={<PencilSimpleIcon size={16} />}
                onClick={() => actions.openEdit(row)}
                title="Sửa thông tin hồ sơ"
              >
                Sửa
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<ShieldIcon size={16} />}
                onClick={() => actions.openChangeRole(row)}
                title="Gán vai trò mới"
              >
                Vai trò
              </Button>
              <button
                className="icon-button"
                title={row.is_active ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản'}
                aria-label={row.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}
                onClick={() => actions.openChangeStatus(row)}
              >
                <PowerIcon
                  size={18}
                  className={
                    row.is_active ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'
                  }
                />
              </button>
            </>
          )}

          {state.canResetPassword && (
            <button
              className="icon-button"
              title="Đặt lại mật khẩu tạm"
              aria-label={`Đặt lại mật khẩu cho ${row.username}`}
              onClick={() => actions.openResetPassword(row)}
            >
              <KeyIcon size={18} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const error = state.error ? normalizeError(state.error) : null;

  return (
    <ListPageLayout
      eyebrow="QUẢN TRỊ TRUY CẬP · IAM"
      title="Tài khoản người dùng"
      description="Quản lý danh sách tài khoản vận hành, phân bổ vai trò và phiên truy cập."
      actions={
        <>
          <Button
            icon={<ArrowClockwiseIcon size={17} />}
            onClick={() => void actions.refresh()}
            pending={state.fetching}
          >
            Làm mới
          </Button>
          {state.canCreate && (
            <Button variant="primary" icon={<PlusIcon size={17} />} onClick={actions.openCreate}>
              Thêm người dùng
            </Button>
          )}
        </>
      }
      toolbar={
        <DataTableFilter
          search={state.search}
          onSearchChange={actions.setSearch}
          searchPlaceholder="Tìm theo tên đăng nhập hoặc họ tên…"
          hasActiveFilters={hasActiveFilters}
          onReset={handleResetFilters}
        >
          <div style={{ minWidth: '160px' }}>
            <Select
              aria-label="Lọc theo vai trò"
              value={state.roleFilter}
              onChange={(e) => actions.setRoleFilter(e.target.value)}
            >
              <option value="">Tất cả vai trò</option>
              <option value="ADMIN">Quản trị viên (ADMIN)</option>
              <option value="WAREHOUSE">Kho hàng (WAREHOUSE)</option>
              <option value="SECURITY">Bảo vệ cổng (SECURITY)</option>
              <option value="OPERATOR">Vận hành (OPERATOR)</option>
            </Select>
          </div>
          <div style={{ minWidth: '160px' }}>
            <Select
              aria-label="Lọc theo trạng thái"
              value={state.statusFilter}
              onChange={(e) => actions.setStatusFilter(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Đã vô hiệu hóa</option>
            </Select>
          </div>
        </DataTableFilter>
      }
      footer={
        data.rows.length > 0 ? (
          <DataTablePagination
            page={safePage}
            pageSize={pageSize}
            total={data.rows.length}
            pageSizeOptions={[10, 20, 50]}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            hasMoreServerData={data.hasMore}
            hasPrevCursor={data.hasPrevCursor}
            onNextCursor={actions.nextCursorPage}
            onPrevCursor={actions.prevCursorPage}
          />
        ) : null
      }
    >
      <AsyncBoundary onReset={() => void actions.refresh()}>
        <SpotlightCard padded={false}>
          {state.unavailable ? (
            <StatePanel kind="unavailable" title="Chức năng đang được hoàn thiện">
              Màn hình này chưa sẵn sàng cho thao tác nghiệp vụ khi chưa có phiên xác thực hoặc dịch
              vụ quản trị tài khoản (FE-G02).
            </StatePanel>
          ) : state.loading ? (
            <Skeleton />
          ) : error ? (
            <StatePanel
              kind={error.status === 403 ? 'forbidden' : 'error'}
              title="Chưa tải được danh sách tài khoản"
              requestId={error.requestId}
              action={<Button onClick={() => void actions.refresh()}>Thử lại</Button>}
            >
              {error.message}
            </StatePanel>
          ) : pagedRows.length ? (
            <DataTable
              label="Danh sách tài khoản người dùng"
              rows={pagedRows}
              columns={columns}
              rowKey={(row) => row.id}
              maxHeight="520px"
            />
          ) : (
            <EmptyState
              title={
                hasActiveFilters ? 'Không tìm thấy tài khoản phù hợp' : 'Chưa có tài khoản nào'
              }
              action={
                hasActiveFilters ? (
                  <Button onClick={handleResetFilters}>Xóa bộ lọc</Button>
                ) : state.canCreate ? (
                  <Button variant="primary" onClick={actions.openCreate}>
                    Thêm người dùng đầu tiên
                  </Button>
                ) : undefined
              }
            >
              {hasActiveFilters
                ? 'Hãy thử thay đổi từ khóa hoặc thiết lập lại bộ lọc để tìm kiếm.'
                : 'Hệ thống chưa có thêm tài khoản vận hành. Hãy tạo mới bằng nút phía trên.'}
            </EmptyState>
          )}
        </SpotlightCard>
      </AsyncBoundary>
    </ListPageLayout>
  );
}
