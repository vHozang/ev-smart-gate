import { ArrowClockwiseIcon, InfoIcon } from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { useSystemHealth } from '@/features/system';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import { formatDate } from '@/shared/lib';
import { normalizeError } from '@/shared/api';
export function SystemPage() {
  const { data, state, actions } = useSystemHealth();
  return (
    <ListPageLayout
      eyebrow="HỆ THỐNG / KẾT NỐI"
      title="Trạng thái hệ thống"
      description="Kiểm tra kết nối dịch vụ và khả năng sẵn sàng của cơ sở dữ liệu."
      actions={
        <Button
          icon={<ArrowClockwiseIcon size={17} />}
          pending={state.fetching}
          onClick={() => void actions.refresh()}
        >
          Kiểm tra lại
        </Button>
      }
      footer={
        <span>
          {data.updatedAt
            ? `Lần nhận dữ liệu gần nhất: ${formatDate(data.updatedAt)}`
            : 'Chưa nhận được phản hồi từ dịch vụ'}
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="surface">
          <header className="section-heading">
            <div>
              <h2>Dịch vụ nền tảng</h2>
              <p>Kết quả kiểm tra tại thời điểm yêu cầu</p>
            </div>
          </header>
          {state.loading ? (
            <Skeleton rows={2} />
          ) : (
            <div className="health-list">
              <div className="health-row">
                <div>
                  <h3>Kết nối ứng dụng</h3>
                  <p>
                    {state.liveError
                      ? normalizeError(state.liveError).message
                      : 'Phản hồi từ dịch vụ ứng dụng'}
                  </p>
                </div>
                <Badge tone={data.live?.status === 'ok' ? 'success' : 'danger'}>
                  {data.live?.status === 'ok' ? 'Có phản hồi' : 'Chưa kết nối'}
                </Badge>
              </div>
              <div className="health-row">
                <div>
                  <h3>Cơ sở dữ liệu</h3>
                  <p>
                    {state.readyError
                      ? normalizeError(state.readyError).message
                      : 'Khả năng sẵn sàng phục vụ yêu cầu'}
                  </p>
                </div>
                <Badge tone={data.ready?.status === 'ready' ? 'success' : 'danger'}>
                  {data.ready?.status === 'ready' ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
                </Badge>
              </div>
            </div>
          )}
        </section>
        <section className="surface">
          <header className="section-heading">
            <div>
              <h2>Thiết bị & nhận diện</h2>
              <p>Cần trạng thái từ từng thiết bị</p>
            </div>
          </header>
          <div className="health-list">
            {['Camera giám sát', 'Mô hình nhận diện', 'Barrier & đầu đọc thẻ'].map((title) => (
              <div className="health-row" key={title}>
                <div>
                  <h3>{title}</h3>
                  <p>Chưa có nguồn trạng thái riêng</p>
                </div>
                <Badge>Chưa xác định</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="inline-note mt-6">
        <InfoIcon size={18} />
        <p>
          Kết nối ứng dụng và cơ sở dữ liệu không xác nhận camera, mô hình nhận diện hoặc barrier
          đang hoạt động.
        </p>
      </div>
    </ListPageLayout>
  );
}
