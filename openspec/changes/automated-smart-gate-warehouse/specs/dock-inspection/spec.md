# Đặc tả dock inspection

## Requirement: Dock gắn với lượt vào hợp lệ

Dock session SHALL liên kết Gate In PASSED của đúng cặp tài xế–xe và nằm trong validity của order.

## Requirement: Operator finalize

AI SHALL chỉ ghi object/count/confidence. Order SHALL không thành READY_FOR_EXIT trước khi WAREHOUSE hoặc ADMIN finalize trạng thái LOADED.
