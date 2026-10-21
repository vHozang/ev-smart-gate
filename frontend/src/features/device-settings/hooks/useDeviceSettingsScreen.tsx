import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth';
import { ApiError } from '@/shared/api';
import { openConfirmModal, openValidationNoticeModal, useFeedback } from '@/shared/feedback';
import { Button } from '@/shared/ui/Button';
import {
  applyDeviceConfig,
  createDeviceConfig,
  deleteDeviceConfig,
  listDeviceAuditLogs,
  listDeviceConfigs,
  reconcileDeviceOperation,
  testDeviceConnectivity,
  updateDeviceConfig,
  validateDeviceConfig,
} from '../api';
import type {
  DeviceAuditLogView,
  DeviceConfigGroup,
  DeviceConfigView,
  DeviceOperationView,
  DeviceValidationResult,
} from '../api';
import { SettingsDraftForm } from '../components/SettingsDraftForm';
import { getSettingsSection, settingsSections } from '../model/catalog';
import { canPrepareLocalDraft, canUseDeviceSettingsApi } from '../model/types';
import type { DeviceSettingsScreen, SettingsSectionId } from '../model/types';

export function useDeviceSettingsScreen(sectionId: SettingsSectionId): DeviceSettingsScreen {
  const { principal } = useAuth();
  const feedback = useFeedback();
  const section = getSettingsSection(sectionId);
  const canPrepareDraft = sectionId !== 'history' && canPrepareLocalDraft(principal);
  const apiReady = canUseDeviceSettingsApi(principal);

  const [configs, setConfigs] = useState<DeviceConfigView[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<DeviceConfigView | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [changeReason, setChangeReason] = useState<string>(
    'Cập nhật cấu hình thiết bị theo quy trình vận hành cổng',
  );
  const [latestValidation, setLatestValidation] = useState<DeviceValidationResult | null>(null);
  const [latestOperation, setLatestOperation] = useState<DeviceOperationView | null>(null);

  const [auditLogs, setAuditLogs] = useState<DeviceAuditLogView[]>([]);
  const [auditGroupFilter, setAuditGroupFilter] = useState<DeviceConfigGroup | ''>('');
  const [auditOutcomeFilter, setAuditOutcomeFilter] = useState<'SUCCEEDED' | 'FAILED' | ''>('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('');

  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [validatingConfig, setValidatingConfig] = useState(false);
  const [testingConnectivity, setTestingConnectivity] = useState(false);
  const [applyingConfig, setApplyingConfig] = useState(false);
  const [reconcilingOperation, setReconcilingOperation] = useState(false);
  const [deletingConfig, setDeletingConfig] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const reloadConfigs = useCallback(
    async (signal?: AbortSignal) => {
      if (!apiReady || sectionId === 'history') {
        return;
      }
      const group = sectionId as DeviceConfigGroup;
      setLoadingConfigs(true);
      setApiError(null);
      try {
        const page = await listDeviceConfigs(group, signal);
        setConfigs(page.items);
        const first = page.items[0] ?? null;
        setSelectedConfig((prev) => {
          const matched = prev ? page.items.find((item) => item.id === prev.id) : undefined;
          const nextSelected = matched ?? first;
          if (nextSelected) {
            setEditName(nextSelected.name);
          } else {
            setEditName(`Cấu hình ${section.title} mới`);
          }
          return nextSelected;
        });
      } catch (err) {
        if (signal?.aborted) return;
        const msg =
          err instanceof ApiError ? err.message : 'Không thể tải danh sách cấu hình thiết bị.';
        setApiError(msg);
      } finally {
        if (!signal?.aborted) {
          setLoadingConfigs(false);
        }
      }
    },
    [apiReady, section.title, sectionId],
  );

  const reloadAuditLogs = useCallback(
    async (signal?: AbortSignal) => {
      if (!apiReady) {
        return;
      }
      setLoadingAuditLogs(true);
      setApiError(null);
      try {
        const page = await listDeviceAuditLogs(
          {
            target_type: auditGroupFilter,
            outcome: auditOutcomeFilter,
            action: auditActionFilter,
          },
          signal,
        );
        setAuditLogs(page.items);
      } catch (err) {
        if (signal?.aborted) return;
        const msg =
          err instanceof ApiError
            ? err.message
            : 'Không thể tải lịch sử kiểm toán cấu hình thiết bị.';
        setApiError(msg);
      } finally {
        if (!signal?.aborted) {
          setLoadingAuditLogs(false);
        }
      }
    },
    [apiReady, auditActionFilter, auditGroupFilter, auditOutcomeFilter],
  );

  useEffect(() => {
    if (!apiReady) {
      return;
    }
    const controller = new AbortController();
    if (sectionId === 'history') {
      void reloadAuditLogs(controller.signal);
    } else {
      void reloadConfigs(controller.signal);
    }
    return () => controller.abort();
  }, [apiReady, reloadAuditLogs, reloadConfigs, sectionId]);

  function selectConfig(config: DeviceConfigView | null) {
    setSelectedConfig(config);
    setEditName(config ? config.name : `Cấu hình ${section.title} mới`);
    setLatestValidation(null);
    setLatestOperation(null);
    setApiError(null);
  }

  async function saveConfig(): Promise<DeviceConfigView | null> {
    if (!apiReady || sectionId === 'history') return null;
    const group = sectionId as DeviceConfigGroup;
    const nameText = editName.trim();
    const reasonText = changeReason.trim();
    const issues: string[] = [];
    if (!nameText) {
      issues.push('Tên bản ghi cấu hình: Vui lòng nhập tên cấu hình thiết bị.');
    }
    if (selectedConfig && selectedConfig.group === group && reasonText.length < 3) {
      issues.push('Lý do cập nhật / áp dụng (reason): Phải có ít nhất 3 ký tự.');
    }
    if (issues.length > 0) {
      setApiError(issues.join(' '));
      openValidationNoticeModal(feedback, {
        title: 'Thiếu thông tin cấu hình thiết bị',
        description: 'Vui lòng bổ sung các trường thông tin bắt buộc trước khi lưu cấu hình:',
        fields: issues,
      });
      return null;
    }

    setSavingConfig(true);
    setApiError(null);
    try {
      let saved: DeviceConfigView;
      if (selectedConfig && selectedConfig.group === group) {
        saved = await updateDeviceConfig(group, selectedConfig.id, {
          expected_version: selectedConfig.desired_version,
          reason: reasonText,
          name: nameText,
          settings: selectedConfig.settings,
        });
        setConfigs((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
        feedback.notify({
          id: `devcfg-updated-${saved.id}-v${saved.desired_version}`,
          tone: 'success',
          title: 'Đã cập nhật cấu hình thiết bị',
          description: `Bản ghi ${saved.name} đã lưu phiên bản mong muốn v${saved.desired_version} (${saved.apply_status}).`,
        });
      } else {
        saved = await createDeviceConfig(group, {
          name: nameText,
          settings: {},
        });
        setConfigs((prev) => [saved, ...prev]);
        feedback.notify({
          id: `devcfg-created-${saved.id}`,
          tone: 'success',
          title: 'Đã tạo cấu hình thiết bị',
          description: `Bản ghi ${saved.name} đã được khởi tạo ở phiên bản v${saved.desired_version}.`,
        });
      }
      setSelectedConfig(saved);
      setEditName(saved.name);
      return saved;
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Không thể lưu cấu hình thiết bị lên máy chủ.';
      setApiError(msg);
      return null;
    } finally {
      setSavingConfig(false);
    }
  }

  async function validateConfig(): Promise<DeviceValidationResult | null> {
    if (!apiReady || sectionId === 'history' || !selectedConfig) return null;
    const group = sectionId as DeviceConfigGroup;
    setValidatingConfig(true);
    setApiError(null);
    try {
      const res = await validateDeviceConfig(group, selectedConfig.id);
      setLatestValidation(res);
      feedback.notify({
        id: `devcfg-validate-${selectedConfig.id}-v${res.desired_version}`,
        tone: res.valid ? 'success' : 'warning',
        title: res.valid ? 'Cấu hình hợp lệ trên máy chủ' : 'Cấu hình có cảnh báo',
        description: `Phiên bản đã lưu v${res.desired_version} đã được máy chủ xác thực.`,
      });
      return res;
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Không thể xác thực cấu hình trên máy chủ.';
      setApiError(msg);
      return null;
    } finally {
      setValidatingConfig(false);
    }
  }

  async function testConnectivity(): Promise<DeviceOperationView | null> {
    if (!apiReady || sectionId === 'history' || !selectedConfig) return null;
    const group = sectionId as DeviceConfigGroup;
    setTestingConnectivity(true);
    setApiError(null);
    try {
      const op = await testDeviceConnectivity(group, selectedConfig.id);
      setLatestOperation(op);
      return op;
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Kiểm tra kết nối thiết bị không thành công.';
      setApiError(msg);
      return null;
    } finally {
      setTestingConnectivity(false);
    }
  }

  async function applyConfig(): Promise<DeviceOperationView | null> {
    if (!apiReady || sectionId === 'history' || !selectedConfig) return null;
    const group = sectionId as DeviceConfigGroup;
    const reasonText = changeReason.trim();
    if (reasonText.length < 3) {
      const msg = 'Lý do cập nhật / áp dụng (reason): Phải có ít nhất 3 ký tự.';
      setApiError(msg);
      openValidationNoticeModal(feedback, {
        title: 'Thiếu lý do áp dụng cấu hình',
        description: 'Vui lòng nhập lý do áp dụng cấu hình xuống thiết bị:',
        fields: [msg],
      });
      return null;
    }

    setApplyingConfig(true);
    setApiError(null);
    try {
      const op = await applyDeviceConfig(group, selectedConfig.id, {
        expected_version: selectedConfig.desired_version,
        reason: reasonText,
      });
      setLatestOperation(op);
      if (op.status === 'SUCCEEDED') {
        const updatedConfig: DeviceConfigView = {
          ...selectedConfig,
          applied_version: op.applied_version,
          status: 'APPLIED',
          apply_status: 'APPLIED',
          restart_required: op.restart_required,
        };
        setSelectedConfig(updatedConfig);
        setConfigs((prev) =>
          prev.map((item) => (item.id === updatedConfig.id ? updatedConfig : item)),
        );
      }
      return op;
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Không thể áp dụng cấu hình xuống thiết bị.';
      setApiError(msg);
      return null;
    } finally {
      setApplyingConfig(false);
    }
  }

  async function reconcileOperation(operationId?: string): Promise<DeviceOperationView | null> {
    const targetOpId = operationId?.trim() || latestOperation?.operation_id;
    if (!apiReady || !targetOpId) return null;
    setReconcilingOperation(true);
    setApiError(null);
    try {
      const op = await reconcileDeviceOperation(targetOpId);
      setLatestOperation(op);
      if (op.kind === 'APPLY_CONFIG' && op.status === 'SUCCEEDED') {
        setSelectedConfig((prev) =>
          prev && prev.id === op.config_id
            ? {
                ...prev,
                applied_version: op.applied_version,
                status: 'APPLIED',
                apply_status: 'APPLIED',
                restart_required: op.restart_required,
              }
            : prev,
        );
        setConfigs((prev) =>
          prev.map((item) =>
            item.id === op.config_id
              ? {
                  ...item,
                  applied_version: op.applied_version,
                  status: 'APPLIED',
                  apply_status: 'APPLIED',
                  restart_required: op.restart_required,
                }
              : item,
          ),
        );
      }
      return op;
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Không thể đối soát trạng thái tác vụ thiết bị.';
      setApiError(msg);
      return null;
    } finally {
      setReconcilingOperation(false);
    }
  }

  function deleteConfig(target?: DeviceConfigView) {
    const cfg = target ?? selectedConfig;
    if (!apiReady || sectionId === 'history' || !cfg) return;
    const group = sectionId as DeviceConfigGroup;
    openConfirmModal(feedback, {
      id: `delete-devcfg-${cfg.id}`,
      title: `Xóa cấu hình thiết bị: ${cfg.name}?`,
      description: `Xác nhận xóa bản ghi cấu hình ${cfg.name} khỏi nhóm ${section.title}.`,
      confirmText: 'Xác nhận xóa',
      danger: true,
      onConfirm: async () => {
        setDeletingConfig(true);
        setApiError(null);
        try {
          await deleteDeviceConfig(group, cfg.id);
          setConfigs((prev) => {
            const next = prev.filter((item) => item.id !== cfg.id);
            const fallback = next[0] ?? null;
            setSelectedConfig(fallback);
            setEditName(fallback ? fallback.name : `Cấu hình ${section.title} mới`);
            return next;
          });
          setLatestValidation(null);
          setLatestOperation(null);
          feedback.notify({
            id: `devcfg-deleted-${cfg.id}`,
            tone: 'success',
            title: 'Đã xóa cấu hình thiết bị',
            description: `Đã xóa bản ghi ${cfg.name}.`,
          });
        } catch (err) {
          const msg =
            err instanceof ApiError ? err.message : 'Không thể xóa cấu hình thiết bị.';
          setApiError(msg);
        } finally {
          setDeletingConfig(false);
        }
      },
    });
  }

  return {
    data: {
      section,
      sections: settingsSections,
      apiReady,
      configs,
      selectedConfig,
      editName,
      changeReason,
      latestValidation,
      latestOperation,
      auditLogs,
      auditGroupFilter,
      auditOutcomeFilter,
      auditActionFilter,
    },
    state: {
      canPrepareDraft,
      accessMessage: principal
        ? 'Chỉ quản trị viên được chuẩn bị bản nháp cục bộ. Quyền thay đổi cấu hình thật sẽ được dịch vụ xác nhận.'
        : 'Đăng nhập bằng tài khoản quản trị để chuẩn bị bản nháp cục bộ.',
      loadingConfigs,
      loadingAuditLogs,
      savingConfig,
      validatingConfig,
      testingConnectivity,
      applyingConfig,
      reconcilingOperation,
      deletingConfig,
      apiError,
    },
    actions: {
      prepareDraft() {
        if (!canPrepareLocalDraft(principal) || sectionId === 'history') return false;
        return feedback.openModal({
          id: `settings-draft-${sectionId}`,
          title: `Chuẩn bị ${section.singular}`,
          description: 'Bản nháp chưa được lưu vào hệ thống.',
          size: 'lg',
          renderContent: (modal) => <SettingsDraftForm kind={sectionId} modal={modal} />,
          renderFooter: (modal) => (
            <>
              <Button onClick={modal.requestClose}>Đóng</Button>
              <Button type="submit" variant="primary" form={modal.formId}>
                Kiểm tra bản nháp
              </Button>
            </>
          ),
        });
      },
      showFields() {
        return feedback.openModal({
          id: `settings-fields-${sectionId}`,
          title: `Phạm vi ${section.title.toLocaleLowerCase('vi')}`,
          description: 'Các thông tin cần quản lý; đây không phải cấu hình hiện hành.',
          size: 'md',
          renderContent: () => (
            <dl className="settings-field-list">
              {section.fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.description}</dd>
                </div>
              ))}
            </dl>
          ),
          renderFooter: (modal) => <Button onClick={modal.requestClose}>Đã hiểu</Button>,
        });
      },
      selectConfig,
      setEditName,
      setChangeReason,
      setAuditGroupFilter,
      setAuditOutcomeFilter,
      setAuditActionFilter,
      reloadConfigs: () => reloadConfigs(),
      reloadAuditLogs: () => reloadAuditLogs(),
      saveConfig,
      deleteConfig,
      validateConfig,
      testConnectivity,
      applyConfig,
      reconcileOperation,
    },
  };
}
