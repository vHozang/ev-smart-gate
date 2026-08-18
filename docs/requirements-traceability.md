# Requirements Traceability Matrix (RTM)

> **Project:** AI-Powered Vehicle Gate Control and Inventory Management System
> **Client:** Tổng Công ty Điện lực
> **Source of truth:** BRD v0.1 (DRAFT / PROPOSED)
> **Status:** Đang chờ Official Requirement bằng văn bản từ Phòng Thông tin — xem `OQ-01`.

Tài liệu này là **cầu nối bắt buộc** giữa BRD (ngôn ngữ nghiệp vụ, do khách hàng chốt) và bộ tài liệu kiến trúc (`smart-gate-system-design.md`, `project-structure.md`, `diagrams.md`). Mọi thay đổi scope phải cập nhật ở đây trước khi lan sang tài liệu kỹ thuật.

---

## 1. Status Legend

| Status | Ý nghĩa | Hệ quả với team |
|---|---|---|
| `CONFIRMED` | Khách hàng đã xác nhận trong họp | Được phép thiết kế chi tiết & estimate |
| `PROPOSED` | Team tự đề xuất từ mong muốn ban đầu | Thiết kế ở mức high-level, **không estimate cứng** |
| `NEEDS CONFIRMATION` | Đang chờ khách trả lời | **Blocking** — không đưa vào commitment |
| `DESIGN-ADDED` | Không có trong BRD, do team bổ sung vì lý do kỹ thuật/an ninh | Phải trình khách duyệt trước khi tính công |

---

## 2. Business Requirements (BRD §4)

| ID | Business Requirement | BRD Status | Phase (BRD) | Thiết kế tương ứng |
|---|---|---|---|---|
| BR-01 | Module Đăng ký (Web/App Portal) | `PROPOSED` | Phase 1 / Stage 1A | System Design §4 (Stage 1A), §6 Visitor Portal |
| BR-02 | Module Nhận diện (AI & Camera IoT) — LPR + Face real-time | `CONFIRMED` | Phase 1 / Stage 1A | System Design §8 AI & Device Integration; Diagrams §9 Edge AI Pipeline |
| BR-03 | Module Điều khiển Cổng | `CONFIRMED` | Phase 1 / Stage 1A | System Design §10 Entry State Machine, §8.7 Integration Matrix |
| BR-04 | Module Kiểm soát Tài sản & An ninh (4 camera) | `PROPOSED` | Phase 1 / Stage 1B | System Design §11 Exit Inspection State Machine, §14 |
| BR-05 | Module Tracking Phương tiện trong bãi | `PROPOSED` | **Chưa xác định** | ⚠️ Xem §3.1 và §5 — Gap của BRD |
| BR-06 | Module Đối chiếu Xuất kho | `PROPOSED` | Phase 2 | System Design §12 Risk Engine (Inspection inputs), §18 PoC 3 |

> **Chỉ BR-02 và BR-03 là CONFIRMED.** 4/6 module còn lại là đề xuất của team. Đây là rủi ro scope lớn nhất của dự án.

---

## 3. Functional Requirements Traceability (BRD §5)

| FR | Tên chức năng | BR | Priority | Use Case (diagrams.md §2) | Component | Phase | Status |
|---|---|---|---|---|---|---|---|
| FR01 | Đăng ký khách ra vào | BR-01 | High | `Register Appointment`, `Register Vehicle` | Visitor Portal → Appointment Service | 1 | `PROPOSED` |
| FR02 | Nhận diện tự động tại cổng | BR-02 | High | `Recognize Plate`, `Verify Face` (include của `Enter Site`) | Edge AI → Vision Gateway | 1 | `CONFIRMED` |
| FR03 | Xử lý mở cổng | BR-03 | High | `Enter Site`, `Review Access` | Decision Engine → Gate Adapter | 1 | `CONFIRMED` |
| FR04 | Thông báo cho Host | BR-01, BR-03 | Medium | `Notify Host` | Notification Service | 1 | `PROPOSED` |
| FR05 | Nhận diện & Cảnh báo hàng hóa | BR-04 | High | `Inspect Vehicle at Exit`, `Detect Objects` | Inspection Service → Risk Engine | 1 | `PROPOSED` |
| FR06 | Tích hợp Phiếu xuất kho | BR-06 | Low | `Match Voucher` | Inventory Adapter | 2 | `PROPOSED` |
| **FR07** | **Tracking phương tiện trong bãi** | BR-05 | **TBD** | `Track Vehicle In Site` | Multi-camera Tracking | **TBD** | ⚠️ `NEEDS CONFIRMATION` |

### 3.1 Ghi chú quan trọng về FR07

BRD §4 liệt kê **BR-05 Module Tracking Phương tiện** và BRD §6 (TO-BE bước 5) mô tả *"Xe di chuyển vào trong bãi, hệ thống tiếp tục tracking vị trí dừng đỗ"*, **nhưng BRD §5 không có Functional Requirement tương ứng**.

Đây là lỗi thiếu sót của BRD, không phải của thiết kế. Team đề xuất bổ sung `FR07` và cần khách hàng làm rõ:

- Tracking ở mức nào: chỉ ghi nhận **vị trí đỗ cuối cùng**, hay **toàn bộ hành trình** trong bãi?
- Có yêu cầu **Vehicle Re-identification** giữa nhiều camera không? (chi phí kỹ thuật rất khác nhau)
- Số lượng camera phủ bãi đỗ hiện có?

→ Ghi nhận thành `OQ-05`.

---

## 4. Design Elements KHÔNG có trong BRD (`DESIGN-ADDED`)

Các hạng mục dưới đây có trong tài liệu kiến trúc nhưng **không xuất phát từ BRD**. Team bổ sung vì lý do an ninh/vận hành. **Cần khách duyệt trước khi tính vào scope thương mại.**

| ID | Hạng mục | Lý do bổ sung | Rủi ro nếu bỏ |
|---|---|---|---|
| DA-01 | Host Approval (Host duyệt lịch hẹn trước khi khách đến) | BRD chỉ mô tả *thông báo* cho Host, không có bước duyệt. Không duyệt trước ⇒ ai cũng đăng ký vào được | Cổng mở cho khách không được mời |
| DA-02 | Audit Log toàn bộ Decision / Manual Override | Dự án Nhà nước, cần truy vết trách nhiệm khi mất tài sản | Không quy trách nhiệm được khi có sự cố |
| DA-03 | Evidence Management (lưu ảnh/clip làm bằng chứng) | Cảnh báo "tuồn hàng" không có bằng chứng thì không xử lý được | Cảnh báo vô giá trị về mặt pháp lý |
| DA-04 | Risk Engine có điểm số & ngưỡng cấu hình | BRD chỉ nói "đánh cờ và gửi cảnh báo" — cần cơ chế định lượng để giảm false alarm | Bảo vệ bị spam cảnh báo, mất niềm tin hệ thống |
| DA-05 | Blacklist người / phương tiện | Yêu cầu an ninh cơ bản của mọi hệ thống kiểm soát ra vào | Không chặn được đối tượng đã có tiền sử |
| DA-06 | Multi-site / Multi-gate configuration | BRD §9 Future Scope nêu ý định nhân rộng ra các chi nhánh | Phải viết lại kiến trúc khi nhân rộng |
| DA-07 | Guard Review / Human-in-the-loop workflow | AI không đủ chính xác để tự quyết (xem `R-01`) | Hệ thống sai ⇒ chặn nhầm xe hợp lệ |
| DA-08 | Security Supervisor role | Cần người quản lý policy & alert, tách khỏi Guard trực ca | Không ai chịu trách nhiệm cấu hình ngưỡng |

---

## 5. Scope Boundary

### 5.1 In Scope (BRD §9)

- Web/App Portal đăng ký ra vào cho khách/nhà cung cấp.
- AI Model (Local hoặc Third-party — **chưa chốt**, xem `OQ-02`) xử lý video real-time.
- Nhận diện biển số, khuôn mặt, tự động mở cổng.
- Nhận diện **cơ bản** hàng hóa/thiết bị trong xe để cảnh báo chống thất thoát.

### 5.2 Out of Scope (BRD §9) — QUAN TRỌNG

> **Toàn bộ phần cứng KHÔNG thuộc phạm vi cung cấp của team:**
> - Camera IP
> - Server / máy chủ AI
> - Thiết bị IoT điều khiển barrier
>
> Khách hàng (Tổng Công ty Điện lực) dự kiến tự đầu tư/cung cấp.

**Hệ quả kỹ thuật bắt buộc phải tuân thủ:**

1. Kiến trúc **không được** phụ thuộc vào một model camera cụ thể → bắt buộc dùng `CameraGateway` port + adapter.
2. Kiến trúc **không được** phụ thuộc vào một giao thức barrier cụ thể → bắt buộc dùng `GateControllerGateway` port (HTTP / MQTT / Modbus adapter).
3. Yêu cầu phần cứng tối thiểu (độ phân giải, FPS, góc đặt, ánh sáng) phải được **văn bản hóa và bàn giao cho khách** như một Hardware Specification — nếu khách mua camera không đạt chuẩn, team **không chịu trách nhiệm** về độ chính xác AI. Xem `OQ-03`, `R-01`.

### 5.3 Future / Potential Scope (BRD §9)

- Tích hợp sâu đối chiếu Phiếu xuất kho (mở rộng của BR-06).
- Đóng gói SaaS / License để triển khai cho các chi nhánh điện lực khác.
- Tích hợp hệ thống HR.

---

## 6. Open Questions Register (BRD §10 + phát sinh)

| ID | Câu hỏi | Nguồn | Owner | Ảnh hưởng nếu không trả lời | Status |
|---|---|---|---|---|---|
| OQ-01 | Xin **Official Requirement bằng văn bản** từ Phòng Thông tin Điện lực để chốt Scope | BRD §10 | Client Sponsor / BA Lead | **Blocking toàn bộ dự án.** Hiện team đang tự lên solution từ mong muốn miệng ⇒ rủi ro làm sai, làm thừa | `OPEN` |
| OQ-02 | AI chạy **Local model** (bảo mật dữ liệu, đầu tư ban đầu cao) hay **Third-party API** (chi phí duy trì cao)? | BRD §10 | Client Sponsor + Tech Lead | Quyết định `ADR-001`, chi phí hạ tầng, và mô hình license SaaS về sau | `OPEN` |
| OQ-03 | **Thông số kỹ thuật camera hiện có** (độ phân giải, góc quét, FPS, khả năng đặt thêm camera ở 4 góc xe)? | BRD §10 | Client IT / Site Survey | Không có thông số ⇒ **không thể cam kết độ chính xác** của FR05. Xem `R-01` | `OPEN` |
| OQ-04 | Khách có cung cấp **dataset ảnh/video mẫu** (thùng thiết bị điện, vật tư) để train model không? | BRD §10 | Client Sponsor | Không có dataset ⇒ FR05/FR06 không khả thi đúng hạn. Xem `R-02` | `OPEN` |
| OQ-05 | **Phạm vi tracking trong bãi** (FR07): chỉ vị trí đỗ cuối, hay toàn bộ hành trình? Có cần Vehicle Re-ID? | Phát sinh khi lập RTM | BA Lead | BR-05 hiện không estimate được | `OPEN` |
| OQ-06 | Quy trình xử lý khi hệ thống **cảnh báo nhầm** (false alarm) với nhân viên nội bộ? Ai có quyền override? | Phát sinh khi lập RTM | Client Sponsor + Phòng Bảo vệ | Ảnh hưởng thiết kế `DA-07`, `DA-08` và mức chấp nhận sai số | `OPEN` |
| OQ-07 | Chính sách **lưu trữ dữ liệu sinh trắc học** (khuôn mặt, CCCD): lưu bao lâu, ai được xem, xóa thế nào? | Phát sinh khi lập RTM | Client Legal / IT | Rủi ro pháp lý về dữ liệu cá nhân. **Chặn việc đưa hệ thống vào vận hành với dữ liệu người thật** | `OPEN` |
| OQ-08 | Một xe có thể gắn với **nhiều người đăng ký** không? (xe tải nhà cung cấp thường đổi tài xế giữa các lần giao hàng) | Phát sinh khi thiết kế ERD | BA Lead + Client | BRD §7 ghi 1-N. Nếu thực tế là N-N thì phải đổi schema `vehicle` ↔ `app_user` — thay đổi tốn kém nếu phát hiện muộn. Xem `data-model-erd.md §3.2` | `OPEN` |

---

## 7. Assumptions (BRD §11)

| ID | Giả định | Nếu sai thì sao |
|---|---|---|
| A-01 | Toàn bộ chi phí phần cứng (Camera, IoT, Server) do ngân sách Điện lực chi trả | Dự án đội chi phí nghiêm trọng, phải đàm phán lại hợp đồng |
| A-02 | Có thể test giải pháp giai đoạn đầu tại cổng/bãi đỗ xe của trường | Không có môi trường thử nghiệm ⇒ phải test trực tiếp tại site khách, rủi ro vận hành cao |
| A-03 | Camera hiện có của khách đủ chất lượng cho bài toán LPR + Face | Phải đầu tư thêm camera ⇒ phụ thuộc `OQ-03` |
| A-04 | Khách chấp nhận mô hình **AI hỗ trợ quyết định**, không phải AI tự quyết 100% | Kỳ vọng lệch ⇒ nghiệm thu thất bại. Xem `R-01` |
| A-05 | Bảo vệ vẫn trực tại cổng để xử lý các trường hợp `REVIEW` | Không có người trực ⇒ luồng human-in-the-loop vô nghĩa, phải thiết kế lại |

> `A-04` và `A-05` là giả định do team bổ sung khi phân tích, **chưa được khách xác nhận** — cần đưa vào biên bản họp kế tiếp.

---

## 8. Risks (BRD §11 + phát sinh)

| ID | Rủi ro | Loại | Mức độ | Giảm thiểu |
|---|---|---|---|---|
| R-01 | **Nhận diện vật thể bị che khuất trong xe** (nhìn qua cốp, qua kính) rất phức tạp, phụ thuộc ánh sáng & chất lượng ảnh. Độ chính xác có thể không đạt kỳ vọng | Kỹ thuật | **Cao** | Không cam kết con số accuracy cho FR05 trước khi có Dataset Benchmark (`ADR-005`). Định vị sản phẩm là *AI-assisted*, giữ Guard Review bắt buộc (`DA-07`). Yêu cầu bung cốp trong **Inspection Zone có kiểm soát ánh sáng** thay vì soi xuyên kính |
| R-02 | Không có dataset thực tế của thùng thiết bị điện lực để train model | Kỹ thuật | **Cao** | Phụ thuộc `OQ-04`. Nếu khách không cung cấp, đề xuất giai đoạn Data Collection có tính phí riêng |
| R-03 | **Dự án Nhà nước**: thủ tục ký hợp đồng, duyệt giải pháp, nghiệm thu, giải ngân mất ~2–3 tháng | Hành chính / Dòng tiền | **Cao** | Nguyên tắc *"có tiền mới làm"*. Chia hợp đồng theo milestone có thanh toán từng phần. Không bố trí full team trước khi ký |
| R-04 | Scope creep: 4/6 module đang ở trạng thái `PROPOSED`, khách chưa chốt bằng văn bản | Quản trị | **Cao** | `OQ-01` là blocking. Freeze scope ngay khi có văn bản; mọi thay đổi sau đó đi qua Change Request |
| R-05 | Kỳ vọng "AI tự phát hiện trộm" vượt quá năng lực thực tế của công nghệ | Kỳ vọng khách hàng | **Cao** | Truyền thông nhất quán: hệ thống là **AI-assisted Smart Gate**, AI đưa cảnh báo — con người ra quyết định |
| R-06 | Phần cứng do khách mua không đạt chuẩn ⇒ AI kém chính xác nhưng team bị quy trách nhiệm | Hợp đồng | Trung bình | Bàn giao **Hardware Specification** bằng văn bản, đưa vào phụ lục hợp đồng như điều kiện tiên quyết |
| R-07 | Dữ liệu sinh trắc học (khuôn mặt, CCCD) — rủi ro tuân thủ pháp luật về dữ liệu cá nhân | Pháp lý | Trung bình | Phụ thuộc `OQ-07`. Thiết kế sẵn retention policy + quyền xóa + mã hóa at-rest |
| R-08 | Fail-open: sự cố hệ thống làm cổng mở tự do | An ninh | Trung bình | Nguyên tắc **fail-safe, not fail-open** (System Design §17). Mất kết nối Central ⇒ Site Manual Safe Mode |

---

## 9. Traceability Coverage Check

| Kiểm tra | Kết quả |
|---|---|
| Mọi FR trong BRD đều có Use Case tương ứng | ✅ FR01–FR06 đã map |
| Mọi Business Requirement đều có FR | ❌ **BR-05 thiếu FR** → đã đề xuất `FR07` |
| Mọi Use Case trong thiết kế đều truy về được BRD | ⚠️ 8 hạng mục `DESIGN-ADDED` (xem §4) — cần khách duyệt |
| Mọi FR đều có Phase & Priority | ⚠️ `FR07` chưa có → `OQ-05` |
| Mọi Open Question đều có Owner | ✅ |
| Mọi rủi ro Cao đều có biện pháp giảm thiểu | ✅ |

---

## 10. Change Control

Bất kỳ thay đổi nào với BRD phải thực hiện theo thứ tự:

```text
1. Cập nhật BRD (khách hàng ký xác nhận)
        ↓
2. Cập nhật requirements-traceability.md (file này)
        ↓
3. Cập nhật smart-gate-system-design.md
        ↓
4. Cập nhật diagrams.md
        ↓
5. Cập nhật data-model-erd.md
        ↓
6. Cập nhật project-structure.md / prompt
```

Không được sửa tài liệu kỹ thuật trước khi cập nhật RTM — nếu không sẽ mất khả năng truy vết và không biết hạng mục nào đã được khách duyệt.
