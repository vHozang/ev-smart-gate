# MVP demo video có thuyết minh

Workflow này dùng Playwright Chromium để thao tác trên giao diện EV Smart Gate thật, Edge TTS để tạo thuyết minh tiếng Việt, và FFmpeg để đồng bộ âm thanh, ghi phụ đề vào video.

## Cảnh demo

Video trình diễn 10 cảnh kiểm soát bãi xe với xác thực ba yếu tố (thẻ RFID + nhận diện khuôn mặt + nhận diện biển số):

1. **Mở trung tâm kiểm soát** — Giới thiệu giao diện EV Smart Gate.
2. **Đăng nhập** — Phiên vận hành an toàn với CSRF.
3. **Hồ sơ nhân viên** — Liên kết tài xế, khuôn mặt, xe và loại xe.
4. **Cấp thẻ** — Cấp thẻ RFID hoạt động duy nhất.
5. **Thay thẻ** — Vô hiệu hóa thẻ cũ, giữ lịch sử, cấp thẻ mới.
6. **Gate In** — Xác thực thẻ + khuôn mặt + biển số, mở barrier.
7. **Từ chối an toàn** — Thẻ đã thay thế bị từ chối, barrier giữ đóng.
8. **Gate Out** — Cùng ba yếu tố, không phụ thuộc phiếu hay kho.
9. **Lịch sử** — Xem lượt vào, từ chối và ra với kết quả từng yếu tố.
10. **Hoàn tất** — Dashboard hiển thị KPI bãi xe.

## Yêu cầu

- Node.js và npm.
- Docker Desktop hoặc Docker Engine với Compose V2.
- Chromium của Playwright.
- Kết nối Internet để Edge TTS tạo thuyết minh (không cần API key).
- FFmpeg/ffprobe trong `PATH`; nếu không có, workflow dùng binary từ `ffmpeg-static` và `ffprobe-static`.
- `node-edge-tts` (cài tự động qua `npm install`) — tạo thuyết minh bằng voice `vi-VN-HoaiMyNeural`, cần kết nối Internet, không cần API key.

Cài dependency và browser một lần:

```bash
npm install
npx playwright install chromium
```

Tạo `.env` cục bộ từ template nếu chưa có:

```bash
cp .env.example .env
```

Credential trong `.env` chỉ dành cho local/simulator. Không commit `.env`, không đưa secret vào command line, log, narration hoặc subtitle.

## Chạy một lệnh

```bash
npm run demo:mvp
```

Runner thực hiện theo thứ tự:

1. Kiểm tra biến môi trường và FFmpeg/ffprobe trước khi xóa output cũ.
2. Dùng app đang sẵn sàng tại `DEMO_BASE_URL`, hoặc khởi động đúng các service Docker Compose local cần thiết.
3. Chỉ xóa `.playwright/demo-results` và `dist/demo`; không gọi `docker compose down -v` và không xóa dữ liệu người dùng.
4. Chạy test Chromium thật qua 10 cảnh kiểm soát bãi xe với xác thực ba yếu tố.
5. Chọn đúng một video và một trace của run hiện tại.
6. Sanitize password, cookie, CSRF, card UID và secret khỏi trace/report; fail nếu scan còn secret.
7. Tạo một MP3 Edge TTS (`vi-VN-HoaiMyNeural`) cho mỗi timeline segment.
8. Tạo SRT không chồng lấn từ timestamp thật.
9. Dùng FFmpeg `adelay` và `amix` theo timeline, rồi encode H.264/AAC ở 1440×900.
10. Dùng ffprobe kiểm tra độc lập output cuối cùng trước khi in `PASS`.

Chạy lại tạo demo identity/card history mới trên cùng dữ liệu Mongo/MinIO mà không xung đột.

> Backend kho hàng được giữ nguyên ở lớp API nhưng giao diện và video chỉ hiển thị luồng bãi xe.

## Output

```text
dist/demo/raw-demo.webm
dist/demo/timeline.json
dist/demo/audio/*.mp3
dist/demo/audio-manifest.json
dist/demo/narration.mp3
dist/demo/subtitles.srt
dist/demo/MVP-Demo-Voice.mp4
dist/demo/MVP-Demo.mp4
dist/demo/playwright-report/index.html
.playwright/demo-results/**/trace.zip
```

`MVP-Demo-Voice.mp4` gồm video và narration. `MVP-Demo.mp4` là deliverable cuối có narration và subtitle burn-in; `npm run demo:mvp` từ chối chạy nếu `DEMO_BURN_SUBTITLES=false`.

## Lệnh kiểm tra riêng

```bash
npm test
npm run demo:test
npm run demo:voice
npm run demo:srt
npm run demo:build
npm run demo:verify
```

`npm run demo:test` không cần API key hay kết nối TTS và phù hợp CI. `npm run demo:mvp` cần kết nối Internet cho Edge TTS.

## Xử lý sự cố

- App chưa ready: chạy `docker compose ps` và `docker compose logs api`; runner sẽ tự khởi động stack nếu endpoint chưa reachable.
- Thiếu Chromium: chạy `npx playwright install chromium`.
- FFmpeg thiếu subtitle filter: dùng build FFmpeg có `libass`; workflow không âm thầm bỏ subtitle.
- Edge TTS timeout: kiểm tra kết nối Internet; Edge TTS cần truy cập endpoint Microsoft.
- Playwright fail: mở trace đã sanitize bằng `npx playwright show-trace <trace.zip>` và sửa root cause; không dùng retry, forced click hoặc sleep để che lỗi.
- Output từ lần trước: runner tự xóa đúng thư mục do workflow sở hữu trước khi bắt đầu run mới.
