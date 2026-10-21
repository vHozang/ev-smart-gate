import type { SettingsSectionDefinition, SettingsSectionId } from './types';
export const settingsSections: readonly SettingsSectionDefinition[] = [
  {
    id: 'cameras',
    title: 'Camera',
    singular: 'camera',
    description: 'Quản lý nguồn hình ảnh và vị trí ghi nhận tại từng điểm ra vào.',
    scope: 'Nguồn hình ảnh',
    fields: [
      { label: 'Thông tin & vị trí', description: 'Tên camera, cổng, làn và hướng vào/ra.' },
      {
        label: 'Vai trò camera',
        description: 'Ghi hình khuôn mặt, biển số hoặc giám sát tổng quan.',
      },
      {
        label: 'Kết nối',
        description: 'Tham chiếu profile kết nối; thông tin xác thực được quản lý riêng.',
      },
      {
        label: 'Vùng nhận diện & hiệu chuẩn',
        description: 'ROI, phiên bản hiệu chuẩn và xem trước cần hình ảnh thật từ dịch vụ.',
      },
      {
        label: 'Thông số hình ảnh',
        description: 'Độ phân giải, FPS và thời gian nhận hình theo khả năng camera được công bố.',
      },
    ],
    columns: ['Camera', 'Cổng / làn', 'Vai trò', 'Phiên bản cấu hình', 'Đang áp dụng'],
  },
  {
    id: 'models',
    title: 'Mô hình nhận diện',
    singular: 'mô hình',
    description: 'Theo dõi mô hình, phiên bản và tham số nhận diện được phép sử dụng.',
    scope: 'Nhận diện & chất lượng',
    fields: [
      {
        label: 'Danh mục mô hình',
        description:
          'Chọn model được backend công bố; không tải model hoặc nhập đường dẫn thực thi từ trình duyệt.',
      },
      {
        label: 'Tác vụ & phiên bản',
        description: 'Nhận diện mặt, phát hiện mặt, đọc biển số hoặc kiểm tra liveness.',
      },
      {
        label: 'Ngưỡng & đơn vị',
        description:
          'Đơn vị, khoảng hợp lệ và ngưỡng hiệu lực cần metadata của từng model; không dùng giá trị mặc định giả.',
      },
      {
        label: 'Áp dụng phiên bản',
        description: 'Phân biệt phiên bản đã lưu, phiên bản đang chạy và yêu cầu khởi động lại.',
      },
    ],
    columns: ['Mô hình', 'Tác vụ', 'Phiên bản', 'Ngưỡng hiệu lực', 'Đang chạy'],
  },
  {
    id: 'barriers',
    title: 'Barrier',
    singular: 'barrier',
    description: 'Cấu hình kết nối bộ chấp hành và thời hạn chờ phản hồi tại cổng.',
    scope: 'Bộ chấp hành',
    fields: [
      {
        label: 'Thiết bị & vị trí',
        description: 'Tên barrier, cổng/làn và profile kết nối tương ứng.',
      },
      {
        label: 'Thời hạn chờ ACK',
        description:
          'Cấu hình timeout theo khả năng thiết bị; hết thời gian chờ không đồng nghĩa lệnh chưa thực thi.',
      },
      {
        label: 'Kiểm tra kết nối',
        description: 'Chỉ kiểm tra kết nối không gây chuyển động; không phát lệnh mở barrier.',
      },
      {
        label: 'Trạng thái áp dụng',
        description:
          'Phiên bản cấu hình đang dùng, kết quả áp dụng và lỗi đã được dịch vụ xác nhận.',
      },
    ],
    columns: ['Barrier', 'Cổng / làn', 'Kết nối', 'Chờ ACK', 'Phiên bản'],
  },
  {
    id: 'readers',
    title: 'Đầu đọc thẻ',
    singular: 'đầu đọc thẻ',
    description: 'Liên kết đầu đọc với vị trí, hướng di chuyển và quy tắc chống quét lặp.',
    scope: 'Nhận thẻ RFID',
    fields: [
      {
        label: 'Thông tin đầu đọc',
        description: 'Tên, cổng/làn, hướng và tham chiếu profile kết nối.',
      },
      {
        label: 'Giao thức & khả năng',
        description: 'Giao thức hỗ trợ phải lấy từ danh mục thiết bị thật.',
      },
      {
        label: 'Chống quét lặp',
        description:
          'Debounce gắn cùng encounter; không tạo thêm lượt xác minh vì một lần quét lặp.',
      },
      {
        label: 'Trạng thái nhận thẻ',
        description:
          'Thời điểm nhận gần nhất và tình trạng kết nối, không hiển thị UID thẻ đầy đủ.',
      },
    ],
    columns: ['Đầu đọc', 'Cổng / làn', 'Hướng', 'Chống quét lặp', 'Phiên bản'],
  },
  {
    id: 'bindings',
    title: 'Cổng & làn',
    singular: 'liên kết cổng và làn',
    description: 'Ghép đúng camera, đầu đọc và bộ chấp hành cho từng luồng ra vào.',
    scope: 'Liên kết thiết bị',
    fields: [
      {
        label: 'Điểm ra vào & hướng',
        description: 'Tham chiếu điểm kiểm soát, làn và hướng vào/ra.',
      },
      { label: 'Chế độ kiểm soát', description: 'Nhân viên đi bộ, xe máy, ô tô hoặc xe tải.' },
      {
        label: 'Nguồn xác minh',
        description:
          'Camera mặt và đầu đọc thẻ cho mọi chế độ; phương tiện có thêm camera biển số.',
      },
      {
        label: 'Bộ chấp hành',
        description: 'Liên kết barrier/thiết bị kiểm soát phù hợp; không suy đã qua cổng từ ACK.',
      },
      {
        label: 'Ràng buộc nguồn hình ảnh',
        description:
          'Binding, encounter, ROI và hiệu chuẩn cần được backend kiểm tra trước áp dụng.',
      },
    ],
    columns: ['Cổng / làn', 'Hướng', 'Chế độ', 'Nguồn xác minh', 'Phiên bản'],
  },
  {
    id: 'history',
    title: 'Lịch sử cấu hình',
    singular: 'lịch sử',
    description: 'Tra cứu ai đã thay đổi, phiên bản và kết quả áp dụng cấu hình.',
    scope: 'Theo dõi thay đổi',
    fields: [
      {
        label: 'Người thực hiện & thời gian',
        description:
          'Actor và timestamp do server ghi, không lấy từ dữ liệu tự khai của trình duyệt.',
      },
      {
        label: 'Thay đổi có phiên bản',
        description: 'Đối tượng, phiên bản trước/sau, lý do và diff đã loại bỏ secrets.',
      },
      {
        label: 'Kết quả áp dụng',
        description:
          'Operation, trạng thái đang chờ/thành công/thất bại/chưa xác định và yêu cầu restart nếu có.',
      },
    ],
    columns: ['Thời gian', 'Người thực hiện', 'Đối tượng', 'Thay đổi', 'Kết quả áp dụng'],
  },
];
export function parseSettingsSection(value: string | null): SettingsSectionId {
  return settingsSections.find((section) => section.id === value)?.id ?? 'cameras';
}
export function getSettingsSection(id: SettingsSectionId): SettingsSectionDefinition {
  const result = settingsSections.find((section) => section.id === id);
  if (!result) throw new Error('Nhóm cấu hình không hợp lệ');
  return result;
}
