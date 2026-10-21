import { useSearchParams } from 'react-router';
import { InfoIcon } from '@phosphor-icons/react';
import { ListPageLayout } from '@/layouts/ListPageLayout';
import {
  parseSettingsSection,
  useDeviceSettingsScreen,
  SettingsTabs,
  SettingsSectionPanel,
} from '@/features/device-settings';
import { Badge } from '@/shared/ui/Badge';

export function DeviceSettingsPage() {
  const [params, setParams] = useSearchParams();
  const sectionId = parseSettingsSection(params.get('section'));
  const screen = useDeviceSettingsScreen(sectionId);
  const { apiReady, selectedConfig } = screen.data;

  return (
    <ListPageLayout
      title="Cấu hình thiết bị"
      description="Quản lý cấu hình camera, nhận diện và thiết bị tại từng điểm ra vào."
      actions={
        apiReady ? (
          <Badge tone="success">Đã kết nối dịch vụ cấu hình</Badge>
        ) : (
          <Badge tone="warning">Chờ dịch vụ cấu hình</Badge>
        )
      }
    >
      <SettingsTabs
        sections={screen.data.sections}
        activeId={sectionId}
        onSelect={(id) => {
          void setParams({ section: id }, { replace: true });
        }}
      />
      <div className="inline-note mb-6" id="settings-api-status">
        <InfoIcon size={18} />
        {apiReady ? (
          <p>
            Đã kết nối nguồn cấu hình máy chủ.
            {selectedConfig
              ? ` Bản ghi đang chọn: ${selectedConfig.name} (desired_version: v${selectedConfig.desired_version}, applied_version: ${
                  selectedConfig.applied_version !== null
                    ? `v${selectedConfig.applied_version}`
                    : 'chưa áp dụng'
                }, trạng thái: ${selectedConfig.apply_status}).`
              : ' Chọn một bản ghi trên máy chủ hoặc tạo cấu hình mới để lưu, kiểm tra kết nối và áp dụng.'}
          </p>
        ) : (
          <p>
            Chưa có nguồn cấu hình hiện hành. Bản nháp chỉ phục vụ chuẩn bị thông tin; thao tác lưu,
            kiểm tra kết nối và áp dụng sẽ khả dụng khi dịch vụ quản trị được kết nối.
          </p>
        )}
      </div>
      {screen.data.sections.map((section) => (
        <div
          key={section.id}
          id={`settings-panel-${section.id}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${section.id}`}
          hidden={section.id !== sectionId}
          tabIndex={0}
        >
          {section.id === sectionId && <SettingsSectionPanel screen={screen} />}
        </div>
      ))}
    </ListPageLayout>
  );
}
