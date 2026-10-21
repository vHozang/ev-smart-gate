import { ArrowClockwiseIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { useDriversScreen } from '@/features/drivers';
import type { Driver } from '@/features/drivers';
import { normalizeError } from '@/shared/api';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DataTable } from '@/shared/ui/DataTable';
import type { TableColumn } from '@/shared/ui/DataTable';
import { Input } from '@/shared/ui/Input';
import { Skeleton } from '@/shared/ui/Skeleton';
import { StatePanel } from '@/shared/ui/StatePanel';
import { formatDate } from '@/shared/lib';
const columns: TableColumn<Driver>[] = [
  {
    id: 'name',
    header: 'Họ và tên',
    render: (row) => <strong className="table-main">{row.full_name}</strong>,
  },
  {
    id: 'code',
    header: 'Mã nhân viên',
    render: (row) => <span className="mono">{row.employee_code || 'Chưa cập nhật'}</span>,
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
];
export function DriversPage() {
  const { data, state, actions } = useDriversScreen();
  const error = state.error ? normalizeError(state.error) : null;
  return (
    <ListPageLayout
      eyebrow="HỒ SƠ / NHÂN SỰ"
      title="Hồ sơ nhận diện"
      description="Danh sách người đã đăng ký nhận diện. Hồ sơ này tách biệt với tài khoản đăng nhập và quyền quản trị."
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
            aria-label="Tìm trong hồ sơ đã tải"
            placeholder="Tìm họ tên, mã nhân viên…"
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
              : `${data.rows.length} hồ sơ hiển thị / ${data.loaded} đã tải`}
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
            title="Chưa tải được hồ sơ"
            requestId={error.requestId}
            action={<Button onClick={() => void actions.refresh()}>Thử lại</Button>}
          >
            {error.message}
          </StatePanel>
        ) : data.rows.length ? (
          <DataTable
            label="Danh sách hồ sơ nhận diện"
            columns={columns}
            rows={data.rows}
            rowKey={(row) => row.id}
          />
        ) : (
          <StatePanel title={state.search ? 'Không có kết quả phù hợp' : 'Chưa có hồ sơ nhận diện'}>
            Các hồ sơ đã đăng ký sẽ xuất hiện tại đây.
          </StatePanel>
        )}
      </div>
    </ListPageLayout>
  );
}
