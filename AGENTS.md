# Hướng dẫn làm việc trong EV Smart Gate

## Ngữ cảnh dự án

- Đọc `openspec/config.yaml` để nắm domain, công nghệ và quy ước trước khi thay đổi code hoặc tài liệu OpenSpec.
- Tuân theo Clean Architecture: `Presentation -> Application -> Domain <- Infrastructure`.
- Tài liệu, comment và docstring viết bằng tiếng Việt; identifier và schema field dùng tiếng Anh kỹ thuật.
- AI chỉ tạo observation, không gọi barrier trực tiếp. Lỗi AI, camera, storage hoặc device phải fail-closed.
- Mỗi use case mới phải có unit test. Chạy các kiểm tra phù hợp với phần thay đổi theo cấu hình trong `pyproject.toml`, `package.json` và hướng dẫn của repo.

## Dùng lại các lệnh OpenSpec của Claude Code

Các file trong `.claude/commands/` là nguồn hướng dẫn workflow dùng chung cho repo. Khi người dùng yêu cầu một lệnh `opsx-*`, đọc toàn bộ file tương ứng và thực hiện các bước trong đó. Tên lệnh trong tin nhắn được hiểu là yêu cầu workflow, không phải lệnh shell.

| Yêu cầu | File hướng dẫn |
| --- | --- |
| `/opsx-explore` | [.claude/commands/opsx-explore.md](.claude/commands/opsx-explore.md) |
| `/opsx-new` | [.claude/commands/opsx-new.md](.claude/commands/opsx-new.md) |
| `/opsx-propose` | [.claude/commands/opsx-propose.md](.claude/commands/opsx-propose.md) |
| `/opsx-continue` | [.claude/commands/opsx-continue.md](.claude/commands/opsx-continue.md) |
| `/opsx-apply` | [.claude/commands/opsx-apply.md](.claude/commands/opsx-apply.md) |
| `/opsx-bulk-apply` | [.claude/commands/opsx-bulk-apply.md](.claude/commands/opsx-bulk-apply.md) |
| `/opsx-verify` | [.claude/commands/opsx-verify.md](.claude/commands/opsx-verify.md) |
| `/opsx-sync` | [.claude/commands/opsx-sync.md](.claude/commands/opsx-sync.md) |
| `/opsx-archive` | [.claude/commands/opsx-archive.md](.claude/commands/opsx-archive.md) |

Nếu người dùng diễn đạt bằng ngôn ngữ tự nhiên, chọn workflow phù hợp với ý định và thông báo workflow đang dùng. Việc khám phá, đề xuất, triển khai, kiểm tra và lưu trữ là các yêu cầu riêng; chỉ thực hiện phạm vi đã được giao.

Nếu command yêu cầu một skill, đọc `.claude/skills/<tên-skill>/SKILL.md` và các tài nguyên mà skill yêu cầu. Các file này được đọc trực tiếp; sự tồn tại của chúng trong `.claude/` không có nghĩa Codex đã tự đăng ký chúng thành skills hoặc slash commands.

## Chuyển đổi công cụ khi chạy bằng Codex

Giữ nguyên mục đích, thứ tự phụ thuộc và điều kiện của workflow khi chuyển các tên công cụ riêng của Claude:

- `AskUserQuestion`: dùng công cụ hỏi người dùng hiện có hoặc hỏi trong hội thoại; chờ câu trả lời nếu bước tiếp theo phụ thuộc vào câu trả lời đó.
- `TodoWrite`: dùng công cụ quản lý kế hoạch nếu có hoặc theo dõi tiến độ bằng checklist và cập nhật ngắn. Checklist này không thay thế `tasks.md` của change.
- `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`: dùng công cụ đọc, sửa, tìm kiếm và terminal hiện có. Terminal mặc định của workspace là PowerShell; điều chỉnh cú pháp shell khi cần.
- `Skill`: mở và làm theo `SKILL.md` được chỉ định.
- `Task` hoặc subagent: chỉ dùng khi người dùng hoặc workflow/skill đang áp dụng yêu cầu, và môi trường hỗ trợ. Nếu thiếu khả năng bắt buộc, báo rõ giới hạn trước khi thực hiện phần phụ thuộc vào khả năng đó.

## Đọc trạng thái và tài liệu OpenSpec

- Dùng chung `openspec/` hiện có; giữ schema tùy chỉnh `intent-driven` và các templates trong `openspec/schemas/intent-driven/`.
- Chọn change theo quy tắc của command. Khi command yêu cầu người dùng chọn, không tự chọn thay.
- Dùng `openspec status --change "<name>" --json` và `openspec instructions <artifact-id> --change "<name>" --json` theo workflow để xác định trạng thái, phụ thuộc, template và tài liệu cần đọc.
- Đọc các file được liệt kê trong `contextFiles` trước khi triển khai hoặc kiểm tra. Không mặc định mọi change dùng schema `spec-driven` hoặc chỉ có proposal, design và tasks.
- Tôn trọng bước ADR của schema; đọc hướng dẫn liên quan và chỉ tạo ADR khi quyết định đủ ý nghĩa kiến trúc.
- Chỉ đánh dấu task hoàn thành sau khi đã thực hiện và kiểm tra phù hợp. Khi verify, đối chiếu code và test với specs; checkbox đã tích không tự chứng minh yêu cầu đã được đáp ứng.
- Nếu thiếu OpenSpec CLI hoặc lệnh thất bại, báo rõ; có thể tiếp tục đọc và phân tích tài liệu nhưng không tự giả lập trạng thái CLI hoặc tuyên bố đã chạy kiểm tra thành công.

## Quy tắc Git của workflow

Trước các workflow propose, continue, apply, verify, archive hoặc worktree, đọc và áp dụng [.claude/skills/openspec-git-discipline/SKILL.md](.claude/skills/openspec-git-discipline/SKILL.md), kể cả khi command không nhắc lại skill này.

- Proposal phải được commit và có trên `main` trước khi apply; kiểm tra trạng thái Git và sự hiện diện trên `main` theo skill.
- Archive chỉ chạy trên `main` sau khi phần triển khai đã được đưa về `main`.
- Tuân theo các checkpoint trong skill; không tự commit, tạo branch hoặc merge khi người dùng chưa yêu cầu rõ ràng.
- Không tự chuyển sang sync hoặc archive sau khi apply/verify hoàn tất nếu chưa được yêu cầu.

Yêu cầu rõ ràng của người dùng được ưu tiên hơn các hướng dẫn workflow trong repo. Khi thiếu thông tin hoặc điều kiện bắt buộc chưa đáp ứng, giải thích cụ thể điều kiện và nguồn hướng dẫn liên quan.
