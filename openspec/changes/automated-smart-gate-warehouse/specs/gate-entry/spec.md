# Đặc tả Gate In

## Requirement: Xác minh face, plate và authorization

### Scenario: Exact match thành công

- Given face similarity tối thiểu 0,75, plate exact và authorization hợp lệ
- When edge gửi event mới
- Then Gate Log là PASSED và barrier chỉ mở qua command có ACK

### Scenario: Fuzzy tie

- Given có từ hai candidate biển số cùng điểm tốt nhất
- When hệ thống đối chiếu
- Then không candidate nào được chọn và hệ thống tạo cảnh báo

### Scenario: Lỗi AI hoặc evidence

- When model hoặc MinIO lỗi
- Then hệ thống fail-closed, ghi FAILED nếu có thể và không gọi barrier
