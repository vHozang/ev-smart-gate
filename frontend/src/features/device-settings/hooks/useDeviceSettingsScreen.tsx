import { useAuth } from '@/features/auth';
import { useFeedback } from '@/shared/feedback';
import { Button } from '@/shared/ui/Button';
import { getSettingsSection, settingsSections } from '../model/catalog';
import { canPrepareLocalDraft } from '../model/types';
import type { DeviceSettingsScreen, SettingsSectionId } from '../model/types';
import { SettingsDraftForm } from '../components/SettingsDraftForm';
export function useDeviceSettingsScreen(sectionId: SettingsSectionId): DeviceSettingsScreen {
  const { principal } = useAuth();
  const feedback = useFeedback();
  const section = getSettingsSection(sectionId);
  const canPrepareDraft = sectionId !== 'history' && canPrepareLocalDraft(principal);
  return {
    data: { section, sections: settingsSections, apiReady: false },
    state: {
      canPrepareDraft,
      accessMessage: principal
        ? 'Chỉ quản trị viên được chuẩn bị bản nháp cục bộ. Quyền thay đổi cấu hình thật sẽ được dịch vụ xác nhận.'
        : 'Đăng nhập bằng tài khoản quản trị để chuẩn bị bản nháp cục bộ.',
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
    },
  };
}
