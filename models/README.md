# Quản lý model AI

`manifest.json` khóa phiên bản, URL, giấy phép và SHA-256 của các ONNX model tải trực tiếp. Chạy:

```bash
python models/download_models.py
```

Script tải vào file tạm, kiểm SHA-256 rồi mới thay thế đích. Model binary bị loại khỏi Git. FastALPR và PaddleOCR tự quản lý cache; production phải đóng gói cache đã kiểm checksum thành image/artifact nội bộ, không tải model động khi service đang phục vụ request.

Adapter mặc định được khuyến nghị cho production:

- LPR: FastALPR hoặc PaddleOCR, giấy phép MIT/Apache-2.0.
- Face: YuNet + SFace, Apache-2.0.
- Liveness: MiniFASNet từ Silent-Face-Anti-Spoofing, Apache-2.0; bản ONNX nội bộ phải được kiểm checksum và đặt tại `models/face/minifasnet.onnx`.
- Cargo: YOLOX, Apache-2.0.
- QR: PyZbar (MIT) và OpenCV fallback.

DeepFace là adapter tùy chọn; cần kiểm tra giấy phép của từng backbone. Ultralytics YOLOv8 là adapter tùy chọn theo AGPL-3.0 hoặc commercial license và không được bật trong bản phân phối proprietary khi chưa được pháp chế phê duyệt.
