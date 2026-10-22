import { Link } from 'react-router';
import { StatePanel } from '@/shared/ui/StatePanel';
import { Button } from '@/shared/ui/Button';
import { paths } from '@/shared/config';
export function RouteError() {
  return (
    <StatePanel
      kind="error"
      title="Trang chưa thể hiển thị"
      action={
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              window.location.reload();
            }}
          >
            Tải lại trang
          </Button>
          <Link className="button button--secondary" to={paths.overview}>
            Về tổng quan
          </Link>
        </div>
      }
    >
      Bạn có thể thử tải lại trang. Thông tin nhạy cảm của lỗi không được hiển thị tại đây.
    </StatePanel>
  );
}
