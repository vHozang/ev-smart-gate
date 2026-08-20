# Ma trận truy vết yêu cầu

| ID | Yêu cầu | Code chính | Test/kiểm chứng |
|---|---|---|---|
| DM-01 | Driver/vehicle/auth/order/log models và indexes | `documents.py`, `repositories.py` | Docker index startup, integration smoke |
| SEC-01 | Embedding/evidence AES-GCM | `crypto.py`, `minio_storage.py` | unit crypto, MinIO E2E |
| EN-01 | Face >= 0,75 và liveness | `services.py`, `gate_entry.py` | `test_domain_services.py`, `test_gate_workflows.py` |
| EN-02 | Plate exact/fuzzy unique | `services.py` | fuzzy/tie unit tests |
| EN-03 | Authorization cùng cặp | `gate_entry.py` | unauthorized Gate In test |
| WH-01 | Dock gắn Gate In PASSED | `warehouse.py` | Docker E2E |
| WH-02 | Operator finalize | `warehouse.py` | state machine + Docker E2E |
| SL-01 | JWS Ed25519, expiry, version | `ed25519_slip.py` | tamper/expiry/reissue tests |
| EX-01 | QR == live == order | `gate_exit.py` | mismatch/success unit tests |
| EX-02 | Complete sau barrier ACK | `gate_exit.py`, `barrier.py` | parameterized ACK/timeout test |
| ID-01 | event/command idempotency | repositories, barrier service | unit + Docker retry smoke |
| RT-01 | Persisted sequence + WS/resync | `alerts.py`, `hub.py`, security router | OpenAPI + Docker smoke |
| AUTH-01 | Session/CSRF/role/device scope | `auth.py`, dependencies | API E2E |
| OPS-01 | Docker Mongo replica/MinIO | `docker-compose.yml` | CI docker-smoke |

Các real-model accuracy KPI không được đánh dấu đạt chỉ bằng simulator; cần dataset benchmark tại đúng camera, ánh sáng và góc lắp đặt thực tế.
