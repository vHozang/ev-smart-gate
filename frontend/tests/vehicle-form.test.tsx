import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../src/features/auth/model/context';
import type { SessionPrincipal } from '@/features/auth';
import { VehicleForm } from '../src/features/vehicles/components/VehicleForm';
import { FeedbackProvider } from '@/shared/feedback';
import type { ModalContext } from '@/shared/feedback';
import { http } from '@/shared/api';
const original = http.defaults.adapter;
afterEach(() => {
  http.defaults.adapter = original;
});
const principal: SessionPrincipal = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'unit-operator',
  role: 'ADMIN',
  permissions: ['vehicles:create'],
  source: 'legacy-session',
};
function mount() {
  const modal: ModalContext = {
    formId: 'unit-form',
    pending: false,
    submitBlocked: false,
    setSubmitBlocked: vi.fn(),
    close: vi.fn(),
    requestClose: vi.fn(),
    setPending: vi.fn(),
    setDirty: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FeedbackProvider>
        <AuthContext.Provider
          value={{
            principal,
            loading: false,
            error: null,
            login: vi.fn(),
            logout: vi.fn(),
            can: () => true,
          }}
        >
          <VehicleForm modal={modal} />
          <button type="submit" form="unit-form">
            Lưu
          </button>
        </AuthContext.Provider>
      </FeedbackProvider>
    </QueryClientProvider>,
  );
  return modal;
}
async function fill() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Biển số/), '59T1-TEST');
  await user.type(screen.getByLabelText(/Loại phương tiện/), 'motorcycle');
  return user;
}
describe('Form phương tiện dùng API adapter trong unit test cô lập', () => {
  it('validation cục bộ không gọi API', async () => {
    let calls = 0;
    http.defaults.adapter = async () => {
      calls++;
      throw new Error('Không được gọi');
    };
    mount();
    await userEvent.click(screen.getByText('Lưu'));
    expect(await screen.findByText('Nhập ít nhất 4 ký tự.')).toBeInTheDocument();
    expect(calls).toBe(0);
  });
  it('422 giữ form, không đóng hoặc phát toast thành công', async () => {
    http.defaults.adapter = async (config) => {
      throw new AxiosError('validation', 'ERR_BAD_REQUEST', config, undefined, {
        data: {
          error: { code: 'VALIDATION_ERROR', message: 'Biển số chưa đúng quy định.', details: {} },
        },
        status: 422,
        statusText: 'Invalid',
        headers: {},
        config,
      });
    };
    const modal = mount();
    const user = await fill();
    await user.click(screen.getByText('Lưu'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Biển số chưa đúng quy định.');
    expect(screen.getByLabelText(/Biển số/)).toHaveValue('59T1-TEST');
    expect(modal.close).not.toHaveBeenCalled();
    expect(screen.queryByText('Đã thêm phương tiện')).not.toBeInTheDocument();
    expect(modal.setPending).toHaveBeenLastCalledWith(false);
  });
  it('double submit chỉ gửi một mutation, chỉ toast sau response đúng contract', async () => {
    let calls = 0;
    let finish: (() => void) | undefined;
    let requestBody = '';
    http.defaults.adapter = async (config) => {
      calls++;
      requestBody = String(config.data);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        data: {
          id: '00000000-0000-4000-8000-000000000002',
          plate_number: '59T1-TEST',
          plate_normalized: '59T1TEST',
          vehicle_type: 'motorcycle',
          make: null,
          model: null,
          color: null,
          metadata: {},
          status: 'ACTIVE',
        },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      };
    };
    const modal = mount();
    await fill();
    fireEvent.submit(document.getElementById('unit-form')!);
    fireEvent.submit(document.getElementById('unit-form')!);
    await waitFor(() => expect(calls).toBe(1));
    expect(screen.queryByText('Đã thêm phương tiện')).not.toBeInTheDocument();
    finish?.();
    expect(await screen.findByText('Đã thêm phương tiện')).toBeInTheDocument();
    expect(modal.close).toHaveBeenCalledOnce();
    expect(JSON.parse(requestBody)).toEqual({
      plate_number: '59T1-TEST',
      vehicle_type: 'motorcycle',
      make: null,
      model: null,
      color: null,
    });
  });
  it('payload sai contract giữ form và chặn gửi lại khi kết quả chưa rõ', async () => {
    http.defaults.adapter = async (config) => ({
      data: { id: 'missing-required-fields' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
    const modal = mount();
    const user = await fill();
    await user.click(screen.getByText('Lưu'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Dữ liệu dịch vụ chưa đúng hợp đồng.',
    );
    expect(modal.close).not.toHaveBeenCalled();
    expect(modal.setSubmitBlocked).toHaveBeenCalledWith(true);
  });
});
