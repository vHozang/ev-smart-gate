import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { normalizeError, queryKeys } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import { useFeedback } from '@/shared/feedback';
import type { ModalContext } from '@/shared/feedback';
import { useAsyncScope } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { deactivateDriver, deleteDriverPermanent } from '../../api';
import type { Driver } from '../../api';

export interface DeactivateDriverProps {
  driver: Driver;
  modal: ModalContext;
  mode?: 'deactivate' | 'delete';
}

export function DeactivateDriver({ driver, modal, mode = 'deactivate' }: DeactivateDriverProps) {
  const beginScope = useAsyncScope();
  const { principal } = useAuth();
  const client = useQueryClient();
  const feedback = useFeedback();
  const [error, setError] = useState<ApiError | null>(null);
  const locked = useRef(false);

  async function submit() {
    if (locked.current || !principal) return;
    const isCurrent = beginScope();
    locked.current = true;
    modal.setPending(true);
    setError(null);
    try {
      if (mode === 'delete') {
        await deleteDriverPermanent(driver.id);
      } else {
        await deactivateDriver(driver.id);
      }
      if (!isCurrent()) return;
      await client.invalidateQueries({ queryKey: queryKeys.resource(principal.id, 'drivers') });
      if (!isCurrent()) return;
      modal.setPending(false);
      modal.close();
      feedback.notify({
        id: `${mode}-driver-${driver.id}`,
        title:
          mode === 'delete'
            ? 'Đã xóa vĩnh viễn hồ sơ nhận diện'
            : 'Đã ngừng hoạt động hồ sơ nhận diện',
        description: driver.full_name,
        tone: 'success',
      });
    } catch (cause) {
      if (isCurrent()) setError(normalizeError(cause));
    } finally {
      locked.current = false;
      modal.setPending(false);
    }
  }

  return (
    <div className="form-stack">
      <p>
        {mode === 'delete' ? (
          <>
            Hồ sơ nhận diện của <strong>{driver.full_name}</strong> sẽ bị xóa vĩnh viễn khỏi hệ
            thống. Thao tác này không thể hoàn tác.
          </>
        ) : (
          <>
            Hồ sơ nhận diện của <strong>{driver.full_name}</strong> sẽ được chuyển sang trạng thái
            ngừng hoạt động và không thể dùng để xác minh mở cổng.
          </>
        )}
      </p>
      {error && (
        <div role="alert" className="form-error">
          {error.message}
        </div>
      )}
      <div className="modal__actions">
        <Button onClick={modal.requestClose} disabled={modal.pending}>
          {mode === 'delete' ? 'Hủy' : 'Giữ hoạt động'}
        </Button>
        <Button variant="danger" onClick={() => void submit()} pending={modal.pending}>
          {mode === 'delete' ? 'Xóa vĩnh viễn' : 'Ngừng hoạt động'}
        </Button>
      </div>
    </div>
  );
}
