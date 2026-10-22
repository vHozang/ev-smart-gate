import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { listRoles } from '@/features/roles';
import { normalizeError, queryKeys } from '@/shared/api';
import { useFeedback, openDetailModal, openFormModal, openNoticeModal } from '@/shared/feedback';
import { Button } from '@/shared/ui/Button';
import type {
  AdminUser,
  UserCreateInput,
  UserProfilePatchInput,
  UserStatusChangeInput,
  UserRoleChangeInput,
  PasswordResetInput,
} from '../model/schema';
import {
  listUsers,
  createUser,
  updateUserProfile,
  changeUserStatus,
  changeUserRole,
  resetPassword,
} from '../api/users';
import { UserDetail } from '../components/UserDetail';
import { UserForm } from '../components/UserForm';
import { UserStatusModal } from '../components/UserStatusModal';
import { UserRoleModal } from '../components/UserRoleModal';
import { PasswordResetModal } from '../components/PasswordResetModal';

export interface UsersScreenData {
  rows: AdminUser[];
  total: number | null;
  hasMore: boolean;
  nextCursor: string | null;
  hasPrevCursor: boolean;
}

export interface UsersScreenState {
  search: string;
  roleFilter: string;
  statusFilter: string;
  unavailable: boolean;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  canCreate: boolean;
  canManage: boolean;
  canResetPassword: boolean;
}

export interface UsersScreenActions {
  setSearch: (v: string) => void;
  setRoleFilter: (v: string) => void;
  setStatusFilter: (v: string) => void;
  nextCursorPage: () => void;
  prevCursorPage: () => void;
  refresh: () => Promise<unknown>;
  openDetail: (user: AdminUser) => void;
  openCreate: () => void;
  openEdit: (user: AdminUser) => void;
  openChangeStatus: (user: AdminUser) => void;
  openChangeRole: (user: AdminUser) => void;
  openResetPassword: (user: AdminUser) => void;
}

export interface UsersScreen {
  data: UsersScreenData;
  state: UsersScreenState;
  actions: UsersScreenActions;
}

export function useUsersScreen(): UsersScreen {
  const { principal, can } = useAuth();
  const feedback = useFeedback();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);

  const usersQueryKey = queryKeys.resource(principal?.id || 'anonymous', 'admin:users', {
    cursor: cursor ?? null,
    role: roleFilter || null,
    is_active: statusFilter ? statusFilter === 'active' : null,
  });
  const rolesQueryKey = queryKeys.resource(principal?.id || 'anonymous', 'admin:roles');

  const query = useQuery({
    queryKey: usersQueryKey,
    queryFn: ({ signal }) =>
      listUsers(
        {
          cursor,
          limit: 50,
          role: roleFilter || undefined,
          is_active:
            statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
        },
        signal,
      ),
    enabled: Boolean(principal),
    placeholderData: keepPreviousData,
  });

  const rolesQuery = useQuery({
    queryKey: rolesQueryKey,
    queryFn: ({ signal }) => listRoles(signal),
    enabled: Boolean(principal && (can('roles:read') || can('users:manage-admin'))),
    retry: false,
  });

  const roleOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code: string; is_system?: boolean }>();
    for (const r of rolesQuery.data || []) {
      if (r.is_active === false) {
        continue;
      }
      map.set(r.id, {
        id: r.id,
        name: r.name,
        code: r.code,
        is_system: r.is_system,
      });
    }
    for (const item of query.data?.items || []) {
      if (!map.has(item.role_id)) {
        const isArchivedInCatalog = (rolesQuery.data || []).some(
          (r) => r.id === item.role_id && r.is_active === false,
        );
        if (!isArchivedInCatalog) {
          map.set(item.role_id, {
            id: item.role_id,
            name: item.role_code,
            code: item.role_code,
            is_system: ['ADMIN', 'WAREHOUSE', 'SECURITY'].includes(item.role_code),
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (Boolean(a.is_system) !== Boolean(b.is_system)) {
        return a.is_system ? -1 : 1;
      }
      return a.code.localeCompare(b.code);
    });
  }, [rolesQuery.data, query.data?.items]);

  const filteredRows = useMemo(() => {
    const rawItems = query.data?.items || [];
    return rawItems.filter((user) => {
      const matchSearch =
        !search.trim() ||
        user.username.toLowerCase().includes(search.trim().toLowerCase()) ||
        (user.display_name &&
          user.display_name.toLowerCase().includes(search.trim().toLowerCase()));

      const matchRole = !roleFilter || user.role_code === roleFilter;

      const matchStatus =
        !statusFilter ||
        (statusFilter === 'active' && user.is_active) ||
        (statusFilter === 'inactive' && !user.is_active);

      return matchSearch && matchRole && matchStatus;
    });
  }, [query.data?.items, search, roleFilter, statusFilter]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.resource(principal?.id || 'anonymous', 'admin:users'),
    });
  };

  const openDetail = (user: AdminUser) => {
    openDetailModal(feedback, {
      id: `user-detail-${user.id}`,
      title: `Hồ sơ tài khoản: ${user.username}`,
      description: 'Chi tiết thông tin đăng nhập, vai trò và phiên truy cập.',
      renderContent: () => <UserDetail user={user} onRefresh={invalidate} />,
    });
  };

  const openCreate = () => {
    openFormModal(feedback, {
      id: 'create-user-modal',
      title: 'Tạo tài khoản người dùng mới',
      description: 'Cấp tài khoản mới cho nhân viên vận hành hoặc bảo mật.',
      submitText: 'Tạo người dùng',
      renderForm: (modal) => (
        <UserForm
          formId={modal.formId}
          roles={roleOptions}
          onSubmit={async (data) => {
            modal.setPending(true);
            try {
              await createUser(data as UserCreateInput);
              modal.setPending(false);
              modal.close();
              openNoticeModal(feedback, {
                id: 'user-created',
                title: 'Tạo thành công',
                message: `Đã khởi tạo tài khoản ${(data as UserCreateInput).username}.`,
                tone: 'success',
              });
              await invalidate();
            } catch (err) {
              modal.setPending(false);
              const safe = normalizeError(err);
              feedback.notify({
                id: `user-create-err-${Date.now()}`,
                title: 'Không thể tạo tài khoản',
                description: safe.message,
                tone: 'error',
              });
            }
          }}
        />
      ),
    });
  };

  const openEdit = (user: AdminUser) => {
    openFormModal(feedback, {
      id: `modal-edit-user-${user.id}`,
      title: `Cập nhật hồ sơ: ${user.username}`,
      description: 'Sửa tên hiển thị hoặc cập nhật tên đăng nhập.',
      submitText: 'Lưu thay đổi',
      renderForm: (modal) => (
        <UserForm
          user={user}
          formId={modal.formId}
          onSubmit={async (data) => {
            modal.setPending(true);
            try {
              await updateUserProfile(user.id, data as UserProfilePatchInput);
              modal.setPending(false);
              modal.close();
              openNoticeModal(feedback, {
                id: 'user-updated',
                title: 'Cập nhật thành công',
                message: `Đã lưu hồ sơ mới cho tài khoản ${user.username}.`,
                tone: 'success',
              });
              await invalidate();
            } catch (err) {
              modal.setPending(false);
              const safe = normalizeError(err);
              feedback.notify({
                id: `user-edit-err-${user.id}-${Date.now()}`,
                title: 'Không thể cập nhật hồ sơ',
                description: safe.message,
                tone: 'error',
              });
            }
          }}
        />
      ),
    });
  };

  const openChangeStatus = (user: AdminUser) => {
    const formId = `status-user-${user.id}`;
    const nextText = user.is_active ? 'Vô hiệu hóa' : 'Kích hoạt lại';
    feedback.openModal({
      id: `modal-status-${user.id}`,
      title: `${nextText} tài khoản: ${user.username}`,
      size: 'sm',
      renderContent: (modal) => (
        <UserStatusModal
          user={user}
          formId={formId}
          onSubmit={async (data: UserStatusChangeInput) => {
            modal.setPending(true);
            try {
              await changeUserStatus(user.id, data);
              modal.setPending(false);
              modal.requestClose();
              openNoticeModal(feedback, {
                id: 'status-changed',
                title: 'Đổi trạng thái thành công',
                message: `Tài khoản ${user.username} đã được ${nextText.toLowerCase()}.`,
                tone: 'success',
              });
              await invalidate();
            } catch (err) {
              modal.setPending(false);
              const safe = normalizeError(err);
              feedback.notify({
                id: `user-status-err-${user.id}-${Date.now()}`,
                title: `Không thể ${nextText.toLowerCase()} tài khoản`,
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
            Bỏ qua
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={user.is_active ? 'danger' : 'primary'}
            pending={modal.pending}
          >
            {nextText}
          </Button>
        </>
      ),
    });
  };

  const openChangeRole = (user: AdminUser) => {
    const formId = `role-user-${user.id}`;
    feedback.openModal({
      id: `modal-role-${user.id}`,
      title: `Gán vai trò mới cho ${user.username}`,
      size: 'sm',
      renderContent: (modal) => (
        <UserRoleModal
          user={user}
          roles={roleOptions}
          formId={formId}
          onSubmit={async (data: UserRoleChangeInput) => {
            modal.setPending(true);
            try {
              await changeUserRole(user.id, data);
              modal.setPending(false);
              modal.close();
              openNoticeModal(feedback, {
                id: 'role-changed',
                title: 'Gán vai trò thành công',
                message: `Đã cập nhật vai trò cho người dùng ${user.username}.`,
                tone: 'success',
              });
              await invalidate();
            } catch (err) {
              modal.setPending(false);
              const safe = normalizeError(err);
              feedback.notify({
                id: `user-role-err-${user.id}-${Date.now()}`,
                title: 'Không thể gán vai trò mới',
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
            Lưu vai trò
          </Button>
        </>
      ),
    });
  };

  const openResetPassword = (user: AdminUser) => {
    const formId = `reset-password-user-${user.id}`;
    feedback.openModal({
      id: `modal-reset-pwd-${user.id}`,
      title: `Đặt lại mật khẩu: ${user.username}`,
      size: 'sm',
      renderContent: (modal) => (
        <PasswordResetModal
          user={user}
          formId={formId}
          onSubmit={async (data: PasswordResetInput) => {
            modal.setPending(true);
            try {
              await resetPassword(user.id, data);
              modal.setPending(false);
              modal.requestClose();
              openNoticeModal(feedback, {
                id: 'pwd-reset-success',
                title: 'Cấp mật khẩu thành công',
                message: `Mật khẩu tạm đã được cập nhật cho ${user.username}. Người dùng bắt buộc phải đổi mật khẩu ở lần đăng nhập tới.`,
                tone: 'success',
              });
              await invalidate();
            } catch (err) {
              modal.setPending(false);
              const safe = normalizeError(err);
              feedback.notify({
                id: `user-pwd-reset-err-${user.id}-${Date.now()}`,
                title: 'Không thể đặt lại mật khẩu',
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
          <Button type="submit" form={formId} variant="danger" pending={modal.pending}>
            Xác nhận cấp lại
          </Button>
        </>
      ),
    });
  };

  return {
    data: {
      rows: filteredRows,
      total: query.data?.total ?? filteredRows.length,
      hasMore: query.data?.has_more ?? false,
      nextCursor: query.data?.next_cursor ?? null,
      hasPrevCursor: cursorHistory.length > 0,
    },
    state: {
      search,
      roleFilter,
      statusFilter,
      unavailable: !principal,
      loading: Boolean(principal) && query.isPending,
      fetching: query.isFetching,
      error: query.error,
      canCreate: can('users:create') || can('users:manage-admin'),
      canManage: can('users:update') || can('users:manage-admin'),
      canResetPassword: can('users:reset-password') || can('users:manage-admin'),
    },
    actions: {
      setSearch,
      setRoleFilter: (v) => {
        setRoleFilter(v);
        setCursor(undefined);
        setCursorHistory([]);
      },
      setStatusFilter: (v) => {
        setStatusFilter(v);
        setCursor(undefined);
        setCursorHistory([]);
      },
      nextCursorPage: () => {
        if (query.data?.next_cursor) {
          setCursorHistory((prev) => [...prev, cursor]);
          setCursor(query.data.next_cursor);
        }
      },
      prevCursorPage: () => {
        setCursorHistory((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const prevCur = next.pop();
          setCursor(prevCur);
          return next;
        });
      },
      refresh: query.refetch,
      openDetail,
      openCreate,
      openEdit,
      openChangeStatus,
      openChangeRole,
      openResetPassword,
    },
  };
}
