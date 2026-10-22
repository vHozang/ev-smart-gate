import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlertSyncBadge, AlertsPanel, WS_CLOSE_HISTORY_GAP } from '@/features/alerts';
import type { AlertsScreen } from '@/features/alerts';
import { inspectPromptPrivacy } from '@/features/assistant';
import { ChangePasswordModal } from '@/features/auth';
import { AuthContext } from '../src/features/auth/model/context';
import type { SessionPrincipal } from '@/features/auth';
import { VerificationResultCard, isBarrierConfirmedOpen } from '@/features/core-access';
import type { VerificationView } from '@/features/core-access';
import { isSecretSettingKey, sanitizeDeviceSettingsRecord } from '@/features/device-settings';
import { AssistantPage } from '../src/pages/AssistantPage/AssistantPage';
import {
  captureIdentityGuard,
  clearTransportIdentity,
  getAuthToken,
  http,
  setAuthToken,
} from '@/shared/api';
import { FeedbackProvider } from '@/shared/feedback';
import { ErrorBoundary } from '@/shared/ui/AsyncBoundary';
import { EvidenceViewer } from '@/shared/ui/EvidenceViewer';
import { AiLiveRegion, SafeAiText } from '@/shared/ui/SafeAiText';

const originalAdapter = http.defaults.adapter;

afterEach(() => {
  http.defaults.adapter = originalAdapter;
  clearTransportIdentity();
});

const operatorPrincipal: SessionPrincipal = {
  id: '00000000-0000-4000-8000-000000000099',
  username: 'release-gate-operator',
  role: 'ADMIN',
  permissions: ['users:read', 'users:manage-admin', 'audit-logs:read'],
  source: 'jwt',
};

function renderWithProviders(
  ui: React.ReactNode,
  principal: SessionPrincipal | null = operatorPrincipal,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthContext.Provider
          value={{
            principal,
            loading: false,
            error: null,
            can: (perm) => principal?.permissions.includes(perm) ?? false,
            login: vi.fn(),
            logout: vi.fn(),
          }}
        >
          <FeedbackProvider>{ui}</FeedbackProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('M6 Release Gate — DoD AI (11.2–11.3), Negative Security (11.4–11.5) & Secret Hygiene (11.10)', () => {
  describe('11.2 (DOD-FE-AI-01..04) & 8.18: Tách biệt 3 vùng xác minh cổng, chống báo mở barrier giả & ErrorBoundary', () => {
    const baseVerification: VerificationView = {
      operation_id: '11111111-1111-4111-8111-111111111111',
      event_id: 'EVT-RELEASE-GATE-001',
      gate_id: 'GATE-VEH-01',
      direction: 'ENTRY',
      access_mode: 'car',
      status: 'COMPLETED',
      verification_status: 'PASSED',
      permit_granted: true,
      barrier_status: 'PENDING',
      command_id: 'cmd-001',
      reason_codes: [],
      factors: [
        { factor: 'card', status: 'PASSED', score: 1.0, reason_code: null },
        { factor: 'face', status: 'PASSED', score: 0.94, reason_code: null },
        { factor: 'plate', status: 'PASSED', score: 0.98, reason_code: null },
      ],
      received_at: '2026-10-21T08:00:00Z',
      verification_completed_at: '2026-10-21T08:00:01Z',
      command_sent_at: '2026-10-21T08:00:01Z',
      acknowledged_at: null,
    };

    it('hiển thị tách biệt 3 vùng (Quan sát, Cấp phép, Barrier) và chỉ báo Đã mở barrier (OPENED) khi cả 3 điều kiện đồng thời thỏa mãn', () => {
      expect(isBarrierConfirmedOpen(baseVerification)).toBe(false);

      const { rerender } = render(<VerificationResultCard verification={baseVerification} />);
      expect(screen.getByTestId('verification-factors')).toBeInTheDocument();
      expect(screen.getByTestId('verification-permit')).toBeInTheDocument();
      expect(screen.getByTestId('verification-barrier')).toBeInTheDocument();
      expect(screen.queryByText(/Đã mở barrier \(OPENED\)/)).not.toBeInTheDocument();
      expect(screen.getByText(/Đang chờ ACK thiết bị \(PENDING\)/)).toBeInTheDocument();

      const confirmed: VerificationView = {
        ...baseVerification,
        barrier_status: 'OPENED',
        acknowledged_at: '2026-10-21T08:00:02Z',
      };
      expect(isBarrierConfirmedOpen(confirmed)).toBe(true);
      rerender(<VerificationResultCard verification={confirmed} />);
      expect(screen.getByText(/Đã mở barrier \(OPENED\)/)).toBeInTheDocument();
    });

    it('ErrorBoundary bắt lỗi render/schema cục bộ mà không làm sập toàn trang', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      function BrokenAiWidget(): React.ReactNode {
        throw new Error('AI_SCHEMA_MALFORMED');
      }
      render(
        <div data-testid="outer-workspace">
          <ErrorBoundary fallback={(err) => <div role="alert">Đã cô lập lỗi: {err.message}</div>}>
            <BrokenAiWidget />
          </ErrorBoundary>
        </div>,
      );
      expect(screen.getByTestId('outer-workspace')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Đã cô lập lỗi: AI_SCHEMA_MALFORMED');
      spy.mockRestore();
    });
  });

  describe('11.3 (DOD-FE-AI-05..08) & 10.18: Tách biệt Dừng theo dõi luồng Client vs Hủy máy chủ, cleanup Blob URL & AiLiveRegion', () => {
    it('EvidenceViewer tạo và thu hồi URL.revokeObjectURL khi unmount, AiLiveRegion có role="status" aria-live="polite"', () => {
      const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ev-gate-evidence-1');
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
      const { unmount } = render(
        <>
          <AiLiveRegion message="Đang tổng hợp báo cáo AI" politeness="polite" debounceMs={0} />
          <EvidenceViewer source={blob} alt="Ảnh bằng chứng cổng" title="Bằng chứng #1" />
        </>,
      );

      const liveRegion = screen.getByTestId('ai-live-region');
      expect(liveRegion).toHaveAttribute('role', 'status');
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
      expect(createSpy).toHaveBeenCalledWith(blob);

      unmount();
      expect(revokeSpy).toHaveBeenCalledWith('blob:ev-gate-evidence-1');

      createSpy.mockRestore();
      revokeSpy.mockRestore();
    });
  });

  describe('11.4 (FE-NEG-01..04) & 7.14: Chống XSS trong SafeAiText/AlertsPanel và tách biệt bộ lọc Prompt AI khỏi trường mật khẩu', () => {
    it('FE-NEG-01 & FE-NEG-02: chuỗi độc hại <script> và <img onerror> được làm sạch hoàn toàn trong SafeAiText và AlertsPanel', () => {
      const maliciousPayload =
        '<script>window.__xss=1</script><img src="x" onerror="alert(1)"><a href="javascript:alert(2)">Click</a>Nội dung an toàn';

      const mockAlertsScreen: AlertsScreen = {
        data: {
          rows: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              event_id: 'EVT-XSS-01',
              sequence: 101,
              alert_type: 'TAILGATING',
              severity: 'HIGH',
              status: 'OPEN',
              message: maliciousPayload,
              data: {},
              occurred_at: '2026-10-21T08:00:00Z',
              resolved_at: null,
            },
          ],
          totalCount: 1,
          openCount: 1,
        },
        state: {
          search: '',
          statusFilter: 'ALL',
          severityFilter: 'ALL',
          syncStatus: 'synced',
          hasHistoryGap: false,
          gapWarning: null,
          invalidEventCount: 0,
          lastSyncedAt: '2026-10-21T08:00:00Z',
          error: null,
          updatingId: null,
          canRead: true,
          canUpdate: true,
        },
        actions: {
          setSearch: vi.fn(),
          setStatusFilter: vi.fn(),
          setSeverityFilter: vi.fn(),
          resetFilters: vi.fn(),
          resync: vi.fn(),
          transitionAlert: vi.fn(),
        },
      };

      const { container } = renderWithProviders(
        <div>
          <SafeAiText value={maliciousPayload} mode="safe-html" />
          <SafeAiText value={maliciousPayload} mode="plain-text" />
          <AlertsPanel screen={mockAlertsScreen} />
        </div>,
      );

      expect(container.querySelectorAll('script')).toHaveLength(0);
      expect(container.querySelector('[onerror]')).toBeNull();
      expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    });

    it('FE-NEG-03 & FE-NEG-04: inspectPromptPrivacy chặn cứng secrets/card_uid/sinh trắc nhưng ChangePasswordModal chấp nhận mật khẩu phức tạp hợp lệ', async () => {
      expect(inspectPromptPrivacy('Hãy kiểm tra password=SuperSecret123').allowed).toBe(false);
      expect(
        inspectPromptPrivacy('Token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def').allowed,
      ).toBe(false);
      expect(inspectPromptPrivacy('Tra cứu card_uid: E2000017221101441890ABCD').allowed).toBe(
        false,
      );
      expect(inspectPromptPrivacy('Vector face_embedding=[0.12, -0.44, 0.88]').allowed).toBe(false);

      let submittedPassword = '';
      const user = userEvent.setup();
      renderWithProviders(
        <ChangePasswordModal
          open
          onClose={vi.fn()}
          onSubmitPassword={async ({ new_password }) => {
            submittedPassword = new_password;
          }}
        />,
      );

      await user.type(screen.getByLabelText(/Mật khẩu hiện tại/i), 'OldPass!23456');
      await user.type(
        screen.getByLabelText(/Mật khẩu mới \(tối thiểu 12 ký tự\)/i),
        'Complex$Pass#2026! Bearer',
      );
      await user.type(screen.getByLabelText(/Xác nhận mật khẩu mới/i), 'Complex$Pass#2026! Bearer');
      await user.click(screen.getByRole('button', { name: /Đổi mật khẩu|Cập nhật mật khẩu/i }));

      await waitFor(() => {
        expect(submittedPassword).toBe('Complex$Pass#2026! Bearer');
      });
    });
  });

  describe('11.5 (FE-NEG-05..08) & 9.11: Cancel race COMPLETED, WS History Gap 4409, score null & Epoch Guard khi đổi phiên', () => {
    it('FE-NEG-05: khi yêu cầu hủy báo cáo vừa COMPLETED trên máy chủ, UI đồng bộ sang COMPLETED và giữ nguyên kết quả hợp lệ', async () => {
      const reportId = '77777777-7777-4777-8777-777777777777';
      const snapshotId = '88888888-8888-4888-8888-888888888888';

      http.defaults.adapter = async (config) => {
        if (config.method === 'get' && config.url === '/api/v1/assistant/reports') {
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            data: {
              items: [
                {
                  report_id: reportId,
                  owner_id: operatorPrincipal.id,
                  status: 'RUNNING',
                  created_at: '2026-10-21T08:00:00Z',
                  expires_at: '2026-10-28T08:00:00Z',
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
          };
        }
        if (
          config.method === 'post' &&
          config.url === `/api/v1/assistant/reports/${reportId}/cancel`
        ) {
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            data: {
              report_id: reportId,
              owner_id: operatorPrincipal.id,
              status: 'COMPLETED',
              created_at: '2026-10-21T08:00:00Z',
              expires_at: '2026-10-28T08:00:00Z',
              last_sequence: 4,
              result: {
                title: 'Báo cáo đã hoàn tất trước lệnh hủy',
                summary: 'Tổng hợp từ snapshot hợp lệ.',
                findings: ['Không phát hiện bất thường.'],
                metric_refs: [
                  {
                    metric_id: 'gate_attempts_total',
                    source_ref: 'gate_logs',
                    snapshot_id: snapshotId,
                  },
                ],
                limitations: [],
                suggested_checks: [],
                snapshot_id: snapshotId,
                data_as_of: '2026-10-21T08:00:02Z',
                model_id: 'evsg-local',
                model_version: '1.0.0',
                output_kind: 'model_report',
              },
              error_code: null,
              artifact_available: true,
            },
          };
        }
        throw new Error(`Unexpected: ${config.method} ${config.url}`);
      };

      const user = userEvent.setup();
      renderWithProviders(<AssistantPage />);

      const historyBtn = await screen.findByRole('button', { name: /77777777/ });
      await user.click(historyBtn);

      const cancelBtn = await screen.findByRole('button', {
        name: 'Yêu cầu hủy báo cáo trên máy chủ',
      });
      await user.click(cancelBtn);

      expect(await screen.findByText('Báo cáo đã hoàn tất trước lệnh hủy')).toBeInTheDocument();
      expect(screen.getByText('Trạng thái máy chủ: COMPLETED')).toBeInTheDocument();
    });

    it('FE-NEG-06: khi gặp 410 ALERT_HISTORY_GAP / WS close 4409, AlertSyncBadge hiển thị rõ Thiếu khoảng lịch sử (History Gap)', () => {
      expect(WS_CLOSE_HISTORY_GAP).toBe(4409);
      render(<AlertSyncBadge syncStatus="gap_detected" hasHistoryGap={true} />);
      expect(screen.getByText('Thiếu khoảng lịch sử (History Gap)')).toBeInTheDocument();
      expect(screen.queryByText('Đã đồng bộ realtime')).not.toBeInTheDocument();
    });

    it('FE-NEG-07: VerificationResultCard với score: null hiển thị "Chưa có điểm", không ép thành 0% hoặc NaN', () => {
      const verificationWithNullScore: VerificationView = {
        operation_id: '99999999-9999-4999-8999-999999999999',
        event_id: 'EVT-NULL-SCORE-01',
        gate_id: 'GATE-01',
        direction: 'ENTRY',
        access_mode: 'pedestrian',
        status: 'COMPLETED',
        verification_status: 'FAILED',
        permit_granted: false,
        barrier_status: 'NOT_REQUESTED',
        command_id: null,
        reason_codes: ['FACE_MISSING'],
        factors: [{ factor: 'face', status: 'NOT_RUN', score: null, reason_code: 'FACE_MISSING' }],
        received_at: '2026-10-21T08:00:00Z',
        verification_completed_at: '2026-10-21T08:00:01Z',
        command_sent_at: null,
        acknowledged_at: null,
      };

      render(<VerificationResultCard verification={verificationWithNullScore} />);
      expect(screen.getByTestId('factor-item-face')).toHaveTextContent(
        'Điểm tin cậy: Chưa có điểm',
      );
      expect(screen.getByTestId('factor-item-face')).not.toHaveTextContent('0.0%');
      expect(screen.getByTestId('factor-item-face')).not.toHaveTextContent('NaN');
    });

    it('FE-NEG-08: đổi phiên/clearTransportIdentity tăng epoch và vô hiệu hóa mọi phản hồi đến trễ của phiên cũ', () => {
      setAuthToken('jwt-session-user-a');
      const isCurrentUserA = captureIdentityGuard();
      expect(isCurrentUserA()).toBe(true);

      clearTransportIdentity();
      expect(getAuthToken()).toBeNull();
      expect(isCurrentUserA()).toBe(false);

      setAuthToken('jwt-session-user-b');
      const isCurrentUserB = captureIdentityGuard();
      expect(isCurrentUserA()).toBe(false);
      expect(isCurrentUserB()).toBe(true);
    });
  });

  describe('11.10: Secret Hygiene & In-Memory Token Discipline', () => {
    it('không lưu token vào localStorage/sessionStorage và bộ lọc sanitizeDeviceSettingsRecord che toàn bộ khóa nhạy cảm', () => {
      localStorage.clear();
      sessionStorage.clear();
      setAuthToken('in-memory-only-jwt-token');

      expect(getAuthToken()).toBe('in-memory-only-jwt-token');
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);

      expect(isSecretSettingKey('rtsp_password')).toBe(true);
      expect(isSecretSettingKey('client_secret')).toBe(true);
      expect(isSecretSettingKey('private_key')).toBe(true);
      expect(isSecretSettingKey('camera_code')).toBe(false);

      const sanitized = sanitizeDeviceSettingsRecord({
        camera_code: 'CAM-01',
        rtsp_password: 'plain-password-123',
        nested: {
          api_key: 'sk-live-secret',
          fps: 25,
        },
      });
      expect(sanitized).toEqual({
        camera_code: 'CAM-01',
        rtsp_password: '[REDACTED]',
        nested: {
          api_key: '[REDACTED]',
          fps: 25,
        },
      });
    });
  });
});
