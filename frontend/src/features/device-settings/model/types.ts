import type { SessionPrincipal } from '@/features/auth';
import type {
  DeviceAuditLogView,
  DeviceConfigGroup,
  DeviceConfigView,
  DeviceOperationView,
  DeviceValidationResult,
} from '../api';

export type SettingsSectionId =
  'cameras' | 'models' | 'barriers' | 'readers' | 'bindings' | 'history';

export type DraftKind = Exclude<SettingsSectionId, 'history'>;

export interface SettingsFieldDefinition {
  label: string;
  description: string;
}

export interface SettingsSectionDefinition {
  id: SettingsSectionId;
  title: string;
  singular: string;
  description: string;
  scope: string;
  fields: readonly SettingsFieldDefinition[];
  columns: readonly string[];
}

export interface SettingsFormValues {
  kind: DraftKind;
  name: string;
  accessPointRef: string;
  laneRef: string;
  direction: string;
  purpose: string;
  connectionProfileRef: string;
  modelRef: string;
  modelVersion: string;
  task: string;
  timeoutMs: string;
  debounceMs: string;
  accessMode: string;
  faceCameraRef: string;
  plateCameraRef: string;
  readerRef: string;
  barrierRef: string;
  notes: string;
}

export interface DraftReviewRow {
  label: string;
  value: string;
}

export interface DeviceSettingsScreen {
  data: {
    section: SettingsSectionDefinition;
    sections: readonly SettingsSectionDefinition[];
    apiReady: boolean;
    configs: DeviceConfigView[];
    selectedConfig: DeviceConfigView | null;
    editName: string;
    changeReason: string;
    latestValidation: DeviceValidationResult | null;
    latestOperation: DeviceOperationView | null;
    auditLogs: DeviceAuditLogView[];
    auditGroupFilter: DeviceConfigGroup | '';
    auditOutcomeFilter: 'SUCCEEDED' | 'FAILED' | '';
    auditActionFilter: string;
  };
  state: {
    canPrepareDraft: boolean;
    accessMessage: string;
    loadingConfigs: boolean;
    loadingAuditLogs: boolean;
    savingConfig: boolean;
    validatingConfig: boolean;
    testingConnectivity: boolean;
    applyingConfig: boolean;
    reconcilingOperation: boolean;
    deletingConfig?: boolean;
    apiError: string | null;
  };
  actions: {
    prepareDraft: () => boolean;
    showFields: () => boolean;
    selectConfig: (config: DeviceConfigView | null) => void;
    setEditName: (name: string) => void;
    setChangeReason: (reason: string) => void;
    setAuditGroupFilter: (group: DeviceConfigGroup | '') => void;
    setAuditOutcomeFilter: (outcome: 'SUCCEEDED' | 'FAILED' | '') => void;
    setAuditActionFilter: (action: string) => void;
    reloadConfigs: () => Promise<void>;
    reloadAuditLogs: () => Promise<void>;
    saveConfig: () => Promise<DeviceConfigView | null>;
    deleteConfig?: (config?: DeviceConfigView) => void;
    validateConfig: () => Promise<DeviceValidationResult | null>;
    testConnectivity: () => Promise<DeviceOperationView | null>;
    applyConfig: () => Promise<DeviceOperationView | null>;
    reconcileOperation: (operationId?: string) => Promise<DeviceOperationView | null>;
  };
}

// Chỉ cho chuẩn bị bản nháp trong RAM; đây không phải grant cho API cấu hình.
export function canPrepareLocalDraft(principal: SessionPrincipal | null): boolean {
  if (!principal || principal.role !== 'ADMIN') return false;
  return principal.source === 'legacy-session' || principal.source === 'jwt';
}

// Kiểm tra phiên quản trị có kết nối dịch vụ API cấu hình thiết bị thực tế.
export function canUseDeviceSettingsApi(principal: SessionPrincipal | null): boolean {
  if (!principal || principal.role !== 'ADMIN') return false;
  return principal.source === 'jwt' || principal.permissions.length > 0;
}
