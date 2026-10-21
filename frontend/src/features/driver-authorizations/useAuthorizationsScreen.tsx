import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { listDrivers } from '@/features/drivers';
import type { Driver } from '@/features/drivers';
import { listVehicles } from '@/features/vehicles';
import type { Vehicle } from '@/features/vehicles';
import { queryKeys } from '@/shared/api';
import { useFeedback } from '@/shared/feedback';
import { Button } from '@/shared/ui/Button';
import { listAuthorizations } from './api';
import type { DriverVehicleAuthorization } from './api';
import { AuthorizationForm } from './components/AuthorizationForm';
import { RevokeAuthorization } from './components/RevokeAuthorization';

export interface AuthorizationsScreen {
  data: {
    rows: DriverVehicleAuthorization[];
    loaded: number | null;
    driversMap: Map<string, Driver>;
    vehiclesMap: Map<string, Vehicle>;
  };
  state: {
    search: string;
    loading: boolean;
    fetching: boolean;
    error: Error | null;
    canCreate: boolean;
    canRevoke: boolean;
  };
  actions: {
    setSearch: (value: string) => void;
    refresh: () => Promise<unknown>;
    create: () => void;
    edit?: (authorization: DriverVehicleAuthorization) => void;
    revoke: (authorization: DriverVehicleAuthorization) => void;
    remove?: (authorization: DriverVehicleAuthorization) => void;
  };
}

export interface UseAuthorizationsScreenOptions {
  enabled?: boolean;
}

export function useAuthorizationsScreen(
  options?: UseAuthorizationsScreenOptions,
): AuthorizationsScreen {
  const { principal, can } = useAuth();
  const feedback = useFeedback();
  const [search, setSearch] = useState('');
  const pid = principal?.id || 'anonymous';
  const isEnabled = options?.enabled ?? true;

  const authQuery = useQuery({
    queryKey: queryKeys.resource(pid, 'authorizations'),
    queryFn: ({ signal }) => listAuthorizations(signal),
    enabled: isEnabled && !!principal && can('driver-vehicle-authorizations:read'),
    placeholderData: keepPreviousData,
  });

  const driversQuery = useQuery({
    queryKey: queryKeys.resource(pid, 'drivers'),
    queryFn: ({ signal }) => listDrivers(signal),
    enabled: isEnabled && !!principal && can('drivers:read'),
    placeholderData: keepPreviousData,
  });

  const vehiclesQuery = useQuery({
    queryKey: queryKeys.resource(pid, 'vehicles'),
    queryFn: ({ signal }) => listVehicles(signal),
    enabled: isEnabled && !!principal && can('vehicles:read'),
    placeholderData: keepPreviousData,
  });

  const driversMap = useMemo(() => {
    const map = new Map<string, Driver>();
    for (const d of driversQuery.data || []) {
      map.set(d.id, d);
    }
    return map;
  }, [driversQuery.data]);

  const vehiclesMap = useMemo(() => {
    const map = new Map<string, Vehicle>();
    for (const v of vehiclesQuery.data || []) {
      map.set(v.id, v);
    }
    return map;
  }, [vehiclesQuery.data]);

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi');
    const all = authQuery.data || [];
    if (!term) return all;
    return all.filter((item) => {
      const driver = driversMap.get(item.driver_id);
      const vehicle = vehiclesMap.get(item.vehicle_id);
      return [
        item.driver_id,
        item.vehicle_id,
        item.status,
        driver?.full_name,
        driver?.employee_code,
        vehicle?.plate_number,
        vehicle?.vehicle_type,
      ].some((val) => val?.toLocaleLowerCase('vi').includes(term));
    });
  }, [authQuery.data, driversMap, vehiclesMap, search]);

  function openCreateModal(authorization?: DriverVehicleAuthorization) {
    const driverItems = (driversQuery.data || []).map((d) => ({
      id: d.id,
      label: d.employee_code ? `${d.full_name} (${d.employee_code})` : d.full_name,
    }));
    const vehicleItems = (vehiclesQuery.data || []).map((v) => ({
      id: v.id,
      label: `${v.plate_number} (${v.vehicle_type})`,
    }));

    feedback.openModal({
      id: authorization
        ? `edit-driver-authorization-${authorization.id}`
        : 'create-driver-authorization',
      title: authorization
        ? 'Cập nhật ủy quyền Tài xế – Phương tiện'
        : 'Cấp quyền Tài xế – Phương tiện',
      description: 'Thiết lập liên kết ủy quyền vận hành giữa hồ sơ tài xế và phương tiện.',
      renderContent: (modal) => (
        <AuthorizationForm
          modal={modal}
          drivers={driverItems}
          vehicles={vehicleItems}
          authorization={authorization}
        />
      ),
      renderFooter: (modal) => (
        <>
          <Button disabled={modal.pending} onClick={modal.requestClose}>
            Hủy
          </Button>
          <Button
            type="submit"
            form={modal.formId}
            variant="primary"
            pending={modal.pending}
            disabled={modal.submitBlocked}
          >
            {authorization ? 'Lưu thay đổi' : 'Cấp quyền'}
          </Button>
        </>
      ),
    });
  }

  function openRevokeModal(
    authorization: DriverVehicleAuthorization,
    mode: 'revoke' | 'delete' = 'revoke',
  ) {
    const driver = driversMap.get(authorization.driver_id);
    const vehicle = vehiclesMap.get(authorization.vehicle_id);
    const driverLabel = driver
      ? driver.employee_code
        ? `${driver.full_name} (${driver.employee_code})`
        : driver.full_name
      : authorization.driver_id;
    const vehicleLabel = vehicle ? vehicle.plate_number : authorization.vehicle_id;

    feedback.openModal({
      id: `${mode}-authorization-${authorization.id}`,
      title: mode === 'delete' ? 'Xóa vĩnh viễn ủy quyền?' : 'Thu hồi quyền vận hành?',
      size: 'sm',
      renderContent: (modal) => (
        <RevokeAuthorization
          authorization={authorization}
          driverLabel={driverLabel}
          vehicleLabel={vehicleLabel}
          modal={modal}
          mode={mode}
        />
      ),
    });
  }

  return {
    data: {
      rows,
      loaded: authQuery.data?.length ?? null,
      driversMap,
      vehiclesMap,
    },
    state: {
      search,
      loading: authQuery.isPending,
      fetching: authQuery.isFetching,
      error: authQuery.error,
      canCreate: can('driver-vehicle-authorizations:create'),
      canRevoke: can('driver-vehicle-authorizations:revoke'),
    },
    actions: {
      setSearch,
      refresh: authQuery.refetch,
      create: () => openCreateModal(),
      edit: (authorization: DriverVehicleAuthorization) => openCreateModal(authorization),
      revoke: (authorization: DriverVehicleAuthorization) => openRevokeModal(authorization, 'revoke'),
      remove: (authorization: DriverVehicleAuthorization) => openRevokeModal(authorization, 'delete'),
    },
  };
}
