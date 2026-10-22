import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../src/features/auth/model/context';
import type { SessionPrincipal } from '@/features/auth';
import { DeviceSettingsPage } from '../src/pages/DeviceSettingsPage/DeviceSettingsPage';
import { useDeviceSettingsScreen } from '@/features/device-settings';
import {
  parseSettingsSection,
  settingsSections,
} from '../src/features/device-settings/model/catalog';
import { canPrepareLocalDraft } from '../src/features/device-settings/model/types';
import type { DraftKind } from '../src/features/device-settings/model/types';
import {
  draftReviewRows,
  emptySettingsForm,
  settingsDraftSchema,
} from '../src/features/device-settings/model/draft';
import { FeedbackProvider } from '@/shared/feedback';
import { http } from '@/shared/api';
const originalAdapter = http.defaults.adapter;
afterEach(() => {
  http.defaults.adapter = originalAdapter;
});
const admin: SessionPrincipal = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'unit-admin',
  role: 'ADMIN',
  permissions: [],
  source: 'legacy-session',
};
function wrapper(principal: SessionPrincipal | null, entry = '/settings') {
  return function Providers({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[entry]}>
        <AuthContext.Provider
          value={{
            principal,
            loading: false,
            error: null,
            can: (permission) => principal?.permissions.includes(permission) ?? false,
            login: vi.fn(),
            logout: vi.fn(),
          }}
        >
          <FeedbackProvider>{children}</FeedbackProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    );
  };
}
function LocationProbe() {
  return <output aria-label="URL trong test">{useLocation().search}</output>;
}
function mount(principal: SessionPrincipal | null = null, entry = '/settings') {
  render(
    <>
      <DeviceSettingsPage />
      <LocationProbe />
    </>,
    { wrapper: wrapper(principal, entry) },
  );
}
function valid(kind: DraftKind) {
  return {
    ...emptySettingsForm(kind),
    name: 'Cấu hình test cô lập',
    accessPointRef: 'gate-unit',
    laneRef: 'lane-unit',
    direction: 'ENTRY',
    purpose: 'FACE',
    connectionProfileRef: 'profile-unit',
    modelRef: 'model-unit',
    modelVersion: 'unit-v1',
    task: 'FACE_VERIFICATION',
    accessMode: 'CAR',
    faceCameraRef: 'face-unit',
    plateCameraRef: 'plate-unit',
    readerRef: 'reader-unit',
    timeoutMs: '',
    debounceMs: '',
  };
}
async function fillCamera() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Tên cấu hình/), 'Camera kiểm thử cục bộ');
  await user.type(screen.getByLabelText(/Mã điểm ra vào/), 'gate-unit');
  await user.type(screen.getByLabelText(/Mã làn/), 'lane-unit');
  await user.selectOptions(screen.getByLabelText(/Hướng di chuyển/), 'ENTRY');
  await user.selectOptions(screen.getByLabelText(/Vai trò camera/), 'FACE');
  await user.type(screen.getByLabelText(/Mã profile kết nối/), 'profile-unit');
  return user;
}
describe('Schema bản nháp có type riêng, chưa phải DTO API', () => {
  it.each(['cameras', 'models', 'barriers', 'readers', 'bindings'] as const)(
    '%s hợp lệ được chiếu đúng fields của nhóm',
    (kind) => {
      const result = settingsDraftSchema.parse(valid(kind));
      expect(result.kind).toBe(kind);
      expect(result.name).toBe('Cấu hình test cô lập');
      if (kind !== 'models') expect(result).not.toHaveProperty('modelRef');
    },
  );
  it.each(['MOTORCYCLE', 'CAR', 'TRUCK'])('%s cần camera biển số', (accessMode) =>
    expect(
      settingsDraftSchema.safeParse({ ...valid('bindings'), accessMode, plateCameraRef: '' })
        .success,
    ).toBe(false),
  );
  it('luồng đi bộ cần mặt/thẻ nhưng không mang plate ref', () => {
    const draft = { ...valid('bindings'), accessMode: 'PEDESTRIAN', plateCameraRef: '' };
    expect(settingsDraftSchema.safeParse(draft).success).toBe(true);
    expect(settingsDraftSchema.safeParse({ ...draft, faceCameraRef: '' }).success).toBe(false);
    expect(settingsDraftSchema.safeParse({ ...draft, readerRef: '' }).success).toBe(false);
    expect(settingsDraftSchema.safeParse({ ...draft, plateCameraRef: 'stale-plate' }).success).toBe(
      false,
    );
  });
  it.each(['rtsp://name:pass@host/stream', 'https://internal.invalid', '/models/arbitrary.onnx'])(
    'không nhận URL/path thay cho profile ref: %s',
    (connectionProfileRef) =>
      expect(
        settingsDraftSchema.safeParse({ ...valid('cameras'), connectionProfileRef }).success,
      ).toBe(false),
  );
  it('không tự đặt timeout/debounce/ngưỡng model và không chuyển name thành enum label', () => {
    expect(emptySettingsForm('barriers').timeoutMs).toBe('');
    expect(emptySettingsForm('readers').debounceMs).toBe('');
    const rows = draftReviewRows(settingsDraftSchema.parse({ ...valid('models'), name: 'ENTRY' }));
    expect(rows.find((row) => row.label === 'Tên cấu hình')?.value).toBe('ENTRY');
    expect(rows.some((row) => row.label.includes('Ngưỡng'))).toBe(false);
  });
  it('validation timeout/debounce cục bộ không chấp nhận NaN hoặc số âm', () => {
    expect(settingsDraftSchema.safeParse({ ...valid('barriers'), timeoutMs: 'NaN' }).success).toBe(
      false,
    );
    expect(settingsDraftSchema.safeParse({ ...valid('readers'), debounceMs: '-1' }).success).toBe(
      false,
    );
  });
});
describe('Không gian cấu hình và quyền chuẩn bị bản nháp', () => {
  it('có sáu tab và unknown section trở về Camera', () => {
    expect(settingsSections).toHaveLength(6);
    expect(parseSettingsSection('not-valid')).toBe('cameras');
    mount(null, '/settings?section=invalid');
    expect(screen.getByRole('tab', { name: 'Camera' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Chuẩn bị bản nháp' })).toBeDisabled();
  });
  it('keyboard chọn tab đồng bộ URL, Home/End vẫn đúng aria/focus', async () => {
    const user = userEvent.setup();
    mount();
    screen.getByRole('tab', { name: 'Camera' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Mô hình nhận diện' })).toHaveFocus();
    expect(screen.getByLabelText('URL trong test')).toHaveTextContent('section=models');
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Lịch sử cấu hình' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Chưa có nguồn lịch sử cấu hình')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu cấu hình' })).not.toBeInTheDocument();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Camera' })).toHaveFocus();
  });
  it.each(['SECURITY', 'WAREHOUSE'] as const)(
    '%s không mở được draft kể cả gọi handler trực tiếp',
    (role) => {
      const principal = { ...admin, role, permissions: ['device-settings:update'] };
      expect(canPrepareLocalDraft(principal)).toBe(false);
      const result = renderHook(() => useDeviceSettingsScreen('cameras'), {
        wrapper: wrapper(principal),
      });
      let opened = true;
      act(() => {
        opened = result.result.current.actions.prepareDraft();
      });
      expect(opened).toBe(false);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );
  it('history không mở draft kể cả ADMIN', () => {
    const result = renderHook(() => useDeviceSettingsScreen('history'), {
      wrapper: wrapper(admin),
    });
    let opened = true;
    act(() => {
      opened = result.result.current.actions.prepareDraft();
    });
    expect(opened).toBe(false);
  });
  it('chỉ xem field descriptions, không request API cấu hình hoặc test thiết bị', async () => {
    let requests = 0;
    http.defaults.adapter = async () => {
      requests++;
      throw new Error('Không có API quản trị cấu hình');
    };
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Xem trường cấu hình' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('ROI');
    expect(requests).toBe(0);
    expect(screen.queryByRole('button', { name: /Mở barrier/ })).not.toBeInTheDocument();
  });
  it('ADMIN kiểm tra draft giữ nghĩa chưa lưu, không request/persist/toast thành công', async () => {
    const persisted = vi.spyOn(Storage.prototype, 'setItem');
    let requests = 0;
    http.defaults.adapter = async () => {
      requests++;
      throw new Error('Không được gọi');
    };
    mount(admin);
    await userEvent.click(screen.getByRole('button', { name: 'Chuẩn bị bản nháp' }));
    const user = await fillCamera();
    await user.click(screen.getByRole('button', { name: 'Kiểm tra bản nháp' }));
    expect(await screen.findByRole('heading', { name: 'Xem lại bản nháp' })).toBeInTheDocument();
    expect(screen.getByText('Chưa lưu')).toBeInTheDocument();
    expect(
      screen.getByText('Biểu mẫu hợp lệ ở phía giao diện. Chưa kiểm tra kết nối và chưa áp dụng.'),
    ).toBeInTheDocument();
    expect(requests).toBe(0);
    expect(persisted).not.toHaveBeenCalled();
    expect(screen.queryByText('Đã lưu cấu hình')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.getByText('Bỏ các thay đổi chưa lưu?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }));
    expect(screen.getByLabelText(/Tên cấu hình/)).toHaveValue('Camera kiểm thử cục bộ');
  });
  it('form trống báo validation và không mở review', async () => {
    mount(admin);
    await userEvent.click(screen.getByRole('button', { name: 'Chuẩn bị bản nháp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Kiểm tra bản nháp' }));
    expect(await screen.findByText('Nhập tên có ít nhất 3 ký tự.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Xem lại bản nháp' })).not.toBeInTheDocument();
  });
  it('đổi luồng xe sang đi bộ xóa plate ref, không đưa ref ẩn vào review', async () => {
    mount(admin, '/settings?section=bindings');
    await userEvent.click(screen.getByRole('button', { name: 'Chuẩn bị bản nháp' }));
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/Chế độ kiểm soát/), 'CAR');
    await user.type(screen.getByLabelText(/Mã camera biển số/), 'plate-old');
    await user.selectOptions(screen.getByLabelText(/Chế độ kiểm soát/), 'PEDESTRIAN');
    await waitFor(() =>
      expect(screen.queryByLabelText(/Mã camera biển số/)).not.toBeInTheDocument(),
    );
    await user.selectOptions(screen.getByLabelText(/Chế độ kiểm soát/), 'TRUCK');
    expect(screen.getByLabelText(/Mã camera biển số/)).toHaveValue('');
  });
  it('mất quyền chuẩn bị draft khi modal mở chặn submit, không tạo review', async () => {
    const provider = (principal: SessionPrincipal | null) => (
      <MemoryRouter>
        <AuthContext.Provider
          value={{
            principal,
            loading: false,
            error: null,
            can: () => false,
            login: vi.fn(),
            logout: vi.fn(),
          }}
        >
          <FeedbackProvider>
            <DeviceSettingsPage />
          </FeedbackProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    );
    const view = render(provider(admin));
    await userEvent.click(screen.getByRole('button', { name: 'Chuẩn bị bản nháp' }));
    await fillCamera();
    view.rerender(provider(null));
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Bạn không có quyền chuẩn bị bản nháp'),
    );
    expect(screen.queryByRole('heading', { name: 'Xem lại bản nháp' })).not.toBeInTheDocument();
  });
});

describe('Tích hợp API thật cấu hình thiết bị M12 (Tasks 12.5, 12.6, 12.7)', () => {
  const adminWithApi: SessionPrincipal = {
    id: '00000000-0000-4000-8000-000000000009',
    username: 'jwt-admin',
    role: 'ADMIN',
    permissions: ['users:read', 'users:manage-admin', 'audit-logs:read'],
    source: 'jwt',
  };

  it('Task 12.5: đọc danh sách cấu hình thiết bị từ GET /api/v1/admin/device-settings/{group}, tách rõ desired_version, applied_version, apply_status, restart_required và ẩn secrets', async () => {
    const configId = '11111111-2222-4333-8444-555555555555';
    http.defaults.adapter = async (config) => {
      if (config.method === 'get' && config.url === '/api/v1/admin/device-settings/cameras') {
        return {
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-12-5' },
          config,
          data: {
            items: [
              {
                id: configId,
                group: 'cameras',
                name: 'Camera Làn Vào 01',
                access_point_ref: 'GATE-VEH-01',
                lane_ref: 'LANE-01',
                direction: 'ENTRY',
                saved_version: 3,
                applied_version: 2,
                status: 'DRIFTED',
                restart_required: true,
                settings: {
                  purpose: 'PLATE',
                  connection_profile_ref: 'prof-cam-01',
                  rtsp_password: 'raw-secret-password-do-not-expose',
                  api_token: 'secret-token-xyz',
                },
                updated_at: '2026-10-21T08:00:00Z',
              },
            ],
            next_cursor: null,
            has_more: false,
            limit: 50,
          },
        };
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    };

    mount(adminWithApi, '/settings?section=cameras');

    const card = await screen.findByTestId(`device-config-card-${configId}`);
    expect(card).toHaveTextContent('Camera Làn Vào 01');
    expect(card).toHaveTextContent('desired_version: v3');
    expect(card).toHaveTextContent('applied_version: v2');
    expect(card).toHaveTextContent('DRIFTED');
    expect(card).toHaveTextContent('Cần khởi động lại');

    const settingsNode = screen.getByTestId(`device-config-settings-${configId}`);
    expect(settingsNode).toHaveTextContent('[REDACTED]');
    expect(settingsNode).not.toHaveTextContent('raw-secret-password-do-not-expose');
    expect(settingsNode).not.toHaveTextContent('secret-token-xyz');
  });

  it('Task 12.6: thực hiện PATCH cập nhật cấu hình (expected_version, reason, Idempotency-Key), validate, connectivity-test, apply và đối soát GET /api/v1/admin/device-settings/operations/{operation_id} khi OUTCOME_UNKNOWN', async () => {
    const configId = '22222222-3333-4444-8555-666666666666';
    const opConnId = '33333333-4444-4555-8666-777777777771';
    const opApplyId = '33333333-4444-4555-8666-777777777772';
    let patchBody: Record<string, unknown> | null = null;
    let patchIdempotencyKey: string | undefined;
    let applyBody: Record<string, unknown> | null = null;

    http.defaults.adapter = async (config) => {
      if (config.method === 'get' && config.url === '/api/v1/admin/device-settings/cameras') {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            items: [
              {
                id: configId,
                group: 'cameras',
                name: 'Camera Cổng Chính',
                access_point_ref: 'GATE-01',
                lane_ref: 'LANE-01',
                direction: 'ENTRY',
                saved_version: 1,
                applied_version: null,
                status: 'SAVED',
                restart_required: true,
                settings: { purpose: 'FACE' },
                updated_at: '2026-10-21T08:00:00Z',
              },
            ],
            next_cursor: null,
            has_more: false,
            limit: 50,
          },
        };
      }
      if (
        config.method === 'patch' &&
        config.url === `/api/v1/admin/device-settings/cameras/${configId}`
      ) {
        patchBody = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        patchIdempotencyKey = String(
          (config.headers as Record<string, unknown>)?.['Idempotency-Key'] ?? '',
        );
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            id: configId,
            group: 'cameras',
            name: String(patchBody?.name ?? 'Camera Cổng Chính v2'),
            access_point_ref: 'GATE-01',
            lane_ref: 'LANE-01',
            direction: 'ENTRY',
            saved_version: 2,
            applied_version: null,
            status: 'SAVED',
            restart_required: true,
            settings: { purpose: 'FACE' },
            updated_at: '2026-10-21T08:05:00Z',
          },
        };
      }
      if (
        config.method === 'post' &&
        config.url === `/api/v1/admin/device-settings/cameras/${configId}/validate`
      ) {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            config_id: configId,
            group: 'cameras',
            valid: true,
            saved_version: 2,
            warnings: [],
            checked_at: '2026-10-21T08:06:00Z',
          },
        };
      }
      if (
        config.method === 'post' &&
        config.url === `/api/v1/admin/device-settings/cameras/${configId}/connectivity-test`
      ) {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            operation_id: opConnId,
            config_id: configId,
            group: 'cameras',
            kind: 'CONNECTIVITY_TEST',
            status: 'SUCCEEDED',
            saved_version: 2,
            applied_version: null,
            restart_required: true,
            message: 'Kiểm tra kết nối chỉ đọc thành công.',
            created_at: '2026-10-21T08:07:00Z',
            completed_at: '2026-10-21T08:07:01Z',
          },
        };
      }
      if (
        config.method === 'post' &&
        config.url === `/api/v1/admin/device-settings/cameras/${configId}/apply`
      ) {
        applyBody = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            operation_id: opApplyId,
            config_id: configId,
            group: 'cameras',
            kind: 'APPLY_CONFIG',
            status: 'OUTCOME_UNKNOWN',
            saved_version: 2,
            applied_version: null,
            restart_required: true,
            message: 'Thiết bị chưa phản hồi ACK đúng hạn; cần đối soát trạng thái tác vụ.',
            created_at: '2026-10-21T08:08:00Z',
            completed_at: null,
          },
        };
      }
      if (
        config.method === 'get' &&
        config.url === `/api/v1/admin/device-settings/operations/${opApplyId}`
      ) {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            operation_id: opApplyId,
            config_id: configId,
            group: 'cameras',
            kind: 'APPLY_CONFIG',
            status: 'SUCCEEDED',
            saved_version: 2,
            applied_version: 2,
            restart_required: true,
            message: 'Đối soát hoàn tất: đã áp dụng cấu hình phiên bản 2 xuống thiết bị.',
            created_at: '2026-10-21T08:08:00Z',
            completed_at: '2026-10-21T08:08:05Z',
          },
        };
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    };

    const user = userEvent.setup();
    mount(adminWithApi, '/settings?section=cameras');

    await screen.findByTestId(`device-config-card-${configId}`);

    const nameInput = screen.getByLabelText('Tên bản ghi cấu hình');
    await user.clear(nameInput);
    await user.type(nameInput, 'Camera Cổng Chính v2');

    const reasonInput = screen.getByLabelText('Lý do cập nhật / áp dụng (reason)');
    await user.clear(reasonInput);
    await user.type(reasonInput, 'Chuẩn hóa cấu hình camera ca sáng');

    await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));

    await waitFor(() => {
      expect(patchBody).toMatchObject({
        expected_version: 1,
        reason: 'Chuẩn hóa cấu hình camera ca sáng',
        name: 'Camera Cổng Chính v2',
      });
    });
    expect(patchIdempotencyKey).toBeTruthy();
    expect(screen.getByTestId(`device-config-card-${configId}`)).toHaveTextContent(
      'desired_version: v2',
    );

    await user.click(screen.getByTestId('btn-validate-config'));
    expect(await screen.findByTestId('device-validation-status')).toHaveTextContent(
      'Xác thực máy chủ v2: Hợp lệ (VALID)',
    );

    await user.click(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
    const opBox = await screen.findByTestId('device-operation-status');
    expect(opBox).toHaveTextContent('CONNECTIVITY_TEST');
    expect(opBox).toHaveTextContent('SUCCEEDED');

    await user.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await waitFor(() => {
      expect(applyBody).toEqual({
        expected_version: 2,
        reason: 'Chuẩn hóa cấu hình camera ca sáng',
      });
    });
    expect(screen.getByTestId('device-operation-status')).toHaveTextContent('OUTCOME_UNKNOWN');
    expect(screen.getByTestId(`device-config-card-${configId}`)).toHaveTextContent(
      'applied_version: Chưa áp dụng',
    );

    await user.click(screen.getByTestId('btn-reconcile-operation'));
    await waitFor(() => {
      expect(screen.getByTestId('device-operation-status')).toHaveTextContent('SUCCEEDED');
    });
    expect(screen.getByTestId(`device-config-card-${configId}`)).toHaveTextContent(
      'applied_version: v2',
    );
    expect(screen.getByTestId(`device-config-card-${configId}`)).toHaveTextContent('APPLIED');
  });

  it('Task 12.7: đọc và lọc nhật ký kiểm toán cấu hình thiết bị từ GET /api/v1/admin/device-settings/audit-logs kèm redacted_changes', async () => {
    const log1Id = '44444444-5555-4666-8777-888888888881';
    const log2Id = '44444444-5555-4666-8777-888888888882';

    http.defaults.adapter = async (config) => {
      if (config.method === 'get' && config.url === '/api/v1/admin/device-settings/audit-logs') {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            items: [
              {
                id: log1Id,
                actor_id: adminWithApi.id,
                action: 'device-settings:cameras:update',
                target_type: 'cameras',
                target_id: 'cfg-cam-01',
                occurred_at: '2026-10-21T08:10:00Z',
                request_id: 'req-audit-1',
                outcome: 'SUCCEEDED',
                redacted_changes: {
                  reason: 'Cập nhật góc quay camera',
                  saved_version: 2,
                  rtsp_secret: 'should-be-redacted',
                },
              },
              {
                id: log2Id,
                actor_id: adminWithApi.id,
                action: 'device-settings:barriers:apply',
                target_type: 'barriers',
                target_id: 'cfg-bar-01',
                occurred_at: '2026-10-21T08:12:00Z',
                request_id: 'req-audit-2',
                outcome: 'SUCCEEDED',
                redacted_changes: {
                  reason: 'Áp dụng thời gian chờ ACK barrier',
                  applied_version: 1,
                },
              },
            ],
            next_cursor: null,
            has_more: false,
            limit: 50,
          },
        };
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    };

    const user = userEvent.setup();
    mount(adminWithApi, '/settings?section=history');

    const row1 = await screen.findByTestId(`device-audit-row-${log1Id}`);
    expect(row1).toHaveTextContent('device-settings:cameras:update');
    expect(screen.getByTestId(`device-audit-changes-${log1Id}`)).toHaveTextContent('[REDACTED]');
    expect(screen.getByTestId(`device-audit-changes-${log1Id}`)).not.toHaveTextContent(
      'should-be-redacted',
    );
    expect(screen.getByTestId(`device-audit-row-${log2Id}`)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Lọc nhóm thiết bị'), 'barriers');
    await waitFor(() => {
      expect(screen.queryByTestId(`device-audit-row-${log1Id}`)).not.toBeInTheDocument();
    });
    expect(screen.getByTestId(`device-audit-row-${log2Id}`)).toHaveTextContent(
      'device-settings:barriers:apply',
    );
  });
});
