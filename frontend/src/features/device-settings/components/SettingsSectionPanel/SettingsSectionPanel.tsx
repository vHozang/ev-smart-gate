import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  ListBulletsIcon,
  LockKeyIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from '@phosphor-icons/react';
import { formatDate } from '@/shared/lib';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { StatePanel } from '@/shared/ui/StatePanel';
import type { DeviceConfigGroup } from '../../api';
import type { DeviceSettingsScreen } from '../../model/types';

export interface SettingsSectionPanelProps {
  screen: DeviceSettingsScreen;
}

export function SettingsSectionPanel({ screen }: SettingsSectionPanelProps) {
  const { data, state, actions } = screen;
  const sectionId = data.section.id;

  return (
    <div className="settings-workspace">
      <section className="surface">
        <header className="section-heading">
          <div>
            <p className="eyebrow mb-2">{data.section.scope}</p>
            <h2>{data.section.title}</h2>
            <p>{data.section.description}</p>
          </div>
          <div className="flex items-center gap-2">
            {data.apiReady && sectionId !== 'history' && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<PlusIcon size={16} />}
                  onClick={() => actions.selectConfig(null)}
                >
                  Tạo bản ghi mới
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  pending={state.loadingConfigs}
                  icon={<ArrowsClockwiseIcon size={16} />}
                  onClick={() => void actions.reloadConfigs()}
                >
                  Làm mới
                </Button>
              </>
            )}
            {data.apiReady && sectionId === 'history' && (
              <Button
                size="sm"
                variant="secondary"
                pending={state.loadingAuditLogs}
                icon={<ArrowsClockwiseIcon size={16} />}
                onClick={() => void actions.reloadAuditLogs()}
              >
                Làm mới lịch sử
              </Button>
            )}
            <Button size="sm" icon={<ListBulletsIcon size={17} />} onClick={actions.showFields}>
              Xem trường cấu hình
            </Button>
          </div>
        </header>

        <div
          className="settings-list-heading"
          role="region"
          tabIndex={0}
          aria-label="Thông tin danh sách dự kiến"
        >
          {data.section.columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>

        {state.apiError && (
          <div role="alert" className="form-error m-4" data-testid="device-settings-api-error">
            {state.apiError}
          </div>
        )}

        {!data.apiReady ? (
          <StatePanel
            kind="unavailable"
            title={
              sectionId === 'history'
                ? 'Chưa có nguồn lịch sử cấu hình'
                : 'Chưa tải được cấu hình hiện hành'
            }
          >
            <p>
              {sectionId === 'history'
                ? 'Lịch sử thay đổi và kết quả áp dụng sẽ được cung cấp từ nhật ký hệ thống.'
                : 'Danh sách sẽ hiển thị thiết bị và phiên bản cấu hình được xác nhận từ dịch vụ.'}
            </p>
          </StatePanel>
        ) : sectionId === 'history' ? (
          <div className="p-4 space-y-4" data-testid="device-audit-logs-panel">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field id="audit-filter-group" label="Lọc nhóm thiết bị">
                <Select
                  id="audit-filter-group"
                  value={data.auditGroupFilter}
                  onChange={(e) =>
                    actions.setAuditGroupFilter(e.target.value as DeviceConfigGroup | '')
                  }
                >
                  <option value="">Tất cả nhóm thiết bị</option>
                  <option value="cameras">Camera (cameras)</option>
                  <option value="models">Mô hình nhận diện (models)</option>
                  <option value="barriers">Barrier (barriers)</option>
                  <option value="readers">Đầu đọc thẻ (readers)</option>
                  <option value="bindings">Cổng & làn (bindings)</option>
                </Select>
              </Field>

              <Field id="audit-filter-outcome" label="Kết quả thực thi">
                <Select
                  id="audit-filter-outcome"
                  value={data.auditOutcomeFilter}
                  onChange={(e) =>
                    actions.setAuditOutcomeFilter(e.target.value as 'SUCCEEDED' | 'FAILED' | '')
                  }
                >
                  <option value="">Tất cả kết quả</option>
                  <option value="SUCCEEDED">Thành công (SUCCEEDED)</option>
                  <option value="FAILED">Thất bại (FAILED)</option>
                </Select>
              </Field>

              <Field id="audit-filter-action" label="Lọc theo hành động">
                <Input
                  id="audit-filter-action"
                  value={data.auditActionFilter}
                  onChange={(e) => actions.setAuditActionFilter(e.target.value)}
                  placeholder="Ví dụ: update, apply, connectivity-test..."
                />
              </Field>
            </div>

            {data.auditLogs.length === 0 ? (
              <StatePanel kind="empty" title="Chưa có bản ghi lịch sử cấu hình phù hợp">
                <p>Không tìm thấy sự kiện kiểm toán cấu hình thiết bị trong bộ lọc hiện tại.</p>
              </StatePanel>
            ) : (
              <div className="space-y-2" data-testid="device-audit-logs-list">
                {data.auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-wrap items-start justify-between gap-3 text-xs"
                    data-testid={`device-audit-row-${log.id}`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="mono">{log.action}</strong>
                        <Badge tone="neutral">{log.target_type}</Badge>
                        <Badge tone={log.outcome === 'SUCCEEDED' ? 'success' : 'danger'}>
                          {log.outcome}
                        </Badge>
                      </div>
                      <p className="text-[var(--color-muted)]">
                        Bản ghi đích: <code className="mono">{log.target_id ?? '—'}</code> · Thời
                        gian: {formatDate(log.occurred_at)}
                        {log.request_id ? ` · Request ID: ${log.request_id}` : ''}
                      </p>
                      <p
                        className="mono text-[11px] text-[var(--color-ink-secondary)]"
                        data-testid={`device-audit-changes-${log.id}`}
                      >
                        redacted_changes: {JSON.stringify(log.redacted_changes)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-3" data-testid="device-config-server-list">
            {data.configs.length === 0 ? (
              <StatePanel kind="empty" title="Chưa có bản ghi cấu hình hiện hành">
                <p>
                  Nhóm {data.section.title} chưa có cấu hình đã lưu trên máy chủ. Nhập tên cấu hình
                  và nhấn Lưu cấu hình để khởi tạo.
                </p>
              </StatePanel>
            ) : (
              <div className="space-y-2">
                {data.configs.map((cfg) => {
                  const isSelected = data.selectedConfig?.id === cfg.id;
                  return (
                    <div
                      key={cfg.id}
                      data-testid={`device-config-card-${cfg.id}`}
                      onClick={() => actions.selectConfig(cfg)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          actions.selectConfig(cfg);
                        }
                      }}
                      className={`p-3 rounded-lg border text-xs space-y-1.5 cursor-pointer transition ${
                        isSelected
                          ? 'border-[var(--color-primary)] bg-[var(--color-emerald-soft)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="font-semibold text-[var(--color-ink)]">
                          {cfg.name}
                        </strong>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            tone={
                              cfg.apply_status === 'APPLIED'
                                ? 'success'
                                : cfg.apply_status === 'DRIFTED'
                                  ? 'warning'
                                  : 'info'
                            }
                          >
                            {cfg.apply_status}
                          </Badge>
                          <Badge tone={cfg.restart_required ? 'warning' : 'neutral'}>
                            {cfg.restart_required ? 'Cần khởi động lại' : 'Áp dụng nóng'}
                          </Badge>
                          {actions.deleteConfig && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                actions.deleteConfig?.(cfg);
                              }}
                            >
                              Xóa
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[var(--color-muted)] mono">
                        <span>desired_version: v{cfg.desired_version}</span>
                        <span>
                          applied_version:{' '}
                          {cfg.applied_version !== null
                            ? `v${cfg.applied_version}`
                            : 'Chưa áp dụng'}
                        </span>
                        {cfg.access_point_ref && <span>Cổng: {cfg.access_point_ref}</span>}
                        {cfg.lane_ref && <span>Làn: {cfg.lane_ref}</span>}
                        {cfg.direction && <span>Hướng: {cfg.direction}</span>}
                      </div>
                      <div
                        className="text-[11px] text-[var(--color-muted)] mono"
                        data-testid={`device-config-settings-${cfg.id}`}
                      >
                        settings: {JSON.stringify(cfg.settings)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <footer className="settings-panel-footer">
          <LockKeyIcon size={16} />
          <span>
            {sectionId === 'history'
              ? 'Lịch sử chỉ đọc và được phân quyền riêng.'
              : 'Chưa có dữ liệu không đồng nghĩa chưa có thiết bị.'}
          </span>
        </footer>
      </section>

      <aside className="settings-aside">
        <section className="surface">
          <header className="section-heading">
            <div>
              <h2>{sectionId === 'history' ? 'Theo dõi có nguồn' : 'Chuẩn bị thay đổi'}</h2>
              <p>
                {sectionId === 'history'
                  ? 'Actor, phiên bản và kết quả từ hệ thống'
                  : 'Tách rõ bản nháp và cấu hình đang chạy'}
              </p>
            </div>
            <SlidersHorizontalIcon size={21} className="muted" />
          </header>
          <div className="p-6">
            <ol className="settings-stages">
              <li>
                <span>01</span>
                <div>
                  <strong>Chuẩn bị bản nháp</strong>
                  <p>Nhập thông tin để xem lại, chưa lưu.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Kiểm tra & lưu</strong>
                  <p>Quyền, phiên bản và kết nối cần được xác nhận.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Áp dụng & theo dõi</strong>
                  <p>Chỉ xác nhận khi thiết bị nhận cấu hình.</p>
                </div>
              </li>
            </ol>
            {sectionId !== 'history' && (
              <>
                <Button
                  variant="primary"
                  className="w-full mt-6"
                  disabled={!state.canPrepareDraft}
                  aria-describedby={!state.canPrepareDraft ? 'settings-draft-access' : undefined}
                  icon={<PlusIcon size={17} />}
                  onClick={actions.prepareDraft}
                >
                  Chuẩn bị bản nháp
                </Button>
                <p id="settings-draft-access" className="field__hint mt-3">
                  {state.canPrepareDraft
                    ? 'Bản nháp chưa lưu sẽ được bỏ khi kết thúc phiên làm việc.'
                    : state.accessMessage}
                </p>
              </>
            )}
          </div>
        </section>

        {sectionId !== 'history' ? (
          <section className="settings-apply-panel space-y-3" aria-label="Áp dụng cấu hình">
            <h3>
              Cấu hình đã lưu <ArrowRightIcon size={14} /> Cấu hình đang chạy
            </h3>
            <p>
              Hai trạng thái cần được xác nhận riêng. Một số thay đổi có thể yêu cầu khởi động lại.
            </p>

            {data.apiReady && (
              <div className="space-y-2.5 pt-1">
                <Field id="device-config-name-input" label="Tên bản ghi cấu hình">
                  <Input
                    id="device-config-name-input"
                    value={data.editName}
                    onChange={(e) => actions.setEditName(e.target.value)}
                    placeholder="Nhập tên cấu hình thiết bị..."
                  />
                </Field>
                <Field id="device-config-reason-input" label="Lý do cập nhật / áp dụng (reason)">
                  <Input
                    id="device-config-reason-input"
                    value={data.changeReason}
                    onChange={(e) => actions.setChangeReason(e.target.value)}
                    placeholder="Nhập lý do thay đổi (tối thiểu 3 ký tự)..."
                  />
                </Field>
              </div>
            )}

            <div className="settings-disabled-actions">
              <Button
                size="sm"
                disabled={!data.apiReady}
                pending={state.savingConfig}
                aria-describedby="settings-api-status"
                onClick={() => void actions.saveConfig()}
              >
                Lưu cấu hình
              </Button>
              {data.apiReady && data.selectedConfig && (
                <Button
                  size="sm"
                  variant="secondary"
                  pending={state.validatingConfig}
                  data-testid="btn-validate-config"
                  onClick={() => void actions.validateConfig()}
                >
                  Xác thực máy chủ
                </Button>
              )}
              <Button
                size="sm"
                disabled={!data.apiReady || !data.selectedConfig}
                pending={state.testingConnectivity}
                aria-describedby="settings-api-status"
                onClick={() => void actions.testConnectivity()}
              >
                Kiểm tra kết nối
              </Button>
              <Button
                size="sm"
                disabled={!data.apiReady || !data.selectedConfig}
                pending={state.applyingConfig}
                aria-describedby="settings-api-status"
                onClick={() => void actions.applyConfig()}
              >
                Áp dụng
              </Button>
              {data.apiReady && data.selectedConfig && actions.deleteConfig && (
                <Button
                  size="sm"
                  variant="danger"
                  pending={state.deletingConfig}
                  data-testid="btn-delete-config"
                  onClick={() => actions.deleteConfig?.(data.selectedConfig ?? undefined)}
                >
                  Xóa bản ghi
                </Button>
              )}
            </div>

            {data.latestValidation && (
              <div
                className="p-2.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-xs"
                data-testid="device-validation-status"
              >
                <span className="mono font-semibold">
                  Xác thực máy chủ v{data.latestValidation.desired_version}:{' '}
                  {data.latestValidation.valid ? 'Hợp lệ (VALID)' : 'Cảnh báo'}
                </span>
              </div>
            )}

            {data.latestOperation && (
              <div
                className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs space-y-2"
                data-testid="device-operation-status"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <strong className="mono">{data.latestOperation.kind}</strong>
                    <Badge
                      tone={
                        data.latestOperation.status === 'SUCCEEDED'
                          ? 'success'
                          : data.latestOperation.status === 'FAILED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {data.latestOperation.status}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    pending={state.reconcilingOperation}
                    data-testid="btn-reconcile-operation"
                    onClick={() =>
                      void actions.reconcileOperation(data.latestOperation?.operation_id)
                    }
                  >
                    Đối soát trạng thái tác vụ
                  </Button>
                </div>
                <p>{data.latestOperation.message}</p>
                <p className="mono text-[11px] text-[var(--color-muted)]">
                  operation_id: {data.latestOperation.operation_id} · desired_version: v
                  {data.latestOperation.desired_version} · applied_version:{' '}
                  {data.latestOperation.applied_version !== null
                    ? `v${data.latestOperation.applied_version}`
                    : 'Chưa áp dụng'}
                </p>
              </div>
            )}
          </section>
        ) : (
          <section className="settings-apply-panel">
            <h3>Lịch sử chỉ đọc</h3>
            <p>
              Thay đổi, người thực hiện và kết quả áp dụng sẽ lấy từ nhật ký có quyền. Thông tin xác
              thực được loại khỏi dữ liệu lịch sử.
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}
