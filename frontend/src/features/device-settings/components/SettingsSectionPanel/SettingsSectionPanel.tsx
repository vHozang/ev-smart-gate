import {
  SlidersHorizontalIcon,
  PlusIcon,
  ListBulletsIcon,
  LockKeyIcon,
  ArrowRightIcon,
} from '@phosphor-icons/react';
import { Button } from '@/shared/ui/Button';
import { StatePanel } from '@/shared/ui/StatePanel';
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
          <Button size="sm" icon={<ListBulletsIcon size={17} />} onClick={actions.showFields}>
            Xem trường cấu hình
          </Button>
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
          <section className="settings-apply-panel" aria-label="Áp dụng cấu hình">
            <h3>
              Cấu hình đã lưu <ArrowRightIcon size={14} /> Cấu hình đang chạy
            </h3>
            <p>
              Hai trạng thái cần được xác nhận riêng. Một số thay đổi có thể yêu cầu khởi động lại.
            </p>
            <div className="settings-disabled-actions">
              <Button size="sm" disabled aria-describedby="settings-api-status">
                Lưu cấu hình
              </Button>
              <Button size="sm" disabled aria-describedby="settings-api-status">
                Kiểm tra kết nối
              </Button>
              <Button size="sm" disabled aria-describedby="settings-api-status">
                Áp dụng
              </Button>
            </div>
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
