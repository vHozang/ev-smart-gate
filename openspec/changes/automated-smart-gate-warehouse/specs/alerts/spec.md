# Đặc tả cảnh báo

## Requirement: Realtime và resync

Security alert SHALL được lưu với sequence tăng dần trước khi phát WebSocket. Client SHALL resync qua REST bằng `after_sequence` sau reconnect và dedupe theo `event_id`/`sequence`.
