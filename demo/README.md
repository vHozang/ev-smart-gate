# MVP demo video có thuyết minh

Workflow này dùng Playwright Chromium để thao tác trên giao diện EV Smart Gate thật, OpenAI TTS để tạo thuyết minh tiếng Việt, và FFmpeg để đồng bộ âm thanh, ghi phụ đề vào video.

## Yêu cầu

- Node.js và npm.
- Docker Desktop hoặc Docker Engine với Compose V2.
- Chromium của Playwright.
- `OPENAI_API_KEY` hợp lệ, được lưu cục bộ trong `.env` (file này đã bị Git ignore).
- FFmpeg/ffprobe trong `PATH`; nếu không có, workflow dùng binary từ `ffmpeg-static` và `ffprobe-static`.

Cài dependency và browser một lần:

```bash
npm install
npx playwright install chromium
```

Tạo `.env` cục bộ từ template nếu chưa có, rồi đặt key bằng secret thật trên máy của bạn:

```dotenv
OPENAI_API_KEY=<your-local-secret>
```

Không commit `.env`, không đưa key vào command line, log, narration hoặc subtitle. Workflow dừng với thông báo rõ ràng nếu key chưa được cấu hình; nó không tạo audio giả.

## Chạy một lệnh

```bash
npm run demo:mvp
```

Runner thực hiện theo thứ tự:

1. Kiểm tra biến môi trường và FFmpeg/ffprobe trước khi xóa output cũ.
2. Dùng app đang sẵn sàng tại `DEMO_BASE_URL`, hoặc khởi động đúng các service Docker Compose local cần thiết.
3. Chỉ xóa `.playwright/demo-results` và `dist/demo`; không gọi `docker compose down -v` và không xóa dữ liệu người dùng.
4. Chạy test Chromium thật qua Gate In → kho/dock → Exit Slip ký số → Gate Out → hoàn tất.
5. Chọn đúng một video và một trace của run hiện tại.
6. Sanitize password, cookie, CSRF và secret khỏi trace/report; fail nếu scan còn secret.
7. Tạo một MP3 OpenAI TTS cho mỗi timeline segment.
8. Tạo SRT không chồng lấn từ timestamp thật.
9. Dùng FFmpeg `adelay` và `amix` theo timeline, rồi encode H.264/AAC ở 1440×900.
10. Dùng ffprobe kiểm tra độc lập output cuối cùng trước khi in `PASS`.

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

`npm run demo:test` không cần OpenAI key và phù hợp CI. `npm run demo:mvp` luôn yêu cầu key thật vì deliverable bắt buộc có narration.

## Xử lý sự cố

- `BLOCKED: OPENAI_API_KEY is required...`: đặt key hợp lệ trong `.env`; không sửa `.env.example` bằng secret thật.
- App chưa ready: chạy `docker compose ps` và `docker compose logs api`; runner sẽ tự khởi động stack nếu endpoint chưa reachable.
- Thiếu Chromium: chạy `npx playwright install chromium`.
- FFmpeg thiếu subtitle filter: dùng build FFmpeg có `libass`; workflow không âm thầm bỏ subtitle.
- Playwright fail: mở trace đã sanitize bằng `npx playwright show-trace <trace.zip>` và sửa root cause; không dùng retry, forced click hoặc sleep để che lỗi.
- Output từ lần trước: runner tự xóa đúng thư mục do workflow sở hữu trước khi bắt đầu run mới.
