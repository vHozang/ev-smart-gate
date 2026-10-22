import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { normalizeError, queryKeys } from '@/shared/api';
import {
  useFeedback,
  openConfirmModal,
  openDetailModal,
  openFormModal,
  openNoticeModal,
} from '@/shared/feedback';
import { Button } from '@/shared/ui/Button';
import type {
  RoleView,
  RoleCreateInput,
  RolePatchInput,
  PermissionReplaceInput,
  PermissionView,
} from '../model/schema';
import {
  listRoles,
  createRole,
  updateRole,
  archiveRole,
  replaceRolePermissions,
  listPermissionCatalog,
} from '../api/roles';
import { RoleDetail } from '../components/RoleDetail';
import { RoleForm } from '../components/RoleForm';
import { PermissionEditor } from '../components/PermissionEditor';

export interface RolesScreenData {
  rows: RoleView[];
  catalog: PermissionView[];
}

export interface RolesScreenState {
  search: string;
  unavailable: boolean;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  canManageRoles: boolean;
}

export interface RolesScreenActions {
  setSearch: (v: string) => void;
  refresh: () => Promise<unknown>;
  openDetail: (role: RoleView) => void;
  openCreate: () => void;
  openEdit?: (role: RoleView) => void;
  openArchive?: (role: RoleView) => void;
  openEditPermissions: (role: RoleView) => void;
}

export interface RolesScreen {
  data: RolesScreenData;
  state: RolesScreenState;
  actions: RolesScreenActions;
}

export function useRolesScreen(): RolesScreen {
  const { principal, can } = useAuth();
  const feedback = useFeedback();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');

  const rolesQueryKey = queryKeys.resource(principal?.id || 'anonymous', 'admin:roles');
  const catalogQueryKey = queryKeys.resource(principal?.id || 'anonymous', 'admin:permissions');

  const rolesQuery = useQuery({
    queryKey: rolesQueryKey,
    queryFn: ({ signal }) => listRoles(signal),
    enabled: Boolean(principal),
    placeholderData: keepPreviousData,
  });

  const catalogQuery = useQuery({
    queryKey: catalogQueryKey,
    queryFn: ({ signal }) => listPermissionCatalog(signal),
    enabled: Boolean(principal),
    placeholderData: keepPreviousData,
  });

  const filteredRoles = useMemo(() => {
    const list = rolesQuery.data || [];
    return list.filter((r) => {
      return (
        !search.trim() ||
        r.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        r.code.toLowerCase().includes(search.trim().toLowerCase())
      );
    });
  }, [rolesQuery.data, search]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: rolesQueryKey });
  };

  const openDetail = (role: RoleView) => {
    openDetailModal(feedback, {
      id: `role-detail-${role.id}`,
      title: `Chi tiết vai trò: ${role.name}`,
      description: 'Thông tin tập quyền và số lượng người dùng liên kết.',
      renderContent: () => <RoleDetail role={role} />,
    });
  };

  const openCreate = () => {
    openFormModal(feedback, {
      id: 'create-role-modal',
      title: 'Tạo vai trò tùy biến mới',
      description: 'Định nghĩa vai trò mới để phân quyền chuyên biệt cho nhân sự.',
      submitText: 'Tạo vai trò',
      renderForm: (modal) => (
        <RoleForm
          formId={modal.formId}
          onSubmit={async (data) => {
            modal.setPending(true);
            try {
              await createRole(data as RoleCreateInput);
              modal.setPending(false);
              modal.close();
              openNoticeModal(feedback, {
                id: 'role-created',
                title: 'Khởi tạo thành công',
                message: `Đã tạo vai trò ${(data as RoleCreateInput).name}. Bạn có thể tiến hành phân quyền ngay bây giờ.`,
                tone: 'success',
              });
              await invalidate();
            } catch (err) {
              modal.setPending(false);
              const safe = normalizeError(err);
              feedback.notify({
                id: `role-create-err-${Date.now()}`,
                title: 'Không thể tạo vai trò',
                description: safe.message,
                tone: 'error',
              });
            }
          }}
        />
      ),
    });
  };

  const openEdit = (role: RoleView) => {
    openFormModal(feedback, {
      id: `edit-role-${role.id}`,
      title: `Cập nhật vai trò: ${role.name}`,
      description: `Phiên bản hiện tại: v${role.version} · Mã vai trò: ${role.code}`,
      submitText: 'Lưu thay đổi',
      renderForm: (modal) => (
        <RoleForm
          formId={modal.formId}
          role={role}
          onSubmit={async () => undefined}
          onSubmitPatch={async (data: RolePatchInput) => {
            modal.setPending(true);
            try {
              await updateRole(role.id, data);
              modal.setPending(false);
              modal.close();
              openNoticeModal(feedback, {
                id: `role-updated-${role.id}`,
                title: 'Cập nhật vai trò thành công',
                message: `Đã cập nhật vai trò ${data.name ?? role.name} (v${role.version + 1}).`,
                tone: 'success',
              });
              await invalidate();
            } catch (err) {
              modal.setPending(false);
              const safe = normalizeError(err);
              feedback.notify({
                id: `role-edit-err-${role.id}-${Date.now()}`,
                title: 'Không thể cập nhật vai trò',
                description: safe.message,
                tone: 'error',
              });
            }
          }}
        />
      ),
    });
  };

  const openArchive = (role: RoleView) => {
    openConfirmModal(feedback, {
      id: `archive-role-${role.id}`,
      title: `Xóa / Lưu trữ vai trò: ${role.name}?`,
      description: `Xác nhận ngừng hoạt động và lưu trữ vai trò tùy biến ${role.code}.`,
      confirmText: 'Xác nhận xóa / lưu trữ',
      danger: true,
      onConfirm: async () => {
        try {
          await archiveRole(role.id, {
            expected_version: role.version,
            reason: `Lưu trữ vai trò ${role.code} theo thao tác quản trị`,
          });
          feedback.notify({
            id: `role-archived-${role.id}`,
            title: `Đã lưu trữ vai trò ${role.name}`,
            tone: 'success',
          });
          await invalidate();
        } catch (err) {
          feedback.notify({
            id: `role-archive-err-${role.id}`,
            title: 'Không thể xóa / lưu trữ vai trò',
            description: normalizeError(err).message,
            tone: 'error',
          });
        }
      },
    });
  };

  const openEditPermissions = (role: RoleView) => {
    const formId = `edit-perms-${role.id}`;
    feedback.openModal({
      id: `modal-edit-perms-${role.id}`,
      title: `Biên tập phân quyền: ${role.name}`,
      size: 'lg',
      renderContent: (modal) => (
        <PermissionEditor
          role={role}
          catalog={catalogQuery.data || []}
          formId={formId}
          onSubmit={async (data: PermissionReplaceInput) => {
            modal.setPending(true);
            try {
              await replaceRolePermissions(role.id, data);
              modal.setPending(false);
              modal.close();
              openNoticeModal(feedback, {
                id: 'perms-updated',
                title: 'Cập nhật phân quyền thành công',
                message: `Đã thay thế toàn bộ tập quyền cho vai trò ${role.name} (v${role.version + 1}).`,
                tone: 'success',
              });
              await invalidate();
            } catch (err) {
              modal.setPending(false);
              const safe = normalizeError(err);
              feedback.notify({
                id: `role-perms-err-${role.id}-${Date.now()}`,
                title: 'Không thể cập nhật phân quyền',
                description: safe.message,
                tone: 'error',
              });
            }
          }}
        />
      ),
      renderFooter: (modal) => (
        <>
          <Button disabled={modal.pending} onClick={modal.requestClose}>
            Hủy
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={modal.pending}>
            Lưu thay đổi phân quyền
          </Button>
        </>
      ),
    });
  };

  return {
    data: {
      rows: filteredRoles,
      catalog: catalogQuery.data || [],
    },
    state: {
      search,
      unavailable: !principal,
      loading: Boolean(principal) && rolesQuery.isPending,
      fetching: rolesQuery.isFetching,
      error: rolesQuery.error,
      canManageRoles: can('users:manage-admin') || can('roles:manage'),
    },
    actions: {
      setSearch,
      refresh: rolesQuery.refetch,
      openDetail,
      openCreate,
      openEdit,
      openArchive,
      openEditPermissions,
    },
  };
}
