import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { FeedbackProvider, useFeedback } from '@/shared/feedback';
import type { ModalContext } from '@/shared/feedback';
function Editable({ modal }: { modal: ModalContext }) {
  const [text, setText] = useState('');
  return (
    <>
      <label htmlFor="draft">Biển số</label>
      <input
        id="draft"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          modal.setDirty(true);
        }}
      />
      <button onClick={() => modal.setPending(true)}>Bắt đầu lưu</button>
      <button onClick={() => modal.setPending(false)}>Nhận phản hồi</button>
    </>
  );
}
function Harness() {
  const feedback = useFeedback();
  return (
    <>
      <button
        onClick={() =>
          feedback.openModal({
            id: 'edit',
            title: 'Chỉnh sửa phương tiện',
            description: 'Thông tin phương tiện',
            renderContent: (modal) => <Editable modal={modal} />,
          })
        }
      >
        Mở form
      </button>
      <button
        onClick={() =>
          feedback.notify({
            id: 'same-operation',
            title: 'Đã lưu hồ sơ',
            tone: 'success',
            duration: 5000,
          })
        }
      >
        Thông báo
      </button>
    </>
  );
}
function mount() {
  render(
    <FeedbackProvider>
      <Harness />
    </FeedbackProvider>,
  );
}
afterEach(() => vi.useRealTimers());
describe('Modal host chung', () => {
  it('chỉ mở một modal, Escape đóng và trả focus về trigger', async () => {
    const user = userEvent.setup();
    mount();
    const trigger = screen.getByRole('button', { name: 'Mở form' });
    await user.dblClick(trigger);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it('giữ input và hỏi trước khi bỏ thay đổi', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByText('Mở form'));
    await user.type(screen.getByLabelText('Biển số'), '59T1');
    await user.keyboard('{Escape}');
    expect(screen.getByText('Bỏ các thay đổi chưa lưu?')).toBeInTheDocument();
    await user.click(screen.getByText('Tiếp tục chỉnh sửa'));
    expect(screen.getByLabelText('Biển số')).toHaveValue('59T1');
    await user.keyboard('{Escape}');
    await user.click(screen.getByText('Bỏ thay đổi'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('không đóng khi mutation pending, cho biết lý do', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByText('Mở form'));
    await user.click(screen.getByText('Bắt đầu lưu'));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText('Thao tác đang được xử lý. Vui lòng chờ phản hồi.'),
    ).toBeInTheDocument();
    await user.click(screen.getByText('Nhận phản hồi'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('trap focus trong modal', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByText('Mở form'));
    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 9; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });
});
describe('Toast thống nhất', () => {
  it('dedupe theo operation và không cướp focus', async () => {
    const user = userEvent.setup();
    mount();
    const button = screen.getByText('Thông báo');
    await user.dblClick(button);
    expect(screen.getAllByText('Đã lưu hồ sơ')).toHaveLength(1);
    expect(button).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Đóng thông báo Đã lưu hồ sơ' }));
    expect(screen.queryByText('Đã lưu hồ sơ')).not.toBeInTheDocument();
  });
  it('pause khi hover, tiếp tục đúng thời gian còn lại', async () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByText('Thông báo'));
    const toast = screen.getByText('Đã lưu hồ sơ').closest('.toast');
    expect(toast).not.toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    fireEvent.mouseEnter(toast!);
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(screen.getByText('Đã lưu hồ sơ')).toBeInTheDocument();
    fireEvent.mouseLeave(toast!);
    await act(() => vi.advanceTimersByTimeAsync(3100));
    expect(within(screen.getByRole('status')).queryByText('Đã lưu hồ sơ')).not.toBeInTheDocument();
  });
});

describe('Lifecycle modal không vượt phiên mới', () => {
  it('callback modal cũ không đóng hoặc gỡ pending của modal mới sau cleanup', async () => {
    let controller: ReturnType<typeof useFeedback> | undefined;
    let oldContext: ModalContext | undefined;
    function Capture() {
      controller = useFeedback();
      return (
        <button
          onClick={() =>
            controller?.openModal({
              id: 'old',
              title: 'Phiên cũ',
              renderContent: (modal) => {
                oldContext = modal;
                return <p>Nội dung cũ</p>;
              },
            })
          }
        >
          Mở phiên cũ
        </button>
      );
    }
    render(
      <FeedbackProvider>
        <Capture />
      </FeedbackProvider>,
    );
    await userEvent.click(screen.getByText('Mở phiên cũ'));
    act(() => {
      controller?.reset();
      controller?.openModal({
        id: 'new',
        title: 'Phiên mới',
        renderContent: (modal) => (
          <button onClick={() => modal.setPending(true)}>Lưu phiên mới</button>
        ),
      });
    });
    await userEvent.click(screen.getByText('Lưu phiên mới'));
    act(() => {
      oldContext?.setPending(false);
      oldContext?.close();
    });
    expect(screen.getByRole('dialog', { name: 'Phiên mới' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(
      screen.getByText('Thao tác đang được xử lý. Vui lòng chờ phản hồi.'),
    ).toBeInTheDocument();
  });
});
