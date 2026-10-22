import type { ReactNode } from 'react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import type { ListPageLayoutProps } from '@/layouts/ListPageLayout';
export interface DetailPageLayoutProps extends ListPageLayoutProps {
  aside?: ReactNode;
}
export function DetailPageLayout({ aside, children, ...props }: DetailPageLayoutProps) {
  return (
    <ListPageLayout {...props}>
      <div className="detail-layout">
        <div>{children}</div>
        {aside && <aside>{aside}</aside>}
      </div>
    </ListPageLayout>
  );
}
