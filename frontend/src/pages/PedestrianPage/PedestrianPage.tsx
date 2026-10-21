import { useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowsClockwiseIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ClockCounterClockwiseIcon,
  IdentificationBadgeIcon,
  PencilSimpleIcon,
  PersonSimpleWalkIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import {
  GateCameraConsole,
  VerificationResultCard,
  usePedestrianScreen,
} from '@/features/core-access';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import { paths } from '@/shared/config';
import { formatDate, fromDateInputValue, toDateInputValue } from '@/shared/lib';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DataTablePagination } from '@/shared/ui/DataTable';
import { DecryptedText } from '@/shared/ui/DecryptedText';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import { Select } from '@/shared/ui/Select';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import { StatePanel } from '@/shared/ui/StatePanel';

export function PedestrianPage() {
  const { data, state, actions } = usePedestrianScreen();

  // Form nội bộ cho đăng ký nhân viên & cấp quyền đi bộ
  const [empPersonId, setEmpPersonId] = useState('');
  const [empCode, setEmpCode] = useState('');
  const [grantEmployeeId, setGrantEmployeeId] = useState('');
  const [grantAccessPointId, setGrantAccessPointId] = useState('PED-TURNSTILE-01');
  const [grantValidFrom, setGrantValidFrom] = useState(() =>
    fromDateInputValue(new Date().toISOString().slice(0, 10), false),
  );
  const [grantValidUntil, setGrantValidUntil] = useState(() =>
    fromDateInputValue(
      new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
      true,
    ),
  );
  const [grantReason, setGrantReason] = useState('');

  // Phân trang danh bạ nhân viên & quyền đi bộ
  const [empPage, setEmpPage] = useState(1);
  const [empPageSize, setEmpPageSize] = useState(10);
  const [grantPage, setGrantPage] = useState(1);
  const [grantPageSize, setGrantPageSize] = useState(10);

  const safeEmpPage = Math.min(
    empPage,
    Math.max(1, Math.ceil(data.employees.length / empPageSize)),
  );
  const pagedEmployees = data.employees.slice(
    (safeEmpPage - 1) * empPageSize,
    safeEmpPage * empPageSize,
  );

  const safeGrantPage = Math.min(
    grantPage,
    Math.max(1, Math.ceil(data.grants.length / grantPageSize)),
  );
  const pagedGrants = data.grants.slice(
    (safeGrantPage - 1) * grantPageSize,
    safeGrantPage * grantPageSize,
  );

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
        Không gian kiểm soát nhân viên đi bộ (FE-G03) yêu cầu phiên đăng nhập vận hành hợp lệ và
        dịch vụ xác minh cổng đi bộ từ máy chủ.
      </StatePanel>
    );
  }

  return (
    <ListPageLayout
      title="Kiểm soát nhân viên đi bộ"
      description="Xác minh nhân viên đi bộ qua cổng kiểm soát (Thẻ RFID + Khuôn mặt 1:1 + Danh bạ Nhân viên + Quyền đi bộ), không gán biển số xe hoặc đơn hàng kho giả."
      actions={
        <Button
          variant="secondary"
          pending={state.fetching}
          icon={<ArrowsClockwiseIcon size={17} />}
          onClick={() => void actions.refreshAll()}
        >
          Làm mới dữ liệu
        </Button>
      }
      toolbar={
        <SegmentedTabs
          ariaLabel="Phân khu kiểm soát đi bộ"
          tabRole="button"
          items={[
            {
              id: 'verify',
              label: 'Xác minh tại cổng đi bộ',
              icon: <PersonSimpleWalkIcon size={16} />,
            },
            {
              id: 'registry',
              label: `Danh bạ nhân viên & Quyền đi bộ (${data.employees.length})`,
              icon: <IdentificationBadgeIcon size={16} />,
            },
            {
              id: 'logs',
              label: `Nhật ký lượt đi bộ (${data.personLogs.length})`,
              icon: <ClockCounterClockwiseIcon size={16} />,
            },
          ]}
          value={data.activeTab}
          onChange={actions.setActiveTab}
        />
      }
    >
      {data.activeTab === 'verify' && (
        <div className="space-y-6" data-testid="pedestrian-verify-tab">
          <GateCameraConsole
            mode="pedestrian"
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
                card_uid: opts.card_uid,
                faceImageFile: opts.faceImageFile,
              })
            }
            onScanAndVerify={(opts) =>
              actions.scanAndVerifyFromCamera({
                card_uid: opts.card_uid,
                faceImageFile: opts.faceImageFile,
              })
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SpotlightCard className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Xác minh lượt ra vào nhân viên đi bộ</h2>
                <p className="text-xs text-[var(--color-muted)]">
                  Đối chiếu 4 yếu tố: Thẻ nhân viên (RFID) + Khuôn mặt 1:1 + Employee Registry +
                  Pedestrian Access Grant.
                </p>
              </div>
              <Badge tone="info">Pedestrian Mode</Badge>
            </div>

            {state.error && (
              <div role="alert" className="form-error" data-testid="pedestrian-error">
                {state.error}
              </div>
            )}

            <div className="space-y-3">
              <Field id="ped-direction" label="Chiều đi bộ" required>
                <Select
                  id="ped-direction"
                  value={data.direction}
                  onChange={(e) => actions.setDirection(e.target.value as 'ENTRY' | 'EXIT')}
                >
                  <option value="ENTRY">Lối vào (ENTRY)</option>
                  <option value="EXIT">Lối ra (EXIT)</option>
                </Select>
              </Field>

              <Field
                id="ped-gate-id"
                label="Mã điểm kiểm soát đi bộ (gate_id)"
                error={data.verifyFieldErrors.gate_id}
                required
              >
                <Input
                  id="ped-gate-id"
                  value={data.gateId}
                  invalid={Boolean(data.verifyFieldErrors.gate_id)}
                  onChange={(e) => actions.setGateId(e.target.value)}
                  placeholder="Ví dụ: PED-TURNSTILE-01"
                />
              </Field>

              <Field
                id="ped-event-id"
                label="Mã sự kiện định danh (event_id)"
                error={data.verifyFieldErrors.event_id}
                required
              >
                <Input
                  id="ped-event-id"
                  value={data.eventId}
                  invalid={Boolean(data.verifyFieldErrors.event_id)}
                  onChange={(e) => actions.setEventId(e.target.value)}
                  placeholder="Ví dụ: EVT-PED-20261021-001"
                />
              </Field>

              <Field
                id="ped-bundle-id"
                label="Mã gói thu nhận (capture_bundle_id)"
                error={data.verifyFieldErrors.capture_bundle_id}
                required
              >
                <Input
                  id="ped-bundle-id"
                  value={data.captureBundleId}
                  invalid={Boolean(data.verifyFieldErrors.capture_bundle_id)}
                  onChange={(e) => actions.setCaptureBundleId(e.target.value)}
                  placeholder="UUID gói thu nhận từ cổng đi bộ..."
                />
              </Field>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
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
                  Đối soát cùng event_id
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="primary"
                pending={state.verifying}
                icon={<PersonSimpleWalkIcon size={16} />}
                onClick={() => void actions.submitVerification()}
              >
                Xác minh lượt đi bộ
              </Button>
            </div>
          </SpotlightCard>

          <SpotlightCard className="space-y-4">
            <h2 className="text-base font-semibold">Kết quả xác minh & cổng đi bộ</h2>
            {data.latestVerification ? (
              <VerificationResultCard
                verification={data.latestVerification}
                reconciling={state.reconciling}
                onReconcile={(evtId) => void actions.reconcileByEventId(evtId)}
              />
            ) : (
              <StatePanel kind="empty" title="Chưa có lượt xác minh đi bộ trong phiên">
                Gửi yêu cầu xác minh gói thu nhận từ cổng đi bộ để xem kết quả đối chiếu thẻ, khuôn
                mặt và quyền truy cập.
              </StatePanel>
            )}
          </SpotlightCard>
          </div>
        </div>
      )}

      {data.activeTab === 'registry' && (
        <div
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          data-testid="pedestrian-registry-tab"
        >
          <SpotlightCard className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Danh bạ nhân viên (Employee Registry)</h2>
              <p className="text-xs text-[var(--color-muted)]">
                Liên kết tham chiếu sang hồ sơ nhận diện (<code className="mono">person_id</code>)
                đã đăng ký; không sao chép vector sinh trắc và tách biệt hoàn toàn với tài khoản vận
                hành hệ thống (<code className="mono">User</code>).
              </p>
            </div>

            <div className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Đăng ký nhân viên mới vào danh bạ
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  id="emp-person-id"
                  label="Mã hồ sơ nhận diện (person_id)"
                  error={data.empFieldErrors.person_id}
                  required
                >
                  <Input
                    id="emp-person-id"
                    value={empPersonId}
                    invalid={Boolean(data.empFieldErrors.person_id)}
                    onChange={(e) => {
                      setEmpPersonId(e.target.value);
                      if (data.empFieldErrors.person_id) actions.clearEmpFieldError('person_id');
                    }}
                    placeholder="UUID hồ sơ nhận diện..."
                  />
                </Field>
                <Field
                  id="emp-code"
                  label="Mã nhân viên (employee_code)"
                  error={data.empFieldErrors.employee_code}
                  required
                >
                  <Input
                    id="emp-code"
                    value={empCode}
                    invalid={Boolean(data.empFieldErrors.employee_code)}
                    onChange={(e) => {
                      setEmpCode(e.target.value);
                      if (data.empFieldErrors.employee_code) {
                        actions.clearEmpFieldError('employee_code');
                      }
                    }}
                    placeholder="Ví dụ: EMP-2026-001"
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  disabled={!data.canManageRegistry}
                  pending={state.creatingEmployee}
                  icon={<PlusIcon size={15} />}
                  onClick={async () => {
                    const created = await actions.submitEmployee({
                      person_id: empPersonId.trim(),
                      employee_code: empCode.trim(),
                    });
                    if (created) {
                      setEmpPersonId('');
                      setEmpCode('');
                    }
                  }}
                >
                  Đăng ký nhân viên
                </Button>
              </div>
            </div>

            {data.employees.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">Chưa có hồ sơ nhân viên nào.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {pagedEmployees.map((emp) => (
                    <div
                      key={emp.employee_id}
                      className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold mono">
                          <DecryptedText text={emp.employee_code} />
                        </p>
                        <p className="text-[var(--color-muted)] mono">
                          employee_id: {emp.employee_id} · person_id: {emp.person_id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={emp.is_active ? 'success' : 'neutral'}>
                          {emp.is_active ? 'Đang hoạt động' : 'Ngưng kích hoạt'} (v{emp.version})
                        </Badge>
                        {data.canManageRegistry && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<PencilSimpleIcon size={14} />}
                              onClick={() => actions.openEditEmployee(emp)}
                              data-testid={`edit-employee-${emp.employee_id}`}
                            >
                              Sửa
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              icon={<TrashIcon size={14} />}
                              onClick={() => actions.openDeleteEmployee(emp)}
                              data-testid={`delete-employee-${emp.employee_id}`}
                            >
                              Xóa
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <DataTablePagination
                  page={safeEmpPage}
                  pageSize={empPageSize}
                  total={data.employees.length}
                  onPageChange={setEmpPage}
                  onPageSizeChange={(size) => {
                    setEmpPageSize(size);
                    setEmpPage(1);
                  }}
                />
              </>
            )}
          </SpotlightCard>

          <SpotlightCard className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">
                Quyền ra vào cổng đi bộ (Pedestrian Grants)
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                Cấp quyền hoặc thu hồi quyền đi bộ theo nhân viên, điểm kiểm soát, chiều di chuyển
                và khoảng thời gian hiệu lực.
              </p>
            </div>

            <div className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Cấp quyền đi bộ mới
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  id="grant-emp-id"
                  label="Mã nhân viên (employee_id)"
                  error={data.grantFieldErrors.employee_id}
                  required
                >
                  <Input
                    id="grant-emp-id"
                    value={grantEmployeeId}
                    invalid={Boolean(data.grantFieldErrors.employee_id)}
                    onChange={(e) => {
                      setGrantEmployeeId(e.target.value);
                      if (data.grantFieldErrors.employee_id) {
                        actions.clearGrantFieldError('employee_id');
                      }
                    }}
                    placeholder="UUID nhân viên..."
                  />
                </Field>
                <Field
                  id="grant-ap-id"
                  label="Điểm kiểm soát (access_point_id)"
                  error={data.grantFieldErrors.access_point_ids}
                  required
                >
                  <Input
                    id="grant-ap-id"
                    value={grantAccessPointId}
                    invalid={Boolean(data.grantFieldErrors.access_point_ids)}
                    onChange={(e) => {
                      setGrantAccessPointId(e.target.value);
                      if (data.grantFieldErrors.access_point_ids) {
                        actions.clearGrantFieldError('access_point_ids');
                      }
                    }}
                    placeholder="PED-TURNSTILE-01"
                  />
                </Field>
                <Field id="grant-from" label="Hiệu lực từ ngày" required>
                  <Input
                    id="grant-from"
                    type="date"
                    value={toDateInputValue(grantValidFrom)}
                    onChange={(e) => setGrantValidFrom(fromDateInputValue(e.target.value, false))}
                  />
                </Field>
                <Field
                  id="grant-until"
                  label="Hiệu lực đến ngày"
                  error={data.grantFieldErrors.valid_until}
                  required
                >
                  <Input
                    id="grant-until"
                    type="date"
                    value={toDateInputValue(grantValidUntil)}
                    invalid={Boolean(data.grantFieldErrors.valid_until)}
                    onChange={(e) => {
                      setGrantValidUntil(fromDateInputValue(e.target.value, true));
                      if (data.grantFieldErrors.valid_until) {
                        actions.clearGrantFieldError('valid_until');
                      }
                    }}
                  />
                </Field>
              </div>
              <Field
                id="grant-reason"
                label="Lý do cấp quyền"
                error={data.grantFieldErrors.reason}
                required
              >
                <Input
                  id="grant-reason"
                  value={grantReason}
                  invalid={Boolean(data.grantFieldErrors.reason)}
                  onChange={(e) => {
                    setGrantReason(e.target.value);
                    if (data.grantFieldErrors.reason) {
                      actions.clearGrantFieldError('reason');
                    }
                  }}
                  placeholder="Nhập lý do nghiệp vụ (tối thiểu 3 ký tự)..."
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  disabled={!data.canManageGrants}
                  pending={state.creatingGrant}
                  icon={<PlusIcon size={15} />}
                  onClick={async () => {
                    const created = await actions.submitGrant({
                      employee_id: grantEmployeeId.trim(),
                      access_point_ids: grantAccessPointId.trim() ? [grantAccessPointId.trim()] : [],
                      directions: ['ENTRY', 'EXIT'],
                      valid_from: grantValidFrom.trim(),
                      valid_until: grantValidUntil.trim(),
                      reason: grantReason.trim(),
                    });
                    if (created) {
                      setGrantEmployeeId('');
                      setGrantReason('');
                    }
                  }}
                >
                  Cấp quyền đi bộ
                </Button>
              </div>
            </div>

            {data.grants.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">Chưa có bản ghi quyền đi bộ nào.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {pagedGrants.map((grant) => (
                    <div
                      key={grant.id}
                      className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold mono">
                          Điểm kiểm soát: {grant.access_point_ids.join(', ')} (
                          {grant.directions.join('/')})
                        </p>
                        <p className="text-[var(--color-muted)]">
                          Nhân viên: <span className="mono">{grant.employee_id}</span> · Lý do:{' '}
                          {grant.reason}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={grant.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {grant.status} (v{grant.version})
                        </Badge>
                        {data.canManageGrants && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<PencilSimpleIcon size={14} />}
                              onClick={() => actions.openEditGrant(grant)}
                            >
                              Sửa
                            </Button>
                            {grant.status === 'ACTIVE' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={state.revokingGrant}
                                onClick={() =>
                                  void actions.revokeGrant(
                                    grant.id,
                                    grant.version,
                                    'Thu hồi quyền đi bộ theo yêu cầu vận hành',
                                  )
                                }
                              >
                                Thu hồi
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="danger"
                              icon={<TrashIcon size={14} />}
                              onClick={() => actions.openDeleteGrant(grant)}
                            >
                              Xóa
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <DataTablePagination
                  page={safeGrantPage}
                  pageSize={grantPageSize}
                  total={data.grants.length}
                  onPageChange={setGrantPage}
                  onPageSizeChange={(size) => {
                    setGrantPageSize(size);
                    setGrantPage(1);
                  }}
                />
              </>
            )}
          </SpotlightCard>
        </div>
      )}

      {data.activeTab === 'logs' && (
        <SpotlightCard className="space-y-4" data-testid="pedestrian-logs-tab">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">
                Nhật ký truy cập nhân viên đi bộ (Person Access Logs)
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                Truy vấn trực tiếp từ nguồn nhật ký đi bộ (
                <code className="mono">/api/v1/person-access-logs</code>), không suy diễn từ nhật ký
                phương tiện.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={data.personLogsCoverage === 'complete' ? 'success' : 'warning'}>
                Độ phủ dữ liệu:{' '}
                {data.personLogsCoverage === 'complete'
                  ? 'Đầy đủ (complete)'
                  : 'Một phần (partial)'}
              </Badge>
              <Select
                aria-label="Lọc chiều đi bộ"
                value={data.logDirectionFilter}
                onChange={(e) =>
                  actions.setLogDirectionFilter(e.target.value as 'ENTRY' | 'EXIT' | '')
                }
              >
                <option value="">Tất cả chiều (ENTRY + EXIT)</option>
                <option value="ENTRY">Lối vào (ENTRY)</option>
                <option value="EXIT">Lối ra (EXIT)</option>
              </Select>
            </div>
          </div>

          {data.personLogs.length === 0 ? (
            <StatePanel kind="empty" title="Chưa có nhật ký lượt đi bộ phù hợp">
              Không tìm thấy bản ghi lượt đi bộ nào trong bộ lọc hiện tại.
            </StatePanel>
          ) : (
            <div className="space-y-2">
              {data.personLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-wrap items-center justify-between gap-3 text-xs"
                  data-testid={`person-log-row-${log.event_id}`}
                >
                  <div className="space-y-0.5">
                    <p className="font-semibold mono">
                      <DecryptedText text={log.event_id} /> · Cổng: {log.gate_id} ({log.direction})
                    </p>
                    <p className="text-[var(--color-muted)]">
                      Thời gian nhận: {formatDate(log.received_at)} · Số ảnh bằng chứng:{' '}
                      {log.snapshot_count}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={log.permit_granted ? 'success' : 'danger'}>
                      {log.permit_granted ? 'Cấp phép' : 'Từ chối'}
                    </Badge>
                    <Badge tone={log.barrier_status === 'OPENED' ? 'success' : 'neutral'}>
                      Barrier: {log.barrier_status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => actions.openPersonLogDetail(log)}
                    >
                      Xem chi tiết & bằng chứng
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div
            className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]"
            role="navigation"
            aria-label="Phân trang con trỏ nhật ký đi bộ"
          >
            <span className="text-xs text-[var(--color-muted)]">
              Đang hiển thị {data.personLogs.length} bản ghi trên trang hiện tại
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<CaretLeftIcon size={15} />}
                disabled={state.fetching || !data.hasPrevLogCursor}
                onClick={actions.prevLogPage}
              >
                Trang trước
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<CaretRightIcon size={15} />}
                disabled={state.fetching || !data.personLogsHasMore}
                onClick={actions.nextLogPage}
              >
                Trang tiếp
              </Button>
            </div>
          </div>
        </SpotlightCard>
      )}
    </ListPageLayout>
  );
}
