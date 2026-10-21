import { createElement, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { queryKeys } from '@/shared/api';
import type { ListScreen } from '@/shared/api';
import { useFeedback } from '@/shared/feedback';
import { Button } from '@/shared/ui/Button';
import { listDrivers } from './api';
import type { Driver } from './api';
import { DriverForm } from './components/DriverForm';
import { DeactivateDriver } from './components/DeactivateDriver';

export interface DriversScreen extends ListScreen<Driver> {
  state: ListScreen<Driver>['state'] & {
    canCreate: boolean;
    canUpdate: boolean;
    canDeactivate: boolean;
  };
  actions: ListScreen<Driver>['actions'] & {
    create: () => void;
    edit: (driver: Driver) => void;
    deactivate: (driver: Driver) => void;
    remove: (driver: Driver) => void;
  };
}

export function useDriversScreen(): DriversScreen {
  const { principal, can } = useAuth();
  const feedback = useFeedback();
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: queryKeys.resource(principal?.id || 'anonymous', 'drivers'),
    queryFn: ({ signal }) => listDrivers(signal),
    enabled: !!principal && can('drivers:read'),
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(
    () =>
      (query.data || []).filter((row) =>
        [row.full_name, row.employee_code, row.phone].some((value) =>
          value?.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')),
        ),
      ),
    [query.data, search],
  );

  function openForm(driver?: Driver) {
    feedback.openModal({
      id: driver ? `edit-driver-${driver.id}` : 'create-driver',
      title: driver ? 'Cập nhật hồ sơ nhận diện' : 'Đăng ký hồ sơ nhận diện',
      description: driver
        ? `Cập nhật thông tin và mẫu khuôn mặt cho ${driver.full_name}.`
        : 'Đăng ký hồ sơ khuôn mặt mới cho người điều khiển phương tiện.',
      renderContent: (modal) => createElement(DriverForm, { modal, driver }),
      renderFooter: (modal) =>
        createElement(
          'div',
          { className: 'flex items-center gap-2' },
          createElement(Button, { disabled: modal.pending, onClick: modal.requestClose }, 'Hủy'),
          createElement(
            Button,
            {
              type: 'submit',
              form: modal.formId,
              variant: 'primary',
              pending: modal.pending,
              disabled: modal.submitBlocked,
            },
            driver ? 'Lưu cập nhật' : 'Đăng ký nhận diện',
          ),
        ),
    });
  }

  return {
    data: { rows, loaded: query.data?.length ?? null },
    state: {
      loading: query.isPending,
      fetching: query.isFetching,
      error: query.error,
      search,
      canCreate: can('drivers:create'),
      canUpdate: can('drivers:update'),
      canDeactivate: can('drivers:deactivate'),
    },
    actions: {
      refresh: query.refetch,
      setSearch,
      create: () => openForm(),
      edit: (driver: Driver) => openForm(driver),
      deactivate: (driver: Driver) => {
        feedback.openModal({
          id: `deactivate-driver-${driver.id}`,
          title: 'Ngừng hoạt động hồ sơ nhận diện?',
          size: 'sm',
          renderContent: (modal) =>
            createElement(DeactivateDriver, { driver, modal, mode: 'deactivate' }),
        });
      },
      remove: (driver: Driver) => {
        feedback.openModal({
          id: `delete-driver-${driver.id}`,
          title: 'Xóa vĩnh viễn hồ sơ nhận diện?',
          size: 'sm',
          renderContent: (modal) =>
            createElement(DeactivateDriver, { driver, modal, mode: 'delete' }),
        });
      },
    },
  };
}
