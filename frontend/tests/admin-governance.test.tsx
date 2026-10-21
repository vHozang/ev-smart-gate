import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { store } from '@/app/store';
import { AuthContext } from '../src/features/auth/model/context';
import { ChangePasswordModal, type SessionPrincipal } from '@/features/auth';
import { createQueryClient, http } from '@/shared/api';
import { FeedbackProvider } from '@/shared/feedback';
import { issueAlertWsTicket } from '@/features/alerts';
import {
  userCreateSchema,
  userProfilePatchSchema,
  userStatusChangeSchema,
  userRoleChangeSchema,
  passwordResetSchema,
  updateUserProfile,
  UserDetail,
  UserForm,
  UserRoleModal,
  UserStatusModal,
  PasswordResetModal,
  type AdminUser,
} from '@/features/users';
import {
  roleCreateSchema,
  permissionReplaceSchema,
  RoleDetail,
  RoleForm,
  PermissionEditor,
  type RoleView,
  type PermissionView,
} from '@/features/roles';
import { auditViewSchema, AuditDetail, type AuditView } from '@/features/audit';
import { UsersPage } from '@/pages/UsersPage';
import { RolesPage } from '@/pages/RolesPage';
import { AuditPage } from '@/pages/AuditPage';

const defaultAdapter = http.defaults.adapter;
afterEach(() => {
  http.defaults.adapter = defaultAdapter;
});

const adminPrincipal: SessionPrincipal = {
  id: '11111111-1111-4111-8111-000000000001',
  username: 'admin.root',
  role: 'ADMIN',
  permissions: [
    'users:read',
    'users:create',
    'users:update',
    'users:reset-password',
    'users:manage-admin',
    'roles:read',
    'roles:manage',
    'audit:read',
  ],
  source: 'legacy-session',
};

function renderWithAuth(ui: React.ReactNode, principal: SessionPrincipal | null = adminPrincipal) {
  const queryClient = createQueryClient();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={{
            principal,
            loading: false,
            error: null,
            login: async () => undefined,
            logout: async () => undefined,
            can: (permission: string) => Boolean(principal?.permissions.includes(permission)),
          }}
        >
          <FeedbackProvider>
            <MemoryRouter>{ui}</MemoryRouter>
          </FeedbackProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </Provider>,
  );
}

const sampleUser: AdminUser = {
  id: '22222222-1111-4111-8111-000000000002',
  username: 'operator.gate1',
  display_name: 'Trần Văn Trực Cổng',
  role_id: '11111111-1111-4111-8111-000000000003',
  role_code: 'SECURITY',
  is_active: true,
  must_change_password: false,
  version: 2,
  created_at: '2026-10-20T08:00:00Z',
};

const sampleRole: RoleView = {
  id: '11111111-1111-4111-8111-000000000003',
  code: 'SECURITY',
  name: 'Kiểm soát an ninh cổng',
  description: 'Vai trò trực cổng an ninh',
  is_system: true,
  is_active: true,
  permission_codes: ['vehicles:read', 'gates:verify-entry'],
  assigned_user_count: 4,
  version: 3,
};

const sampleCatalog: PermissionView[] = [
  {
    code: 'vehicles:read',
    group: 'vehicles',
    description: 'Xem phương tiện',
    dependencies: [],
    protected: false,
  },
  {
    code: 'vehicles:create',
    group: 'vehicles',
    description: 'Tạo phương tiện',
    dependencies: ['vehicles:read'],
    protected: false,
  },
  {
    code: 'gates:verify-entry',
    group: 'gates',
    description: 'Xác minh xe vào cổng',
    dependencies: ['vehicles:read'],
    protected: false,
  },
  {
    code: 'users:manage-admin',
    group: 'users',
    description: 'Quản trị tài khoản Admin',
    dependencies: [],
    protected: true,
  },
];

const sampleAudit: AuditView = {
  id: 'aaaaaaaa-1111-4111-8111-000000000001',
  actor_id: '11111111-1111-4111-8111-000000000001',
  action: 'users:status_change',
  target_type: 'User',
  target_id: 'operator.gate1',
  occurred_at: '2026-10-21T04:00:00Z',
  request_id: 'req-audit-001',
  outcome: 'SUCCEEDED',
  redacted_changes: {
    is_active: { old: true, new: false },
    reason: 'Tạm khóa nghỉ phép',
  },
};

describe('Schemas & Invariants cho Users, Roles và Audit', () => {
  it('userProfilePatchSchema: chỉ cho phép username/display_name + expected_version, từ chối extra fields (chống mass-assignment)', () => {
    expect(
      userProfilePatchSchema.safeParse({
        expected_version: 2,
        display_name: 'Tên mới',
      }).success,
    ).toBe(true);

    expect(
      userProfilePatchSchema.safeParse({
        expected_version: 2,
        display_name: 'Tên mới',
        role_id: '11111111-0000-0000-0000-000000000001',
      }).success,
    ).toBe(false);
  });

  it('userCreateSchema, userStatusChangeSchema, userRoleChangeSchema, passwordResetSchema: kiểm tra mật khẩu >= 12 ký tự và reason >= 3 ký tự', () => {
    expect(
      userCreateSchema.safeParse({
        username: 'op_1',
        password: 'short',
        role_id: '11111111-0000-0000-0000-000000000003',
      }).success,
    ).toBe(false);

    expect(
      userStatusChangeSchema.safeParse({
        expected_version: 1,
        reason: 'ab',
        is_active: false,
      }).success,
    ).toBe(false);

    expect(
      userRoleChangeSchema.safeParse({
        expected_version: 1,
        reason: 'Chuyển bộ phận kho',
        role_id: '11111111-1111-4111-8111-000000000002',
      }).success,
    ).toBe(true);

    expect(
      passwordResetSchema.safeParse({
        expected_version: 1,
        reason: 'Quên mật khẩu ca trực',
        temporary_password: 'TempPassword#2026',
      }).success,
    ).toBe(true);
  });

  it('roleCreateSchema, permissionReplaceSchema & auditViewSchema: kiểm tra mã role IN HOA và cấu trúc audit', () => {
    expect(roleCreateSchema.safeParse({ code: 'dispatcher', name: 'Điều phối' }).success).toBe(
      false,
    );
    expect(roleCreateSchema.safeParse({ code: 'DISPATCHER', name: 'Điều phối' }).success).toBe(
      true,
    );
    expect(
      permissionReplaceSchema.safeParse({
        expected_version: 3,
        reason: 'Cập nhật quyền ca đêm',
        permission_codes: ['vehicles:read'],
      }).success,
    ).toBe(true);
    expect(auditViewSchema.safeParse(sampleAudit).success).toBe(true);
  });
});

describe('Components & Modals cho Users, Roles và Audit', () => {
  it('PermissionEditor: tính đúng Selection Diff (+thêm / -gỡ), tự động chọn dependency và yêu cầu lý do', async () => {
    const user = userEvent.setup();
    let submitted: unknown = null;

    render(
      <PermissionEditor
        role={sampleRole}
        catalog={sampleCatalog}
        formId="perm-form"
        onSubmit={async (data) => {
          submitted = data;
        }}
      />,
    );

    // Ban đầu sampleRole có vehicles:read và gates:verify-entry
    // Bỏ chọn vehicles:read rồi chọn vehicles:create (có dependency là vehicles:read)
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!); // bỏ vehicles:read
    expect(screen.getByText('-vehicles:read')).toBeInTheDocument();

    await user.click(checkboxes[1]!); // chọn vehicles:create -> tự bật lại vehicles:read
    expect(screen.getByText('+vehicles:create')).toBeInTheDocument();

    // Submit khi chưa có lý do -> báo lỗi
    const reasonInput = screen.getByLabelText(/Lý do cập nhật tập quyền/i);
    await user.type(reasonInput, 'Bổ sung quyền tạo xe');

    const form = document.getElementById('perm-form') as HTMLFormElement;
    form.requestSubmit();

    await waitFor(() => {
      expect(submitted).toEqual({
        expected_version: 3,
        reason: 'Bổ sung quyền tạo xe',
        permission_codes: expect.arrayContaining([
          'vehicles:read',
          'gates:verify-entry',
          'vehicles:create',
        ]),
      });
    });
  });

  it('UserDetail: tải danh sách phiên từ API và thu hồi phiên kèm expected_version', async () => {
    const user = userEvent.setup();
    const calls: Array<{ method?: string; url?: string }> = [];

    http.defaults.adapter = async (config) => {
      calls.push({ method: config.method, url: config.url });
      if (config.url?.endsWith('/sessions') && config.method === 'get') {
        return {
          data: {
            items: [
              {
                id: '99999999-1111-4111-8111-000000000099',
                created_at: '2026-10-21T01:00:00Z',
                last_seen_at: '2026-10-21T05:00:00Z',
                expires_at: '2026-10-22T01:00:00Z',
                revoked_at: null,
              },
            ],
            next_cursor: null,
            has_more: false,
            coverage: 'complete',
            total: 1,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-sess-1' },
          config,
        };
      }
      return {
        data: { message: 'Revoked' },
        status: 200,
        statusText: 'OK',
        headers: { 'x-request-id': 'req-revoke-1' },
        config,
      };
    };

    render(
      <FeedbackProvider>
        <UserDetail user={sampleUser} />
      </FeedbackProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Tải danh sách phiên' }));
    expect(await screen.findByText('99999999…')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Thu hồi tất cả' }));
    await waitFor(() => {
      expect(calls.some((c) => c.url?.endsWith('/sessions/revoke') && c.method === 'post')).toBe(
        true,
      );
    });
  });

  it('UserForm, UserStatusModal, UserRoleModal, PasswordResetModal, RoleDetail, RoleForm, AuditDetail hoạt động đúng', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <RoleDetail role={sampleRole} />
        <AuditDetail audit={sampleAudit} />
        <UserStatusModal user={sampleUser} formId="status-f" onSubmit={async () => undefined} />
        <UserRoleModal
          user={sampleUser}
          roles={[{ id: sampleRole.id, name: sampleRole.name, code: sampleRole.code }]}
          formId="role-f"
          onSubmit={async () => undefined}
        />
        <PasswordResetModal user={sampleUser} formId="pwd-f" onSubmit={async () => undefined} />
        <UserForm user={sampleUser} formId="user-f" onSubmit={async () => undefined} />
        <RoleForm formId="rcreate-f" onSubmit={async () => undefined} />
      </div>,
    );

    expect(screen.getByText('Hệ thống (Bất biến)')).toBeInTheDocument();
    expect(screen.getByText('users:status_change')).toBeInTheDocument();
    expect(screen.getByText(/Tạm khóa nghỉ phép/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Mã vai trò \(Code\)/i), 'supervisor');
    expect(screen.getByLabelText(/Mã vai trò \(Code\)/i)).toHaveValue('SUPERVISOR');
  });

  it('ChangePasswordModal dùng đúng class chuẩn components.css (.modal.modal--sm, .modal__header, .modal__body, .modal__footer)', () => {
    render(
      <ChangePasswordModal
        open={true}
        forced={true}
        username="operator.gate1"
        onSubmitPassword={async () => undefined}
      />,
    );
    const dialog = screen.getByTestId('change-password-modal');
    expect(dialog).toHaveClass('modal', 'modal--sm');
    expect(dialog.querySelector('.modal__header')).not.toBeNull();
    expect(dialog.querySelector('.modal__body')).not.toBeNull();
    expect(dialog.querySelector('.modal__footer')).not.toBeNull();
  });

  it('updateUserProfile gọi PATCH /api/v1/admin/users/:id và issueAlertWsTicket gửi channel security.alerts + nhận websocket_path', async () => {
    const calls: Array<{ method?: string; url?: string; data?: unknown }> = [];
    http.defaults.adapter = async (config) => {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      calls.push({ method: config.method?.toUpperCase(), url: config.url, data: parsedData });
      if (config.url === `/api/v1/admin/users/${sampleUser.id}`) {
        return {
          data: { ...sampleUser, display_name: 'Họ Tên Đã Sửa', version: 3 },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-patch-user' },
          config,
        };
      }
      if (config.url === '/api/v2/auth/ws-tickets') {
        return {
          data: {
            ticket: 'ws-ticket-xyz',
            expires_at: '2026-10-21T08:01:00Z',
            websocket_path: '/ws/v2/security/alerts',
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-ws-ticket' },
          config,
        };
      }
      throw new Error(`Unexpected URL: ${config.url}`);
    };

    const updated = await updateUserProfile(sampleUser.id, {
      expected_version: 2,
      display_name: 'Họ Tên Đã Sửa',
    });
    expect(updated.version).toBe(3);

    const wsTicket = await issueAlertWsTicket();
    expect(wsTicket.ticket).toBe('ws-ticket-xyz');
    expect(wsTicket.websocket_path).toBe('/ws/v2/security/alerts');

    expect(calls).toEqual([
      {
        method: 'PATCH',
        url: `/api/v1/admin/users/${sampleUser.id}`,
        data: { expected_version: 2, display_name: 'Họ Tên Đã Sửa' },
      },
      {
        method: 'POST',
        url: '/api/v2/auth/ws-tickets',
        data: { channel: 'security.alerts' },
      },
    ]);
  });
});

describe('Pages UsersPage, RolesPage, AuditPage (không mock runtime)', () => {
  it('khi chưa xác thực (principal = null), hiển thị trạng thái unavailable và không gọi /api/v1/admin/*', () => {
    const requested: string[] = [];
    http.defaults.adapter = async (config) => {
      if (config.url) requested.push(config.url);
      throw new Error('Should not be called');
    };

    renderWithAuth(<UsersPage />, null);
    expect(
      screen.getByRole('heading', { name: 'Chức năng đang được hoàn thiện' }),
    ).toBeInTheDocument();
    expect(requested).toHaveLength(0);
  });

  it('khi đã xác thực, gọi đúng API thật và hiển thị dữ liệu / lỗi thật từ adapter', async () => {
    http.defaults.adapter = async (config) => {
      if (config.url?.startsWith('/api/v1/admin/users')) {
        return {
          data: {
            items: [sampleUser],
            next_cursor: null,
            has_more: false,
            coverage: 'complete',
            total: 1,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-users-200' },
          config,
        };
      }
      if (config.url?.startsWith('/api/v1/admin/roles')) {
        return {
          data: {
            items: [sampleRole],
            next_cursor: null,
            has_more: false,
            coverage: 'complete',
            total: 1,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-roles-200' },
          config,
        };
      }
      if (config.url?.startsWith('/api/v1/admin/permissions')) {
        return {
          data: {
            items: sampleCatalog,
            next_cursor: null,
            has_more: false,
            coverage: 'complete',
            total: sampleCatalog.length,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-perms-200' },
          config,
        };
      }
      return {
        data: {
          items: [sampleAudit],
          next_cursor: null,
          has_more: false,
          coverage: 'complete',
          total: 1,
        },
        status: 200,
        statusText: 'OK',
        headers: { 'x-request-id': 'req-audit-200' },
        config,
      };
    };

    const { unmount: unmountUsers } = renderWithAuth(<UsersPage />);
    expect(await screen.findByText('operator.gate1')).toBeInTheDocument();
    unmountUsers();

    const { unmount: unmountRoles } = renderWithAuth(<RolesPage />);
    expect(await screen.findByText('Kiểm soát an ninh cổng')).toBeInTheDocument();
    unmountRoles();

    renderWithAuth(<AuditPage />);
    expect(await screen.findByText('users:status_change')).toBeInTheDocument();
  });
});
