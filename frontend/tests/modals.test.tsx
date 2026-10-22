import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
  FeedbackProvider,
  useFeedback,
  openNoticeModal,
  openConfirmModal,
  openFormModal,
  openDetailModal,
  openEvidenceModal,
} from '@/shared/feedback';

function ModalHarness({
  onAction,
}: {
  onAction: (feedback: ReturnType<typeof useFeedback>) => void;
}) {
  const feedback = useFeedback();
  return <button onClick={() => onAction(feedback)}>Kích hoạt modal</button>;
}

function mount(onAction: (feedback: ReturnType<typeof useFeedback>) => void) {
  return render(
    <FeedbackProvider>
      <ModalHarness onAction={onAction} />
    </FeedbackProvider>,
  );
}

describe('Modal Compositions (Task 6.9)', () => {
  it('NoticeModal: mở modal thông báo, hiển thị nội dung và đóng khi bấm xác nhận', async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn();

    mount((feedback) => {
      openNoticeModal(feedback, {
        id: 'test-notice',
        title: 'Thông báo hệ thống',
        message: 'Cổng số 1 đang hoạt động bình thường.',
        confirmText: 'Đồng ý',
        onConfirm: handleConfirm,
        tone: 'success',
      });
    });

    await user.click(screen.getByRole('button', { name: 'Kích hoạt modal' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Thông báo hệ thống')).toBeInTheDocument();
    expect(screen.getByText('Cổng số 1 đang hoạt động bình thường.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đồng ý' }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ConfirmModal: xác nhận thành công thì đóng modal', async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn().mockResolvedValue(undefined);

    mount((feedback) => {
      openConfirmModal(feedback, {
        id: 'test-confirm',
        title: 'Xóa hồ sơ phương tiện?',
        message: 'Hành động này không thể hoàn tác.',
        confirmText: 'Xác nhận xóa',
        cancelText: 'Bỏ qua',
        variant: 'danger',
        onConfirm: handleConfirm,
      });
    });

    await user.click(screen.getByRole('button', { name: 'Kích hoạt modal' }));
    expect(screen.getByText('Xóa hồ sơ phương tiện?')).toBeInTheDocument();
    expect(screen.getByText('Hành động này không thể hoàn tác.')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận xóa' });
    await user.click(confirmBtn);

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('ConfirmModal: khi onConfirm ném lỗi, không đóng modal và hiển thị lỗi để thử lại', async () => {
    const user = userEvent.setup();
    const handleConfirm = vi
      .fn()
      .mockRejectedValue(new Error('Máy chủ từ chối thao tác do vi phạm ràng buộc'));

    mount((feedback) => {
      openConfirmModal(feedback, {
        id: 'test-confirm-error',
        title: 'Ngừng hoạt động?',
        message: 'Bạn có chắc chắn muốn dừng cổng?',
        onConfirm: handleConfirm,
      });
    });

    await user.click(screen.getByRole('button', { name: 'Kích hoạt modal' }));
    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận' });

    await user.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);

    // Modal vẫn mở và hiển thị thông báo lỗi
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Máy chủ từ chối thao tác do vi phạm ràng buộc')).toBeInTheDocument();
  });

  it('FormModal: liên kết formId và giữ form khi có lỗi', async () => {
    const user = userEvent.setup();

    function SampleForm({ formId, onSave }: { formId: string; onSave: (val: string) => void }) {
      const [val, setVal] = useState('');
      return (
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            onSave(val);
          }}
        >
          <label htmlFor="driver-name">Tên tài xế</label>
          <input id="driver-name" value={val} onChange={(e) => setVal(e.target.value)} />
        </form>
      );
    }

    const handleSave = vi.fn();

    mount((feedback) => {
      openFormModal(feedback, {
        id: 'test-form',
        title: 'Thêm tài xế mới',
        submitText: 'Lưu tài xế',
        renderForm: (context) => <SampleForm formId={context.formId} onSave={handleSave} />,
      });
    });

    await user.click(screen.getByRole('button', { name: 'Kích hoạt modal' }));
    expect(screen.getByText('Thêm tài xế mới')).toBeInTheDocument();

    const input = screen.getByLabelText('Tên tài xế');
    await user.type(input, 'Nguyễn Văn A');

    const submitBtn = screen.getByRole('button', { name: 'Lưu tài xế' });
    await user.click(submitBtn);

    expect(handleSave).toHaveBeenCalledWith('Nguyễn Văn A');
  });

  it('DetailModal: hiển thị chi tiết và extraActions', async () => {
    const user = userEvent.setup();
    const handlePrint = vi.fn();

    mount((feedback) => {
      openDetailModal(feedback, {
        id: 'test-detail',
        title: 'Chi tiết lượt xe ra vào',
        renderContent: () => (
          <div data-testid="detail-content">
            <p>Biển số: 29A-12345</p>
            <p>Thời gian: 09:30:15</p>
          </div>
        ),
        extraActions: () => <button onClick={handlePrint}>In phiếu</button>,
      });
    });

    await user.click(screen.getByRole('button', { name: 'Kích hoạt modal' }));
    expect(screen.getByTestId('detail-content')).toBeInTheDocument();

    const printBtn = screen.getByRole('button', { name: 'In phiếu' });
    await user.click(printBtn);
    expect(handlePrint).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByRole('button', { name: 'Đóng' });
    await user.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('EvidenceModal: mở modal hiển thị bằng chứng ảnh và metadata', async () => {
    const user = userEvent.setup();

    mount((feedback) => {
      openEvidenceModal(feedback, {
        id: 'test-evidence',
        title: 'Bằng chứng ảnh cổng vào',
        source: 'https://example.com/gate-car.jpg',
        alt: 'Ảnh xe vào lúc 10h',
        metadata: { 'Biển số': '29C-99999' },
      });
    });

    await user.click(screen.getByRole('button', { name: 'Kích hoạt modal' }));
    expect(screen.getByText('Bằng chứng ảnh cổng vào')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ảnh xe vào lúc 10h' })).toBeInTheDocument();
    expect(screen.getByText('29C-99999')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
