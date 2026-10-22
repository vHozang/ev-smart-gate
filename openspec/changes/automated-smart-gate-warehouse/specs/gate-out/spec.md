# Đặc tả Gate Out

## Requirement: Xác minh ba chiều

Face live SHALL đúng `assigned_driver_id`, plate SHALL đúng `assigned_vehicle_id`, claims SHALL khớp order `SLIP_ISSUED` và token hash/JTI/version SHALL hợp lệ.

### Scenario: Barrier timeout

- Given ba chiều đều hợp lệ
- When barrier không ACK
- Then Gate Log giữ kết quả xác minh, permit là false và order vẫn SLIP_ISSUED

### Scenario: Checkout thành công

- When ba chiều hợp lệ và barrier ACK
- Then order chuyển COMPLETED và retry cùng event không mở cổng lần hai
