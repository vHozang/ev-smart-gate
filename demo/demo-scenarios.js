/**
 * EVN Smart-Gate — Danh mục Tình huống Thử nghiệm Thực tế
 * Tuân thủ tiêu chuẩn thiết kế v1 (Anti-Emoji, Typography & Visual Calibration)
 */

window.SCENARIOS = {
  1: {
    id: 1,
    title: "1. Xe Ô tô Nhân viên vào cổng (Tự động mở)",
    lane: "lane-auto",
    camName: "Camera Cổng vào Ô tô",
    laneCode: "Làn Ô tô vào",
    vehicleType: "CAR",
    
    // Biển số & Nhận diện
    rawPlate: "51A-123.45",
    normPlate: "51A12345",
    plateConfidence: 0.984,
    plateType: "Xe Ô tô con",
    ocrFix: "Trùng khớp chính xác",

    // Thông tin người vào
    driverName: "Nguyễn Văn An",
    driverRole: "Ban Quản lý Dự án Lưới điện",
    scheduleText: "Ca trực ngày (07:00 - 18:00)",
    regPlate: "51A-123.45",
    avatarInitials: "NA",
    faceSimilarity: 0.951,
    identitySource: "NHÂN VIÊN NỘI BỘ",

    // Bước 1: Điều kiện tiên quyết
    hardRules: {
      isBlacklisted: false,
      isAppointmentValid: true,
      isDeviceOk: true
    },

    // Bước 2: Điểm đánh giá
    riskScore: 0,
    scoreChips: [
      { text: "Lịch trực ca hợp lệ", type: "chip-ok" },
      { text: "Biển số khớp 98.4%", type: "chip-ok" },
      { text: "Khuôn mặt khớp 95.1%", type: "chip-ok" }
    ],

    // Quyết định
    decision: "ALLOW",
    decisionBadgeText: "CHO PHÉP VÀO (TỰ ĐỘNG MỞ CỔNG)",
    decisionBadgeClass: "badge-allow",
    decisionReason: "Lịch trực hợp lệ, Biển số khớp 98.4%, Khuôn mặt khớp 95.1%. Đánh giá: An toàn tuyệt đối (0/100).",
    autoOpenGate: true,
    gateLatency: "1.8 giây (Rất nhanh)",

    // Khung hiển thị camera
    hudBoxes: {
      plate: { text: "Biển số: 51A-123.45 (Khớp 98%)", top: "60%", left: "38%", width: "24%", height: "14%", hazard: false },
      face: { text: "Khuôn mặt: Nguyễn Văn An (Khớp 95%)", top: "25%", left: "45%", width: "12%", height: "20%", hazard: false },
      cargo: null
    },

    auditMessage: "Đã xác thực nhân viên Nguyễn Văn An (Xe: 51A-123.45). Cần barrier tự động nâng lên cho xe vào."
  },

  2: {
    id: 2,
    title: "2. Đối tượng trong Danh sách Chặn (Khóa cổng ngay)",
    lane: "lane-auto",
    camName: "Camera Cổng vào Ô tô",
    laneCode: "Làn Ô tô vào",
    vehicleType: "CAR",
    
    // Biển số & Nhận diện
    rawPlate: "51K-999.99",
    normPlate: "51K99999",
    plateConfidence: 0.991,
    plateType: "Xe Ô tô con",
    ocrFix: "Trùng khớp chính xác",

    // Thông tin người vào
    driverName: "Lê Văn Trọng",
    driverRole: "Cựu nhân viên (Đã thu hồi quyền)",
    scheduleText: "Lịch hẹn công tác tạo qua mạng",
    regPlate: "51K-999.99",
    avatarInitials: "LT",
    faceSimilarity: 0.965,
    identitySource: "ĐỐI TƯỢNG CẦN CHẶN",

    // Bước 1: Điều kiện tiên quyết - PHÁT HIỆN BLACKLIST
    hardRules: {
      isBlacklisted: true, // VI PHẠM
      isAppointmentValid: true,
      isDeviceOk: true
    },

    // Bước 2: Điểm đánh giá
    riskScore: 100,
    scoreChips: [
      { text: "PHÁT HIỆN TRONG DANH SÁCH CHẶN", type: "chip-bad" },
      { text: "KHÓA CỔNG AN NINH LẬP TỨC", type: "chip-bad" }
    ],

    // Quyết định
    decision: "BLOCK",
    decisionBadgeText: "TỪ CHỐI VÀO (CẢNH BÁO AN NINH)",
    decisionBadgeClass: "badge-block",
    decisionReason: "CẢNH BÁO: Đối tượng nằm trong danh sách cấm/hạn chế vào công ty. Hệ thống khóa cổng lập tức, không cho vào!",
    autoOpenGate: false,
    gateLatency: "Khóa cổng ngay tức thì",

    // Khung hiển thị camera
    hudBoxes: {
      plate: { text: "Biển số: 51K-999.99 [DANH SÁCH CẤM]", top: "60%", left: "38%", width: "24%", height: "14%", hazard: true },
      face: { text: "Khuôn mặt: Lê Văn Trọng [DANH SÁCH CẤM]", top: "25%", left: "45%", width: "12%", height: "20%", hazard: true },
      cargo: null
    },

    auditMessage: "CẢNH BÁO AN NINH: Đối tượng Lê Văn Trọng trong danh sách cấm đến cổng. Hệ thống đã khóa chặt barrier."
  },

  3: {
    id: 3,
    title: "3. Làn Xe máy (Đọc biển số sau + Quẹt thẻ nhanh 1.2s)",
    lane: "lane-moto",
    camName: "Camera Làn Xe máy (Chụp Biển số sau)",
    laneCode: "Làn Xe máy",
    vehicleType: "MOTORBIKE",
    
    // Biển số & Nhận diện
    rawPlate: "59-F1 2345",
    normPlate: "59F12345",
    plateConfidence: 0.962,
    plateType: "Xe máy",
    ocrFix: "Đã xử lý khoảng cách",

    // Thông tin người vào
    driverName: "Phạm Quốc Hùng",
    driverRole: "Kỹ sư Vận hành Trạm 220kV",
    scheduleText: "Thẻ Nhân viên: RF-902188",
    regPlate: "59-F1 2345",
    avatarInitials: "PH",
    faceSimilarity: 0.912,
    identitySource: "THẺ NHÂN VIÊN + BIỂN SỐ SAU",

    // Bước 1: Điều kiện tiên quyết
    hardRules: {
      isBlacklisted: false,
      isAppointmentValid: true,
      isDeviceOk: true
    },

    // Bước 2: Điểm đánh giá
    riskScore: 0,
    scoreChips: [
      { text: "Quẹt thẻ nhân viên: 0.4s", type: "chip-ok" },
      { text: "Biển số sau khớp 96.2%", type: "chip-ok" },
      { text: "Nhân viên hợp lệ", type: "chip-ok" }
    ],

    // Quyết định
    decision: "ALLOW",
    decisionBadgeText: "CHO PHÉP VÀO (MỞ CẦN XE MÁY)",
    decisionBadgeClass: "badge-allow",
    decisionReason: "Làn xe máy: Thẻ nhân viên hợp lệ, Camera sau đọc đúng biển 59F12345. Mở cần trong 1.2s.",
    autoOpenGate: true,
    gateLatency: "1.2 giây (Siêu tốc giải tỏa)",

    // Khung hiển thị camera
    hudBoxes: {
      plate: { text: "Biển số sau: 59-F1 2345 (Khớp 96%)", top: "50%", left: "40%", width: "20%", height: "18%", hazard: false },
      face: { text: "Thẻ nhân viên: Hợp lệ", top: "20%", left: "42%", width: "16%", height: "20%", hazard: false },
      cargo: null
    },

    auditMessage: "Làn xe máy: Xác thực thành công kỹ sư Phạm Quốc Hùng (Thẻ: RF-902188). Mở cổng xe máy trong 1.2s."
  },

  4: {
    id: 4,
    title: "4. Xe tải ra cổng chở hàng lệch phiếu xuất kho",
    lane: "lane-exit",
    camName: "Khu vực 4 Camera Soi thùng xe lối ra",
    laneCode: "Làn Xe tải ra",
    vehicleType: "TRUCK",
    
    // Biển số & Nhận diện
    rawPlate: "51D-882.11",
    normPlate: "51D88211",
    plateConfidence: 0.978,
    plateType: "Xe tải chở hàng",
    ocrFix: "Trùng khớp chính xác",

    // Thông tin người vào
    driverName: "Đỗ Minh Tuấn",
    driverRole: "Lái xe Đội vận tải số 2",
    scheduleText: "Phiếu xuất kho: PXK-EVN-2026-08819",
    regPlate: "51D-882.11",
    avatarInitials: "DT",
    faceSimilarity: 0.932,
    identitySource: "XE TẢI VẬN CHUYỂN",

    // Bước 1: Điều kiện tiên quyết
    hardRules: {
      isBlacklisted: false,
      isAppointmentValid: true,
      isDeviceOk: true
    },

    // Bước 2: Điểm đánh giá
    riskScore: 85,
    scoreChips: [
      { text: "HÀNG HÓA LỆCH PHIẾU XUẤT", type: "chip-bad" },
      { text: "Phát hiện Cuộn cáp 110kV", type: "chip-bad" },
      { text: "Biển số xe vận chuyển khớp", type: "chip-ok" }
    ],

    // Quyết định
    decision: "REVIEW",
    decisionBadgeText: "CẦN BẢO VỆ KIỂM TRA XE (RỦI RO CAO)",
    decisionBadgeClass: "badge-block",
    decisionReason: "CẢNH BÁO: 4 Camera phát hiện Cuộn cáp đồng 110kV không có tên trong Phiếu xuất kho PXK-08819. Cần giữ cổng và kiểm tra!",
    autoOpenGate: false,
    gateLatency: "Giữ cổng đóng để kiểm tra",

    // Khung hiển thị camera
    hudBoxes: {
      plate: { text: "Biển số xe: 51D-882.11", top: "65%", left: "35%", width: "24%", height: "14%", hazard: false },
      face: { text: "Lái xe: Đỗ Minh Tuấn", top: "25%", left: "30%", width: "12%", height: "20%", hazard: false },
      cargo: { text: "HÀNG LỆCH PHIẾU: Cuộn cáp 110kV", top: "35%", left: "48%", width: "35%", height: "45%", hazard: true }
    },

    auditMessage: "CẢNH BÁO THẤT THOÁT: Xe tải 51D88211 chở cuộn cáp 110kV không có trong phiếu xuất kho. Giữ cổng đóng."
  }
};
