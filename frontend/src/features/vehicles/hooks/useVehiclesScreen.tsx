import type { VehiclesScreen } from '../model/screen';
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { queryKeys } from '@/shared/api';
import { useFeedback } from '@/shared/feedback';
import { Button } from '@/shared/ui/Button';
import { listVehicles } from '../api/vehicles';
import { VehicleForm } from '../components/VehicleForm';
import { DeactivateVehicle } from '../components/DeactivateVehicle';
import type { Vehicle } from '../model/schema';
export function useVehiclesScreen(): VehiclesScreen {
  const { principal, can } = useAuth();
  const feedback = useFeedback();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: queryKeys.resource(principal?.id || 'anonymous', 'vehicles'),
    queryFn: ({ signal }) => listVehicles(signal),
    enabled: !!principal && can('vehicles:read'),
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(
    () =>
      (query.data || []).filter((row) =>
        [row.plate_number, row.vehicle_type, row.make, row.model].some((value) =>
          value?.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')),
        ),
      ),
    [query.data, search],
  );
  function openForm(vehicle?: Vehicle) {
    feedback.openModal({
      id: vehicle ? `edit-vehicle-${vehicle.id}` : 'create-vehicle',
      title: vehicle ? 'Chỉnh sửa phương tiện' : 'Thêm phương tiện',
      description: vehicle
        ? `Cập nhật hồ sơ ${vehicle.plate_number}.`
        : 'Đăng ký hồ sơ phương tiện mới.',
      renderContent: (modal) => <VehicleForm modal={modal} vehicle={vehicle} />,
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
            Lưu phương tiện
          </Button>
        </>
      ),
    });
  }
  return {
    data: { rows, loaded: query.data?.length ?? null },
    state: {
      search,
      loading: query.isPending,
      fetching: query.isFetching,
      error: query.error,
      canCreate: can('vehicles:create'),
      canUpdate: can('vehicles:update'),
      canDeactivate: can('vehicles:deactivate'),
    },
    actions: {
      setSearch,
      refresh: query.refetch,
      create: () => openForm(),
      edit: (vehicle: Vehicle) => openForm(vehicle),
      deactivate: (vehicle: Vehicle) =>
        feedback.openModal({
          id: `deactivate-${vehicle.id}`,
          title: 'Ngừng hoạt động phương tiện?',
          size: 'sm',
          renderContent: (modal) => <DeactivateVehicle vehicle={vehicle} modal={modal} />,
        }),
      remove: (vehicle: Vehicle) =>
        feedback.openModal({
          id: `delete-vehicle-${vehicle.id}`,
          title: 'Xóa vĩnh viễn phương tiện?',
          size: 'sm',
          renderContent: (modal) => (
            <DeactivateVehicle vehicle={vehicle} modal={modal} mode="delete" />
          ),
        }),
    },
  };
}
