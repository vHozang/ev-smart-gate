import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { invalidateResource, normalizeError, queryKeys } from '@/shared/api';
import {
  openConfirmModal,
  openFormModal,
  openNoticeModal,
  openValidationNoticeModal,
  useFeedback,
} from '@/shared/feedback';
import {
  createEmployee,
  createPedestrianGrant,
  createSampleCaptureBundle,
  deleteEmployee,
  deletePedestrianGrant,
  employeeCreateSchema,
  grantCreateSchema,
  listAccessPoints,
  listEmployees,
  listPedestrianGrants,
  listPersonAccessLogs,
  reconcileAccessEvent,
  revokePedestrianGrant,
  updateEmployee,
  updatePedestrianGrant,
  verificationRequestSchema,
  verifyPedestrianGate,
} from './api';
import {
  EmployeeEditModalForm,
  GrantEditModalForm,
  PersonLogEvidenceModalBody,
} from './VerificationResultCard';
import type {
  EmployeeCreateInput,
  EmployeePatchInput,
  EmployeeView,
  GrantCreateInput,
  GrantPatchInput,
  GrantView,
  PersonLogView,
  VerificationRequest,
  VerificationView,
} from './api';

export type PedestrianTab = 'verify' | 'registry' | 'logs';

export function usePedestrianScreen() {
  const { principal, can } = useAuth();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const identity = principal?.id ?? 'anonymous';

  const [activeTab, setActiveTab] = useState<PedestrianTab>('verify');
  const [direction, setDirection] = useState<'ENTRY' | 'EXIT'>('ENTRY');
  const [gateId, setGateId] = useState('PED-TURNSTILE-01');
  const [eventId, setEventId] = useState('');
  const [captureBundleId, setCaptureBundleId] = useState('');
  const [latestVerification, setLatestVerification] = useState<VerificationView | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [verifyFieldErrors, setVerifyFieldErrors] = useState<{
    gate_id?: string;
    event_id?: string;
    capture_bundle_id?: string;
  }>({});
  const [empFieldErrors, setEmpFieldErrors] = useState<{
    person_id?: string;
    employee_code?: string;
  }>({});
  const [grantFieldErrors, setGrantFieldErrors] = useState<{
    employee_id?: string;
    access_point_ids?: string;
    valid_until?: string;
    reason?: string;
  }>({});

  const [logDirectionFilter, setLogDirectionFilter] = useState<'ENTRY' | 'EXIT' | ''>('');
  const [logCursor, setLogCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([]);

  const canManageRegistry =
    Boolean(principal) &&
    (principal?.role === 'ADMIN' ||
      can('employees:create') ||
      can('employees:update') ||
      can('drivers:create'));

  const canManageGrants =
    Boolean(principal) &&
    (principal?.role === 'ADMIN' ||
      can('pedestrian-grants:create') ||
      can('pedestrian-grants:revoke') ||
      can('driver-vehicle-authorizations:create'));

  const employeesQuery = useQuery({
    queryKey: queryKeys.resource(identity, 'employees', {}),
    queryFn: ({ signal }) => listEmployees({}, signal),
    enabled: Boolean(principal),
    placeholderData: keepPreviousData,
  });

  const grantsQuery = useQuery({
    queryKey: queryKeys.resource(identity, 'pedestrian-grants', {}),
    queryFn: ({ signal }) => listPedestrianGrants({}, signal),
    enabled: Boolean(principal),
    placeholderData: keepPreviousData,
  });

  const accessPointsQuery = useQuery({
    queryKey: queryKeys.resource(identity, 'access-points', {}),
    queryFn: ({ signal }) => listAccessPoints(signal),
    enabled: Boolean(principal),
    placeholderData: keepPreviousData,
  });

  const personLogsQuery = useQuery({
    queryKey: queryKeys.resource(identity, 'person-access-logs', {
      direction: logDirectionFilter,
      cursor: logCursor,
    }),
    queryFn: ({ signal }) =>
      listPersonAccessLogs(
        {
          direction: logDirectionFilter,
          cursor: logCursor,
          limit: 20,
        },
        signal,
      ),
    enabled: Boolean(principal),
    placeholderData: keepPreviousData,
  });

  const sampleBundleMutation = useMutation({
    mutationFn: (options?: { card_uid?: string; faceImageFile?: File | null }) =>
      createSampleCaptureBundle({
        access_point_id: gateId.trim() || 'PED-TURNSTILE-01',
        access_mode: 'pedestrian',
        card_uid: options?.card_uid,
        faceImageFile: options?.faceImageFile,
      }),
    onSuccess: (created) => {
      const nextEventId = eventId.trim().length >= 8 ? eventId.trim() : `EVT-PED-${Date.now()}`;
      setEventId(nextEventId);
      setCaptureBundleId(created.capture_bundle_id);
      setVerifyFieldErrors({});
      setFormError(null);
      feedback.notify({
        id: `sample-ped-bundle-${created.capture_bundle_id}`,
        title: 'Đã thu nhận gói Camera AI (CaptureBundle)',
        description: `Mã gói: ${created.capture_bundle_id.slice(0, 8)}… · Sẵn sàng xác minh lượt đi bộ.`,
        tone: 'success',
      });
    },
    onError: (err) => {
      setFormError(normalizeError(err).message);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (input: VerificationRequest) => verifyPedestrianGate(direction, input),
    onSuccess: async (result) => {
      setLatestVerification(result);
      setFormError(null);
      await invalidateResource(queryClient, identity, 'person-access-logs');
      feedback.notify({
        id: `ped-verify-${result.event_id}`,
        title: `Đã nhận kết quả kiểm soát đi bộ (${result.event_id})`,
        tone: result.permit_granted ? 'success' : 'warning',
      });
    },
    onError: (err) => {
      setFormError(normalizeError(err).message);
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: (targetEventId: string) => reconcileAccessEvent(targetEventId),
    onSuccess: (result) => {
      setLatestVerification(result);
      setFormError(null);
      feedback.notify({
        id: `ped-reconcile-${result.event_id}`,
        title: `Đã đối soát sự kiện đi bộ ${result.event_id}`,
        tone: 'info',
      });
    },
    onError: (err) => {
      setFormError(normalizeError(err).message);
    },
  });

  const createEmployeeMutation = useMutation({
    mutationFn: (input: EmployeeCreateInput) =>
      createEmployee(input, `emp-${Date.now()}-${input.employee_code}`),
    onSuccess: async (created) => {
      await invalidateResource(queryClient, identity, 'employees');
      feedback.notify({
        id: `emp-create-${created.employee_id}`,
        title: `Đã đăng ký nhân viên ${created.employee_code}`,
        tone: 'success',
      });
    },
    onError: (err) => {
      feedback.notify({
        id: `emp-create-err-${Date.now()}`,
        title: 'Không thể đăng ký nhân viên',
        description: normalizeError(err).message,
        tone: 'error',
      });
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: (params: { employeeId: string; input: EmployeePatchInput }) =>
      updateEmployee(params.employeeId, params.input),
    onSuccess: async (updated) => {
      await invalidateResource(queryClient, identity, 'employees');
      feedback.notify({
        id: `emp-update-${updated.employee_id}-v${updated.version}`,
        title: `Đã cập nhật nhân viên ${updated.employee_code} (v${updated.version})`,
        tone: 'success',
      });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: (employeeId: string) => deleteEmployee(employeeId),
    onSuccess: async () => {
      await invalidateResource(queryClient, identity, 'employees');
      feedback.notify({
        id: `emp-deleted-${Date.now()}`,
        title: 'Đã xóa hồ sơ nhân viên khỏi danh bạ',
        tone: 'success',
      });
    },
  });

  const createGrantMutation = useMutation({
    mutationFn: (input: GrantCreateInput) => createPedestrianGrant(input),
    onSuccess: async (created) => {
      await invalidateResource(queryClient, identity, 'pedestrian-grants');
      feedback.notify({
        id: `grant-create-${created.id}`,
        title: 'Đã cấp quyền đi bộ qua cổng kiểm soát',
        tone: 'success',
      });
    },
    onError: (err) => {
      feedback.notify({
        id: `grant-create-err-${Date.now()}`,
        title: 'Không thể cấp quyền đi bộ',
        description: normalizeError(err).message,
        tone: 'error',
      });
    },
  });

  const updateGrantMutation = useMutation({
    mutationFn: (params: { grantId: string; input: GrantPatchInput }) =>
      updatePedestrianGrant(params.grantId, params.input),
    onSuccess: async (updated) => {
      await invalidateResource(queryClient, identity, 'pedestrian-grants');
      feedback.notify({
        id: `grant-update-${updated.id}-v${updated.version}`,
        title: `Đã cập nhật quyền đi bộ (v${updated.version})`,
        tone: 'success',
      });
    },
  });

  const revokeGrantMutation = useMutation({
    mutationFn: (params: { grantId: string; expected_version: number; reason: string }) =>
      revokePedestrianGrant(params.grantId, {
        expected_version: params.expected_version,
        reason: params.reason,
      }),
    onSuccess: async () => {
      await invalidateResource(queryClient, identity, 'pedestrian-grants');
      feedback.notify({
        id: 'grant-revoked',
        title: 'Đã thu hồi quyền đi bộ',
        tone: 'info',
      });
    },
  });

  const deleteGrantMutation = useMutation({
    mutationFn: (grantId: string) => deletePedestrianGrant(grantId),
    onSuccess: async () => {
      await invalidateResource(queryClient, identity, 'pedestrian-grants');
      feedback.notify({
        id: `grant-deleted-${Date.now()}`,
        title: 'Đã xóa vĩnh viễn quyền đi bộ',
        tone: 'success',
      });
    },
  });

  const openEditEmployee = (emp: EmployeeView) => {
    openFormModal(feedback, {
      id: `edit-employee-${emp.employee_id}`,
      title: `Cập nhật nhân viên: ${emp.employee_code}`,
      description: `Phiên bản hiện tại: v${emp.version} · Hồ sơ nhận diện: ${emp.person_id.slice(0, 8)}…`,
      submitText: 'Lưu thay đổi',
      renderForm: (modal) => (
        <EmployeeEditModalForm
          formId={modal.formId}
          employee={emp}
          onSubmit={async (payload) => {
            modal.setPending(true);
            try {
              const updated = await updateEmployeeMutation.mutateAsync({
                employeeId: emp.employee_id,
                input: payload,
              });
              modal.setPending(false);
              modal.close();
              openNoticeModal(feedback, {
                id: `emp-updated-notice-${updated.employee_id}`,
                title: 'Cập nhật nhân viên thành công',
                message: `Hồ sơ nhân viên ${updated.employee_code} đã được nâng lên phiên bản v${updated.version}.`,
                tone: 'success',
              });
            } catch (err) {
              modal.setPending(false);
              feedback.notify({
                id: `emp-edit-err-${emp.employee_id}`,
                title: 'Không thể cập nhật nhân viên',
                description: normalizeError(err).message,
                tone: 'error',
              });
            }
          }}
        />
      ),
    });
  };

  const openDeleteEmployee = (emp: EmployeeView) => {
    openConfirmModal(feedback, {
      id: `delete-employee-${emp.employee_id}`,
      title: `Xóa nhân viên: ${emp.employee_code}`,
      description: `Xác nhận xóa vĩnh viễn nhân viên ${emp.employee_code} khỏi danh bạ đi bộ.`,
      confirmText: 'Xóa vĩnh viễn',
      danger: true,
      onConfirm: async () => {
        await deleteEmployeeMutation.mutateAsync(emp.employee_id);
      },
    });
  };

  const openEditGrant = (grant: GrantView) => {
    openFormModal(feedback, {
      id: `edit-grant-${grant.id}`,
      title: 'Cập nhật quyền ra vào cổng đi bộ',
      description: `Phiên bản hiện tại: v${grant.version} · Nhân viên: ${grant.employee_id.slice(0, 8)}…`,
      submitText: 'Lưu thay đổi',
      renderForm: (modal) => (
        <GrantEditModalForm
          formId={modal.formId}
          grant={grant}
          onSubmit={async (payload) => {
            modal.setPending(true);
            try {
              await updateGrantMutation.mutateAsync({
                grantId: grant.id,
                input: payload,
              });
              modal.setPending(false);
              modal.close();
            } catch (err) {
              modal.setPending(false);
              feedback.notify({
                id: `grant-edit-err-${grant.id}`,
                title: 'Không thể cập nhật quyền đi bộ',
                description: normalizeError(err).message,
                tone: 'error',
              });
            }
          }}
        />
      ),
    });
  };

  const openDeleteGrant = (grant: GrantView) => {
    openConfirmModal(feedback, {
      id: `delete-grant-${grant.id}`,
      title: 'Xóa vĩnh viễn quyền đi bộ',
      description: `Xác nhận xóa vĩnh viễn bản ghi quyền đi bộ tại ${grant.access_point_ids.join(', ')}.`,
      confirmText: 'Xóa vĩnh viễn',
      danger: true,
      onConfirm: async () => {
        await deleteGrantMutation.mutateAsync(grant.id);
      },
    });
  };

  const openPersonLogDetail = (log: PersonLogView) => {
    feedback.openModal({
      id: `person-log-detail-${log.id}`,
      title: `Chi tiết lượt đi bộ · ${log.event_id}`,
      description: `Cổng: ${log.gate_id} · Chiều: ${log.direction}`,
      size: 'lg',
      renderContent: () => <PersonLogEvidenceModalBody log={log} />,
    });
  };

  return {
    data: {
      activeTab,
      direction,
      gateId,
      eventId,
      captureBundleId,
      latestVerification,
      verifyFieldErrors,
      empFieldErrors,
      grantFieldErrors,
      employees: employeesQuery.data?.items ?? [],
      grants: grantsQuery.data?.items ?? [],
      accessPoints: accessPointsQuery.data?.items ?? [],
      personLogs: personLogsQuery.data?.items ?? [],
      personLogsCoverage: personLogsQuery.data?.coverage ?? 'complete',
      personLogsHasMore: personLogsQuery.data?.has_more ?? false,
      personLogsNextCursor: personLogsQuery.data?.next_cursor ?? null,
      logCursor,
      hasPrevLogCursor: cursorHistory.length > 0,
      logDirectionFilter,
      canManageRegistry,
      canManageGrants,
    },
    state: {
      unavailable: !principal,
      loading:
        Boolean(principal) &&
        (employeesQuery.isPending || grantsQuery.isPending || personLogsQuery.isPending),
      fetching:
        Boolean(principal) &&
        (employeesQuery.isFetching ||
          grantsQuery.isFetching ||
          accessPointsQuery.isFetching ||
          personLogsQuery.isFetching),
      verifying: verifyMutation.isPending,
      generatingBundle: sampleBundleMutation.isPending,
      reconciling: reconcileMutation.isPending,
      creatingEmployee: createEmployeeMutation.isPending,
      updatingEmployee: updateEmployeeMutation.isPending,
      creatingGrant: createGrantMutation.isPending,
      revokingGrant: revokeGrantMutation.isPending,
      canManageRegistry,
      canManageGrants,
      error: formError,
    },
    actions: {
      setActiveTab,
      setDirection,
      setGateId: (val: string) => {
        setGateId(val);
        if (verifyFieldErrors.gate_id) {
          setVerifyFieldErrors((prev) => ({ ...prev, gate_id: undefined }));
        }
      },
      setEventId: (val: string) => {
        setEventId(val);
        if (verifyFieldErrors.event_id) {
          setVerifyFieldErrors((prev) => ({ ...prev, event_id: undefined }));
        }
      },
      setCaptureBundleId: (val: string) => {
        setCaptureBundleId(val);
        if (verifyFieldErrors.capture_bundle_id) {
          setVerifyFieldErrors((prev) => ({ ...prev, capture_bundle_id: undefined }));
        }
      },
      clearEmpFieldError: (key: 'person_id' | 'employee_code') => {
        setEmpFieldErrors((prev) => ({ ...prev, [key]: undefined }));
      },
      clearGrantFieldError: (key: keyof typeof grantFieldErrors) => {
        setGrantFieldErrors((prev) => ({ ...prev, [key]: undefined }));
      },
      refreshAll: async () => {
        await Promise.all([
          employeesQuery.refetch(),
          grantsQuery.refetch(),
          accessPointsQuery.refetch(),
          personLogsQuery.refetch(),
        ]);
      },
      setLogDirectionFilter: (next: 'ENTRY' | 'EXIT' | '') => {
        setLogDirectionFilter(next);
        setLogCursor(null);
        setCursorHistory([]);
      },
      setLogCursor,
      nextLogPage: () => {
        const next = personLogsQuery.data?.next_cursor;
        if (!next) return;
        setCursorHistory((prev) => [...prev, logCursor]);
        setLogCursor(next);
      },
      prevLogPage: () => {
        setCursorHistory((prev) => {
          if (prev.length === 0) return prev;
          const copy = [...prev];
          const previousCursor = copy.pop() ?? null;
          setLogCursor(previousCursor);
          return copy;
        });
      },
      generateSampleBundle: async (options?: {
        card_uid?: string;
        faceImageFile?: File | null;
      }) => {
        setFormError(null);
        await sampleBundleMutation.mutateAsync(options);
      },
      scanAndVerifyFromCamera: async (options?: {
        card_uid?: string;
        faceImageFile?: File | null;
      }) => {
        setFormError(null);
        setVerifyFieldErrors({});
        const safeGateId = gateId.trim() || 'PED-TURNSTILE-01';
        if (!gateId.trim()) {
          setGateId(safeGateId);
        }
        const created = await sampleBundleMutation.mutateAsync(options);
        const nextEventId = `EVT-PED-${Date.now()}`;
        setEventId(nextEventId);
        setCaptureBundleId(created.capture_bundle_id);
        await verifyMutation.mutateAsync({
          event_id: nextEventId,
          gate_id: safeGateId,
          capture_bundle_id: created.capture_bundle_id,
        });
      },
      submitVerification: async () => {
        setFormError(null);
        setVerifyFieldErrors({});
        const parsed = verificationRequestSchema.safeParse({
          event_id: eventId.trim(),
          gate_id: gateId.trim(),
          capture_bundle_id: captureBundleId.trim(),
        });
        if (!parsed.success) {
          const nextErrors: {
            gate_id?: string;
            event_id?: string;
            capture_bundle_id?: string;
          } = {};
          const missing: string[] = [];
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (key === 'gate_id' && !nextErrors.gate_id) {
              nextErrors.gate_id = issue.message;
              missing.push('Mã điểm kiểm soát đi bộ (gate_id)');
            } else if (key === 'event_id' && !nextErrors.event_id) {
              nextErrors.event_id = issue.message;
              missing.push('Mã sự kiện định danh (event_id)');
            } else if (key === 'capture_bundle_id' && !nextErrors.capture_bundle_id) {
              nextErrors.capture_bundle_id = issue.message;
              missing.push('Mã gói thu nhận (capture_bundle_id)');
            }
          }
          setVerifyFieldErrors(nextErrors);
          setFormError(
            parsed.error.issues[0]?.message || 'Dữ liệu xác minh lượt đi bộ chưa hợp lệ.',
          );
          openValidationNoticeModal(feedback, {
            title: 'Chưa đủ thông tin xác minh lượt đi bộ',
            fields: missing,
          });
          return;
        }
        await verifyMutation.mutateAsync(parsed.data);
      },
      reconcileByEventId: async (targetEventId: string) => {
        setFormError(null);
        await reconcileMutation.mutateAsync(targetEventId);
      },
      submitEmployee: async (input: EmployeeCreateInput) => {
        setEmpFieldErrors({});
        const parsed = employeeCreateSchema.safeParse(input);
        if (!parsed.success) {
          const nextErrors: { person_id?: string; employee_code?: string } = {};
          const missing: string[] = [];
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (key === 'person_id' && !nextErrors.person_id) {
              nextErrors.person_id = issue.message;
              missing.push('Mã hồ sơ nhận diện (person_id)');
            } else if (key === 'employee_code' && !nextErrors.employee_code) {
              nextErrors.employee_code = issue.message;
              missing.push('Mã nhân viên (employee_code)');
            }
          }
          setEmpFieldErrors(nextErrors);
          openValidationNoticeModal(feedback, {
            title: 'Chưa đủ thông tin đăng ký nhân viên',
            fields: missing,
          });
          return null;
        }
        try {
          return await createEmployeeMutation.mutateAsync(parsed.data);
        } catch {
          return null;
        }
      },
      openEditEmployee,
      openDeleteEmployee,
      submitGrant: async (input: GrantCreateInput) => {
        setGrantFieldErrors({});
        const parsed = grantCreateSchema.safeParse(input);
        if (!parsed.success) {
          const nextErrors: {
            employee_id?: string;
            access_point_ids?: string;
            valid_until?: string;
            reason?: string;
          } = {};
          const missing: string[] = [];
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (key === 'employee_id' && !nextErrors.employee_id) {
              nextErrors.employee_id = issue.message;
              missing.push('Mã nhân viên (employee_id)');
            } else if (key === 'access_point_ids' && !nextErrors.access_point_ids) {
              nextErrors.access_point_ids = issue.message;
              missing.push('Điểm kiểm soát (access_point_id)');
            } else if (
              (key === 'valid_from' || key === 'valid_until') &&
              !nextErrors.valid_until
            ) {
              nextErrors.valid_until = issue.message;
              missing.push('Thời gian hiệu lực (Từ ngày / Đến ngày)');
            } else if (key === 'reason' && !nextErrors.reason) {
              nextErrors.reason = issue.message;
              missing.push('Lý do cấp quyền');
            }
          }
          setGrantFieldErrors(nextErrors);
          openValidationNoticeModal(feedback, {
            title: 'Chưa đủ thông tin cấp quyền đi bộ',
            fields: missing,
          });
          return null;
        }
        try {
          return await createGrantMutation.mutateAsync(parsed.data);
        } catch {
          return null;
        }
      },
      openEditGrant,
      openDeleteGrant,
      revokeGrant: (grantId: string, expectedVersion: number, reason: string) =>
        revokeGrantMutation.mutateAsync({
          grantId,
          expected_version: expectedVersion,
          reason,
        }),
      openPersonLogDetail,
    },
  };
}
