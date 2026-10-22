import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { normalizeError, queryKeys } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import { useFeedback } from '@/shared/feedback';
import type { ModalContext } from '@/shared/feedback';
import { useAsyncScope } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { revokeAuthorization, deleteAuthorizationPermanent } from '../../api';
import type { DriverVehicleAuthorization } from '../../api';

export interface RevokeAuthorizationProps {
  authorization: DriverVehicleAuthorization;
  driverLabel: string;
  vehicleLabel: string;
  modal: ModalContext;
  mode?: 'revoke' | 'delete';
}

export function RevokeAuthorization({
  authorization,
  driverLabel,
  vehicleLabel,
  modal,
  mode = 'revoke',
}: RevokeAuthorizationProps) {
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
        await deleteAuthorizationPermanent(authorization.id);
      } else {
        await revokeAuthorization(authorization.driver_id, authorization.vehicle_id);
      }
      if (!isCurrent()) return;
      await client.invalidateQueries({
        queryKey: queryKeys.resource(principal.id, 'authorizations'),
      });
      if (!isCurrent()) return;
      modal.setPending(false);
      modal.close();
      feedback.notify({
        id: `${mode}-authz-${authorization.id}`,
        title:
          mode === 'delete'
            ? 'Đã xóa bản ghi ủy quyền điều khiển xe'
            : 'Đã thu hồi ủy quyền điều khiển xe',
        description: `${driverLabel} → ${vehicleLabel}`,
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
            Xóa vĩnh viễn bản ghi ủy quyền giữa <strong>{driverLabel}</strong> và phương tiện{' '}
            <strong>{vehicleLabel}</strong>?
          </>
        ) : (
          <>
            Thu hồi ủy quyền điều khiển giữa người điều khiển <strong>{driverLabel}</strong> và
            phương tiện <strong>{vehicleLabel}</strong>?
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
          {mode === 'delete' ? 'Hủy' : 'Giữ ủy quyền'}
        </Button>
        <Button variant="danger" onClick={() => void submit()} pending={modal.pending}>
          {mode === 'delete' ? 'Xóa vĩnh viễn' : 'Xác nhận thu hồi'}
        </Button>
      </div>
    </div>
  );
}
