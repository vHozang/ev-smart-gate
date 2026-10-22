import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FeedbackProvider } from '@/shared/feedback';
import { VehicleDetail } from '@/features/vehicles/components/VehicleDetail';
import type { Vehicle } from '@/features/vehicles/model/schema';
import { DriverDetail } from '@/features/drivers/components/DriverDetail';
import type { Driver } from '@/features/drivers/api';
import { OrderDetail } from '@/features/warehouse-orders/components/OrderDetail';
import type { WarehouseOrder } from '@/features/warehouse-orders/api';

const mockVehicle: Vehicle = {
  id: 'veh-123-abc',
  plate_number: '29A-888.88',
  plate_normalized: '29A88888',
  vehicle_type: 'CAR',
  make: 'VinFast',
  model: 'VF8',
  color: 'Xanh bộ đội',
  status: 'ACTIVE',
  metadata: {
    rfid_card: 'E28011700000020',
    max_payload: '2000kg',
    snapshot_url: 'https://cdn.example.com/vehicles/29A88888.jpg',
  },
};

const mockDriver: Driver = {
  id: 'drv-456-xyz',
  full_name: 'Trần Văn Mạnh',
  employee_code: 'NV-9988',
  phone: '0901234567',
  status: 'ACTIVE',
  face_model: 'insightface-arcface-r100',
  embedding_version: 'v2.1',
  enrolled_at: '2026-02-15T10:30:00Z',
};

const mockOrder: WarehouseOrder = {
  id: 'ord-789-uvw',
  order_id: 'XK-2026-0045',
  slip_version: 2,
  status: 'LOADING',
  assigned_vehicle_id: 'veh-123-abc',
  assigned_driver_id: 'drv-456-xyz',
  dock_session_id: 'DOCK-B-04',
  valid_from: '2026-10-21T06:00:00Z',
  valid_until: '2026-10-21T18:00:00Z',
  slip_refs: { inv: 'INV-1092', gate_pass: 'GP-88' },
  cargo_metadata: [
    { name: 'Pin Lithium xe điện', quantity: 120, unit: 'module' },
    { name: 'Cụm điều khiển Inverter', quantity: 40, unit: 'bộ' },
  ],
};

describe('Entity Details & Evidence Modals (Tùy chọn A)', () => {
  it('VehicleDetail: render đúng các thông số và mở EvidenceModal chứa ảnh xe', async () => {
    const user = userEvent.setup();

    render(
      <FeedbackProvider>
        <VehicleDetail vehicle={mockVehicle} />
      </FeedbackProvider>,
    );

    // Kiểm tra thông tin hiển thị cơ bản
    expect(screen.getByText('29A-888.88')).toBeInTheDocument();
    expect(screen.getByText('29A88888')).toBeInTheDocument();
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
    expect(screen.getByText('CAR')).toBeInTheDocument();
    expect(screen.getByText('VinFast · VF8')).toBeInTheDocument();
    expect(screen.getByText('Xanh bộ đội')).toBeInTheDocument();
    expect(screen.getByText('veh-123-abc')).toBeInTheDocument();
    expect(screen.getByText('E28011700000020')).toBeInTheDocument();

    // Mở Evidence Modal
    const evidenceBtn = screen.getByRole('button', { name: /Xem hình ảnh \/ bằng chứng/i });
    await user.click(evidenceBtn);

    // EvidenceModal xuất hiện
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Ảnh phương tiện 29A-888.88')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Ảnh phương tiện biển số 29A-888.88' }),
    ).toBeInTheDocument();

    // Đóng Evidence Modal
    const closeBtn = screen.getByRole('button', { name: 'Đóng' });
    await user.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('DriverDetail: render thông số nhận diện AI và mở EvidenceModal', async () => {
    const user = userEvent.setup();

    render(
      <FeedbackProvider>
        <DriverDetail driver={mockDriver} />
      </FeedbackProvider>,
    );

    // Kiểm tra thông tin tài xế
    expect(screen.getByText('Trần Văn Mạnh')).toBeInTheDocument();
    expect(screen.getByText('NV-9988')).toBeInTheDocument();
    expect(screen.getByText('0901234567')).toBeInTheDocument();
    expect(screen.getByText('insightface-arcface-r100')).toBeInTheDocument();
    expect(screen.getByText('v2.1')).toBeInTheDocument();

    // Mở Evidence Modal
    const evidenceBtn = screen.getByRole('button', { name: /Xem chi tiết mẫu nhận diện AI/i });
    await user.click(evidenceBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Khuôn mặt nhận diện: Trần Văn Mạnh')).toBeInTheDocument();
    // Do source=null, EvidenceViewer render placeholder fallback an toàn
    expect(screen.getByText('Chưa có hình ảnh bằng chứng')).toBeInTheDocument();

    // Đóng Modal
    const closeBtn = screen.getByRole('button', { name: 'Đóng' });
    await user.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('OrderDetail: render thông tin đơn kho, danh mục hàng hóa và mở EvidenceModal', async () => {
    const user = userEvent.setup();

    render(
      <FeedbackProvider>
        <OrderDetail order={mockOrder} />
      </FeedbackProvider>,
    );

    // Kiểm tra thông tin đơn hàng
    expect(screen.getByText('XK-2026-0045')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('Đang xếp hàng')).toBeInTheDocument();
    expect(screen.getByText('DOCK-B-04')).toBeInTheDocument();
    expect(screen.getByText('Pin Lithium xe điện')).toBeInTheDocument();
    expect(screen.getByText('120 module')).toBeInTheDocument();
    expect(screen.getByText('Cụm điều khiển Inverter')).toBeInTheDocument();
    expect(screen.getByText('40 bộ')).toBeInTheDocument();

    // Mở Evidence Modal
    const evidenceBtn = screen.getByRole('button', { name: /Xem chứng từ/i });
    await user.click(evidenceBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Phiếu xuất kho: XK-2026-0045')).toBeInTheDocument();

    // Đóng Modal
    const closeBtn = screen.getByRole('button', { name: 'Đóng' });
    await user.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
