import { paths } from '@/shared/config';
import { Link } from 'react-router';
import { StatePanel } from '@/shared/ui/StatePanel';
export function NotFoundPage() {
  return (
    <StatePanel
      title="Không tìm thấy trang"
      action={
        <Link className="button button--primary" to={paths.overview}>
          Về không gian điều hành
        </Link>
      }
    >
      Đường dẫn này không tồn tại hoặc đã được thay đổi.
    </StatePanel>
  );
}
