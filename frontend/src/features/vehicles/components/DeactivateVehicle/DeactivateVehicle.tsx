import { useAsyncScope } from '@/shared/hooks';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/shared/ui/Button';
import { normalizeError, queryKeys } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import { useFeedback } from '@/shared/feedback';
import type { ModalContext } from '@/shared/feedback';
import { useAuth } from '@/features/auth';
import { deactivateVehicle, deleteVehiclePermanent } from '../../api/vehicles';
import type { Vehicle } from '../../model/schema';
export interface DeactivateVehicleProps {
  vehicle: Vehicle;
  modal: ModalContext;
  mode?: 'deactivate' | 'delete';
}
export function DeactivateVehicle({
  vehicle,
  modal,
  mode = 'deactivate',
}: DeactivateVehicleProps) {
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
        await deleteVehiclePermanent(vehicle.id);
      } else {
        await deactivateVehicle(vehicle.id);
      }
      if (!isCurrent()) return;
      await client.invalidateQueries({ queryKey: queryKeys.resource(principal.id, 'vehicles') });
      if (!isCurrent()) return;
      modal.setPending(false);
      modal.close();
      feedback.notify({
        id: `${mode}-${vehicle.id}`,
        title:
          mode === 'delete'
            ? 'Đã xóa phương tiện khỏi hệ thống'
            : 'Đã ngừng hoạt động phương tiện',
        description: vehicle.plate_number,
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
            Phương tiện <strong>{vehicle.plate_number}</strong> sẽ bị xóa vĩnh viễn khỏi cơ sở dữ
            liệu.
          </>
        ) : (
          <>
            Phương tiện <strong>{vehicle.plate_number}</strong> sẽ được chuyển sang trạng thái ngừng
            hoạt động. Hồ sơ vẫn được giữ lại.
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
