import { paths } from '@/shared/config';
import { Link, useMatches } from 'react-router';
import { z } from 'zod';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { StatePanel } from '@/shared/ui/StatePanel';
const metadata = z.object({
  title: z.string(),
  group: z.string(),
  gap: z.string().optional(),
  description: z.string().optional(),
});
export function UnavailablePage() {
  const matches = useMatches();
  const handle = metadata.safeParse(
    [...matches].reverse().find((match) => metadata.safeParse(match.handle).success)?.handle,
  );
  const title = handle.success ? handle.data.title : 'Chức năng đang chuẩn bị';
  return (
    <ListPageLayout
      title={title}
      eyebrow={handle.success ? handle.data.group : 'KHÔNG GIAN VẬN HÀNH'}
      description={handle.success ? handle.data.description : undefined}
    >
      <div className="surface">
        <StatePanel
          kind="unavailable"
          title="Chức năng đang được hoàn thiện"
          action={
            <Link className="button button--secondary" to={paths.overview}>
              Về không gian điều hành
            </Link>
          }
        >
          <p>
            Màn hình này chưa sẵn sàng cho thao tác nghiệp vụ. Dữ liệu sẽ được hiển thị khi dịch vụ
            tương ứng được tích hợp.
          </p>
        </StatePanel>
      </div>
    </ListPageLayout>
  );
}
