import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  OutcomeUnknownState,
  StatePanel,
} from '@/shared/ui/StatePanel';
import { AsyncBoundary, ErrorBoundary } from '@/shared/ui/AsyncBoundary';
import { ApiError } from '@/shared/api';

describe('Task 6.11: Common State Panels & Async/Render Boundaries', () => {
  it('StatePanel render đúng các kind empty, error, forbidden, unavailable, outcome_unknown', () => {
    const { rerender } = render(
      <StatePanel kind="empty" title="Không có dữ liệu">
        Danh sách trống
      </StatePanel>,
    );
    expect(screen.getByRole('region', { name: 'Không có dữ liệu' })).toBeInTheDocument();
    expect(screen.getByText('Danh sách trống')).toBeInTheDocument();

    rerender(
      <StatePanel
        kind="outcome_unknown"
        title="Kết quả chưa thể xác nhận"
        requestId="req-unknown-123"
      >
        Lệnh đóng/mở barrier chưa nhận phản hồi
      </StatePanel>,
    );
    expect(screen.getByRole('region', { name: 'Kết quả chưa thể xác nhận' })).toBeInTheDocument();
    expect(screen.getByText(/Mã yêu cầu: req-unknown-123/)).toBeInTheDocument();
  });

  it('Các component helper EmptyState, ErrorState, ForbiddenState, OutcomeUnknownState gán đúng kind', () => {
    const { container: emptyC } = render(<EmptyState title="Hộp thư rỗng" />);
    expect(emptyC.querySelector('.state-panel--empty')).toBeInTheDocument();

    const { container: errorC } = render(<ErrorState title="Lỗi hệ thống" />);
    expect(errorC.querySelector('.state-panel--error')).toBeInTheDocument();

    const { container: forbiddenC } = render(<ForbiddenState title="Cấm truy cập" />);
    expect(forbiddenC.querySelector('.state-panel--forbidden')).toBeInTheDocument();

    const { container: unknownC } = render(<OutcomeUnknownState title="Không rõ kết quả" />);
    expect(unknownC.querySelector('.state-panel--outcome_unknown')).toBeInTheDocument();
  });

  it('ErrorBoundary bắt lỗi từ component con và hiển thị giao diện an toàn không crash', () => {
    // Tạm thời tắt console.error để tránh log rác từ React ErrorBoundary trong test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function FaultyComponent({ shouldThrow }: { shouldThrow: boolean }) {
      if (shouldThrow) {
        throw new Error('Lỗi tính toán logic nội bộ');
      }
      return <div>Nội dung an toàn</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <FaultyComponent shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Nội dung an toàn')).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <FaultyComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('region', { name: 'Không thể tải nội dung' })).toBeInTheDocument();
    expect(screen.getByText('Không thể hoàn tất thao tác. Hãy thử lại.')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('ErrorBoundary phân biệt lỗi 403 Forbidden và hiển thị mã yêu cầu requestId', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function ForbiddenFaulty() {
      throw new ApiError('FORBIDDEN', 'Bạn không có quyền xem tài nguyên này', 403, 'req-403-safe');
      return null;
    }

    render(
      <ErrorBoundary>
        <ForbiddenFaulty />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole('region', { name: 'Bạn chưa được cấp quyền truy cập' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Bạn không có quyền xem tài nguyên này')).toBeInTheDocument();
    expect(screen.getByText('Mã yêu cầu: req-403-safe')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('ErrorBoundary nút Thử lại gọi onReset và cho phép phục hồi render', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let hasError = true;
    const onReset = vi.fn(() => {
      hasError = false;
    });

    function Recoverable() {
      if (hasError) throw new ApiError('TEMP_ERROR', 'Lỗi kết nối tạm thời');
      return <div>Đã phục hồi thành công</div>;
    }

    render(
      <ErrorBoundary onReset={onReset}>
        <Recoverable />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Lỗi kết nối tạm thời')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: 'Thử lại' });
    fireEvent.click(retryButton);

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Đã phục hồi thành công')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('AsyncBoundary render children khi không có lỗi', () => {
    render(
      <AsyncBoundary>
        <p>Async content loaded</p>
      </AsyncBoundary>,
    );
    expect(screen.getByText('Async content loaded')).toBeInTheDocument();
  });
});
