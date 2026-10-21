import { useState, useMemo, useEffect } from 'react';
import { ArrowClockwiseIcon, EyeIcon } from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { useAuditScreen, type AuditView } from '@/features/audit';
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

export function AuditPage() {
  const { data, state, actions } = useAuditScreen();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [state.search, state.targetTypeFilter, state.outcomeFilter]);

  const safePage = Math.min(page, Math.max(1, Math.ceil(data.rows.length / pageSize)));

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.rows.slice(start, start + pageSize);
  }, [data.rows, safePage, pageSize]);

  const hasActiveFilters = Boolean(state.search || state.targetTypeFilter || state.outcomeFilter);

  const handleResetFilters = () => {
    actions.setSearch('');
    actions.setTargetTypeFilter('');
    actions.setOutcomeFilter('');
  };

  const columns: TableColumn<AuditView>[] = [
    {
      id: 'time',
      header: 'Thời điểm',
      render: (row) => (
        <span className="text-xs font-mono font-medium text-[var(--color-text)]">
          {formatDate(row.occurred_at)}
        </span>
      ),
    },
    {
      id: 'action',
      header: 'Hành động',
      render: (row) => (
        <DecryptedText text={row.action} className="table-main mono font-semibold" />
      ),
    },
    {
      id: 'target',
      header: 'Đối tượng tác động',
      render: (row) => (
        <div>
          <span className="font-semibold text-xs text-[var(--color-text)]">{row.target_type}</span>
          <span className="mono text-[11px] text-[var(--color-muted)] block">{row.target_id}</span>
        </div>
      ),
    },
    {
      id: 'actor',
      header: 'Người thực hiện',
      render: (row) => (
        <span className="mono text-xs text-[var(--color-muted)]">
          {row.actor_id ? `${row.actor_id.slice(0, 8)}…` : 'Hệ thống'}
        </span>
      ),
    },
    {
      id: 'outcome',
      header: 'Kết quả',
      render: (row) => {
        const tone =
          row.outcome === 'SUCCEEDED' ? 'success' : row.outcome === 'DENIED' ? 'warning' : 'danger';

        const label =
          row.outcome === 'SUCCEEDED'
            ? 'Thành công'
            : row.outcome === 'DENIED'
              ? 'Bị từ chối'
              : 'Thất bại';

        return <Badge tone={tone}>{label}</Badge>;
      },
    },
    {
      id: 'request_id',
      header: 'Mã Request ID',
      render: (row) => (
        <span className="mono text-[11px] text-[var(--color-muted)]">{row.request_id}</span>
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
        </div>
      ),
    },
  ];

  const error = state.error ? normalizeError(state.error) : null;

  return (
    <ListPageLayout
      eyebrow="TRUY VẾT BẢO MẬT · IMMUTABLE AUDIT"
      title="Nhật ký kiểm toán (Audit Log)"
      description="Lịch sử các thao tác nghiệp vụ, biến động cấu hình và truy cập bảo mật được ghi nhận bất biến."
      actions={
        <Button
          icon={<ArrowClockwiseIcon size={17} />}
          onClick={() => void actions.refresh()}
          pending={state.fetching}
        >
          Làm mới
        </Button>
      }
      toolbar={
        <DataTableFilter
          search={state.search}
          onSearchChange={actions.setSearch}
          searchPlaceholder="Tìm theo hành động, ID đối tượng, Request ID…"
          hasActiveFilters={hasActiveFilters}
          onReset={handleResetFilters}
        >
          <div style={{ minWidth: '160px' }}>
            <Select
              aria-label="Lọc theo loại đối tượng"
              value={state.targetTypeFilter}
              onChange={(e) => actions.setTargetTypeFilter(e.target.value)}
            >
              <option value="">Tất cả đối tượng</option>
              <option value="user">Tài khoản người dùng (user)</option>
              <option value="role">Vai trò phân quyền (role)</option>
              <option value="AuthSession">Phiên xác thực (AuthSession)</option>
              <option value="Device">Thiết bị & Cổng (Device)</option>
            </Select>
          </div>
          <div style={{ minWidth: '160px' }}>
            <Select
              aria-label="Lọc theo kết quả"
              value={state.outcomeFilter}
              onChange={(e) => actions.setOutcomeFilter(e.target.value)}
            >
              <option value="">Tất cả kết quả</option>
              <option value="SUCCEEDED">Thành công (SUCCEEDED)</option>
              <option value="DENIED">Bị từ chối (DENIED)</option>
              <option value="FAILED">Thất bại (FAILED)</option>
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
              vụ nhật ký kiểm toán (FE-G02).
            </StatePanel>
          ) : state.loading ? (
            <Skeleton />
          ) : error ? (
            <StatePanel
              kind={error.status === 403 ? 'forbidden' : 'error'}
              title="Chưa tải được nhật ký kiểm toán"
              requestId={error.requestId}
              action={<Button onClick={() => void actions.refresh()}>Thử lại</Button>}
            >
              {error.message}
            </StatePanel>
          ) : pagedRows.length ? (
            <DataTable
              label="Bảng nhật ký kiểm toán"
              rows={pagedRows}
              columns={columns}
              rowKey={(row) => row.id}
              maxHeight="520px"
            />
          ) : (
            <EmptyState
              title={hasActiveFilters ? 'Không tìm thấy bản ghi phù hợp' : 'Chưa có nhật ký nào'}
              action={
                hasActiveFilters ? (
                  <Button onClick={handleResetFilters}>Xóa bộ lọc</Button>
                ) : undefined
              }
            >
              {hasActiveFilters
                ? 'Hãy thử thay đổi từ khóa hoặc bộ lọc tìm kiếm.'
                : 'Các thao tác nghiệp vụ và bảo mật sẽ tự động xuất hiện tại đây.'}
            </EmptyState>
          )}
        </SpotlightCard>
      </AsyncBoundary>
    </ListPageLayout>
  );
}
