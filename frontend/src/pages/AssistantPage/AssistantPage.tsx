import { Link } from 'react-router';
import {
  ArrowsClockwiseIcon,
  LightningIcon,
  PlugsIcon,
  ProhibitIcon,
  ShieldWarningIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import {
  AI_REPORT_PIPELINE_STEPS,
  reportResultSchema,
  useAssistantScreen,
} from '@/features/assistant';
import type { DataRiskLevel, ReportStatus, ReportTemplate } from '@/features/assistant';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { WorkspaceLayout } from '@/layouts/WorkspaceLayout';
import { paths } from '@/shared/config';
import { formatDate, fromDateInputValue, toDateInputValue } from '@/shared/lib';
import { ErrorBoundary } from '@/shared/ui/AsyncBoundary';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DecryptedText } from '@/shared/ui/DecryptedText';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { AiLiveRegion, SafeAiText } from '@/shared/ui/SafeAiText';
import { Select } from '@/shared/ui/Select';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import { StatePanel } from '@/shared/ui/StatePanel';

const RISK_LEVEL_BADGE: Record<
  DataRiskLevel,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  NONE: { label: 'Sẵn sàng kiểm tra dữ liệu', tone: 'neutral' },
  PUBLIC: { label: 'Public — An toàn', tone: 'success' },
  INTERNAL: { label: 'Internal', tone: 'info' },
  CONFIDENTIAL: { label: 'Confidential — Tự động Masking', tone: 'warning' },
  RESTRICTED: { label: 'Restricted — Cấm gửi', tone: 'danger' },
};

const QUICK_PROMPTS: ReadonlyArray<{ label: string; prompt: string; template: ReportTemplate }> = [
  {
    label: 'Lưu lượng hôm nay',
    template: 'access-summary',
    prompt:
      'Tóm tắt lưu lượng phương tiện và tỷ lệ xác nhận mở barrier (OPENED) tại các cổng trong ca trực hôm nay.',
  },
  {
    label: 'Cảnh báo mức HIGH',
    template: 'alerts-summary',
    prompt:
      'Phân tích nguyên nhân các cảnh báo mức HIGH và các lượt bị từ chối cấp phép (PERMIT DENIED).',
  },
  {
    label: 'So sánh biến động ca trực',
    template: 'period-comparison',
    prompt:
      'Đối chiếu biến động lưu lượng xe tải ra vào kho và lượt nhân viên đi bộ giữa hai ngày gần nhất.',
  },
];

function resolvePipelineStepIndex(status: ReportStatus): number {
  const normalized = status === 'CANCEL_REQUESTED' ? 'RUNNING' : status;
  return AI_REPORT_PIPELINE_STEPS.findIndex((step) => step.id === normalized);
}

function ValidatedAiReportResultView({ rawResult }: { rawResult: unknown }) {
  const parsed = reportResultSchema.safeParse(rawResult);
  if (!parsed.success) {
    throw new Error('AI_RESULT_SCHEMA_INVALID');
  }
  const result = parsed.data;

  return (
    <div className="space-y-4" data-testid="assistant-report-result">
      <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-[var(--color-ink)]">
            <SafeAiText as="span" value={result.title} />
          </h3>
          <Badge tone={result.output_kind === 'model_report' ? 'success' : 'warning'}>
            {result.output_kind === 'model_report'
              ? 'Báo cáo mô hình nội bộ (model_report)'
              : 'Báo cáo tóm tắt dữ liệu theo mẫu dự phòng (data_summary)'}
          </Badge>
        </div>
        <SafeAiText
          className="text-sm leading-relaxed text-[var(--color-ink-secondary)]"
          value={result.summary}
        />
        <p className="text-xs text-[var(--color-muted)] mono pt-1">
          Mô hình: {result.model_id} ({result.model_version}) · Snapshot: {result.snapshot_id} · Dữ
          liệu đến: {formatDate(result.data_as_of)}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Phát hiện chính (Findings)
          </h4>
          <ul className="list-disc pl-4 space-y-1 text-xs">
            {result.findings.map((item, idx) => (
              <li key={idx}>
                <SafeAiText as="span" value={item} />
              </li>
            ))}
          </ul>
        </div>

        <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Giới hạn & Đề xuất kiểm tra
          </h4>
          {result.limitations.length > 0 && (
            <ul className="list-disc pl-4 space-y-1 text-xs text-[var(--color-warning)]">
              {result.limitations.map((lim, idx) => (
                <li key={idx}>
                  Giới hạn: <SafeAiText as="span" value={lim} />
                </li>
              ))}
            </ul>
          )}
          {result.suggested_checks.length > 0 && (
            <ul className="list-disc pl-4 space-y-1 text-xs text-[var(--color-muted)]">
              {result.suggested_checks.map((chk, idx) => (
                <li key={idx}>
                  Kiểm tra: <SafeAiText as="span" value={chk} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div
        className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2"
        data-testid="assistant-metric-citations"
      >
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Trích dẫn nguồn chỉ số đối chứng (Metric Citations)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {result.metric_refs.map((ref, idx) => (
            <div
              key={`${ref.metric_id}-${idx}`}
              className="p-2 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] flex items-center justify-between gap-2 mono"
            >
              <span className="font-semibold">{ref.metric_id}</span>
              <span className="text-[var(--color-muted)]">
                {ref.source_ref} · {ref.snapshot_id.slice(0, 8)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AssistantPage() {
  const { data, state, actions } = useAssistantScreen();

  if (state.unavailable) {
    return (
      <StatePanel
        kind="unavailable"
        title="Chức năng đang được hoàn thiện"
        action={
          <Link to={paths.overview} className="button button--secondary button--sm">
            Quay lại trang Tổng quan
          </Link>
        }
      >
        Không gian AI Assistant tự chủ nội bộ (FE-G05) yêu cầu phiên đăng nhập vận hành hợp lệ và
        dịch vụ tổng hợp báo cáo từ máy chủ.
      </StatePanel>
    );
  }

  const active = data.activeReport;
  const isRunning =
    active &&
    (active.status === 'QUEUED' ||
      active.status === 'RUNNING' ||
      active.status === 'VALIDATING' ||
      active.status === 'CANCEL_REQUESTED');

  const riskBadge = RISK_LEVEL_BADGE[data.privacyCheck.riskLevel];
  const canSubmitPrompt =
    data.privacyCheck.allowed &&
    data.prompt.trim().length > 0 &&
    (!data.privacyCheck.requiresMasking || data.maskConfidentialPii);

  const liveAnnouncement = active
    ? `Báo cáo ${active.report_id} đang ở trạng thái ${active.status}`
    : 'Sẵn sàng khởi tạo báo cáo phân tích AI Assistant';

  return (
    <ListPageLayout
      title="AI Assistant"
      description="Tổng hợp báo cáo vận hành có kiểm chứng số liệu trên mô hình nội bộ (Self-hosted)."
      actions={
        <Button
          variant="secondary"
          size="sm"
          pending={state.fetchingHistory}
          icon={<ArrowsClockwiseIcon size={16} />}
          onClick={() => void actions.refreshHistory()}
        >
          Làm mới lịch sử
        </Button>
      }
    >
      <AiLiveRegion message={liveAnnouncement} politeness="polite" />
      <WorkspaceLayout
        primary={
          <div className="space-y-5">
            {/* 1. KHUNG SOẠN THẢO TỐI GIẢN & HIỆN ĐẠI */}
            <SpotlightCard className="space-y-4" data-testid="assistant-composer">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-[var(--color-ink)]">
                  Khởi tạo báo cáo phân tích
                </h2>
                <Badge tone={riskBadge.tone} data-testid="assistant-risk-badge">
                  {riskBadge.label}
                </Badge>
              </div>

              {/* Cảnh báo chỉ xuất hiện khi có vi phạm hoặc PII */}
              {!data.privacyCheck.allowed && (
                <div
                  role="alert"
                  data-testid="assistant-privacy-guard"
                  className="p-3 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] text-[var(--color-danger)] text-xs flex items-start gap-2"
                >
                  <ShieldWarningIcon size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Đã chặn dữ liệu hạn chế (Restricted Data Guard)</p>
                    <p className="mt-0.5">{data.privacyCheck.message}</p>
                  </div>
                </div>
              )}

              {data.privacyCheck.allowed && data.privacyCheck.requiresMasking && (
                <div
                  role="alert"
                  data-testid="assistant-pii-masking-warning"
                  className="p-3 rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-subtle)] text-xs space-y-1.5"
                >
                  <p className="font-semibold text-[var(--color-ink)]">
                    Phát hiện dữ liệu cá nhân (Confidential PII)
                  </p>
                  <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-[var(--color-ink-secondary)]">
                    <input
                      type="checkbox"
                      checked={data.maskConfidentialPii}
                      onChange={(e) => actions.setMaskConfidentialPii(e.target.checked)}
                    />
                    Tự động ẩn danh Email / Số điện thoại thành{' '}
                    <code className="mono">[MASKED]</code> trước khi gửi
                  </label>
                </div>
              )}

              {state.error && (
                <div role="alert" className="form-error" data-testid="assistant-error">
                  {state.error}
                </div>
              )}

              {/* Thanh chọn Mẫu báo cáo + Chọn Từ ngày / Đến ngày gọn gàng trên 1 hàng */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field id="ast-template" label="Mẫu báo cáo">
                  <Select
                    id="ast-template"
                    value={data.template}
                    onChange={(e) => actions.setTemplate(e.target.value as ReportTemplate | '')}
                  >
                    <option value="access-summary">Tổng hợp lưu lượng ra vào</option>
                    <option value="alerts-summary">Tóm tắt cảnh báo an ninh</option>
                    <option value="period-comparison">So sánh biến động theo kỳ</option>
                    <option value="">Tự chọn theo câu hỏi</option>
                  </Select>
                </Field>

                <Field id="ast-from" label="Từ ngày">
                  <Input
                    id="ast-from"
                    type="date"
                    value={toDateInputValue(data.from)}
                    onChange={(e) => actions.setFrom(fromDateInputValue(e.target.value, false))}
                  />
                </Field>

                <Field id="ast-to" label="Đến ngày">
                  <Input
                    id="ast-to"
                    type="date"
                    value={toDateInputValue(data.to)}
                    onChange={(e) => actions.setTo(fromDateInputValue(e.target.value, true))}
                  />
                </Field>
              </div>

              {/* Khung nhập câu hỏi tích hợp Gợi ý nhanh & Nút gửi */}
              <div className="space-y-1.5">
                <label
                  htmlFor="ast-prompt"
                  className="text-xs font-medium text-[var(--color-ink-secondary)]"
                >
                  Nội dung yêu cầu phân tích (Prompt) *
                </label>
                <div
                  className={`ai-composer-dock ${
                    !data.privacyCheck.allowed ? 'ai-composer-dock--restricted' : ''
                  }`}
                >
                  <textarea
                    id="ast-prompt"
                    value={data.prompt}
                    maxLength={4000}
                    rows={3}
                    onChange={(e) => actions.setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSubmitPrompt) {
                        e.preventDefault();
                        void actions.submitReport();
                      }
                    }}
                    placeholder="Nhập câu hỏi phân tích hoặc chọn gợi ý nhanh bên dưới..."
                    className="ai-composer-textarea"
                  />

                  <div className="ai-composer-toolbar">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {QUICK_PROMPTS.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            actions.setTemplate(item.template);
                            actions.setPrompt(item.prompt);
                          }}
                          className="ai-prompt-chip"
                        >
                          <LightningIcon
                            size={12}
                            weight="fill"
                            className="text-[var(--color-accent)]"
                          />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 ml-auto">
                      <span className="text-xs text-[var(--color-muted)] mono">
                        {data.prompt.length}/4000
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        pending={state.creating}
                        disabled={!canSubmitPrompt}
                        icon={<SparkleIcon size={15} weight="fill" />}
                        onClick={() => void actions.submitReport()}
                      >
                        Tạo báo cáo phân tích
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </SpotlightCard>

            {/* 2. KẾT QUẢ & TIẾN TRÌNH XỬ LÝ */}
            <SpotlightCard
              className="space-y-4"
              data-testid="assistant-active-report"
              aria-live="polite"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-[var(--color-ink)]">
                  Kết quả phân tích
                </h2>
                {active && (
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        active.status === 'COMPLETED'
                          ? 'success'
                          : active.status === 'CANCELED' || active.status === 'FAILED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      Trạng thái máy chủ: {active.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      pending={state.refreshingReport}
                      icon={<ArrowsClockwiseIcon size={15} />}
                      onClick={() => void actions.refreshReport(active.report_id)}
                    >
                      Đồng bộ trạng thái
                    </Button>
                  </div>
                )}
              </div>

              {!active ? (
                <StatePanel kind="empty" title="Chưa chọn báo cáo phân tích">
                  Khởi tạo báo cáo mới ở khung phía trên hoặc chọn một báo cáo từ lịch sử bên phải.
                </StatePanel>
              ) : (
                <div className="space-y-4 text-sm">
                  <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-[var(--color-muted)]">Mã báo cáo: </span>
                      <strong className="mono">
                        <DecryptedText text={active.report_id} />
                      </strong>
                      <span className="text-[var(--color-muted)]"> · Chuỗi sự kiện: </span>
                      <span className="mono">#{active.last_sequence}</span>
                    </div>
                    <div className="text-[var(--color-muted)]">
                      Hết hạn lưu trữ: <span className="mono">{formatDate(active.expires_at)}</span>
                    </div>
                  </div>

                  {/* Pipeline Tiến trình thực tế từ Worker (Mục 3.3, DOD-FE-AI-03) */}
                  <ol
                    aria-label="Tiến trình xử lý báo cáo AI"
                    data-testid="assistant-pipeline-timeline"
                    className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs"
                  >
                    {AI_REPORT_PIPELINE_STEPS.filter(
                      (step) =>
                        (step.id !== 'FAILED' && step.id !== 'CANCELED') ||
                        step.id === active.status,
                    ).map((step, index) => {
                      const currentIdx = resolvePipelineStepIndex(active.status);
                      const isActive =
                        step.id === active.status ||
                        (active.status === 'CANCEL_REQUESTED' && step.id === 'RUNNING');
                      const isDone =
                        active.status === 'COMPLETED' ||
                        (currentIdx >= 0 &&
                          index < currentIdx &&
                          active.status !== 'FAILED' &&
                          active.status !== 'CANCELED');

                      return (
                        <li
                          key={step.id}
                          aria-current={isActive ? 'step' : undefined}
                          className={`p-2.5 rounded-lg border space-y-1 ${
                            isActive
                              ? 'border-[var(--color-primary)] bg-[var(--color-emerald-soft)]'
                              : isDone
                                ? 'border-[var(--color-border)] bg-[var(--color-surface-subtle)]'
                                : 'border-[var(--color-border-subtle)] bg-[var(--color-surface)] opacity-75'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <strong className="font-semibold text-[var(--color-ink)]">
                              {step.label}
                            </strong>
                            <Badge
                              tone={
                                isActive
                                  ? 'info'
                                  : isDone
                                    ? 'success'
                                    : step.id === 'FAILED' || step.id === 'CANCELED'
                                      ? 'danger'
                                      : 'neutral'
                              }
                            >
                              {isActive ? 'Đang xử lý' : isDone ? 'Hoàn tất' : 'Chờ'}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-[var(--color-muted)]">
                            {step.description}
                          </p>
                        </li>
                      );
                    })}
                  </ol>

                  {data.streamState === 'disconnected_by_client' && (
                    <div
                      role="status"
                      data-testid="assistant-stream-disconnected"
                      className="p-3 rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-subtle)] text-xs space-y-1"
                    >
                      <p className="font-semibold">
                        Đã dừng theo dõi luồng sự kiện trên trình duyệt (Client Stream Disconnected)
                      </p>
                      <p className="text-[var(--color-muted)]">
                        Việc ngắt kết nối luồng SSE tại trình duyệt <strong>không hủy</strong> tiến
                        trình tạo báo cáo trên máy chủ. Trạng thái máy chủ hiện tại vẫn là{' '}
                        <code className="mono">{active.status}</code>.
                      </p>
                    </div>
                  )}

                  {isRunning && (
                    <div
                      className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-wrap items-center justify-between gap-2"
                      data-testid="assistant-running-controls"
                    >
                      <span className="text-xs text-[var(--color-muted)]">
                        Giai đoạn thực tế từ worker:{' '}
                        <strong className="mono">{active.status}</strong>
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          icon={<PlugsIcon size={15} />}
                          onClick={actions.disconnectStream}
                        >
                          Dừng theo dõi luồng (Client)
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          pending={state.canceling}
                          icon={<ProhibitIcon size={15} />}
                          onClick={() => void actions.requestServerCancel(active.report_id)}
                        >
                          Yêu cầu hủy báo cáo trên máy chủ
                        </Button>
                      </div>
                    </div>
                  )}

                  {active.status === 'CANCELED' && (
                    <div
                      className="p-3 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] text-xs text-[var(--color-danger)] font-medium"
                      data-testid="assistant-canceled-confirmed"
                    >
                      Máy chủ đã xác nhận hủy báo cáo thành công (CANCELED).
                    </div>
                  )}

                  {active.result !== null && (
                    <ErrorBoundary
                      fallback={(_err, reset) => (
                        <div
                          role="alert"
                          aria-live="assertive"
                          data-testid="assistant-result-fallback"
                          className="p-4 rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-subtle)] space-y-2 text-xs"
                        >
                          <p className="font-semibold text-sm text-[var(--color-ink)]">
                            Yêu cầu cần được xử lý thủ công
                          </p>
                          <p className="text-[var(--color-muted)]">
                            Kết quả báo cáo AI chưa đạt định dạng schema an toàn. Hệ thống đã chuyển
                            sang luồng kiểm tra an toàn để đảm bảo độ chính xác.
                          </p>
                          <Button size="sm" variant="secondary" onClick={reset}>
                            Thử hiển thị lại
                          </Button>
                        </div>
                      )}
                    >
                      <ValidatedAiReportResultView rawResult={active.result} />
                    </ErrorBoundary>
                  )}
                </div>
              )}
            </SpotlightCard>
          </div>
        }
        secondary={
          <SpotlightCard className="space-y-3" data-testid="assistant-history-panel">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">Lịch sử báo cáo</h3>
              <Badge tone="neutral">{data.reports.length}</Badge>
            </div>

            <Select
              aria-label="Lọc trạng thái báo cáo AI"
              value={data.statusFilter}
              onChange={(e) => actions.setStatusFilter(e.target.value as ReportStatus | '')}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="RUNNING">Đang xử lý (RUNNING)</option>
              <option value="COMPLETED">Hoàn tất (COMPLETED)</option>
              <option value="CANCELED">Đã hủy (CANCELED)</option>
              <option value="FAILED">Lỗi (FAILED)</option>
            </Select>

            {data.reports.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)] py-2">
                Chưa có báo cáo nào được khởi tạo trong phiên hiện tại.
              </p>
            ) : (
              <div className="space-y-2">
                {data.reports.map((rep) => (
                  <button
                    key={rep.report_id}
                    type="button"
                    onClick={() => actions.selectReport(rep)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs space-y-1 transition cursor-pointer ${
                      active?.report_id === rep.report_id
                        ? 'border-[var(--color-primary)] bg-[var(--color-emerald-soft)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-subtle)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono font-semibold">{rep.report_id.slice(0, 12)}...</span>
                      <Badge
                        tone={
                          rep.status === 'COMPLETED'
                            ? 'success'
                            : rep.status === 'CANCELED' || rep.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {rep.status}
                      </Badge>
                    </div>
                    <p className="text-[var(--color-muted)]">
                      Tạo lúc: {formatDate(rep.created_at)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </SpotlightCard>
        }
      />
    </ListPageLayout>
  );
}
