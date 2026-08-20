# Plate Normalization Specification — Biển số Việt Nam

> **Vị trí trong kiến trúc:** Domain Layer
> **Dùng cho:** `plate_normalized` (UNIQUE index, cache key, matching trong `access_event`, `vehicle`)
> **Lý do tách spec riêng:** đây là nguồn bug số 1 của mọi hệ thống LPR tại Việt Nam

---

## 1. Quy tắc chuẩn hóa

### 1.1 Input → Output

Từ bất kỳ chuỗi biển số nào (raw OCR output hoặc user input), tạo ra chuỗi
`plate_normalized` **duy nhất** cho mỗi biển số vật lý.

```text
Quy trình:
1. Uppercase toàn bộ
2. Loại bỏ dấu cách, dấu gạch ngang, dấu chấm
3. Áp dụng bảng mapping ký tự dễ nhầm (§1.2)
4. Validate format theo regex (§2)
5. Nếu không match format nào → giữ nguyên sau bước 1-3, đánh dấu is_valid=false
```

### 1.2 Bảng mapping ký tự dễ nhầm (OCR confusion)

Camera LPR thường nhầm các ký tự sau. Quy tắc: **chữ cái giữ chữ cái, số giữ số**,
dựa trên vị trí trong format biển số.

| Ký tự OCR | Có thể nhầm với | Quy tắc phân giải |
|---|---|---|
| `O` (chữ) | `0` (số) | Nếu vị trí thuộc phần số → đổi thành `0` |
| `0` (số) | `O` (chữ) | Nếu vị trí thuộc phần chữ (series) → đổi thành `O` |
| `I` (chữ) | `1` (số) | Nếu vị trí thuộc phần số → đổi thành `1` |
| `1` (số) | `I` (chữ) | Nếu vị trí thuộc phần chữ → đổi thành `I` |
| `B` (chữ) | `8` (số) | Nếu vị trí thuộc phần số → đổi thành `8` |
| `8` (số) | `B` (chữ) | Nếu vị trí thuộc phần chữ → đổi thành `B` |
| `S` (chữ) | `5` (số) | Nếu vị trí thuộc phần số → đổi thành `5` |
| `Z` (chữ) | `2` (số) | Context-dependent |
| `D` (chữ) | `0` (số) | Context-dependent |

> ⚠️ Áp dụng mapping **chỉ khi format đã xác định**. Nếu không xác định format,
> không đoán — đánh dấu `low_confidence` và chuyển Guard review.

---

## 2. Format biển số Việt Nam

### 2.1 Ô tô (4 bánh)

| Loại | Format | Regex | Ví dụ | Normalized |
|---|---|---|---|---|
| Ô tô dân dụng (cũ) | `XXY-ZZZ.ZZ` | `^[0-9]{2}[A-Z]-[0-9]{3}\.[0-9]{2}$` | `51A-123.45` | `51A12345` |
| Ô tô dân dụng (mới 5 số) | `XXY-ZZZZZ` | `^[0-9]{2}[A-Z]-[0-9]{5}$` | `51A-12345` | `51A12345` |
| Ô tô nền xanh (xe công) | `XXY-ZZZZ` hoặc `XXY-ZZZZZ` | `^[0-9]{2}[A-Z]-[0-9]{4,5}$` | `80B-1234` | `80B1234` |
| Ô tô nền đỏ (quân đội) | Đa dạng, có chữ | Context | `TM-0123` | `TM0123` |

### 2.2 Xe máy

| Loại | Format | Regex | Ví dụ | Normalized |
|---|---|---|---|---|
| Xe máy (cũ) | `XX-YZ ZZZZ` | `^[0-9]{2}-[A-Z][0-9] [0-9]{4}$` | `59-F1 2345` | `59F12345` |
| Xe máy (mới) | `XX-YZZ ZZZZZ` | `^[0-9]{2}-[A-Z][0-9]{2} [0-9]{5}$` | `51-F1 234.56` | `51F123456` |

### 2.3 Biển đặc biệt

| Loại | Nhận dạng | Xử lý |
|---|---|---|
| Xe ngoại giao (NN) | Bắt đầu `NN` | Normalize bình thường, đánh dấu `plate_type=DIPLOMATIC` |
| Xe nước ngoài | Format không match VN | Giữ nguyên text sau uppercase + strip, `plate_type=FOREIGN` |
| Biển tạm | Chữ T | `plate_type=TEMPORARY` |

> **Đặc biệt quan trọng cho Điện lực:** biển nền xanh (xe công) sẽ có rất nhiều.
> Cần đảm bảo regex phủ được format xe công.

---

## 3. Hàm chuẩn hóa (Domain Layer)

```python
# Đặt trong domain/value_objects/plate_number.py
# KHÔNG import framework — chỉ pure Python

import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class NormalizedPlate:
    """Value Object: biển số đã chuẩn hóa."""
    raw: str
    normalized: str
    plate_type: str  # PRIVATE | GOVERNMENT | DIPLOMATIC | MILITARY | TEMPORARY | FOREIGN | UNKNOWN
    is_valid: bool

    @staticmethod
    def from_raw(raw_plate: str) -> "NormalizedPlate":
        if not raw_plate or not raw_plate.strip():
            return NormalizedPlate(raw=raw_plate, normalized="", plate_type="UNKNOWN", is_valid=False)

        # Step 1: Uppercase
        upper = raw_plate.upper().strip()

        # Step 2: Strip separators
        stripped = re.sub(r"[\s\-\.]", "", upper)

        # Step 3: Detect plate type and apply confusion mapping
        plate_type = _detect_plate_type(stripped)
        normalized = _apply_ocr_correction(stripped, plate_type)

        # Step 4: Validate
        is_valid = _validate_format(normalized)

        return NormalizedPlate(
            raw=raw_plate,
            normalized=normalized,
            plate_type=plate_type,
            is_valid=is_valid,
        )


# Format patterns (normalized, no separators)
_PATTERNS = {
    "PRIVATE_OLD": re.compile(r"^(\d{2})([A-Z])(\d{5})$"),           # 51A12345
    "PRIVATE_NEW": re.compile(r"^(\d{2})([A-Z])(\d{5,6})$"),        # 51A12345 hoặc 51A123456
    "GOVERNMENT": re.compile(r"^(80|[0-9]{2})([A-Z])(\d{4,5})$"),   # 80B1234
    "MOTORBIKE": re.compile(r"^(\d{2})([A-Z]\d)(\d{4,5})$"),        # 59F12345
    "MOTORBIKE_NEW": re.compile(r"^(\d{2})([A-Z]\d{2})(\d{5})$"),   # 51F1123456
    "DIPLOMATIC": re.compile(r"^NN.*$"),
    "MILITARY": re.compile(r"^[A-Z]{2}\d+$"),                        # TM0123
}


def _detect_plate_type(stripped: str) -> str:
    if stripped.startswith("NN"):
        return "DIPLOMATIC"
    if re.match(r"^[A-Z]{2}\d+$", stripped):
        return "MILITARY"
    if stripped.startswith("80"):
        return "GOVERNMENT"
    if re.match(r"^\d{2}[A-Z]\d{2}\d{5}$", stripped):
        return "MOTORBIKE_NEW"
    if re.match(r"^\d{2}[A-Z]\d\d{4,5}$", stripped):
        return "MOTORBIKE"
    if re.match(r"^\d{2}[A-Z]\d{4,6}$", stripped):
        return "PRIVATE"
    return "UNKNOWN"


def _apply_ocr_correction(stripped: str, plate_type: str) -> str:
    """Áp dụng OCR confusion correction dựa trên vị trí."""
    if plate_type == "UNKNOWN":
        return stripped

    # Vị trí phần chữ vs phần số phụ thuộc format
    # Đơn giản: 2 số đầu + 1-2 chữ + còn lại là số
    result = list(stripped)
    for i, ch in enumerate(result):
        if i < 2:  # Phần tỉnh: luôn là số
            result[i] = _to_digit(ch)
        elif i == 2:  # Series letter: luôn là chữ
            result[i] = _to_letter(ch)
        elif i >= 3:  # Phần số
            result[i] = _to_digit(ch) if ch.isdigit() or ch in "OIBSZD" else ch
    return "".join(result)


def _to_digit(ch: str) -> str:
    return {"O": "0", "I": "1", "B": "8", "S": "5", "Z": "2", "D": "0"}.get(ch, ch)

def _to_letter(ch: str) -> str:
    return {"0": "O", "1": "I", "8": "B", "5": "S"}.get(ch, ch)


def _validate_format(normalized: str) -> bool:
    for pattern in _PATTERNS.values():
        if pattern.match(normalized):
            return True
    return False
```

---

## 4. Test Fixtures

> Mỗi case phải có trong bộ test tự động. Đây là **bộ test tối thiểu** — bổ sung khi gặp case mới.

| # | Input (raw) | Expected normalized | plate_type | is_valid | Ghi chú |
|---|---|---|---|---|---|
| 1 | `51A-123.45` | `51A12345` | PRIVATE | ✅ | Format cũ, ô tô |
| 2 | `51A-12345` | `51A12345` | PRIVATE | ✅ | Format mới |
| 3 | `51a-123.45` | `51A12345` | PRIVATE | ✅ | Lowercase input |
| 4 | `80B-1234` | `80B1234` | GOVERNMENT | ✅ | Xe công (nền xanh) |
| 5 | `80B-12345` | `80B12345` | GOVERNMENT | ✅ | Xe công 5 số |
| 6 | `59-F1 2345` | `59F12345` | MOTORBIKE | ✅ | Xe máy cũ |
| 7 | `51-F1 234.56` | `51F123456` | MOTORBIKE_NEW | ✅ | Xe máy mới |
| 8 | `NN-01-234` | `NN01234` | DIPLOMATIC | ✅ | Ngoại giao |
| 9 | `TM-0123` | `TM0123` | MILITARY | ✅ | Quân đội |
| 10 | `51A 123 45` | `51A12345` | PRIVATE | ✅ | Spaces thay dash |
| 11 | `51A.123.45` | `51A12345` | PRIVATE | ✅ | Dots thay dash |
| 12 | `5IA-I23.45` | `51A12345` | PRIVATE | ✅ | OCR: I→1 |
| 13 | `51A-O23.45` | `51A02345` | PRIVATE | ✅ | OCR: O→0 |
| 14 | `51A-1B3.45` | `51A18345` | PRIVATE | ✅ | OCR: B→8 |
| 15 | `5OA-123.45` | `50A12345` | PRIVATE | ✅ | OCR: O→0 ở vị trí số |
| 16 | `510-123.45` | `51O12345` | PRIVATE | ✅ | OCR: 0→O ở vị trí chữ |
| 17 | `` | `` | UNKNOWN | ❌ | Empty |
| 18 | `   ` | `` | UNKNOWN | ❌ | Whitespace only |
| 19 | `ABC` | `ABC` | UNKNOWN | ❌ | Invalid format |
| 20 | `123456789012` | `123456789012` | UNKNOWN | ❌ | Too long |
| 21 | `51A-S23.45` | `51A52345` | PRIVATE | ✅ | OCR: S→5 |
| 22 | `30H-123.45` | `30H12345` | PRIVATE | ✅ | Hà Nội |
| 23 | `43A-123.45` | `43A12345` | PRIVATE | ✅ | Đà Nẵng |
| 24 | `92C-123.45` | `92C12345` | PRIVATE | ✅ | Quảng Nam |

---

## 5. Quy tắc tích hợp

1. **Mọi nơi dùng biển số** đều phải đi qua `NormalizedPlate.from_raw()` trước khi lưu/so khớp.
2. `plate_normalized` trong DB là kết quả của hàm này. **UNIQUE index** trên `plate_normalized`.
3. **Cache key** cho Redis cũng dùng `plate_normalized`.
4. Khi LPR trả về kết quả, so khớp bằng `plate_normalized`, **không bao giờ** so khớp raw text.
5. Nếu `is_valid = false`, không reject — vẫn lưu và tạo AccessEvent, nhưng đánh dấu
   `plate_confidence` thấp để Risk Engine xử lý.
