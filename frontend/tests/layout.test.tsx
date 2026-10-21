import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { HouseLineIcon } from '@phosphor-icons/react';
import { AppShell } from '@/layouts/AppShell';
import { DataTable } from '@/shared/ui/DataTable';
import { paths } from '@/shared/config';
const navigation = [
  {
    id: 'overview',
    path: paths.overview,
    title: 'Tổng quan',
    group: 'Điều hành',
    icon: HouseLineIcon,
  },
];
describe('Composition layout', () => {
  it('toggle sidebar có aria và gọi callback sở hữu preference', async () => {
    const collapse = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppShell
          navigation={navigation}
          title="Tổng quan"
          group="Điều hành"
          collapsed={false}
          onCollapse={collapse}
        >
          <p>Nội dung trang</p>
        </AppShell>
      </MemoryRouter>,
    );
    const button = screen.getByRole('button', { name: 'Thu gọn thanh điều hướng' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.click(button);
    expect(collapse).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page');
  });
  it('bảng có vùng cuộn được gắn nhãn và column headers', () => {
    render(
      <DataTable
        label="Danh sách thử trong test"
        rows={[{ id: 'unit-1', value: 'Nội dung rất dài được giữ nguyên' }]}
        columns={[{ id: 'value', header: 'Thông tin', render: (row) => row.value }]}
        rowKey={(row) => row.id}
      />,
    );
    expect(screen.getByRole('region', { name: 'Danh sách thử trong test' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByRole('columnheader', { name: 'Thông tin' })).toHaveAttribute('scope', 'col');
  });
});
