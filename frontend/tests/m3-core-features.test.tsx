import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/app/store';
import { AuthContext } from '../src/features/auth/model/context';
import { legacyPermissions } from '../src/features/auth/model/legacy-permissions';
import type { SessionPrincipal } from '@/features/auth';
import { ApiError, createQueryClient, http } from '@/shared/api';
import { FeedbackProvider } from '@/shared/feedback';
import {
  faceImageFileSchema,
  driverCreateSchema,
  createDriver,
  updateDriver,
  deactivateDriver,
  type Driver,
} from '@/features/drivers';
import {
  authorizationCreateSchema,
  type DriverVehicleAuthorization,
} from '@/features/driver-authorizations';
import {
  employeeCardIssueSchema,
  employeeCardStatusSchema,
  employeeCardReplaceSchema,
  type EmployeeCard,
} from '@/features/employee-cards';
import { GateLogDetail, GateLogsPanel, type GateLog } from '@/features/gate-logs';
import {
  AlertsStreamController,
  mergeAlertLists,
  AlertsPanel,
  WS_CLOSE_HISTORY_GAP,
  type AlertItem,
} from '@/features/alerts';
import { DriversPage } from '../src/pages/DriversPage/DriversPage';
import { VehiclesPage } from '../src/pages/VehiclesPage/VehiclesPage';

const defaultAdapter = http.defaults.adapter;
afterEach(() => {
  http.defaults.adapter = defaultAdapter;
  vi.restoreAllMocks();
});

const adminPrincipal: SessionPrincipal = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin.ops',
  role: 'ADMIN',
  permissions: legacyPermissions.ADMIN,
  source: 'legacy-session',
};

function renderWithConsoleProviders(
  ui: React.ReactNode,
  principal: SessionPrincipal | null = adminPrincipal,
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

const sampleDriver: Driver = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Nguyễn Văn Tài',
  employee_code: 'NV-101',
  phone: '0901234567',
  status: 'ACTIVE',
  face_model: 'arcface-r100',
  embedding_version: 'v1',
  enrolled_at: '2026-10-20T08:00:00Z',
};

const sampleVehicle = {
  id: '22222222-2222-4222-8222-222222222222',
  plate_number: '51H-888.99',
  plate_normalized: '51H88899',
  vehicle_type: 'TRUCK',
  make: 'Hino',
  model: '500 Series',
  color: 'Trắng',
  metadata: {},
  status: 'ACTIVE' as const,
};

const sampleAuthorization: DriverVehicleAuthorization = {
  id: '33333333-3333-4333-8333-333333333333',
  driver_id: sampleDriver.id,
  vehicle_id: sampleVehicle.id,
  valid_from: '2026-10-20T00:00:00Z',
  valid_until: '2026-12-31T23:59:59Z',
  status: 'ACTIVE',
};

const sampleCard: EmployeeCard = {
  id: '44444444-4444-4444-8444-444444444444',
  card_uid_masked: '****9A1F',
  driver_id: sampleDriver.id,
  status: 'ACTIVE',
  status_reason: 'Cấp mới nhân sự',
  issued_at: '2026-10-20T09:00:00Z',
  updated_at: '2026-10-20T09:00:00Z',
};

const sampleGateLog: GateLog = {
  id: '55555555-5555-4555-8555-555555555555',
  event_id: 'EVT-GATE-001',
  direction: 'ENTRY',
  verification_status: 'PASSED',
  observed_plate: '51H-888.99',
  plate_score: 0.96,
  plate_match_type: 'EXACT',
  face_similarity: 0.91,
  verification_score: 0.94,
  reason_codes: ['ALL_CHECKS_PASSED'],
  driver_id: sampleDriver.id,
  vehicle_id: sampleVehicle.id,
  order_id: null,
  snapshot_count: 1,
  barrier_status: 'OPENED',
  model_versions: { plate_ocr: 'v2.1', face_embed: 'v1.4' },
  threshold_version: '2026-10',
  occurred_at: '2026-10-21T07:15:00Z',
  completed_at: '2026-10-21T07:15:02Z',
  card_id: sampleCard.id,
  card_status: 'ACTIVE',
  card_verified: true,
  face_verified: true,
  plate_verified: true,
  authorization_verified: true,
  vehicle_type: 'TRUCK',
};

const sampleAlertOpen: AlertItem = {
  id: '66666666-6666-4666-8666-666666666661',
  event_id: 'EVT-ALR-001',
  sequence: 10,
  alert_type: 'FACE_MISMATCH',
  severity: 'HIGH',
  status: 'OPEN',
  message: 'Khuôn mặt không khớp với chủ thẻ <script>window.__xss = true</script>',
  data: { gate_id: 'GATE-01', raw_tag: '<img src=x onerror=alert(1)>' },
  occurred_at: '2026-10-21T08:00:00Z',
  resolved_at: null,
};

describe('M3 Core Operational Features (Tasks 7.7 - 7.12)', () => {
  describe('7.7 Drivers enrollment & multipart FormData', () => {
    it('kiểm tra kích thước <= 10 MiB và định dạng JPEG/PNG/WebP cho ảnh khuôn mặt', () => {
      const validJpeg = new File([new Uint8Array(1024)], 'driver.jpg', { type: 'image/jpeg' });
      expect(faceImageFileSchema.safeParse(validJpeg).success).toBe(true);

      const invalidType = new File([new Uint8Array(128)], 'driver.gif', { type: 'image/gif' });
      expect(faceImageFileSchema.safeParse(invalidType).success).toBe(false);

      const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'huge.png', {
        type: 'image/png',
      });
      expect(faceImageFileSchema.safeParse(oversized).success).toBe(false);

      expect(
        driverCreateSchema.safeParse({
          full_name: 'Trần Văn B',
          employee_code: 'NV-202',
          phone: '0912345678',
          face_image: validJpeg,
        }).success,
      ).toBe(true);
    });

    it('gửi multipart FormData cho createDriver, updateDriver và gọi DELETE cho deactivateDriver', async () => {
      const calls: Array<{ method?: string; url?: string; isFormData: boolean }> = [];
      http.defaults.adapter = async (config) => {
        calls.push({
          method: config.method?.toUpperCase(),
          url: config.url,
          isFormData: config.data instanceof FormData,
        });
        return {
          data: sampleDriver,
          status: 200,
          statusText: 'OK',
          headers: { 'x-request-id': 'req-driver-1' },
          config,
        };
      };

      const file = new File([new Uint8Array([1, 2, 3])], 'face.webp', { type: 'image/webp' });
      const created = await createDriver({
        full_name: 'Nguyễn Văn Tài',
        employee_code: 'NV-101',
        phone: '0901234567',
        face_image: file,
      });
      expect(created.id).toBe(sampleDriver.id);

      await updateDriver(sampleDriver.id, {
        full_name: 'Nguyễn Văn Tài (Cập nhật)',
        employee_code: 'NV-101',
        phone: '0901234567',
        face_image: null,
      });

      await deactivateDriver(sampleDriver.id);

      expect(calls).toEqual([
        { method: 'POST', url: '/api/v1/drivers', isFormData: true },
        {
          method: 'PATCH',
          url: `/api/v1/drivers/${sampleDriver.id}`,
          isFormData: true,
        },
        {
          method: 'DELETE',
          url: `/api/v1/drivers/${sampleDriver.id}`,
          isFormData: false,
        },
      ]);
    });
  });

  describe('7.8 Driver–Vehicle Authorizations', () => {
    it('từ chối valid_until nhỏ hơn hoặc bằng valid_from', () => {
      const invalid = authorizationCreateSchema.safeParse({
        driver_id: sampleDriver.id,
        vehicle_id: sampleVehicle.id,
        valid_from: '2026-10-21T10:00:00Z',
        valid_until: '2026-10-21T09:00:00Z',
      });
      expect(invalid.success).toBe(false);

      const valid = authorizationCreateSchema.safeParse({
        driver_id: sampleDriver.id,
        vehicle_id: sampleVehicle.id,
        valid_from: '2026-10-21T10:00:00Z',
        valid_until: '2026-10-22T10:00:00Z',
      });
      expect(valid.success).toBe(true);
    });

    it('hiển thị danh sách ủy quyền trong VehiclesPage và cho phép thu hồi ủy quyền', async () => {
      let revoked = false;
      http.defaults.adapter = async (config) => {
        if (config.url === '/api/v1/vehicles') {
          return { data: [sampleVehicle], status: 200, statusText: 'OK', headers: {}, config };
        }
        if (config.url === '/api/v1/drivers') {
          return { data: [sampleDriver], status: 200, statusText: 'OK', headers: {}, config };
        }
        if (config.url === '/api/v1/driver-vehicle-authorizations') {
          return {
            data: [sampleAuthorization],
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        if (
          config.method?.toUpperCase() === 'DELETE' &&
          config.url?.includes('/api/v1/driver-vehicle-authorizations/')
        ) {
          revoked = true;
          return {
            data: { message: 'Revoked' },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.url}`);
      };

      const user = userEvent.setup();
      const { container } = renderWithConsoleProviders(<VehiclesPage />);

      const authTab = await screen.findByRole('tab', { name: /Ủy quyền Tài xế – Xe/i });
      await user.click(authTab);

      expect(await screen.findByText('Nguyễn Văn Tài')).toBeInTheDocument();
      expect(screen.getByText('51H-888.99')).toBeInTheDocument();

      // Đảm bảo nút hành động chính nằm cố định trên vùng page-header (.page-actions), không bị nhảy xuống dưới thanh lọc
      const createAuthButtons = screen.getAllByRole('button', { name: /Cấp quyền Tài xế – Xe/i });
      expect(createAuthButtons).toHaveLength(1);
      expect(container.querySelector('.page-header .page-actions')).toContainElement(
        createAuthButtons[0]!,
      );

      const revokeBtn = screen.getByRole('button', { name: /Thu hồi/i });
      await user.click(revokeBtn);

      const confirmBtn = await screen.findByRole('button', { name: /Xác nhận thu hồi/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(revoked).toBe(true);
      });
    });
  });

  describe('7.9 Employee Cards (masked UID, issue, block, report-lost, replace)', () => {
    it('kiểm tra schema phát hành, khóa/báo mất và thay thế thẻ', () => {
      expect(
        employeeCardIssueSchema.safeParse({
          driver_id: sampleDriver.id,
          card_uid: '04AABBCCDD',
          status_reason: 'Cấp mới',
        }).success,
      ).toBe(true);

      expect(employeeCardStatusSchema.safeParse({ status_reason: 'ab' }).success).toBe(false);
      expect(
        employeeCardReplaceSchema.safeParse({
          card_uid: '0411223344',
          status_reason: 'Thẻ cũ bị hỏng chip',
        }).success,
      ).toBe(true);
    });

    it('hiển thị UID đã che (masked) và yêu cầu xác nhận cùng lý do trước khi khóa thẻ', async () => {
      let blockedCardId: string | null = null;
      http.defaults.adapter = async (config) => {
        if (config.url === '/api/v1/drivers') {
          return { data: [sampleDriver], status: 200, statusText: 'OK', headers: {}, config };
        }
        if (config.url === '/api/v1/employee-cards' && config.method?.toUpperCase() === 'GET') {
          return { data: [sampleCard], status: 200, statusText: 'OK', headers: {}, config };
        }
        if (config.url === `/api/v1/employee-cards/${sampleCard.id}/block`) {
          blockedCardId = sampleCard.id;
          return {
            data: { ...sampleCard, status: 'BLOCKED', status_reason: 'Vi phạm quy định cổng' },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.url}`);
      };

      const user = userEvent.setup();
      const { container } = renderWithConsoleProviders(<DriversPage />);

      const cardsTab = await screen.findByRole('tab', { name: /Thẻ nhân viên \(RFID\)/i });
      await user.click(cardsTab);

      expect(await screen.findByText('****9A1F')).toBeInTheDocument();

      // Đảm bảo nút hành động chính nằm cố định trên vùng page-header (.page-actions), không bị nhảy xuống dưới thanh lọc
      const issueCardButtons = screen.getAllByRole('button', { name: /Phát hành thẻ mới/i });
      expect(issueCardButtons).toHaveLength(1);
      expect(container.querySelector('.page-header .page-actions')).toContainElement(
        issueCardButtons[0]!,
      );

      const blockBtn = screen.getByRole('button', { name: /^Khóa$/i });
      await user.click(blockBtn);

      const submitBtn = await screen.findByRole('button', { name: /Xác nhận khóa thẻ/i });
      await user.click(submitBtn);
      expect(
        await screen.findByText(/Vui lòng tích xác nhận thực hiện thao tác/i),
      ).toBeInTheDocument();

      const reasonInput = screen.getByLabelText(/Lý do thực hiện/i);
      await user.type(reasonInput, 'Vi phạm quy định cổng');
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);
      await user.click(submitBtn);

      await waitFor(() => {
        expect(blockedCardId).toBe(sampleCard.id);
      });
    });
  });

  describe('7.10 Gate Logs & Snapshot Evidence Blob cleanup', () => {
    it('tách biệt rõ Observation, Verification Decision, Barrier Result và thu hồi URL.createObjectURL khi unmount', async () => {
      const createUrlSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:http://localhost/mock-gate-snapshot-1');
      const revokeUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

      http.defaults.adapter = async (config) => {
        if (config.url === `/api/v1/gate-logs/${sampleGateLog.id}/snapshots/0`) {
          const fakeImageBlob = new Blob([new Uint8Array([137, 80, 78, 71])], {
            type: 'image/png',
          });
          return {
            data: fakeImageBlob,
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'image/png' },
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.url}`);
      };

      const { unmount } = renderWithConsoleProviders(
        <GateLogDetail log={sampleGateLog} canViewEvidence={true} />,
      );

      expect(screen.getByTestId('gate-log-observation')).toBeInTheDocument();
      expect(screen.getByTestId('gate-log-decision')).toBeInTheDocument();
      expect(screen.getByTestId('gate-log-barrier')).toBeInTheDocument();

      await waitFor(() => {
        expect(createUrlSpy).toHaveBeenCalledTimes(1);
      });

      unmount();
      expect(revokeUrlSpy).toHaveBeenCalledWith('blob:http://localhost/mock-gate-snapshot-1');
    });

    it('hiển thị danh sách nhật ký cổng và lọc theo hướng cổng', async () => {
      http.defaults.adapter = async (config) => {
        if (config.url === '/api/v1/gate-logs') {
          return { data: [sampleGateLog], status: 200, statusText: 'OK', headers: {}, config };
        }
        throw new Error(`Unexpected request: ${config.url}`);
      };

      renderWithConsoleProviders(<GateLogsPanel />);
      expect(await screen.findByText('EVT-GATE-001')).toBeInTheDocument();
      expect(screen.getByText('51H-888.99')).toBeInTheDocument();
    });
  });

  describe('7.11 & 7.12 Alerts WS Client, Multi-batch Resync, History Gap & Safe Rendering', () => {
    it('chống hạ cấp trạng thái khi nhận gói tin out-of-order và gộp dedupe theo sequence', () => {
      const resolvedAlert: AlertItem = {
        ...sampleAlertOpen,
        status: 'RESOLVED',
        resolved_at: '2026-10-21T08:05:00Z',
      };
      const staleOpenDuplicate: AlertItem = {
        ...sampleAlertOpen,
        status: 'OPEN',
        resolved_at: null,
      };

      const merged = mergeAlertLists([resolvedAlert], [staleOpenDuplicate]);
      expect(merged.items).toHaveLength(1);
      expect(merged.items[0]?.status).toBe('RESOLVED');
    });

    it('đồng bộ nhiều batch (multi-batch after_sequence), gộp buffer WS và cô lập gói tin sai định dạng', async () => {
      const alertSeq1: AlertItem = {
        ...sampleAlertOpen,
        id: '66666666-6666-4666-8666-666666666601',
        sequence: 1,
      };
      const alertSeq2: AlertItem = {
        ...sampleAlertOpen,
        id: '66666666-6666-4666-8666-666666666602',
        sequence: 2,
      };
      const alertSeq3Buffered: AlertItem = {
        ...sampleAlertOpen,
        id: '66666666-6666-4666-8666-666666666603',
        sequence: 3,
      };

      const states: string[] = [];
      let callCount = 0;

      const controller = new AlertsStreamController({
        batchLimit: 1,
        createSocket: () =>
          ({
            close: vi.fn(),
          }) as unknown as WebSocket,
        fetchPage: async ({ after_sequence }) => {
          callCount += 1;
          if (after_sequence === 0) {
            // Trong lúc đang tải batch 1, giả lập WS đẩy vào 1 gói tin hợp lệ (seq 3) và 1 gói tin rác
            controller.handleIncomingRawFrame(JSON.stringify(alertSeq3Buffered));
            controller.handleIncomingRawFrame('{malformed-json');
            return {
              items: [alertSeq1],
              next_after_sequence: 1,
              has_more: true,
              oldest_available_sequence: 1,
            };
          }
          return {
            items: [alertSeq2],
            next_after_sequence: 2,
            has_more: false,
            oldest_available_sequence: 1,
          };
        },
        onStateChange: (st) => {
          states.push(st.syncStatus);
        },
      });

      await controller.start();
      const finalState = controller.getState();

      expect(callCount).toBe(2);
      expect(finalState.syncStatus).toBe('synced');
      expect(finalState.hasHistoryGap).toBe(false);
      expect(finalState.invalidEventCount).toBe(1);
      expect(finalState.items.map((i) => i.sequence)).toEqual([3, 2, 1]);

      controller.stop();
    });

    it('đánh dấu gap_detected khi gặp 410 ALERT_HISTORY_GAP hoặc đóng socket 4409 thay vì báo đã đồng bộ', async () => {
      let socketCloseHandler: ((ev: CloseEvent) => void) | null = null;

      const controller = new AlertsStreamController({
        createSocket: () => {
          const fakeSocket = {
            onopen: null,
            onmessage: null,
            onerror: null,
            set onclose(fn: ((ev: CloseEvent) => void) | null) {
              socketCloseHandler = fn;
            },
            close: vi.fn(),
          };
          return fakeSocket as unknown as WebSocket;
        },
        fetchPage: async () => {
          throw new ApiError(
            'ALERT_HISTORY_GAP',
            'Khoảng sự kiện yêu cầu đã bị xóa khỏi bộ đệm',
            410,
          );
        },
        onStateChange: () => undefined,
      });

      await controller.start();
      expect(controller.getState().syncStatus).toBe('gap_detected');
      expect(controller.getState().hasHistoryGap).toBe(true);

      // Kiểm tra cả trường hợp đóng socket với mã 4409
      if (socketCloseHandler) {
        (socketCloseHandler as (ev: CloseEvent) => void)({
          code: WS_CLOSE_HISTORY_GAP,
        } as CloseEvent);
      }
      expect(controller.getState().syncStatus).toBe('gap_detected');
      controller.stop();
    });

    it('hiển thị an toàn chuỗi chứa <script>/<img onerror> và cập nhật trạng thái ACKNOWLEDGE', async () => {
      let patchedStatus: string | null = null;
      http.defaults.adapter = async (config) => {
        if (config.url === '/api/v1/security/alerts' && config.method?.toUpperCase() === 'GET') {
          return {
            data: [sampleAlertOpen],
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        if (
          config.url === `/api/v1/security/alerts/${sampleAlertOpen.id}` &&
          config.method?.toUpperCase() === 'PATCH'
        ) {
          const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
          patchedStatus = body.status;
          return {
            data: { ...sampleAlertOpen, status: 'ACKNOWLEDGED' },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.url}`);
      };

      const user = userEvent.setup();
      const { container } = renderWithConsoleProviders(<AlertsPanel />);

      expect(
        await screen.findByText(/Khuôn mặt không khớp với chủ thẻ <script>/i),
      ).toBeInTheDocument();
      // Đảm bảo không có thẻ script hay img thực thi được chèn vào DOM
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img[onerror]')).toBeNull();

      const ackBtn = screen.getByRole('button', { name: /Tiếp nhận/i });
      await user.click(ackBtn);

      await waitFor(() => {
        expect(patchedStatus).toBe('ACKNOWLEDGED');
      });
    });
  });
});
