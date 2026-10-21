import {
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PencilSimpleIcon,
  ProhibitIcon,
} from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { useVehiclesScreen } from '@/features/vehicles';
import type { Vehicle } from '@/features/vehicles';
import { normalizeError } from '@/shared/api';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DataTable } from '@/shared/ui/DataTable';
import type { TableColumn } from '@/shared/ui/DataTable';
import { Input } from '@/shared/ui/Input';
import { Skeleton } from '@/shared/ui/Skeleton';
import { StatePanel } from '@/shared/ui/StatePanel';
export function VehiclesPage() {
  const { data, state, actions } = useVehiclesScreen();
  const columns: TableColumn<Vehicle>[] = [
    {
      id: 'plate',
      header: 'Biển số',
      render: (row) => <span className="table-main mono">{row.plate_number}</span>,
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
          {!state.canUpdate && !state.canDeactivate && <span className="muted">Chỉ xem</span>}
        </div>
      ),
    },
  ];
  const error = state.error ? normalizeError(state.error) : null;
  return (
    <ListPageLayout
      eyebrow="HỒ SƠ / PHƯƠNG TIỆN"
      title="Quản lý phương tiện"
      description="Hồ sơ xe máy, ô tô và xe tải được đăng ký trong hệ thống."
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
            <Button variant="primary" icon={<PlusIcon size={17} />} onClick={actions.create}>
              Thêm phương tiện
            </Button>
          )}
        </>
      }
      toolbar={
        <>
          <div className="search-field">
            <MagnifyingGlassIcon size={18} />
            <Input
              aria-label="Tìm trong phương tiện đã tải"
              placeholder="Tìm biển số, loại xe, hãng xe…"
              value={state.search}
              onChange={(e) => actions.setSearch(e.target.value)}
            />
          </div>
          <span className="muted text-xs">Tìm trong danh sách đã tải</span>
        </>
      }
      footer={
        <>
          <span>
            {data.loaded === null
              ? 'Chưa tải được danh sách'
              : `${data.rows.length} hồ sơ hiển thị / ${data.loaded} đã tải`}
          </span>
          <span>Chưa có phân trang từ dịch vụ</span>
        </>
      }
    >
      <div className="surface">
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
        ) : data.rows.length ? (
          <DataTable
            label="Danh sách phương tiện"
            rows={data.rows}
            columns={columns}
            rowKey={(row) => row.id}
          />
        ) : (
          <StatePanel
            title={state.search ? 'Không có kết quả phù hợp' : 'Chưa có phương tiện'}
            action={
              state.search ? (
                <Button onClick={() => actions.setSearch('')}>Xóa tìm kiếm</Button>
              ) : state.canCreate ? (
                <Button variant="primary" onClick={actions.create}>
                  Thêm phương tiện đầu tiên
                </Button>
              ) : undefined
            }
          >
            {state.search
              ? 'Thử biển số hoặc từ khóa khác trong danh sách đã tải.'
              : 'Các phương tiện đã đăng ký sẽ xuất hiện tại đây.'}
          </StatePanel>
        )}
      </div>
    </ListPageLayout>
  );
}
