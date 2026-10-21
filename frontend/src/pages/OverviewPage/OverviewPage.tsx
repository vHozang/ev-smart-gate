import { paths } from '@/shared/config';
import { Link } from 'react-router';
import {
  ArrowUpRightIcon,
  ArrowRightIcon,
  ScanIcon,
  CarProfileIcon,
  PackageIcon,
  ShieldCheckIcon,
  ArrowClockwiseIcon,
} from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { WorkspaceLayout } from '@/layouts/WorkspaceLayout';
import { useAuth } from '@/features/auth';
import { useSystemHealth } from '@/features/system';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import { formatDate } from '@/shared/lib';
export function OverviewPage() {
  const { principal } = useAuth();
  const { data, state, actions } = useSystemHealth();
  return (
    <ListPageLayout
      eyebrow="ĐIỀU HÀNH / TỔNG QUAN"
      title="Không gian điều hành"
      description="Theo dõi ra vào, quản lý hồ sơ và phối hợp hoạt động kho."
      actions={
        <Button
          icon={<ArrowClockwiseIcon size={17} />}
          pending={state.fetching}
          onClick={() => void actions.refresh()}
        >
          Cập nhật trạng thái
        </Button>
      }
    >
      <WorkspaceLayout
        primary={
          <section className="overview-welcome">
            <div>
              <div className="overview-welcome__icon">
                <ScanIcon size={29} />
              </div>
              <h2>
                {principal
                  ? `Chào ${principal.username}, sẵn sàng cho ca vận hành.`
                  : 'Bắt đầu ca vận hành của bạn.'}
              </h2>
              <p>
                {principal
                  ? 'Truy cập hồ sơ và các tác vụ theo quyền được cấp. Mỗi quyết định ra vào đều cần được xác minh.'
                  : 'Đăng nhập để truy cập hồ sơ nhân viên, phương tiện và công việc được phân quyền.'}
              </p>
            </div>
            <div>
              <Link
                className="button button--primary"
                to={principal ? paths.vehicles : paths.login}
              >
                {principal ? 'Mở hồ sơ phương tiện' : 'Đăng nhập hệ thống'}
                <ArrowRightIcon size={17} />
              </Link>
            </div>
          </section>
        }
        secondary={
          <section className="surface">
            <header className="section-heading">
              <div>
                <h2>Kết nối vận hành</h2>
                <p>Phản hồi trực tiếp từ dịch vụ</p>
              </div>
              <ShieldCheckIcon size={21} className="muted" />
            </header>
            {state.loading ? (
              <Skeleton rows={2} />
            ) : (
              <div className="health-list">
                <div className="health-row">
                  <div>
                    <h3>Ứng dụng</h3>
                    <p>Kết nối dịch vụ nền tảng</p>
                  </div>
                  <Badge tone={data.live?.status === 'ok' ? 'success' : 'warning'}>
                    {data.live?.status === 'ok' ? 'Có phản hồi' : 'Chưa kết nối'}
                  </Badge>
                </div>
                <div className="health-row">
                  <div>
                    <h3>Cơ sở dữ liệu</h3>
                    <p>Khả năng phục vụ dữ liệu</p>
                  </div>
                  <Badge tone={data.ready?.status === 'ready' ? 'success' : 'warning'}>
                    {data.ready?.status === 'ready' ? 'Sẵn sàng' : 'Chưa xác định'}
                  </Badge>
                </div>
              </div>
            )}
            <div className="px-6 py-4 text-xs text-muted border-t border-border flex flex-wrap items-center justify-between gap-2">
              <span>{data.updatedAt ? formatDate(data.updatedAt) : 'Chưa có phản hồi'}</span>
              <Link to={paths.system} className="text-accent flex items-center gap-1">
                Chi tiết
                <ArrowUpRightIcon size={14} />
              </Link>
            </div>
          </section>
        }
      />
      <div className="grid grid-cols-1 gap-6 mt-6 xl:grid-cols-2">
        <section className="surface">
          <header className="section-heading">
            <div>
              <h2>Truy cập nhanh</h2>
              <p>Hồ sơ và nghiệp vụ thường dùng</p>
            </div>
          </header>
          <Link to={paths.vehicles} className="module-link">
            <CarProfileIcon size={24} />
            <div>
              <h3>Phương tiện</h3>
              <p>Đăng ký, cập nhật và tra cứu hồ sơ xe.</p>
            </div>
            <ArrowUpRightIcon size={18} />
          </Link>
          <Link to={paths.orders} className="module-link">
            <PackageIcon size={24} />
            <div>
              <h3>Quản lý kho hàng</h3>
              <p>Theo dõi đơn hàng và trạng thái xuất kho.</p>
            </div>
            <ArrowUpRightIcon size={18} />
          </Link>
        </section>
        <section className="surface">
          <header className="section-heading">
            <div>
              <h2>Báo cáo & phân tích</h2>
              <p>Số liệu cần được xác nhận từ nguồn</p>
            </div>
            <Badge>Đang chuẩn bị</Badge>
          </header>
          <div className="p-6">
            <p className="text-sm text-muted leading-relaxed">
              Dashboard thống kê và báo cáo nhanh đang chờ dịch vụ dữ liệu. Chưa có số liệu tổng hợp
              được công bố tại đây.
            </p>
            <Link className="button button--secondary mt-6" to={paths.dashboard}>
              Xem phạm vi thống kê
              <ArrowUpRightIcon size={16} />
            </Link>
          </div>
        </section>
      </div>
    </ListPageLayout>
  );
}
