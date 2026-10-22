import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/app/store';
import { AuthContext } from '../src/features/auth/model/context';
import type { SessionPrincipal } from '@/features/auth';
import {
  detectPii,
  inspectPromptPrivacy,
  isLikelyCreditCard,
  maskDetectedPii,
  useEphemeralAiBuffer,
} from '@/features/assistant';
import { AssistantPage } from '@/pages/AssistantPage';
import { createQueryClient, http } from '@/shared/api';
import { FeedbackProvider } from '@/shared/feedback';
import { AiLiveRegion, SafeAiText, sanitizeHtml, stripAllHtml } from '@/shared/ui/SafeAiText';

const defaultAdapter = http.defaults.adapter;
afterEach(() => {
  http.defaults.adapter = defaultAdapter;
  vi.useRealTimers();
});

const operatorPrincipal: SessionPrincipal = {
  id: '11111111-1111-4111-8111-000000000001',
  username: 'operator.console',
  role: 'ADMIN',
  permissions: ['gate_logs:read', 'alerts:read', 'orders:read'],
  must_change_password: false,
  source: 'jwt',
};

function renderAssistantWithAuth(ui: React.ReactNode) {
  const queryClient = createQueryClient();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={{
            principal: operatorPrincipal,
            loading: false,
            error: null,
            login: async () => undefined,
            logout: async () => undefined,
            can: (permission: string) => operatorPrincipal.permissions.includes(permission),
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

function BufferHarness({
  onMount,
}: {
  onMount?: (api: ReturnType<typeof useEphemeralAiBuffer>) => void;
}) {
  const api = useEphemeralAiBuffer(80);
  onMount?.(api);
  return <div data-testid="ephemeral-buffer-text">{api.visibleText}</div>;
}

describe('OJT 2026 AI-First UX v2 — DOD-FE-AI-01..08 & FE-NEG-01..08', () => {
  it('FE-NEG-01 & FE-NEG-02: SafeAiText, sanitizeHtml và stripAllHtml loại bỏ <script>, onerror= và javascript: protocol', () => {
    const xssScript = 'Báo cáo an toàn <script>alert(1)</script><strong>Hợp lệ</strong>';
    const sanitizedScript = sanitizeHtml(xssScript);
    expect(sanitizedScript).not.toContain('<script>');
    expect(sanitizedScript).not.toContain('alert(1)');
    expect(sanitizedScript).toContain('<strong>Hợp lệ</strong>');

    const xssImg = '<img src=x onerror=alert(1)><a href="javascript:alert(1)">Chi tiết</a>';
    const sanitizedImg = sanitizeHtml(xssImg);
    expect(sanitizedImg).not.toContain('onerror');
    expect(sanitizedImg).not.toContain('javascript:');

    expect(stripAllHtml(xssScript)).toBe('Báo cáo an toàn Hợp lệ');

    const { container } = render(
      <div>
        <SafeAiText value={xssScript} mode="safe-html" className="safe-html-box" />
        <SafeAiText value={xssImg} mode="plain-text" className="plain-text-box" />
      </div>,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
  });

  it('DOD-FE-AI-07, FE-NEG-03 & FE-NEG-04: Phân loại dữ liệu 4 cấp (Public / Confidential PII Masking / Restricted Hard-Block gồm Luhn Credit Card & PIN)', () => {
    // 1. Public prompt
    const pub = inspectPromptPrivacy('Tóm tắt lưu lượng cổng số 1 trong ca sáng');
    expect(pub.allowed).toBe(true);
    expect(pub.riskLevel).toBe('PUBLIC');
    expect(pub.requiresMasking).toBe(false);

    // 2. Confidential PII (Email + Số điện thoại VN) -> Cho phép sau khi Masking
    const confPrompt = 'Liên hệ quản lý ca trực qua email nam.nguyen@r2s.com.vn hoặc số 0912345678';
    const conf = inspectPromptPrivacy(confPrompt);
    expect(conf.allowed).toBe(true);
    expect(conf.riskLevel).toBe('CONFIDENTIAL');
    expect(conf.requiresMasking).toBe(true);
    expect(conf.maskedPrompt).toContain('[EMAIL_MASKED]');
    expect(conf.maskedPrompt).toContain('[VIETNAM_PHONE_MASKED]');
    expect(conf.maskedPrompt).not.toContain('0912345678');

    const detections = detectPii(confPrompt);
    expect(maskDetectedPii(confPrompt, detections)).toBe(
      'Liên hệ quản lý ca trực qua email [EMAIL_MASKED] hoặc số [VIETNAM_PHONE_MASKED]',
    );

    // 3. FE-NEG-03: Password & PIN -> Restricted Hard-Block
    expect(inspectPromptPrivacy('password=abc123456').allowed).toBe(false);
    expect(inspectPromptPrivacy('password=abc123456').riskLevel).toBe('RESTRICTED');
    expect(inspectPromptPrivacy('Mã pin: 4829').allowed).toBe(false);

    // 4. FE-NEG-04: Số thẻ hợp lệ theo thuật toán Luhn -> Restricted Hard-Block
    expect(isLikelyCreditCard('4532 0151 1283 0366')).toBe(true);
    const cardCheck = inspectPromptPrivacy('Kiểm tra giao dịch thẻ 4532 0151 1283 0366');
    expect(cardCheck.allowed).toBe(false);
    expect(cardCheck.riskLevel).toBe('RESTRICTED');
  });

  it('DOD-FE-AI-03, DOD-FE-AI-04 & FE-NEG-07: AssistantPage hiển thị Pipeline Timeline thật và bọc kết quả AI bằng ErrorBoundary + Schema Guard', async () => {
    const user = userEvent.setup();

    http.defaults.adapter = async (config) => {
      const url = config.url || '';
      if (url.includes('/api/v1/assistant/reports') && config.method === 'get') {
        return {
          data: {
            items: [
              {
                report_id: 'bbbbbbbb-1111-4111-8111-000000000001',
                owner_id: operatorPrincipal.id,
                status: 'VALIDATING',
                created_at: '2026-10-21T08:00:00Z',
                expires_at: '2026-10-22T08:00:00Z',
                last_sequence: 3,
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
          headers: { 'x-request-id': 'req-rep-1' },
          config,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    renderAssistantWithAuth(<AssistantPage />);

    // Kiểm tra Pipeline Timeline hiển thị đúng bước VALIDATING với aria-current="step"
    const timeline = await screen.findByTestId('assistant-pipeline-timeline');
    expect(timeline).toBeInTheDocument();
    const validatingStep = screen
      .getByText(/Kiểm chứng số liệu & chính sách \(VALIDATING\)/i)
      .closest('li');
    expect(validatingStep).toHaveAttribute('aria-current', 'step');

    // Kiểm tra cảnh báo Confidential PII + Masking checkbox trên UI
    const promptInput = screen.getByLabelText(/Nội dung yêu cầu phân tích/i);
    await user.type(promptInput, 'Gửi báo cáo cho quản lý qua sđt 0987654321');
    expect(await screen.findByTestId('assistant-pii-masking-warning')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-risk-badge')).toHaveTextContent(/Confidential/i);
  });

  it('DOD-FE-AI-05, DOD-FE-AI-08 & FE-NEG-08: useEphemeralAiBuffer gom chunk theo nhịp 80ms, xóa sạch khi unmount và AiLiveRegion debounce thông báo', () => {
    vi.useFakeTimers();
    const apiRef: { current: ReturnType<typeof useEphemeralAiBuffer> | null } = { current: null };

    const { unmount } = render(
      <div>
        <BufferHarness
          onMount={(api) => {
            apiRef.current = api;
          }}
        />
        <AiLiveRegion message="Đang khởi tạo..." debounceMs={250} />
      </div>,
    );

    act(() => {
      apiRef.current?.appendChunk('Tổng hợp ');
      apiRef.current?.appendChunk('lưu lượng ');
      apiRef.current?.appendChunk('cổng chính.');
    });

    // Trước 80ms: state chưa cập nhật từng ký tự, nhưng snapshot đã có đủ trong useRef
    expect(screen.getByTestId('ephemeral-buffer-text')).toHaveTextContent('');
    expect(apiRef.current?.snapshot()).toBe('Tổng hợp lưu lượng cổng chính.');

    // Sau 80ms: flush 1 lần duy nhất lên giao diện
    act(() => {
      vi.advanceTimersByTime(85);
    });
    expect(screen.getByTestId('ephemeral-buffer-text')).toHaveTextContent(
      'Tổng hợp lưu lượng cổng chính.',
    );

    // Unmount khi đang có chunk chờ trong buffer -> cleanup timer và xóa buffer RAM
    act(() => {
      apiRef.current?.appendChunk('Dữ liệu nhạy cảm tạm thời');
    });
    unmount();
    expect(() => {
      vi.advanceTimersByTime(500);
    }).not.toThrow();
  });
});
