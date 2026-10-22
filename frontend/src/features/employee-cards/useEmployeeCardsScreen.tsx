import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { listDrivers } from '@/features/drivers';
import type { Driver } from '@/features/drivers';
import { queryKeys } from '@/shared/api';
import { useFeedback } from '@/shared/feedback';
import { Button } from '@/shared/ui/Button';
import { listEmployeeCards } from './api';
import type { EmployeeCard } from './api';
import { CardIssueForm } from './components/CardIssueForm';
import { CardActionModal } from './components/CardActionModal';
import type { CardLifecycleAction } from './components/CardActionModal';

export interface EmployeeCardsScreen {
  data: {
    rows: EmployeeCard[];
    loaded: number | null;
    driversMap: Map<string, Driver>;
  };
  state: {
    search: string;
    driverFilter: string;
    loading: boolean;
    fetching: boolean;
    error: Error | null;
    canIssue: boolean;
    canBlock: boolean;
    canReportLost: boolean;
    canReplace: boolean;
  };
  actions: {
    setSearch: (value: string) => void;
    setDriverFilter: (value: string) => void;
    refresh: () => Promise<unknown>;
    issue: () => void;
    runLifecycleAction: (card: EmployeeCard, action: CardLifecycleAction) => void;
  };
}

export interface UseEmployeeCardsScreenOptions {
  enabled?: boolean;
}

export function useEmployeeCardsScreen(
  options?: UseEmployeeCardsScreenOptions,
): EmployeeCardsScreen {
  const { principal, can } = useAuth();
  const feedback = useFeedback();
  const [search, setSearch] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const pid = principal?.id || 'anonymous';
  const isEnabled = options?.enabled ?? true;

  const cardsQuery = useQuery({
    queryKey: [...queryKeys.resource(pid, 'employee-cards'), { driver_id: driverFilter || null }],
    queryFn: ({ signal }) =>
      listEmployeeCards(driverFilter ? { driver_id: driverFilter } : undefined, signal),
    enabled: isEnabled && !!principal && can('employee-cards:read'),
    placeholderData: keepPreviousData,
  });

  const driversQuery = useQuery({
    queryKey: queryKeys.resource(pid, 'drivers'),
    queryFn: ({ signal }) => listDrivers(signal),
    enabled: isEnabled && !!principal && can('drivers:read'),
    placeholderData: keepPreviousData,
  });

  const driversMap = useMemo(() => {
    const map = new Map<string, Driver>();
    for (const d of driversQuery.data || []) {
      map.set(d.id, d);
    }
    return map;
  }, [driversQuery.data]);

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi');
    const all = cardsQuery.data || [];
    if (!term) return all;
    return all.filter((card) => {
      const driver = driversMap.get(card.driver_id);
      return [
        card.card_uid_masked,
        card.status,
        card.status_reason,
        driver?.full_name,
        driver?.employee_code,
      ].some((val) => val?.toLocaleLowerCase('vi').includes(term));
    });
  }, [cardsQuery.data, driversMap, search]);

  function openIssueModal() {
    const driverItems = (driversQuery.data || []).map((d) => ({
      id: d.id,
      label: d.employee_code ? `${d.full_name} (${d.employee_code})` : d.full_name,
    }));

    feedback.openModal({
      id: 'issue-employee-card',
      title: 'Phát hành thẻ nhân viên (RFID)',
      description: 'Liên kết thẻ vật lý với hồ sơ tài xế để định danh tại cổng ra/vào.',
      renderContent: (modal) => <CardIssueForm modal={modal} drivers={driverItems} />,
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
            Phát hành thẻ
          </Button>
        </>
      ),
    });
  }

  function runLifecycleAction(card: EmployeeCard, action: CardLifecycleAction) {
    const driver = driversMap.get(card.driver_id);
    const driverLabel = driver
      ? driver.employee_code
        ? `${driver.full_name} (${driver.employee_code})`
        : driver.full_name
      : card.driver_id;

    const titles: Record<CardLifecycleAction, string> = {
      block: 'Khóa thẻ nhân viên',
      'report-lost': 'Báo mất thẻ nhân viên',
      replace: 'Thay thế thẻ nhân viên',
      edit: 'Cập nhật thẻ nhân viên',
      delete: 'Xóa thẻ nhân viên',
    };

    feedback.openModal({
      id: `card-${action}-${card.id}`,
      title: titles[action],
      size: 'sm',
      renderContent: (modal) => (
        <CardActionModal card={card} driverLabel={driverLabel} action={action} modal={modal} />
      ),
    });
  }

  return {
    data: {
      rows,
      loaded: cardsQuery.data?.length ?? null,
      driversMap,
    },
    state: {
      search,
      driverFilter,
      loading: cardsQuery.isPending,
      fetching: cardsQuery.isFetching,
      error: cardsQuery.error,
      canIssue: can('employee-cards:issue'),
      canBlock: can('employee-cards:block'),
      canReportLost: can('employee-cards:report-lost'),
      canReplace: can('employee-cards:replace'),
    },
    actions: {
      setSearch,
      setDriverFilter,
      refresh: cardsQuery.refetch,
      issue: openIssueModal,
      runLifecycleAction,
    },
  };
}
