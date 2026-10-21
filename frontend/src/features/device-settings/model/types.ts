import type { SessionPrincipal } from '@/features/auth';
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
    apiReady: false;
  };
  state: { canPrepareDraft: boolean; accessMessage: string };
  actions: { prepareDraft: () => boolean; showFields: () => boolean };
}
// Chỉ cho chuẩn bị bản nháp trong RAM; đây không phải grant cho API cấu hình.
export function canPrepareLocalDraft(principal: SessionPrincipal | null): boolean {
  return principal?.source === 'legacy-session' && principal.role === 'ADMIN';
}
