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
