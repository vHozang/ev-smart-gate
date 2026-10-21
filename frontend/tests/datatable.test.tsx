import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DataTable,
  DataTablePagination,
  DataTableFilter,
  formatNullable,
} from '@/shared/ui/DataTable';
import type { TableColumn } from '@/shared/ui/DataTable';
import { EvidenceViewer } from '@/shared/ui/EvidenceViewer';

interface Item {
  id: string;
  code: string;
  name: string | null;
  description?: string;
}

const mockItems: Item[] = [
  { id: '1', code: 'ITM-01', name: 'Mục 1', description: 'Mô tả chi tiết mục 1' },
  { id: '2', code: 'ITM-02', name: null, description: 'Mô tả chi tiết mục 2' },
  {
    id: '3',
    code: 'ITM-03',
    name: 'Mục 3',
    description: 'Chuỗi văn bản rất dài để kiểm tra tính năng truncate tự động',
  },
];

const columns: TableColumn<Item>[] = [
  { id: 'code', header: 'Mã', render: (row) => row.code, align: 'center' },
  { id: 'name', header: 'Tên', render: (row) => formatNullable(row.name) },
  {
    id: 'desc',
    header: 'Mô tả',
    render: (row) => row.description,
    truncate: true,
    maxWidth: '200px',
  },
];

describe('DataTable dùng chung', () => {
  it('render bảng dữ liệu đầy đủ với header và rows', () => {
    render(
      <DataTable
        label="Bảng kiểm thử"
        caption="Danh sách kiểm thử"
        rows={mockItems}
        columns={columns}
        rowKey={(row) => row.id}
      />,
    );

    expect(screen.getByRole('region', { name: 'Bảng kiểm thử' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Danh sách kiểm thử')).toBeInTheDocument();
    expect(screen.getByText('ITM-01')).toBeInTheDocument();
    expect(screen.getByText('Mục 1')).toBeInTheDocument();
  });

  it('xử lý formatNullable hiển thị ký tự fallback khi giá trị null/undefined/rỗng', () => {
    render(
      <DataTable
        label="Bảng nullable"
        rows={mockItems}
        columns={columns}
        rowKey={(row) => row.id}
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('hỗ trợ cuộn nội bộ và sticky header', () => {
    const { container } = render(
      <DataTable
        label="Bảng cuộn nội bộ"
        rows={mockItems}
        columns={columns}
        rowKey={(row) => row.id}
        maxHeight="400px"
        stickyHeader
      />,
    );

    const region = container.querySelector('.table-region--sticky');
    expect(region).toBeInTheDocument();
    expect(region).toHaveStyle({ maxHeight: '400px', overflow: 'auto' });
  });

  it('hiển thị emptyState khi danh sách rỗng', () => {
    render(
      <DataTable
        label="Bảng rỗng"
        rows={[]}
        columns={columns}
        rowKey={(row) => row.id}
        emptyState={<div>Chưa có dữ liệu nào</div>}
      />,
    );

    expect(screen.getByText('Chưa có dữ liệu nào')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('hiển thị skeleton khi loading và không có dữ liệu', () => {
    const { container } = render(
      <DataTable
        label="Bảng đang tải"
        rows={[]}
        columns={columns}
        rowKey={(row) => row.id}
        loading
      />,
    );

    expect(container.querySelector('.skeleton-list')).toBeInTheDocument();
  });
});

describe('DataTablePagination phân trang', () => {
  it('hiển thị số bản ghi và thông tin trang chính xác', () => {
    const { container } = render(
      <DataTablePagination page={2} pageSize={10} total={45} onPageChange={vi.fn()} />,
    );

    const info = container.querySelector('.data-table-pagination__info');
    expect(info?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Hiển thị 11–20 trên 45 mục');
    expect(screen.getByText(/Trang 2 \/ 5/)).toBeInTheDocument();
  });

  it('chuyển trang khi bấm Trước / Sau', async () => {
    const user = userEvent.setup();
    const handlePageChange = vi.fn();

    render(
      <DataTablePagination page={2} pageSize={10} total={30} onPageChange={handlePageChange} />,
    );

    const prevButton = screen.getByRole('button', { name: 'Trang trước' });
    const nextButton = screen.getByRole('button', { name: 'Trang tiếp' });

    await user.click(prevButton);
    expect(handlePageChange).toHaveBeenCalledWith(1);

    await user.click(nextButton);
    expect(handlePageChange).toHaveBeenCalledWith(3);
  });

  it('vô hiệu hóa nút Trước khi ở trang 1 và nút Sau khi ở trang cuối', () => {
    const { rerender } = render(
      <DataTablePagination page={1} pageSize={10} total={10} onPageChange={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang tiếp' })).toBeDisabled();

    rerender(<DataTablePagination page={1} pageSize={10} total={30} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang tiếp' })).not.toBeDisabled();
  });

  it('thay đổi kích thước trang qua select', async () => {
    const user = userEvent.setup();
    const handleSizeChange = vi.fn();

    render(
      <DataTablePagination
        page={1}
        pageSize={10}
        total={50}
        pageSizeOptions={[10, 20, 50]}
        onPageChange={vi.fn()}
        onPageSizeChange={handleSizeChange}
      />,
    );

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, '20');
    expect(handleSizeChange).toHaveBeenCalledWith(20);
  });
});

describe('DataTableFilter thanh lọc dữ liệu', () => {
  it('nhập từ khóa tìm kiếm gọi onSearchChange', async () => {
    const user = userEvent.setup();
    const handleSearchChange = vi.fn();

    render(
      <DataTableFilter
        search=""
        onSearchChange={handleSearchChange}
        searchPlaceholder="Tìm kiếm mục…"
      />,
    );

    const input = screen.getByPlaceholderText('Tìm kiếm mục…');
    await user.type(input, 'xe');
    expect(handleSearchChange).toHaveBeenCalled();
  });

  it('hiển thị nút Xóa bộ lọc khi hasActiveFilters=true và kích hoạt onReset', async () => {
    const user = userEvent.setup();
    const handleReset = vi.fn();

    render(
      <DataTableFilter
        search="tu-khoa"
        onSearchChange={vi.fn()}
        hasActiveFilters
        onReset={handleReset}
      />,
    );

    const resetButton = screen.getByRole('button', { name: 'Xóa tất cả bộ lọc' });
    expect(resetButton).toBeInTheDocument();
    await user.click(resetButton);
    expect(handleReset).toHaveBeenCalledTimes(1);
  });
});

describe('EvidenceViewer và Resource Cleanup', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('hiển thị ảnh thông thường từ URL string', () => {
    render(
      <EvidenceViewer
        source="https://example.com/gate-cam.jpg"
        alt="Camera cổng số 1"
        title="Ảnh xe ra vào"
        metadata={{ 'Vị trí': 'Cổng chính', 'Thời gian': '10:00:00' }}
      />,
    );

    expect(screen.getByText('Ảnh xe ra vào')).toBeInTheDocument();
    const img = screen.getByRole('img', { name: 'Camera cổng số 1' });
    expect(img).toHaveAttribute('src', 'https://example.com/gate-cam.jpg');
    expect(screen.getByText('Cổng chính')).toBeInTheDocument();
    expect(screen.getByText('10:00:00')).toBeInTheDocument();
  });

  it('tạo ObjectURL từ Blob và dọn dẹp giải phóng bộ nhớ khi unmount', () => {
    const createMock = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');
    const revokeMock = vi.fn();
    URL.createObjectURL = createMock;
    URL.revokeObjectURL = revokeMock;

    const dummyBlob = new Blob(['fake image data'], { type: 'image/jpeg' });

    const { unmount } = render(
      <EvidenceViewer source={dummyBlob} alt="Bằng chứng từ Blob" title="Bằng chứng nhận diện" />,
    );

    expect(createMock).toHaveBeenCalledWith(dummyBlob);
    const img = screen.getByRole('img', { name: 'Bằng chứng từ Blob' });
    expect(img).toHaveAttribute('src', 'blob:http://localhost/test-uuid');

    // Unmount component -> kiểm chứng resource cleanup
    unmount();
    expect(revokeMock).toHaveBeenCalledWith('blob:http://localhost/test-uuid');
  });

  it('hiển thị placeholder khi không có dữ liệu nguồn', () => {
    render(<EvidenceViewer source={null} alt="Ảnh trống" title="Chưa chụp" />);

    expect(screen.getByText('Chưa có hình ảnh bằng chứng')).toBeInTheDocument();
  });
});
