import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { listDrivers, type Driver } from '@/features/drivers';
import { listVehicles, type Vehicle } from '@/features/vehicles';
import { invalidateResource, normalizeError, queryKeys } from '@/shared/api';
import {
  openConfirmModal,
  openDetailModal,
  openFormModal,
  openNoticeModal,
  useFeedback,
} from '@/shared/feedback';
import {
  cancelOrder,
  createOrder,
  deleteOrderPermanent,
  downloadExitSlipBlob,
  issueExitSlip,
  listDockSessions,
  listOrders,
  reissueExitSlip,
  startDockSession,
  updateOrder,
  type CreateOrderInput,
  type DockSessionDetail,
  type UpdateOrderInput,
  type WarehouseOrder,
} from './api';
import { OrderDetail } from './components/OrderDetail';
import { OrderForm } from './components/OrderForm';
import { DockSessionModal } from './components/DockSessionModal';

export interface OrdersScreen {
  data: {
    rows: WarehouseOrder[];
    loaded: number | null;
    dockSessions: DockSessionDetail[];
    driversMap: Map<string, Driver>;
    vehiclesMap: Map<string, Vehicle>;
  };
  state: {
    loading: boolean;
    fetching: boolean;
    error: Error | null;
    search: string;
    canCreate: boolean;
    canUpdate: boolean;
    canCancel: boolean;
    canStartDock: boolean;
    canReadDock: boolean;
    canCaptureDock: boolean;
    canFinalizeDock: boolean;
    canIssueSlip: boolean;
    canReissueSlip: boolean;
    canReadSlip: boolean;
  };
  actions: {
    refresh: () => Promise<unknown>;
    setSearch: (value: string) => void;
    openCreate: () => void;
    openEdit: (order: WarehouseOrder) => void;
    confirmCancel: (order: WarehouseOrder) => void;
    confirmDelete?: (order: WarehouseOrder) => void;
    openDetail: (order: WarehouseOrder) => void;
    startDock: (order: WarehouseOrder) => Promise<void>;
    openDockModal: (inspectionId: string, initialSession?: DockSessionDetail) => void;
    issueSlip: (order: WarehouseOrder) => Promise<void>;
    reissueSlip: (order: WarehouseOrder) => Promise<void>;
    downloadSlip: (order: WarehouseOrder, artifactType: 'qr' | 'html' | 'pdf') => Promise<void>;
  };
}

export function useOrdersScreen(): OrdersScreen {
  const { principal, can } = useAuth();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const pid = principal?.id || 'anonymous';

  const canCreate = can('orders:create');
  const canUpdate = can('orders:update');
  const canCancel = can('orders:cancel');
  const canStartDock = can('dock:start');
  const canReadDock = can('dock:read');
  const canCaptureDock = can('dock:capture');
  const canFinalizeDock = can('dock:finalize');
  const canIssueSlip = can('exit-slips:issue');
  const canReissueSlip = can('exit-slips:reissue');
  const canReadSlip = can('exit-slips:read');

  const query = useQuery({
    queryKey: queryKeys.resource(pid, 'orders'),
    queryFn: ({ signal }) => listOrders(signal),
    enabled: !!principal && can('orders:read'),
    placeholderData: keepPreviousData,
  });

  const docksQuery = useQuery({
    queryKey: queryKeys.resource(pid, 'dock-sessions'),
    queryFn: ({ signal }) => listDockSessions(50, signal),
    enabled: !!principal && canReadDock,
    placeholderData: keepPreviousData,
  });

  const driversQuery = useQuery({
    queryKey: queryKeys.resource(pid, 'drivers'),
    queryFn: ({ signal }) => listDrivers(signal),
    enabled: !!principal && can('drivers:read'),
    placeholderData: keepPreviousData,
  });

  const vehiclesQuery = useQuery({
    queryKey: queryKeys.resource(pid, 'vehicles'),
    queryFn: ({ signal }) => listVehicles(signal),
    enabled: !!principal && can('vehicles:read'),
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
    const all = query.data || [];
    if (!term) return all;
    return all.filter((row) => {
      const driver = driversMap.get(row.assigned_driver_id);
      const vehicle = vehiclesMap.get(row.assigned_vehicle_id);
      return [
        row.order_id,
        row.status,
        row.dock_session_id,
        driver?.full_name,
        driver?.employee_code,
        vehicle?.plate_number,
      ].some((val) => val?.toLocaleLowerCase('vi').includes(term));
    });
  }, [query.data, driversMap, vehiclesMap, search]);

  const invalidateAll = async () => {
    await Promise.all([
      invalidateResource(queryClient, pid, 'orders'),
      canReadDock ? invalidateResource(queryClient, pid, 'dock-sessions') : Promise.resolve(),
    ]);
  };

  const openCreate = () => {
    openFormModal(feedback, {
      id: 'create-warehouse-order',
      title: 'Tạo đơn hàng xuất kho mới',
      description: 'Khởi tạo lệnh xuất kho, phân công tài xế, phương tiện và danh mục hàng hóa.',
      submitText: 'Tạo đơn hàng',
      renderForm: (modal) => (
        <OrderForm
          formId={modal.formId}
          drivers={driversQuery.data || []}
          vehicles={vehiclesQuery.data || []}
          onSubmitCreate={async (payload: CreateOrderInput) => {
            modal.setPending(true);
            try {
              const created = await createOrder(payload);
              modal.setPending(false);
              modal.close();
              openNoticeModal(feedback, {
                id: `order-created-${created.id}`,
                title: 'Tạo đơn hàng thành công',
                message: `Đã khởi tạo đơn hàng xuất kho ${created.order_id}.`,
                tone: 'success',
              });
              await invalidateAll();
            } catch (err) {
              modal.setPending(false);
              feedback.notify({
                id: `order-create-err-${Date.now()}`,
                title: 'Không thể tạo đơn hàng xuất kho',
                description: normalizeError(err).message,
                tone: 'error',
              });
            }
          }}
        />
      ),
    });
  };

  const openEdit = (order: WarehouseOrder) => {
    openFormModal(feedback, {
      id: `edit-warehouse-order-${order.id}`,
      title: `Cập nhật đơn hàng: ${order.order_id}`,
      description:
        'Điều chỉnh phân công tài xế, phương tiện, thời hạn hiệu lực hoặc danh mục hàng.',
      submitText: 'Lưu thay đổi',
      renderForm: (modal) => (
        <OrderForm
          formId={modal.formId}
          order={order}
          drivers={driversQuery.data || []}
          vehicles={vehiclesQuery.data || []}
          onSubmitUpdate={async (payload: UpdateOrderInput) => {
            modal.setPending(true);
            try {
              await updateOrder(order.order_id, payload);
              modal.setPending(false);
              modal.close();
              openNoticeModal(feedback, {
                id: `order-updated-${order.id}`,
                title: 'Cập nhật thành công',
                message: `Đã lưu thông tin mới cho đơn hàng ${order.order_id}.`,
                tone: 'success',
              });
              await invalidateAll();
            } catch (err) {
              modal.setPending(false);
              feedback.notify({
                id: `order-update-err-${order.id}-${Date.now()}`,
                title: 'Không thể cập nhật đơn hàng',
                description: normalizeError(err).message,
                tone: 'error',
              });
            }
          }}
        />
      ),
    });
  };

  const confirmCancel = (order: WarehouseOrder) => {
    openConfirmModal(feedback, {
      id: `cancel-order-${order.id}`,
      title: `Hủy đơn hàng ${order.order_id}?`,
      description:
        'Đơn hàng sau khi hủy sẽ không thể tiếp tục tạo phiên Dock hoặc cấp phiếu xuất kho.',
      message: `Xác nhận hủy đơn hàng xuất kho ${order.order_id}? Thao tác này sẽ chuyển trạng thái đơn sang CANCELLED.`,
      confirmText: 'Xác nhận hủy đơn',
      onConfirm: async () => {
        try {
          await cancelOrder(order.order_id);
          feedback.notify({
            id: `order-cancelled-${order.id}`,
            title: `Đã hủy đơn hàng ${order.order_id}`,
            tone: 'info',
          });
          await invalidateAll();
        } catch (err) {
          feedback.notify({
            id: `order-cancel-err-${order.id}`,
            title: 'Không thể hủy đơn hàng',
            description: normalizeError(err).message,
            tone: 'error',
          });
        }
      },
    });
  };

  const confirmDelete = (order: WarehouseOrder) => {
    openConfirmModal(feedback, {
      id: `delete-order-${order.id}`,
      title: `Xóa vĩnh viễn đơn hàng ${order.order_id}?`,
      description: 'Đơn hàng xuất kho sẽ bị xóa vĩnh viễn khỏi cơ sở dữ liệu.',
      confirmText: 'Xóa vĩnh viễn',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteOrderPermanent(order.order_id);
          feedback.notify({
            id: `order-deleted-${order.id}`,
            title: `Đã xóa đơn hàng ${order.order_id}`,
            tone: 'success',
          });
          await invalidateAll();
        } catch (err) {
          feedback.notify({
            id: `order-delete-err-${order.id}`,
            title: 'Không thể xóa đơn hàng',
            description: normalizeError(err).message,
            tone: 'error',
          });
        }
      },
    });
  };

  const openDockModal = (inspectionId: string, initialSession?: DockSessionDetail) => {
    openDetailModal(feedback, {
      id: `dock-session-modal-${inspectionId}`,
      title: `Phiên kiểm hàng tại Dock: ${inspectionId.slice(0, 8)}…`,
      description: 'Theo dõi ảnh chụp kiểm đếm hàng hóa, kết quả AI và chốt trạng thái Dock.',
      size: 'lg',
      renderContent: () => (
        <DockSessionModal
          inspectionId={inspectionId}
          initialSession={initialSession}
          canCapture={canCaptureDock}
          canFinalize={canFinalizeDock}
          onUpdated={invalidateAll}
        />
      ),
    });
  };

  const startDock = async (order: WarehouseOrder) => {
    try {
      const dock = await startDockSession(order.order_id);
      feedback.notify({
        id: `dock-started-${dock.id}`,
        title: `Đã mở phiên Dock cho đơn ${order.order_id}`,
        tone: 'success',
      });
      await invalidateAll();
      if (canReadDock) {
        openDockModal(dock.id);
      }
    } catch (err) {
      feedback.notify({
        id: `dock-start-err-${order.id}`,
        title: 'Không thể bắt đầu phiên Dock',
        description: normalizeError(err).message,
        tone: 'error',
      });
    }
  };

  const issueSlip = async (order: WarehouseOrder) => {
    try {
      const slip = await issueExitSlip(order.order_id);
      feedback.notify({
        id: `slip-issued-${order.id}-v${slip.slip_version}`,
        title: `Đã cấp phiếu xuất kho v${slip.slip_version} cho đơn ${order.order_id}`,
        tone: 'success',
      });
      await invalidateAll();
    } catch (err) {
      feedback.notify({
        id: `slip-issue-err-${order.id}`,
        title: 'Không thể cấp phiếu xuất kho',
        description: normalizeError(err).message,
        tone: 'error',
      });
    }
  };

  const reissueSlip = async (order: WarehouseOrder) => {
    try {
      const slip = await reissueExitSlip(order.order_id);
      feedback.notify({
        id: `slip-reissued-${order.id}-v${slip.slip_version}`,
        title: `Đã cấp lại phiếu xuất kho v${slip.slip_version} cho đơn ${order.order_id}`,
        tone: 'success',
      });
      await invalidateAll();
    } catch (err) {
      feedback.notify({
        id: `slip-reissue-err-${order.id}`,
        title: 'Không thể cấp lại phiếu xuất kho',
        description: normalizeError(err).message,
        tone: 'error',
      });
    }
  };

  const downloadSlip = async (order: WarehouseOrder, artifactType: 'qr' | 'html' | 'pdf') => {
    try {
      const blob = await downloadExitSlipBlob(order.order_id, artifactType);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const ext = artifactType === 'qr' ? 'png' : artifactType;
      link.download = `exit-slip-${order.order_id}-v${order.slip_version}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      feedback.notify({
        id: `slip-dl-${order.id}-${artifactType}`,
        title: `Đã tải tệp phiếu xuất kho (${artifactType.toUpperCase()})`,
        tone: 'info',
      });
    } catch (err) {
      feedback.notify({
        id: `slip-dl-err-${order.id}-${artifactType}`,
        title: 'Không thể tải tệp phiếu xuất kho',
        description: normalizeError(err).message,
        tone: 'error',
      });
    }
  };

  const openDetail = (order: WarehouseOrder) => {
    const driver = driversMap.get(order.assigned_driver_id);
    const vehicle = vehiclesMap.get(order.assigned_vehicle_id);
    openDetailModal(feedback, {
      id: `detail-order-${order.id}`,
      title: `Đơn hàng xuất kho: ${order.order_id}`,
      description: 'Chi tiết lịch trình, phiên làm việc dock và danh mục hàng hóa.',
      renderContent: () => (
        <OrderDetail
          order={order}
          driverLabel={driver ? driver.full_name : undefined}
          vehicleLabel={vehicle ? vehicle.plate_number : undefined}
          canStartDock={canStartDock}
          canReadDock={canReadDock}
          canIssueSlip={canIssueSlip}
          canReissueSlip={canReissueSlip}
          canReadSlip={canReadSlip}
          onStartDock={startDock}
          onInspectDock={(inspId) => openDockModal(inspId)}
          onIssueSlip={issueSlip}
          onReissueSlip={reissueSlip}
          onDownloadSlip={downloadSlip}
        />
      ),
    });
  };

  return {
    data: {
      rows,
      loaded: query.data?.length ?? null,
      dockSessions: docksQuery.data ?? [],
      driversMap,
      vehiclesMap,
    },
    state: {
      loading: query.isPending,
      fetching: query.isFetching || docksQuery.isFetching,
      error: query.error,
      search,
      canCreate,
      canUpdate,
      canCancel,
      canStartDock,
      canReadDock,
      canCaptureDock,
      canFinalizeDock,
      canIssueSlip,
      canReissueSlip,
      canReadSlip,
    },
    actions: {
      refresh: async () => {
        await Promise.all([
          query.refetch(),
          canReadDock ? docksQuery.refetch() : Promise.resolve(),
        ]);
      },
      setSearch,
      openCreate,
      openEdit,
      confirmCancel,
      confirmDelete,
      openDetail,
      startDock,
      openDockModal,
      issueSlip,
      reissueSlip,
      downloadSlip,
    },
  };
}
