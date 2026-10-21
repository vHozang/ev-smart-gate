import { useState, useMemo, useEffect } from 'react';
import {
  ArrowClockwiseIcon,
  PlusIcon,
  PencilSimpleIcon,
  TrashIcon,
  ShieldCheckIcon,
  EyeIcon,
  LockKeyIcon,
} from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { useRolesScreen, type RoleView } from '@/features/roles';
import { normalizeError } from '@/shared/api';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DataTable, DataTableFilter, DataTablePagination } from '@/shared/ui/DataTable';
import type { TableColumn } from '@/shared/ui/DataTable';
import { DecryptedText } from '@/shared/ui/DecryptedText';
import { Skeleton } from '@/shared/ui/Skeleton';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import { StatePanel, EmptyState } from '@/shared/ui/StatePanel';
import { AsyncBoundary } from '@/shared/ui/AsyncBoundary';

export function RolesPage() {
  const { data, state, actions } = useRolesScreen();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [state.search]);

  const safePage = Math.min(page, Math.max(1, Math.ceil(data.rows.length / pageSize)));

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.rows.slice(start, start + pageSize);
  }, [data.rows, safePage, pageSize]);

  const hasActiveFilters = Boolean(state.search);

  const handleResetFilters = () => {
    actions.setSearch('');
  };

  const columns: TableColumn<RoleView>[] = [
    {
      id: 'name',
      header: 'Vai trò & Mã định danh',
      render: (row) => (
        <div>
          <span className="table-main font-semibold">{row.name}</span>
          <span className="text-xs font-mono text-[var(--color-muted)] block mt-0.5">
            <DecryptedText text={row.code} />
          </span>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Phân loại',
      render: (row) => (
        <Badge tone={row.is_system ? 'neutral' : 'warning'}>
          {row.is_system ? (
            <span className="flex items-center gap-1">
              <LockKeyIcon size={12} /> Hệ thống
            </span>
          ) : (
            'Tùy biến'
          )}
        </Badge>
      ),
    },
    {
      id: 'users',
      header: 'Số người dùng',
      render: (row) => (
        <span className="font-semibold text-xs text-[var(--color-text)]">
          {row.assigned_user_count} tài khoản
        </span>
      ),
      align: 'center',
    },
    {
      id: 'permissions',
      header: 'Số quyền được cấp',
      render: (row) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--color-surface-hover)] border border-[var(--color-border)]">
          {row.permission_codes.length} quyền
        </span>
      ),
      align: 'center',
    },
    {
      id: 'status',
      header: 'Trạng thái',
      render: (row) => (
        <Badge tone={row.is_active ? 'success' : 'neutral'}>
          {row.is_active ? 'Kích hoạt' : 'Tạm ngừng'}
        </Badge>
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

          {state.canManageRoles && (
            <>
              {actions.openEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<PencilSimpleIcon size={16} />}
                  onClick={() => actions.openEdit?.(row)}
                >
                  Sửa
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                icon={<ShieldCheckIcon size={16} />}
                onClick={() => actions.openEditPermissions(row)}
                title="Phân quyền tập lệnh"
              >
                Phân quyền
              </Button>
              {!row.is_system && actions.openArchive && (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<TrashIcon size={16} />}
                  onClick={() => actions.openArchive?.(row)}
                >
                  Xóa
                </Button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  const error = state.error ? normalizeError(state.error) : null;

  return (
    <ListPageLayout
      eyebrow="CHÍNH SÁCH ĐẶC QUYỀN · RBAC"
      title="Vai trò & Phân quyền"
      description="Quản lý danh mục vai trò hệ thống, chính sách phân quyền và kiểm soát đặc quyền truy cập."
      actions={
        <>
          <Button
            icon={<ArrowClockwiseIcon size={17} />}
            onClick={() => void actions.refresh()}
            pending={state.fetching}
          >
            Làm mới
          </Button>
          {state.canManageRoles && (
            <Button variant="primary" icon={<PlusIcon size={17} />} onClick={actions.openCreate}>
              Tạo vai trò mới
            </Button>
          )}
        </>
      }
      toolbar={
        <DataTableFilter
          search={state.search}
          onSearchChange={actions.setSearch}
          searchPlaceholder="Tìm theo tên hoặc mã vai trò…"
          hasActiveFilters={hasActiveFilters}
          onReset={handleResetFilters}
        />
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
          />
        ) : null
      }
    >
      <AsyncBoundary onReset={() => void actions.refresh()}>
        <SpotlightCard padded={false}>
          {state.unavailable ? (
            <StatePanel kind="unavailable" title="Chức năng đang được hoàn thiện">
              Màn hình này chưa sẵn sàng cho thao tác nghiệp vụ khi chưa có phiên xác thực hoặc dịch
              vụ quản trị vai trò (FE-G02).
            </StatePanel>
          ) : state.loading ? (
            <Skeleton />
          ) : error ? (
            <StatePanel
              kind={error.status === 403 ? 'forbidden' : 'error'}
              title="Chưa tải được danh sách vai trò"
              requestId={error.requestId}
              action={<Button onClick={() => void actions.refresh()}>Thử lại</Button>}
            >
              {error.message}
            </StatePanel>
          ) : pagedRows.length ? (
            <DataTable
              label="Danh sách vai trò"
              rows={pagedRows}
              columns={columns}
              rowKey={(row) => row.id}
              maxHeight="520px"
            />
          ) : (
            <EmptyState
              title={hasActiveFilters ? 'Không tìm thấy vai trò phù hợp' : 'Chưa có vai trò'}
              action={
                hasActiveFilters ? (
                  <Button onClick={handleResetFilters}>Xóa bộ lọc</Button>
                ) : state.canManageRoles ? (
                  <Button variant="primary" onClick={actions.openCreate}>
                    Tạo vai trò mới
                  </Button>
                ) : undefined
              }
            >
              {hasActiveFilters
                ? 'Hãy thử thay đổi từ khóa tìm kiếm.'
                : 'Các vai trò tùy biến và hệ thống sẽ xuất hiện tại đây.'}
            </EmptyState>
          )}
        </SpotlightCard>
      </AsyncBoundary>
    </ListPageLayout>
  );
}
