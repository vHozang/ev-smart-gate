import { Link } from 'react-router';
import {
  ArrowsClockwiseIcon,
  CarProfileIcon,
  ScanIcon,
  ShieldCheckIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import {
  GateCameraConsole,
  VerificationResultCard,
  useVehicleGateScreen,
} from '@/features/core-access';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { WorkspaceLayout } from '@/layouts/WorkspaceLayout';
import { paths } from '@/shared/config';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DecryptedText } from '@/shared/ui/DecryptedText';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import { StatePanel } from '@/shared/ui/StatePanel';

export function VehicleGatePage() {
  const { data, state, actions } = useVehicleGateScreen();

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
        Không gian kiểm soát phương tiện tại cổng (FE-G03) yêu cầu phiên đăng nhập vận hành hợp lệ
        và dịch vụ xác minh CaptureBundle từ máy chủ.
      </StatePanel>
    );
  }

  return (
    <ListPageLayout
      title="Trực cổng phương tiện — Kiểm tra Nhân sự & Biển số xe"
      description="Bàn trực dành cho Bảo vệ gác cổng: quan sát Camera trực tiếp, đối chiếu Nhân sự và Biển số xe để duyệt mở cổng an toàn."
      actions={
        <Button
          variant="secondary"
          icon={<ArrowsClockwiseIcon size={17} />}
          onClick={actions.reloadCatalog}
        >
          Làm mới dữ liệu cổng
        </Button>
      }
    >
      <div className="space-y-6">
        <GateCameraConsole
          mode="vehicle"
          direction={data.direction}
          gateId={data.gateId}
          eventId={data.eventId}
          captureBundleId={data.captureBundleId}
          latestVerification={data.latestVerification}
          verifying={state.verifying}
          generatingBundle={state.generatingBundle}
          onDirectionChange={actions.setDirection}
          onGateIdChange={actions.setGateId}
          onCaptureOnly={(opts) =>
            actions.generateSampleBundle({
              access_mode: opts.access_mode === 'pedestrian' ? 'car' : opts.access_mode,
              card_uid: opts.card_uid,
              faceImageFile: opts.faceImageFile,
              plateImageFile: opts.plateImageFile,
            })
          }
          onScanAndVerify={(opts) =>
            actions.scanAndVerifyFromCamera({
              access_mode: opts.access_mode === 'pedestrian' ? 'car' : opts.access_mode,
              card_uid: opts.card_uid,
              faceImageFile: opts.faceImageFile,
              plateImageFile: opts.plateImageFile,
            })
          }
        />

        <SpotlightCard className="space-y-4">
          <h2 className="text-base font-semibold">Kết quả xác minh & trạng thái thiết bị</h2>
          {data.latestVerification ? (
            <VerificationResultCard
              verification={data.latestVerification}
              reconciling={state.reconciling}
              onReconcile={(evtId) => void actions.reconcileByEventId(evtId)}
            />
          ) : (
            <StatePanel kind="empty" title="Chưa có lượt quét duyệt nào trong ca trực">
              Hãy mở Webcam hoặc chọn ảnh trên màn hình Camera phía trên, sau đó bấm{' '}
              <strong>Kiểm tra & Duyệt mở cổng ngay</strong>.
            </StatePanel>
          )}
        </SpotlightCard>

        <div className="pt-4 border-t border-[var(--color-border-subtle)] space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Khu vực Tra cứu Kỹ thuật & Đối soát Mã sự kiện (Dành cho Quản trị viên)
          </p>
          <WorkspaceLayout
            primary={
              <div className="space-y-6">
                <SpotlightCard className="space-y-4" data-testid="vehicle-gate-verify-panel">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold">
                        Tra cứu & Xác minh theo mã kỹ thuật (CaptureBundle)
                      </h2>
                      <p className="text-xs text-[var(--color-muted)]">
                        Dành cho kỹ thuật viên khi cần kiểm tra lại theo mã sự kiện (event_id) hoặc
                        mã gói thu nhận (capture_bundle_id).
                      </p>
                    </div>
                    <Badge tone="info">Fail-closed</Badge>
                  </div>

                  {data.direction === 'EXIT' && (
                    <div
                      className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-xs text-[var(--color-muted)]"
                      data-testid="vehicle-gate-exit-order-notice"
                    >
                      <strong>Lưu ý nghiệp vụ Cổng Ra (EXIT):</strong> Luồng xác minh phương tiện
                      rời cổng kiểm tra thẻ, khuôn mặt, biển số và ủy quyền phương tiện;{' '}
                      <strong>không yêu cầu và không tự động hoàn tất đơn hàng xuất kho</strong>.
                    </div>
                  )}

                  {state.error && (
                    <div role="alert" className="form-error" data-testid="vehicle-gate-error">
                      {state.error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field id="veh-direction" label="Chiều kiểm soát" required>
                      <Select
                        id="veh-direction"
                        value={data.direction}
                        onChange={(e) => actions.setDirection(e.target.value as 'ENTRY' | 'EXIT')}
                      >
                        <option value="ENTRY">Cổng vào (ENTRY)</option>
                        <option value="EXIT">Cổng ra (EXIT)</option>
                      </Select>
                    </Field>

                    <Field
                      id="veh-gate-id"
                      label="Mã cổng / làn kiểm soát (gate_id)"
                      error={data.verifyFieldErrors.gate_id}
                      required
                    >
                      <Input
                        id="veh-gate-id"
                        value={data.gateId}
                        invalid={Boolean(data.verifyFieldErrors.gate_id)}
                        onChange={(e) => actions.setGateId(e.target.value)}
                        placeholder="Ví dụ: GATE-VEH-01"
                      />
                    </Field>

                    <Field
                      id="veh-event-id"
                      label="Mã sự kiện định danh (event_id)"
                      error={data.verifyFieldErrors.event_id}
                      required
                    >
                      <Input
                        id="veh-event-id"
                        value={data.eventId}
                        invalid={Boolean(data.verifyFieldErrors.event_id)}
                        onChange={(e) => actions.setEventId(e.target.value)}
                        placeholder="Ví dụ: EVT-VEH-20261021-001"
                      />
                    </Field>

                    <Field
                      id="veh-bundle-id"
                      label="Mã gói thu nhận (capture_bundle_id)"
                      error={data.verifyFieldErrors.capture_bundle_id}
                      required
                    >
                      <Input
                        id="veh-bundle-id"
                        value={data.captureBundleId}
                        invalid={Boolean(data.verifyFieldErrors.capture_bundle_id)}
                        onChange={(e) => actions.setCaptureBundleId(e.target.value)}
                        placeholder="UUID gói thu nhận từ Edge..."
                      />
                    </Field>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      pending={state.generatingBundle}
                      icon={<SparkleIcon size={16} />}
                      onClick={() => void actions.generateSampleBundle()}
                    >
                      Tạo gói thu nhận mẫu (CaptureBundle)
                    </Button>
                    {data.eventId.trim().length >= 8 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        pending={state.reconciling}
                        icon={<ArrowsClockwiseIcon size={16} />}
                        onClick={() => void actions.reconcileByEventId(data.eventId)}
                      >
                        Đối soát theo event_id hiện tại
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      pending={state.verifying}
                      icon={<ScanIcon size={16} />}
                      onClick={() => void actions.submitVerification()}
                    >
                      Thực hiện xác minh lượt phương tiện
                    </Button>
                  </div>
                </SpotlightCard>
              </div>
            }
        secondary={
          <div className="space-y-4">
            <SpotlightCard className="space-y-3" data-testid="vehicle-types-catalog-panel">
              <div className="flex items-center gap-2">
                <CarProfileIcon size={18} />
                <h3 className="text-sm font-semibold">Danh mục chuẩn hóa loại phương tiện</h3>
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                Hệ thống chuẩn hóa 3 nhóm phương tiện đủ điều kiện xác minh tự động (xe máy, ô tô,
                xe tải) và giữ nguyên nhóm chưa xác định (unknown) để xử lý fail-closed.
              </p>

              {data.vehicleTypes.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">
                  Đang đồng bộ danh mục loại phương tiện từ dịch vụ...
                </p>
              ) : (
                <div className="space-y-2">
                  {data.vehicleTypes.map((vt) => (
                    <div
                      key={vt.code}
                      className="p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold">
                          {vt.label}{' '}
                          <span className="mono text-[var(--color-muted)]">
                            (<DecryptedText text={vt.code} />)
                          </span>
                        </p>
                        {vt.legacy_values.length > 0 && (
                          <p className="text-[11px] text-[var(--color-muted)]">
                            Ánh xạ giá trị cũ:{' '}
                            <span className="mono">{vt.legacy_values.join(', ')}</span>
                          </p>
                        )}
                      </div>
                      <Badge tone={vt.eligible_for_verification ? 'success' : 'warning'}>
                        {vt.eligible_for_verification ? 'Đủ điều kiện xác minh' : 'Chặn mở tự động'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-[var(--color-border-subtle)] space-y-2">
                <Field
                  id="legacy-vehicle-type-input"
                  label="Kiểm tra ánh xạ mã loại xe (legacy / unknown)"
                >
                  <Input
                    id="legacy-vehicle-type-input"
                    value={data.legacyCheckInput}
                    onChange={(e) => actions.setLegacyCheckInput(e.target.value)}
                    placeholder="Ví dụ: sedan, van, unknown..."
                  />
                </Field>
                <div
                  className="p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-xs space-y-1"
                  data-testid="legacy-vehicle-resolution"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-muted)]">Mã chuẩn hóa:</span>
                    <strong className="mono">
                      <DecryptedText text={data.legacyResolution.code} />
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-muted)]">Nhãn hiển thị:</span>
                    <span>{data.legacyResolution.label}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-muted)]">Đủ điều kiện mở cổng:</span>
                    <Badge
                      tone={data.legacyResolution.eligible_for_verification ? 'success' : 'danger'}
                    >
                      {data.legacyResolution.eligible_for_verification
                        ? 'Hợp lệ'
                        : 'Từ chối (Fail-closed)'}
                    </Badge>
                  </div>
                </div>
              </div>
            </SpotlightCard>

            <SpotlightCard className="space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheckIcon size={16} />
                <span>Quy tắc an toàn vận hành cổng</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[var(--color-muted)]">
                <li>
                  Chỉ báo <strong>Đã mở barrier (OPENED)</strong> khi máy chủ xác nhận đồng thời{' '}
                  <code className="mono">PASSED</code>,{' '}
                  <code className="mono">permit_granted=true</code> và{' '}
                  <code className="mono">barrier_status=OPENED</code>.
                </li>
                <li>
                  Mọi trường hợp timeout hoặc <code className="mono">OUTCOME_UNKNOWN</code> phải tra
                  cứu đối soát trên cùng <code className="mono">event_id</code>.
                </li>
              </ul>
            </SpotlightCard>
          </div>
        }
      />
        </div>
      </div>
    </ListPageLayout>
  );
}
