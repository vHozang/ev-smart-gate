import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { store } from '@/app/store';
import { AuthContext } from '../src/features/auth/model/context';
import { legacyPermissions } from '../src/features/auth/model/legacy-permissions';
import {
  ChangePasswordModal,
  changePasswordRequestSchema,
  type SessionPrincipal,
} from '@/features/auth';
import {
  VerificationResultCard,
  isBarrierConfirmedOpen,
  resolveVehicleTypeCatalogItem,
  type VerificationView,
  type VehicleTypeView,
} from '@/features/core-access';
import { inspectPromptPrivacy, parseSseFrames } from '@/features/assistant';
import { VehicleGatePage } from '@/pages/VehicleGatePage';
import { PedestrianPage } from '@/pages/PedestrianPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { AssistantPage } from '@/pages/AssistantPage';
import { OrdersPage } from '../src/pages/OrdersPage/OrdersPage';
import {
  createOrder,
  updateOrder,
  cancelOrder,
  startDockSession,
  finalizeDockSession,
  issueExitSlip,
  reissueExitSlip,
  orderCreateSchema,
} from '@/features/warehouse-orders';
import { createQueryClient, http } from '@/shared/api';
import { FeedbackProvider } from '@/shared/feedback';

const defaultAdapter = http.defaults.adapter;
afterEach(() => {
  http.defaults.adapter = defaultAdapter;
});

const operatorPrincipal: SessionPrincipal = {
  id: '11111111-1111-4111-8111-000000000001',
  username: 'operator.console',
  role: 'ADMIN',
  permissions: ['gate_logs:read', 'alerts:read', 'orders:read', 'drivers:read', 'vehicles:read'],
  must_change_password: false,
  source: 'jwt',
};

function renderWithAuth(
  ui: React.ReactNode,
  principal: SessionPrincipal | null = operatorPrincipal,
) {
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

describe('M3/M4/M5 Frontend UI — Auth v2, Core Access, Analytics Dashboard & AI Assistant', () => {
  it('7.2 & FE-NEG-03: ChangePasswordModal kiểm tra mật khẩu mới >= 12 ký tự và không áp dụng bộ lọc prompt AI lên mật khẩu hợp lệ', async () => {
    const user = userEvent.setup();
    let submittedPayload: { current_password: string; new_password: string } | null = null;

    // Mật khẩu có chuỗi giống pattern "password=..." vẫn hợp lệ trong form đổi mật khẩu (FE-NEG-03)
    const validPasswordInput = {
      current_password: 'TempPassword123!',
      new_password: 'password=NewStrongSecret2026!',
    };
    expect(changePasswordRequestSchema.safeParse(validPasswordInput).success).toBe(true);

    render(
      <ChangePasswordModal
        open={true}
        forced={true}
        username="operator.console"
        onSubmitPassword={async (input) => {
          submittedPayload = input;
        }}
      />,
    );

    expect(screen.getByTestId('change-password-modal')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Mật khẩu hiện tại/i), 'TempPassword123!');
    await user.type(screen.getByLabelText(/Mật khẩu mới \(tối thiểu/i), 'short');
    await user.type(screen.getByLabelText(/Xác nhận mật khẩu mới/i), 'short');
    await user.click(screen.getByRole('button', { name: /Cập nhật mật khẩu/i }));

    expect(await screen.findByTestId('change-password-error')).toHaveTextContent(
      /tối thiểu 12 ký tự/i,
    );

    await user.clear(screen.getByLabelText(/Mật khẩu mới \(tối thiểu/i));
    await user.clear(screen.getByLabelText(/Xác nhận mật khẩu mới/i));
    await user.type(screen.getByLabelText(/Mật khẩu mới \(tối thiểu/i), 'NewStrongPassword2026!');
    await user.type(screen.getByLabelText(/Xác nhận mật khẩu mới/i), 'NewStrongPassword2026!');
    await user.click(screen.getByRole('button', { name: /Cập nhật mật khẩu/i }));

    await waitFor(() => {
      expect(submittedPayload).toEqual({
        current_password: 'TempPassword123!',
        new_password: 'NewStrongPassword2026!',
      });
    });
  });

  it('8.17, DOD-FE-AI-01 & FE-NEG-07: VerificationResultCard tách 3 lớp, xử lý score=null ("Chưa có điểm") và chỉ báo OPENED khi đủ 3 điều kiện', async () => {
    const user = userEvent.setup();
    let reconciledEventId: string | null = null;

    const pendingVerification: VerificationView = {
      operation_id: '22222222-1111-4111-8111-000000000001',
      event_id: 'EVT-GATE-20261021-009',
      gate_id: 'GATE-VEH-01',
      access_mode: 'car',
      direction: 'ENTRY',
      status: 'OUTCOME_UNKNOWN',
      verification_status: 'PASSED',
      permit_granted: true,
      barrier_status: 'UNKNOWN',
      command_id: 'CMD-009',
      factors: [
        { factor: 'card', status: 'PASSED', reason_code: null, score: 1.0 },
        { factor: 'face', status: 'PASSED', reason_code: null, score: null },
        { factor: 'plate', status: 'PASSED', reason_code: null, score: 0.962 },
      ],
      reason_codes: ['PERMIT_ISSUED'],
      received_at: '2026-10-21T06:00:00Z',
      verification_completed_at: '2026-10-21T06:00:01Z',
      command_sent_at: '2026-10-21T06:00:01Z',
      acknowledged_at: null,
    };

    expect(isBarrierConfirmedOpen(pendingVerification)).toBe(false);
    expect(
      isBarrierConfirmedOpen({
        verification_status: 'PASSED',
        permit_granted: true,
        barrier_status: 'OPENED',
      }),
    ).toBe(true);

    render(
      <VerificationResultCard
        verification={pendingVerification}
        onReconcile={(evtId) => {
          reconciledEventId = evtId;
        }}
      />,
    );

    expect(screen.getByTestId('verification-factors')).toBeInTheDocument();
    expect(screen.getByTestId('verification-permit')).toBeInTheDocument();
    expect(screen.getByTestId('verification-barrier')).toBeInTheDocument();

    // FE-NEG-07: score === null phải hiển thị "Chưa có điểm", không tự bịa phần trăm
    expect(screen.getByTestId('factor-item-face')).toHaveTextContent('Chưa có điểm');
    // Chưa có ACK OPENED nên không được hiển thị "Đã mở barrier (OPENED)"
    expect(screen.queryByText(/Đã mở barrier \(OPENED\)/i)).not.toBeInTheDocument();

    // OUTCOME_UNKNOWN phải hiển thị cảnh báo và nút đối soát cùng event_id
    expect(screen.getByTestId('verification-outcome-unknown')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Tra cứu đối soát cùng mã sự kiện/i }));
    expect(reconciledEventId).toBe('EVT-GATE-20261021-009');
  });

  it('8.15, 8.16 & 8.18: VehicleGatePage chuẩn hóa danh mục loại xe (sedan -> car, unknown -> chặn) và tách biệt cổng ra (EXIT) với đơn hàng kho', async () => {
    const user = userEvent.setup();
    const catalog: VehicleTypeView[] = [
      {
        code: 'car',
        label: 'Ô tô con / tải nhẹ',
        legacy_values: ['sedan', 'suv'],
        eligible_for_verification: true,
      },
      {
        code: 'unknown',
        label: 'Chưa phân loại',
        legacy_values: [],
        eligible_for_verification: false,
      },
    ];

    expect(resolveVehicleTypeCatalogItem('sedan', catalog)).toEqual({
      code: 'car',
      label: 'Ô tô con / tải nhẹ (ánh xạ từ "sedan")',
      eligible_for_verification: true,
      isLegacyAlias: true,
    });
    expect(resolveVehicleTypeCatalogItem('unknown', catalog).eligible_for_verification).toBe(false);

    http.defaults.adapter = async (config) => {
      const url = config.url || '';
      if (url.includes('/api/v1/vehicle-types')) {
        return {
          data: {
            items: catalog,
            next_cursor: null,
            has_more: false,
            coverage: 'complete',
            total: 2,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-vt' },
          config,
        };
      }
      if (url.includes('/api/v1/access-points')) {
        return {
          data: {
            items: [],
            next_cursor: null,
            has_more: false,
            coverage: 'complete',
            total: 0,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-ap' },
          config,
        };
      }
      if (url.includes('/api/v2/gates/exit/verifications')) {
        return {
          data: {
            operation_id: '33333333-1111-4111-8111-000000000001',
            event_id: 'EVT-VEH-EXIT-001',
            gate_id: 'GATE-VEH-01',
            access_mode: 'car',
            direction: 'EXIT',
            status: 'COMPLETED',
            verification_status: 'PASSED',
            permit_granted: true,
            barrier_status: 'OPENED',
            command_id: 'CMD-OPEN-01',
            factors: [{ factor: 'plate', status: 'PASSED', reason_code: null, score: 0.98 }],
            reason_codes: ['EXIT_VERIFIED'],
            received_at: '2026-10-21T07:00:00Z',
            verification_completed_at: '2026-10-21T07:00:01Z',
            command_sent_at: '2026-10-21T07:00:01Z',
            acknowledged_at: '2026-10-21T07:00:02Z',
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-verify' },
          config,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    renderWithAuth(<VehicleGatePage />);

    await waitFor(() => {
      expect(screen.getByTestId('legacy-vehicle-resolution')).toHaveTextContent('car');
    });

    await user.selectOptions(screen.getByLabelText(/Chiều kiểm soát/i), 'EXIT');
    expect(await screen.findByTestId('vehicle-gate-exit-order-notice')).toHaveTextContent(
      /không yêu cầu và không tự động hoàn tất đơn hàng xuất kho/i,
    );

    await user.type(screen.getByLabelText(/Mã sự kiện định danh/i), 'EVT-VEH-EXIT-001');
    await user.type(
      screen.getByLabelText(/Mã gói thu nhận/i),
      '44444444-1111-4111-8111-000000000004',
    );
    await user.click(screen.getByRole('button', { name: /Thực hiện xác minh lượt phương tiện/i }));

    expect(await screen.findByTestId('verification-barrier')).toHaveTextContent(
      /Đã mở barrier \(OPENED\)/i,
    );
  });

  it('8.19: PedestrianPage hiển thị xác minh đi bộ, danh bạ nhân viên và nhật ký người đi bộ tách biệt với nhật ký xe', async () => {
    const user = userEvent.setup();

    http.defaults.adapter = async (config) => {
      const url = config.url || '';
      if (url.includes('/api/v1/employees')) {
        return {
          data: {
            items: [
              {
                employee_id: '55555555-1111-4111-8111-000000000005',
                person_id: '66666666-1111-4111-8111-000000000006',
                employee_code: 'EMP-2026-009',
                is_active: true,
                version: 1,
                created_at: '2026-10-20T00:00:00Z',
              },
            ],
            next_cursor: null,
            has_more: false,
            coverage: 'complete',
            total: 1,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-emp' },
          config,
        };
      }
      if (url.includes('/api/v1/pedestrian-access-grants')) {
        return {
          data: {
            items: [],
            next_cursor: null,
            has_more: false,
            coverage: 'complete',
            total: 0,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-grants' },
          config,
        };
      }
      if (url.includes('/api/v1/access-points')) {
        return {
          data: {
            items: [],
            next_cursor: null,
            has_more: false,
            coverage: 'complete',
            total: 0,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-ap' },
          config,
        };
      }
      if (url.includes('/api/v1/person-access-logs')) {
        return {
          data: {
            items: [
              {
                id: '77777777-1111-4111-8111-000000000007',
                operation_id: '88888888-1111-4111-8111-000000000008',
                event_id: 'EVT-PED-LOG-001',
                gate_id: 'PED-TURNSTILE-01',
                access_mode: 'pedestrian',
                direction: 'ENTRY',
                status: 'COMPLETED',
                verification_status: 'PASSED',
                permit_granted: true,
                barrier_status: 'OPENED',
                command_id: 'CMD-PED-01',
                factors: [{ factor: 'employee', status: 'PASSED', reason_code: null, score: 1 }],
                reason_codes: [],
                received_at: '2026-10-21T07:10:00Z',
                verification_completed_at: '2026-10-21T07:10:01Z',
                command_sent_at: '2026-10-21T07:10:01Z',
                acknowledged_at: '2026-10-21T07:10:02Z',
                person_id: '66666666-1111-4111-8111-000000000006',
                employee_id: '55555555-1111-4111-8111-000000000005',
                snapshot_count: 0,
              },
            ],
            next_cursor: null,
            has_more: false,
            coverage: 'partial',
            total: 1,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-plogs' },
          config,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    renderWithAuth(<PedestrianPage />);

    await user.click(screen.getByRole('button', { name: /Danh bạ nhân viên & Quyền đi bộ/i }));
    expect(await screen.findByText('EMP-2026-009')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Nhật ký lượt đi bộ/i }));
    expect(await screen.findByTestId('person-log-row-EVT-PED-LOG-001')).toBeInTheDocument();
    expect(screen.getByText(/Một phần \(partial\)/i)).toBeInTheDocument();
  });

  it('9.9–9.11: DashboardPage hiển thị provenance snapshot, coverage, MetricStrip và bảng dữ liệu văn bản tương đương (ANA-07)', async () => {
    http.defaults.adapter = async (config) => {
      const url = config.url || '';
      if (url.includes('/api/v1/analytics/dashboard')) {
        return {
          data: {
            snapshot_id: '99999999-1111-4111-8111-000000000009',
            generated_at: '2026-10-21T08:00:00Z',
            data_as_of: '2026-10-21T07:59:30Z',
            period: {
              from: '2026-10-20T00:00:00Z',
              to: '2026-10-21T23:59:59Z',
              timezone: 'Asia/Bangkok',
            },
            metric_definition_version: 'v1.2.0',
            authz_version: 3,
            metrics: [
              {
                metric_id: 'total_access_events',
                value: 142,
                unit: 'count',
                status: 'available',
                unavailable_reason: null,
                sample_size: 142,
                excluded_count: 0,
                source_ref: 'gate_access_logs',
              },
              {
                metric_id: 'permit_denied_rate',
                value: null,
                unit: 'percent',
                status: 'unavailable',
                unavailable_reason: 'Chưa đủ lịch sử đối chiếu trong kỳ',
                sample_size: 0,
                excluded_count: 2,
                source_ref: 'access_verifications',
              },
            ],
            coverage: 'partial',
            source_watermarks: { gate_access_logs: '2026-10-21T07:59:30Z' },
            warnings: ['Một phần bản ghi legacy chưa xác định loại phương tiện (unknown).'],
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-dash' },
          config,
        };
      }
      if (url.includes('/api/v1/analytics/metric-definitions')) {
        return {
          data: {
            items: [
              {
                metric_id: 'total_access_events',
                version: 'v1.2.0',
                unit: 'count',
                formula: 'COUNT(distinct event_id)',
                source: 'gate_access_logs',
                kind: 'event_flow',
                required_permissions: ['gate_logs:read'],
                supported_filters: ['direction', 'access_mode'],
              },
            ],
            next_cursor: null,
            has_more: false,
            coverage: 'complete',
            total: 1,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-mdef' },
          config,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    renderWithAuth(<DashboardPage />);

    expect(await screen.findByTestId('dashboard-provenance-banner')).toHaveTextContent(
      '99999999-1111-4111-8111-000000000009',
    );
    expect(screen.getByTestId('dashboard-warnings')).toHaveTextContent(
      /chưa xác định loại phương tiện/i,
    );
    expect(screen.getByTestId('metric-card-total_access_events')).toHaveTextContent('142');
    expect(screen.getByTestId('metric-card-permit_denied_rate')).toHaveTextContent(
      'Chưa đủ lịch sử đối chiếu trong kỳ',
    );
    expect(screen.getByTestId('dashboard-equivalent-table')).toBeInTheDocument();
  });

  it('10.15–10.18 & FE-NEG-03/04/05: AssistantPage chặn prompt chứa mật khẩu/card_uid/sinh trắc, parse SSE dedupe và phân biệt Dừng theo dõi vs Hủy máy chủ', async () => {
    const user = userEvent.setup();

    // 1. Kiểm thử unit bộ lọc quyền riêng tư (inspectPromptPrivacy)
    expect(inspectPromptPrivacy('Tóm tắt lưu lượng xe tải hôm nay').allowed).toBe(true);
    expect(inspectPromptPrivacy('Kiểm tra password=SuperSecret123!').allowed).toBe(false);
    expect(inspectPromptPrivacy('Tra cứu card_uid: 04A1B2C3D4E5F6').allowed).toBe(false);
    expect(inspectPromptPrivacy('Xuất face_embedding của tài xế').allowed).toBe(false);

    // 2. Kiểm thử SSE frame parser & sequence deduplication
    const ssePayload = [
      'data: {"schema_version":"1.0","report_id":"aaaaaaaa-1111-4111-8111-000000000001","sequence":1,"stage":"QUEUED","occurred_at":"2026-10-21T08:00:00Z","terminal":false}',
      'data: {"schema_version":"1.0","report_id":"aaaaaaaa-1111-4111-8111-000000000001","sequence":1,"stage":"QUEUED","occurred_at":"2026-10-21T08:00:00Z","terminal":false}',
      'data: {"schema_version":"1.0","report_id":"aaaaaaaa-1111-4111-8111-000000000001","sequence":2,"stage":"RUNNING","occurred_at":"2026-10-21T08:00:01Z","terminal":false}',
      '',
    ].join('\n\n');
    const parsedBatch = parseSseFrames(ssePayload, 0, 'aaaaaaaa-1111-4111-8111-000000000001');
    expect(parsedBatch.events).toHaveLength(2);
    expect(parsedBatch.highestSequence).toBe(2);

    // 3. Kiểm thử UI AssistantPage: Privacy Guard + Disconnect Stream vs Server Cancel
    let cancelCalled = false;
    http.defaults.adapter = async (config) => {
      const url = config.url || '';
      if (url.includes('/api/v1/assistant/reports') && config.method === 'get') {
        return {
          data: {
            items: [
              {
                report_id: 'aaaaaaaa-1111-4111-8111-000000000001',
                owner_id: operatorPrincipal.id,
                status: 'RUNNING',
                created_at: '2026-10-21T08:00:00Z',
                expires_at: '2026-10-22T08:00:00Z',
                last_sequence: 2,
                result: null,
                error_code: null,
                artifact_available: false,
              },
            ],
            next_cursor: null,
            has_more: false,
            coverage: 'complete',
            total: 1,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-rep-list' },
          config,
        };
      }
      if (url.includes('/cancel') && config.method === 'post') {
        cancelCalled = true;
        return {
          data: {
            report_id: 'aaaaaaaa-1111-4111-8111-000000000001',
            owner_id: operatorPrincipal.id,
            status: 'CANCELED',
            created_at: '2026-10-21T08:00:00Z',
            expires_at: '2026-10-22T08:00:00Z',
            last_sequence: 3,
            result: null,
            error_code: null,
            artifact_available: false,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-rep-cancel' },
          config,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    renderWithAuth(<AssistantPage />);

    // Kiểm tra chặn prompt chứa dữ liệu Restricted
    const promptInput = await screen.findByLabelText(/Nội dung yêu cầu phân tích/i);
    await user.type(promptInput, 'Hãy gửi password: SecretPassword123 cho tôi');
    expect(await screen.findByTestId('assistant-privacy-guard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tạo báo cáo phân tích/i })).toBeDisabled();

    // Kiểm tra nút Dừng theo dõi luồng (Client) KHÔNG giả báo CANCELED
    await user.click(
      await screen.findByRole('button', { name: /Dừng theo dõi luồng \(Client\)/i }),
    );
    expect(await screen.findByTestId('assistant-stream-disconnected')).toHaveTextContent(
      /không hủy tiến trình tạo báo cáo trên máy chủ/i,
    );
    expect(screen.queryByTestId('assistant-canceled-confirmed')).not.toBeInTheDocument();

    // Kiểm tra nút Yêu cầu hủy báo cáo trên máy chủ gọi API cancel và xác nhận CANCELED
    await user.click(screen.getByRole('button', { name: /Yêu cầu hủy báo cáo trên máy chủ/i }));
    expect(cancelCalled).toBe(true);
    expect(await screen.findByTestId('assistant-canceled-confirmed')).toBeInTheDocument();
  });

  it('Warehouse Orders CRUD, Dock Inspection Sessions & Exit Slips hoạt động đầy đủ theo vai trò WAREHOUSE/ADMIN', async () => {
    const user = userEvent.setup();
    const orderUuid = 'bbbbbbbb-1111-4111-8111-000000000001';
    const orderCode = 'ORD-2026-888';
    const sessionId = 'cccccccc-1111-4111-8111-000000000001';
    const driverId = 'dddddddd-1111-4111-8111-000000000001';
    const vehicleId = 'eeeeeeee-1111-4111-8111-000000000001';

    expect(
      orderCreateSchema.safeParse({
        order_id: orderCode,
        assigned_driver_id: driverId,
        assigned_vehicle_id: vehicleId,
        valid_from: '2026-10-21T08:00:00Z',
        valid_until: '2026-10-21T20:00:00Z',
        cargo_metadata: [{ sku: 'SKU-EV-01', name: 'Pin Lithium 60kWh', quantity: 10 }],
      }).success,
    ).toBe(true);

    const sampleOrder = {
      id: orderUuid,
      order_id: orderCode,
      assigned_driver_id: driverId,
      assigned_vehicle_id: vehicleId,
      status: 'PENDING' as const,
      valid_from: '2026-10-21T08:00:00Z',
      valid_until: '2026-10-21T20:00:00Z',
      cargo_metadata: [{ sku: 'SKU-EV-01', quantity: 10 }],
      dock_session_id: sessionId,
      slip_version: 0,
      slip_refs: {},
    };

    const sampleDock = {
      id: sessionId,
      order_id: orderCode,
      entry_gate_log_id: 'EVT-GATE-IN-01',
      status: 'ACTIVE' as const,
      current_cargo_state: 'LOADING' as const,
      capture_count: 1,
      operator_note: 'Đang bốc hàng tại Dock 02',
      completed_at: null,
    };

    http.defaults.adapter = async (config) => {
      const url = config.url || '';
      const method = config.method?.toUpperCase();

      if (url === '/api/v1/warehouse/orders' && method === 'GET') {
        return { data: [sampleOrder], status: 200, statusText: 'OK', headers: {}, config };
      }
      if (url === '/api/v1/warehouse/dock-sessions' && method === 'GET') {
        return {
          data: [
            {
              ...sampleDock,
              captures: [
                {
                  index: 0,
                  captured_at: '2026-10-21T08:20:00Z',
                  cargo_state: 'LOADING',
                  detections: [],
                },
              ],
            },
          ],
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (url === '/api/v1/drivers' && method === 'GET') {
        return { data: [], status: 200, statusText: 'OK', headers: {}, config };
      }
      if (url === '/api/v1/vehicles' && method === 'GET') {
        return { data: [], status: 200, statusText: 'OK', headers: {}, config };
      }
      if (url === '/api/v1/warehouse/orders' && method === 'POST') {
        return { data: sampleOrder, status: 201, statusText: 'Created', headers: {}, config };
      }
      if (url === `/api/v1/warehouse/orders/${orderCode}` && method === 'PATCH') {
        return {
          data: { ...sampleOrder, valid_until: '2026-10-22T20:00:00Z' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (url === `/api/v1/warehouse/orders/${orderCode}` && method === 'DELETE') {
        return {
          data: { ...sampleOrder, status: 'CANCELLED' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (url === `/api/v1/warehouse/orders/${orderCode}/dock-sessions` && method === 'POST') {
        return { data: sampleDock, status: 201, statusText: 'Created', headers: {}, config };
      }
      if (url === `/api/v1/warehouse/dock-sessions/${sessionId}/finalize` && method === 'POST') {
        return {
          data: {
            ...sampleDock,
            status: 'APPROVED',
            current_cargo_state: 'LOADED',
            operator_note: 'Đạt kiểm hàng',
            completed_at: '2026-10-21T08:30:00Z',
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (
        (url === `/api/v1/warehouse/orders/${orderCode}/exit-slip` ||
          url === `/api/v1/warehouse/orders/${orderCode}/exit-slip/reissue`) &&
        method === 'POST'
      ) {
        return {
          data: {
            order_id: orderCode,
            slip_version: 1,
            expires_at: '2026-10-21T20:35:00Z',
            refs: {
              qr: `/api/v1/warehouse/orders/${orderCode}/exit-slip/qr`,
              html: `/api/v1/warehouse/orders/${orderCode}/exit-slip/html`,
              pdf: `/api/v1/warehouse/orders/${orderCode}/exit-slip/pdf`,
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    };

    const created = await createOrder({
      order_id: orderCode,
      assigned_driver_id: driverId,
      assigned_vehicle_id: vehicleId,
      valid_from: '2026-10-21T08:00:00Z',
      valid_until: '2026-10-21T20:00:00Z',
      cargo_metadata: [{ sku: 'SKU-EV-01', quantity: 10 }],
    });
    expect(created.order_id).toBe(orderCode);

    await updateOrder(orderCode, { valid_until: '2026-10-22T20:00:00Z' });
    const startedDock = await startDockSession(orderCode);
    expect(startedDock.status).toBe('ACTIVE');
    const finalizedDock = await finalizeDockSession(sessionId, {
      operator_note: 'Đạt kiểm hàng',
      final_cargo_state: 'LOADED',
    });
    expect(finalizedDock.status).toBe('APPROVED');
    const slip = await issueExitSlip(orderCode);
    expect(slip.slip_version).toBe(1);
    const reissued = await reissueExitSlip(orderCode);
    expect(reissued.order_id).toBe(orderCode);
    const canceled = await cancelOrder(orderCode);
    expect(canceled.status).toBe('CANCELLED');

    const warehousePrincipal: SessionPrincipal = {
      id: '11111111-1111-4111-8111-000000000099',
      username: 'warehouse.ops',
      role: 'WAREHOUSE',
      permissions: legacyPermissions.WAREHOUSE,
      source: 'jwt',
    };

    renderWithAuth(<OrdersPage />, warehousePrincipal);
    expect(await screen.findByText(orderCode)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tạo đơn xuất kho/i })).toBeInTheDocument();

    const dockTab = screen.getByRole('tab', { name: /Phiên kiểm hàng Dock/i });
    await user.click(dockTab);
    expect(await screen.findByText(/Đang bốc hàng tại Dock 02/i)).toBeInTheDocument();
  });
});
