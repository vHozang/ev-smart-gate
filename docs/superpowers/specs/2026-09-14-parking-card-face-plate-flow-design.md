# EV Smart Gate — Thiết kế luồng bãi xe bằng thẻ, khuôn mặt và biển số

**Ngày:** 2026-09-14  
**Trạng thái:** Đã duyệt trong phiên brainstorming; chờ duyệt tài liệu  
**Phạm vi:** Thu gọn sản phẩm và video về nghiệp vụ bãi xe vào/ra; ẩn nghiệp vụ xuất hàng khỏi UI nhưng giữ nguyên backend và dữ liệu kho.

## 1. Mục tiêu

Điều chỉnh EV Smart Gate để nhân viên ra/vào bãi xe bằng ba yếu tố bắt buộc:

1. thẻ nhân viên đang hoạt động;
2. khuôn mặt khớp đúng chủ thẻ;
3. biển số thuộc xe mà nhân viên được phép sử dụng.

Hệ thống tra loại xe từ hồ sơ đăng ký theo biển số, ghi nhận sự kiện vào/ra và chỉ mở barrier khi cả ba yếu tố hợp lệ. Cổng ra không còn phụ thuộc QR Exit Slip, lệnh kho hoặc trạng thái xuất hàng.

Tạo lại video demo hoàn chỉnh từ hệ thống thật, giữ phong cách, giọng đọc tiếng Việt, phụ đề và tỷ lệ khung hình của video hiện tại nhưng chỉ trình bày flow bãi xe mới.

## 2. Phạm vi

### 2.1 Bao gồm

- Phân hệ quản lý thẻ nhân viên riêng, có lịch sử vòng đời thẻ.
- Mỗi nhân viên chỉ có một thẻ hoạt động tại một thời điểm.
- Cấp thẻ mới tự động khóa thẻ cũ nhưng không xóa lịch sử.
- Gate In và Gate Out dùng chung cơ chế xác thực thẻ–khuôn mặt–biển số.
- Tra loại xe đã đăng ký từ biển số nhận diện được.
- Ghi log chi tiết cho lượt vào, lượt ra và các lần xác thực thất bại.
- Màn hình quản lý thẻ và giao diện xác thực ba bước tại hai cổng.
- Ẩn mọi lối truy cập và nội dung xuất hàng trong SPA.
- Cập nhật Playwright demo, lời đọc, phụ đề và pipeline dựng video.
- Xuất MP4 H.264/AAC, 1440×900, có giọng đọc và phụ đề đồng bộ.

### 2.2 Không bao gồm

- Xóa API, application service, entity hoặc dữ liệu của phân hệ kho/xuất hàng.
- AI nhận dạng loại xe từ hình ảnh; loại xe chỉ được tra từ hồ sơ xe.
- Cho phép bỏ qua một trong ba yếu tố xác thực.
- Nhiều thẻ hoạt động đồng thời cho một nhân viên.
- Tích hợp đầu đọc RFID vật lý cụ thể; giao diện nhận `card_uid` độc lập thiết bị để hỗ trợ simulator và tích hợp phần cứng sau này.
- Quy trình xuất hàng, kiểm hàng, dock, QR Exit Slip hoặc hoàn tất lệnh kho trong UI/video mới.

## 3. Hiện trạng và tác động

Hệ thống hiện dùng FastAPI, MongoDB/Beanie, MinIO và SPA JavaScript thuần.

- Gate In hiện nhận ảnh khuôn mặt và biển số, sau đó kiểm tra quyền nhân viên–xe.
- Gate Out hiện nhận QR Exit Slip, khuôn mặt và biển số, đồng thời phụ thuộc lệnh kho.
- Hồ sơ hiện đã có mã nhân viên, dữ liệu khuôn mặt, biển số, loại xe và quan hệ quyền sử dụng xe.
- Chưa có entity, persistence, API hoặc UI cho thẻ RFID.
- UI kho, dashboard, hai cổng và kịch bản video tập trung nhiều trong SPA và demo Playwright.

Thay đổi vì vậy tác động đến domain, persistence/index, application services, schemas/router, dependency wiring, SPA, test và pipeline video. Backend kho được giữ nguyên; Gate Out được tách hoàn toàn khỏi nó.

## 4. Kiến trúc đề xuất

### 4.1 Phân hệ quản lý thẻ

Tạo một thực thể thẻ độc lập thay vì lưu UID trực tiếp trên nhân viên. Thực thể tối thiểu gồm:

- định danh thẻ nội bộ;
- `card_uid` duy nhất, được chuẩn hóa trước khi lưu/so sánh;
- nhân viên sở hữu;
- trạng thái: `ACTIVE`, `BLOCKED`, `LOST`, `REPLACED`;
- thời điểm cấp, thời điểm cập nhật;
- lý do thay đổi trạng thái;
- tham chiếu thẻ thay thế/thẻ được thay thế khi có;
- metadata kiểm toán phù hợp với mô hình hiện có.

Các thao tác nghiệp vụ:

- cấp thẻ lần đầu;
- khóa thẻ;
- báo mất;
- thay thẻ;
- xem thẻ hiện tại và lịch sử của nhân viên.

Ràng buộc:

- `card_uid` duy nhất toàn hệ thống;
- một nhân viên có tối đa một thẻ `ACTIVE`;
- việc vô hiệu hóa thẻ cũ và kích hoạt thẻ mới phải nguyên tử;
- thẻ bị khóa, mất hoặc thay thế không được dùng tại cổng;
- không xóa bản ghi lịch sử khi trạng thái thay đổi.

### 4.2 Dịch vụ xác thực cổng dùng chung

Gate In và Gate Out dùng chung một dịch vụ xác thực nghiệp vụ, nhận:

- hướng di chuyển: `ENTRY` hoặc `EXIT`;
- `card_uid`;
- ảnh khuôn mặt;
- ảnh biển số;
- metadata yêu cầu/idempotency theo convention hiện có.

Dịch vụ phối hợp các thành phần:

1. Card service tìm thẻ đang hoạt động và chủ thẻ.
2. Face recognition so ảnh hiện tại với hồ sơ khuôn mặt của chủ thẻ.
3. Plate recognition đọc biển số.
4. Vehicle registry tìm xe và trả về loại xe đã đăng ký.
5. Authorization service xác nhận chủ thẻ được phép sử dụng xe.
6. Gate event service lưu toàn bộ kết quả kiểm tra.
7. Barrier port chỉ được gọi sau khi mọi điều kiện đều thành công.

Hai router Gate In/Gate Out có thể giữ endpoint riêng để tương thích và phân biệt hướng, nhưng cùng gọi một use case lõi. Gate Out không đọc hoặc cập nhật bất kỳ order/exit slip nào.

### 4.3 Giao diện người dùng

#### Quản lý thẻ

Thêm màn hình cho quản trị viên:

- tìm nhân viên;
- xem thẻ đang hoạt động và lịch sử;
- cấp thẻ;
- khóa thẻ;
- báo mất;
- thay thẻ;
- hiển thị rõ trạng thái và thời điểm thay đổi.

#### Gate In và Gate Out

Hai màn hình có bố cục và hành vi thống nhất:

1. quẹt/nhập UID thẻ;
2. tải/chụp ảnh khuôn mặt;
3. tải/chụp ảnh biển số;
4. gửi xác thực;
5. hiển thị kết quả từng yếu tố;
6. hiển thị nhân viên, biển số, loại xe đăng ký và trạng thái barrier khi thành công.

#### Ẩn xuất hàng

Ẩn khỏi SPA:

- navigation `/warehouse`;
- KPI và danh sách lệnh kho trên dashboard;
- nội dung hero/workflow nhắc tới lệnh, dock, kiểm hàng hoặc phiếu xuất;
- renderer, dialog và action của kho;
- QR/order fields và hướng dẫn phiếu xuất tại Gate Out;
- mọi cảnh xuất hàng trong demo.

Các router/application service/entity/dữ liệu kho được giữ nguyên và không bị xóa.

## 5. Luồng dữ liệu

### 5.1 Chuẩn bị dữ liệu

1. Quản trị viên đăng ký nhân viên và khuôn mặt.
2. Quản trị viên đăng ký xe, biển số và loại xe.
3. Quản trị viên gán quyền sử dụng xe cho nhân viên.
4. Quản trị viên cấp thẻ cho nhân viên.
5. Nếu nhân viên đã có thẻ hoạt động, hệ thống khóa/thay thế thẻ cũ và kích hoạt thẻ mới trong cùng thao tác nguyên tử.

### 5.2 Xác thực tại cổng

1. Nhân viên quẹt thẻ.
2. Hệ thống xác minh thẻ tồn tại và đang hoạt động, rồi xác định chủ thẻ.
3. Nếu thẻ không hợp lệ, dừng sớm và giữ barrier đóng.
4. Camera chụp khuôn mặt và biển số.
5. Nhận diện khuôn mặt và biển số chạy song song khi hạ tầng hiện có cho phép.
6. Hệ thống so khuôn mặt với hồ sơ của chủ thẻ.
7. Hệ thống tìm xe theo biển số và lấy loại xe từ hồ sơ đăng ký.
8. Hệ thống xác minh chủ thẻ có quyền sử dụng xe.
9. Nếu mọi kiểm tra thành công, lưu sự kiện rồi mở barrier.
10. Nếu bất kỳ kiểm tra nào thất bại, lưu lý do và giữ barrier đóng.

### 5.3 Dữ liệu trả về UI

Kết quả cần đủ để UI giải thích quyết định mà không lộ dữ liệu nhạy cảm:

- hướng vào/ra;
- kết quả tổng;
- trạng thái kiểm tra thẻ, khuôn mặt, biển số và quyền xe;
- thông tin nhân viên được phép hiển thị;
- biển số và loại xe đăng ký;
- trạng thái barrier;
- mã lý do/hướng dẫn xử lý khi thất bại;
- thời gian và mã sự kiện.

## 6. Xử lý lỗi và an toàn

- Thẻ không tồn tại, bị khóa, báo mất hoặc đã thay thế: dừng sớm, barrier đóng.
- Khuôn mặt không khớp: barrier đóng, yêu cầu nhìn lại camera.
- Ảnh khuôn mặt không đạt chất lượng: barrier đóng, cho phép thử lại.
- Không đọc được biển số: barrier đóng, hướng dẫn đưa xe vào vùng chụp.
- Biển số chưa đăng ký: barrier đóng, hướng dẫn liên hệ quản trị viên.
- Nhân viên không được gán xe: barrier đóng dù thẻ và khuôn mặt hợp lệ.
- Dịch vụ nhận diện lỗi/quá thời gian: thất bại an toàn; không tự bỏ qua yếu tố.
- Yêu cầu lặp trong cửa sổ chống trùng: không mở barrier hoặc ghi hai sự kiện.
- Không ghi mật khẩu, token, embedding, ảnh nhạy cảm hoặc bí mật vào log/video.
- Thay thẻ phải chống race condition để không tồn tại hai thẻ hoạt động.

## 7. Kiểm thử

### 7.1 Domain và persistence

- UID được chuẩn hóa và duy nhất.
- Một nhân viên không thể có hai thẻ hoạt động.
- Cấp/thay thẻ mới vô hiệu hóa thẻ cũ và giữ lịch sử.
- Chuyển trạng thái hợp lệ; thẻ không hoạt động không xác thực được.
- Index/ràng buộc hỗ trợ truy vấn thẻ hoạt động và chống trùng.

### 7.2 Application và API

- Gate In thành công khi cả ba yếu tố và quyền xe đều khớp.
- Gate Out thành công với cùng điều kiện và không cần QR/order/slip.
- Từng trường hợp thất bại được kiểm thử độc lập.
- Dịch vụ nhận diện lỗi dẫn đến barrier đóng.
- Barrier không được gọi trước khi event thành công được lưu theo convention nhất quán hiện có.
- Chống request lặp/idempotency tại cả hai hướng.
- API quản lý vòng đời thẻ trả lỗi rõ ràng cho UID trùng và chuyển trạng thái không hợp lệ.

### 7.3 UI và E2E

- Có thể cấp, khóa, báo mất và thay thẻ qua UI.
- Thẻ cũ không sử dụng được sau khi thay.
- Gate In/Gate Out hiển thị ba bước và kết quả rõ ràng.
- Không có menu, KPI, workflow, dialog hoặc nội dung xuất hàng trong UI.
- Playwright chạy trên hệ thống thật với simulator, không dùng trang giả hoặc mock API.
- Demo có ít nhất một lượt vào thành công, một từ chối an toàn và một lượt ra thành công.

### 7.4 Hồi quy và quality gates

- Backend và dữ liệu kho còn nguyên vẹn.
- Đăng ký nhân viên, khuôn mặt, xe và phân quyền xe tiếp tục hoạt động.
- Chạy Ruff, format check, mypy, pytest, JS syntax check, Node tests và Playwright E2E.
- Build và readiness của Docker Compose phải thành công.

## 8. Video hoàn chỉnh

Tái sử dụng pipeline hiện có:

- Playwright quay UI thật ở 1440×900;
- timeline điều khiển đồng bộ;
- Edge TTS với giọng Việt hiện tại;
- SRT tạo từ timeline;
- FFmpeg xuất H.264/yuv420p và AAC;
- `ffprobe` xác minh output cuối.

Kịch bản mới:

1. giới thiệu EV Smart Gate được tinh gọn cho bãi xe;
2. đăng ký nhân viên, khuôn mặt, xe và loại xe;
3. cấp thẻ và minh họa thẻ cũ bị khóa khi thay thẻ;
4. Gate In: thẻ → mặt → biển số → loại xe đăng ký → mở barrier;
5. một tình huống từ chối ngắn chứng minh barrier giữ đóng;
6. Gate Out dùng cùng ba yếu tố và mở barrier;
7. tổng kết lịch sử vào/ra và lợi ích kiểm soát;
8. tuyệt đối không xuất hiện lệnh kho, dock, kiểm hàng hay QR Exit Slip.

Đầu ra bắt buộc:

- `dist/demo/MVP-Demo.mp4`;
- H.264 video và AAC audio;
- độ phân giải 1440×900;
- thời lượng dương, file không rỗng;
- giọng đọc và phụ đề khớp cảnh;
- không có màn hình lỗi, dữ liệu bí mật hoặc nội dung xuất hàng;
- kịch bản/tài nguyên dựng video được giữ trong repo để tái tạo bằng một lệnh.

## 9. Tiêu chí chấp nhận

- [ ] Có phân hệ quản lý thẻ với đầy đủ cấp, khóa, báo mất, thay và lịch sử.
- [ ] Mỗi nhân viên chỉ có một thẻ hoạt động.
- [ ] Gate In và Gate Out chỉ mở barrier khi thẻ, khuôn mặt và xe đều khớp.
- [ ] Loại xe được tra từ hồ sơ đăng ký theo biển số.
- [ ] Gate Out không còn phụ thuộc kho, QR hoặc Exit Slip.
- [ ] UI không còn hiển thị hoặc điều hướng tới chức năng xuất hàng.
- [ ] Backend và dữ liệu kho vẫn được giữ nguyên.
- [ ] Các trường hợp từ chối đều giữ barrier đóng và lưu lý do.
- [ ] Mọi quality gate và E2E liên quan đều vượt qua.
- [ ] Video hoàn chỉnh được dựng từ UI thật, đúng nội dung và xác minh bằng `ffprobe`.

## 10. Quyết định đã chốt

- Ẩn xuất hàng khỏi **UI và video**, không xóa backend/dữ liệu.
- Barrier yêu cầu **khớp cả thẻ, khuôn mặt và xe đăng ký**.
- Xây **phân hệ quản lý thẻ riêng**.
- Mỗi nhân viên có **một thẻ hoạt động**; thay thẻ sẽ khóa thẻ cũ.
- Loại xe được **tra từ biển số**, không thêm AI phân loại.
- Video **giữ phong cách hiện có** và được quay từ hệ thống hoạt động thật.
