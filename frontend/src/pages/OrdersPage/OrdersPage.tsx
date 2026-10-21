import { ArrowClockwiseIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { useOrdersScreen } from '@/features/warehouse-orders';
import type { WarehouseOrder } from '@/features/warehouse-orders';
import { normalizeError } from '@/shared/api';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DataTable } from '@/shared/ui/DataTable';
import type { TableColumn } from '@/shared/ui/DataTable';
import { Input } from '@/shared/ui/Input';
import { Skeleton } from '@/shared/ui/Skeleton';
import { StatePanel } from '@/shared/ui/StatePanel';
import { formatDate } from '@/shared/lib';
const labels: Record<WarehouseOrder['status'], string> = {
  PENDING: 'Chờ xử lý',
  LOADING: 'Đang xếp hàng',
  READY_FOR_EXIT: 'Sẵn sàng xuất',
  SLIP_ISSUED: 'Đã cấp phiếu',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};
const columns: TableColumn<WarehouseOrder>[] = [
  {
    id: 'code',
    header: 'Mã đơn hàng',
    render: (row) => <strong className="table-main mono">{row.order_id}</strong>,
  },
  {
    id: 'status',
    header: 'Trạng thái',
    render: (row) => (
      <Badge
        tone={
          row.status === 'CANCELLED' ? 'danger' : row.status === 'COMPLETED' ? 'success' : 'neutral'
        }
      >
        {labels[row.status]}
      </Badge>
    ),
  },
  { id: 'from', header: 'Hiệu lực từ', render: (row) => formatDate(row.valid_from) },
  { id: 'until', header: 'Hiệu lực đến', render: (row) => formatDate(row.valid_until) },
  {
    id: 'dock',
    header: 'Phiên tại kho',
    render: (row) =>
      row.dock_session_id ? <span className="mono">{row.dock_session_id}</span> : 'Chưa có phiên',
  },
];
export function OrdersPage() {
  const { data, state, actions } = useOrdersScreen();
  const error = state.error ? normalizeError(state.error) : null;
  return (
    <ListPageLayout
      eyebrow="KHO HÀNG / ĐƠN HÀNG"
      title="Đơn hàng xuất kho"
      description="Theo dõi đơn hàng và hiệu lực xuất kho. Hoạt động kho tách biệt với luồng kiểm soát ra vào."
      actions={
        <Button
          pending={state.fetching}
          icon={<ArrowClockwiseIcon size={17} />}
          onClick={() => void actions.refresh()}
        >
          Làm mới
        </Button>
      }
      toolbar={
        <div className="search-field">
          <MagnifyingGlassIcon size={18} />
          <Input
            aria-label="Tìm trong đơn hàng đã tải"
            placeholder="Tìm mã đơn hàng…"
            value={state.search}
            onChange={(e) => actions.setSearch(e.target.value)}
          />
        </div>
      }
      footer={
        <>
          <span>
            {data.loaded === null
              ? 'Chưa tải danh sách'
              : `${data.rows.length} đơn hiển thị / ${data.loaded} đã tải`}
          </span>
          <span>Tìm trong danh sách đã tải</span>
        </>
      }
    >
      <div className="surface">
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
        ) : data.rows.length ? (
          <DataTable
            label="Danh sách đơn hàng xuất kho"
            columns={columns}
            rows={data.rows}
            rowKey={(row) => row.id}
          />
        ) : (
          <StatePanel title={state.search ? 'Không có đơn hàng phù hợp' : 'Chưa có đơn hàng'}>
            Các đơn hàng xuất kho sẽ xuất hiện tại đây.
          </StatePanel>
        )}
      </div>
    </ListPageLayout>
  );
}
