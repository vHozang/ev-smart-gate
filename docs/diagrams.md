# Sơ đồ Kiến trúc & Luồng Nghiệp vụ — EV Smart Gate

> Các sơ đồ tương tác chất lượng cao (HTML standalone, hỗ trợ zoom, trace flow, inspector) được tạo bằng **Archify**:
> - 🏛️ **Kiến trúc Tổng thể Hệ thống & React Migration**: [ev-smart-gate-architecture.html](file:///e:/ev-smart-gate/docs/diagrams/ev-smart-gate-architecture.html) (Specification: [ev-smart-gate-architecture.json](file:///e:/ev-smart-gate/docs/diagrams/ev-smart-gate-architecture.json))
> - 🔄 **Trình tự Xác minh 3 Yếu tố & Vòng đời Auth**: [ev-smart-gate-verification-auth.html](file:///e:/ev-smart-gate/docs/diagrams/ev-smart-gate-verification-auth.html) (Specification: [ev-smart-gate-verification-auth.json](file:///e:/ev-smart-gate/docs/diagrams/ev-smart-gate-verification-auth.json))

---

## 1. Luồng Cổng Phương tiện Đa yếu tố (`Vehicle Gate In / Gate Out` — 3 Nhóm xe)

```mermaid
sequenceDiagram
    participant E as Edge Agent (RFID + Camera)
    participant A as FastAPI / Gate Use Case
    participant S as MinIO (AES-256-GCM)
    participant V as Vision AI (Face 1:1 + ALPR)
    participant D as MongoDB (Authz & Log)
    participant B as Barrier Controller
    participant W as Security WebSocket

    E->>A: CaptureBundle (event_id, card_uid, face_image, plate_image)
    A->>A: Lock 1: Kiểm tra X-Device-Key, Calibration, ROI, Freshness, Idempotency
    A->>S: Lock 2: Mã hóa AES-256-GCM & Lưu bằng chứng (Fail-closed nếu lỗi)
    par Xác minh Khuôn mặt 1:1
        A->>V: Phát hiện mặt người lái + Liveness + So khớp 1:1 với chủ thẻ
    and Nhận diện Biển số
        A->>V: ALPR (Exact hoặc Fuzzy Unique Levenshtein<=1, RapidFuzz>=90)
    end
    A->>D: Lock 3: Kiểm tra Card ACTIVE + Driver ACTIVE + Vehicle (motorcycle/car/truck) + Authz hiệu lực
    alt Đạt 100% Policy
        A->>D: Ghi GateLog (PASSED, permit_granted=true)
        A->>B: OPEN(command_id = open:{gate_id}:{event_id})
        alt Barrier trả ACK đúng hạn
            B-->>A: ACK (OPENED)
            A->>D: Cập nhật barrier_status = OPENED
            A-->>E: 200 OK (PASSED + permit_granted=true + barrier_status=OPENED)
        else Barrier Timeout / Lỗi
            B-->>A: Timeout / Error
            A->>D: Cập nhật barrier_status = TIMEOUT_UNKNOWN / FAILED + Tạo SecurityAlert
            A-->>W: Phát AlertDelta (sequence)
            A-->>E: Trả trạng thái OUTCOME_UNKNOWN (Đối soát qua GET /api/v2/access-events/{event_id})
        end
    else Sai lệch yếu tố / Mơ hồ / Lỗi AI
        A->>D: Lock 4: Ghi GateLog (FAILED, permit_granted=false) + Tạo SecurityAlert
        A-->>W: Phát AlertDelta (sequence)
        A-->>E: Từ chối mở cổng (Barrier giữ ĐÓNG - Fail-closed)
    end
```

---

## 2. Luồng Cổng Nhân viên Đi bộ (`Pedestrian Access` — 4 Yếu tố, Độc lập với Xe)

```mermaid
sequenceDiagram
    participant P as Pedestrian Turnstile / Edge
    participant A as FastAPI / Pedestrian Use Case
    participant S as MinIO (AES-256-GCM)
    participant F as Face Verification AI
    participant D as MongoDB (Registry & Grants)
    participant T as Turnstile / Barrier

    P->>A: event_id + card_uid + face_image + access_point_id + direction (Không có plate_image)
    A->>S: Lưu bằng chứng face_image mã hóa AES-256-GCM
    A->>D: Tra cứu EmployeeCard (ACTIVE) -> EmployeeRegistry (ACTIVE) -> PedestrianAccessGrant (ACTIVE)
    A->>F: Kiểm tra Liveness & So khớp khuôn mặt 1:1 (face_similarity >= 0.75)
    A->>D: Kiểm tra lại hiệu lực Registry & Grant ngay trước lệnh mở cửa (Chống race revoke)
    alt Đạt đủ 4 yếu tố
        A->>D: Ghi PersonAccessLog (PASSED, permit_granted=true)
        A->>T: OPEN(command_id)
        T-->>A: ACK (OPENED)
        A->>D: Cập nhật barrier_status = OPENED
    else Không đạt / Thu hồi quyền
        A->>D: Ghi PersonAccessLog (FAILED) + Tạo SecurityAlert
    end
```

---

## 3. Máy Trạng thái Công việc Báo cáo AI Nội bộ (`ReportJob Lifecycle` — `UC-AI-03`)

```mermaid
stateDiagram-v2
    [*] --> QUEUED: POST /api/v1/assistant/reports\n(Qua Lock 1 & Lock 2: Chặn Restricted & Injection)
    QUEUED --> RUNNING: Worker atomic claim + lease
    QUEUED --> CANCELED: User cancel trước khi chạy
    RUNNING --> VALIDATING: Code tính AnalyticsSnapshot +\nModelGateway trả JSON draft
    RUNNING --> CANCEL_REQUESTED: POST .../cancel
    CANCEL_REQUESTED --> CANCELED: Worker xác nhận dừng
    CANCEL_REQUESTED --> VALIDATING: Inference hoàn tất trước khi dừng
    VALIDATING --> COMPLETED: Lock 3 Pass (MODEL_GROUNDED)\nhoặc Chuyển sang DATA_SUMMARY_FALLBACK
    VALIDATING --> FAILED: Lỗi không thể phục hồi
    RUNNING --> FAILED: Timeout / Vượt số lần retry lease
    COMPLETED --> [*]: Hết hạn expires_at -> Purge nội dung (410 Gone)
    FAILED --> [*]
    CANCELED --> [*]
```

---

## 4. Máy Trạng thái Lệnh Xuất Kho (`Warehouse Exit Order` — Module Mở rộng)

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> LOADING: Start Dock (Yêu cầu Gate In PASSED hợp lệ)
    LOADING --> READY_FOR_EXIT: AI Cargo tạo Observation +\nOperator Finalize LOADED (Human-in-the-loop)
    READY_FOR_EXIT --> SLIP_ISSUED: Ký phiếu Compact JWS Ed25519 (version=1)
    SLIP_ISSUED --> SLIP_ISSUED: Reissue (tăng slip_version + 1, vô hiệu hóa token cũ)
    SLIP_ISSUED --> COMPLETED: Khớp 3 chiều tại Cổng Kho + Barrier ACK
    PENDING --> CANCELLED
    LOADING --> CANCELLED
    READY_FOR_EXIT --> CANCELLED
    SLIP_ISSUED --> CANCELLED
```
