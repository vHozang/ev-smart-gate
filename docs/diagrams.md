# Smart Gate & Vehicle Security — Diagrams

Tập hợp Mermaid và PlantUML diagrams dùng chung cho BA, Backend, AI, IoT và DevOps.

> Mọi Use Case trong tài liệu này đều truy vết được về `FR01`–`FR07` của BRD.
> Xem `requirements-traceability.md` để biết hạng mục nào đã `CONFIRMED`,
> hạng mục nào còn `PROPOSED` hoặc `DESIGN-ADDED`.

## Cách xem sơ đồ

| Loại | Xem bằng gì |
|---|---|
| **Mermaid** | Cài extension **Markdown Preview Mermaid Support** (`bierner.markdown-mermaid`) → `Ctrl+Shift+V` |
| **PlantUML** | Cài extension **PlantUML** (`jebbs.plantuml`) → mở file → `Alt+D`. Cần Java + Graphviz, hoặc trỏ về server `https://www.plantuml.com/plantuml` trong settings |

```bash
code --install-extension bierner.markdown-mermaid
code --install-extension jebbs.plantuml
```

> Các sơ đồ UML thuần (Use Case, Class Diagram) có **cả 2 bản**: bản Mermaid để xem nhanh
> không cần cài gì thêm ngoài extension mermaid, và bản PlantUML chuẩn UML để đưa vào tài liệu bàn giao.

---

## 1. System Context

```mermaid
flowchart LR
    Guest["Guest / Supplier"]
    Employee["Employee"]
    Host["Host"]
    Guard["Security Guard"]
    Admin["Admin"]

    Platform["Smart Gate Platform"]

    Cameras["IP Cameras"]
    Barrier["Barrier"]
    Inventory["Warehouse System"]
    Notify["Notification Provider"]

    Guest --> Platform
    Employee --> Platform
    Host --> Platform
    Guard --> Platform
    Admin --> Platform

    Cameras --> Platform
    Platform --> Barrier
    Inventory <--> Platform
    Platform --> Notify
```

---

## 2. Use Case Diagram

Sơ đồ Use Case chuẩn UML (PlantUML), áp dụng nguyên tắc scoping của Cockburn:

- Actor người dùng đồng bộ với **System Context** (mục 1) và **BRD §2**: Guest/Supplier, Employee, Host, Security Guard, Admin.
- `Edge AI` và `Warehouse System` là **actor hệ thống phụ (system actor)**, chỉ tham gia các use case ở mức sub-function.
- Các use case mức sub-function (Recognize Plate, Verify Face, Detect Objects, Match Voucher, Evaluate Access Risk) là quan hệ **`<<include>>`** bên trong use case mức user-goal — đúng "coffee-break test": actor chỉ nghỉ giải lao sau khi *Enter Site* / *Inspect Vehicle at Exit* hoàn tất.
- `Open Gate` không phải use case riêng — là postcondition trong Normal Course của `Enter Site` (xem mục 5 và 7).
- `Review Access` và `Review Alert` là quan hệ **`<<extend>>`**: chỉ xảy ra khi có ngoại lệ (risk flagged / mismatch detected).

### 2.1 Bản Mermaid — xem nhanh

```mermaid
flowchart LR
    Guest(["👤 Guest / Supplier"])
    Employee(["👤 Employee"])
    Host(["👤 Host"])
    Guard(["👤 Security Guard"])
    Admin(["👤 Admin"])
    AI(["🤖 Edge AI"])
    WH(["🏭 Warehouse System"])

    subgraph SYS["Smart Gate Platform"]
        direction TB
        UC1(("Register<br/>Appointment<br/>FR01"))
        UC2(("Register<br/>Vehicle<br/>FR01"))
        UC3(("Approve<br/>Appointment<br/>DA-01"))

        UC4(("Enter Site<br/>FR03"))
        UC4a(("Recognize<br/>Plate<br/>FR02"))
        UC4b(("Verify Face<br/>FR02"))
        UC4c(("Evaluate<br/>Access Risk<br/>DA-04"))
        UC4d(("Notify Host<br/>FR04"))
        UC5(("Review<br/>Access<br/>FR03"))

        UC11(("Track Vehicle<br/>In Site<br/>FR07 · TBD"))

        UC6(("Inspect Vehicle<br/>at Exit<br/>FR05"))
        UC6a(("Detect<br/>Objects<br/>FR05"))
        UC6b(("Match Voucher<br/>FR06 · Phase 2"))
        UC7(("Review Alert<br/>FR05"))

        UC8(("View Evidence<br/>DA-03"))
        UC9(("Manage<br/>Devices<br/>DA-06"))
        UC10(("Audit Access<br/>DA-02"))
    end

    Guest --- UC1
    Employee --- UC1
    Guest --- UC2
    Employee --- UC2
    Host --- UC3

    Guest --- UC4
    Employee --- UC4
    UC4 -. include .-> UC4a
    UC4 -. include .-> UC4b
    UC4 -. include .-> UC4c
    UC4 -. include .-> UC4d
    AI --- UC4a
    AI --- UC4b
    UC4d --- Host
    UC5 -. extend .-> UC4
    Guard --- UC5

    AI --- UC11
    UC11 -. extend .-> UC4

    Guard --- UC6
    UC6 -. include .-> UC6a
    UC6 -. include .-> UC6b
    AI --- UC6a
    WH --- UC6b
    UC7 -. extend .-> UC6
    Guard --- UC7

    Guard --- UC8
    Admin --- UC9
    Admin --- UC10

    classDef confirmed fill:#d9f2d9,stroke:#2d7a2d,stroke-width:2px,color:#000
    classDef proposed  fill:#fff6d9,stroke:#b8860b,color:#000
    classDef added     fill:#e6e6fa,stroke:#6a5acd,color:#000
    classDef tbd       fill:#eeeeee,stroke:#999,stroke-dasharray:5 3,color:#000

    class UC4,UC4a,UC4b,UC5 confirmed
    class UC1,UC2,UC4d,UC6,UC6a,UC6b,UC7 proposed
    class UC3,UC4c,UC8,UC9,UC10 added
    class UC11 tbd
```

| Màu | Ý nghĩa |
|---|---|
| 🟩 Xanh lá | `CONFIRMED` — khách đã xác nhận |
| 🟨 Vàng | `PROPOSED` — team đề xuất, chờ chốt |
| 🟪 Tím | `DESIGN-ADDED` — team tự thêm, không có trong BRD |
| ⬜ Xám nét đứt | `NEEDS CONFIRMATION` — **không estimate** (`OQ-05`) |

> Mermaid không có sơ đồ Use Case chuẩn UML. Bản trên dùng flowchart để mô phỏng
> (hình tròn = use case, đường liền = association, đường đứt = `include` / `extend`).
> Bản chuẩn UML nằm ở §2.2.

### 2.2 Bản PlantUML — chuẩn UML để bàn giao

```plantuml
@startuml
left to right direction
skinparam packageStyle rectangle
skinparam actorStyle awesome

actor "Guest / Supplier" as Guest
actor "Employee" as Employee
actor "Host" as Host
actor "Security Guard" as Guard
actor "Admin" as Admin
actor "Edge AI" as AI <<system>>
actor "Warehouse System" as Warehouse <<system>>

rectangle "Smart Gate Platform" {
  usecase "Register Appointment\n(FR01)" as UC1
  usecase "Register Vehicle\n(FR01)" as UC2
  usecase "Approve Appointment\n(DA-01)" as UC3

  usecase "Enter Site\n(FR03)" as UC4
  usecase "Recognize Plate\n(FR02)" as UC4a
  usecase "Verify Face\n(FR02)" as UC4b
  usecase "Evaluate Access Risk\n(DA-04)" as UC4c
  usecase "Notify Host\n(FR04)" as UC4d
  usecase "Review Access\n(FR03)" as UC5

  usecase "Track Vehicle In Site\n(FR07 - TBD)" as UC11 #LightGray

  usecase "Inspect Vehicle at Exit\n(FR05)" as UC6
  usecase "Detect Objects\n(FR05)" as UC6a
  usecase "Match Voucher\n(FR06 - Phase 2)" as UC6b
  usecase "Review Alert\n(FR05)" as UC7

  usecase "View Evidence\n(DA-03)" as UC8
  usecase "Manage Devices\n(DA-06)" as UC9
  usecase "Audit Access\n(DA-02)" as UC10
}

Guest --> UC1
Employee --> UC1
Guest --> UC2
Employee --> UC2
Host --> UC3

Guest --> UC4
Employee --> UC4
UC4 ..> UC4a : <<include>>
UC4 ..> UC4b : <<include>>
UC4 ..> UC4c : <<include>>
UC4 ..> UC4d : <<include>>
AI --> UC4a
AI --> UC4b
UC4d --> Host
UC5 ..> UC4 : <<extend>>
Guard --> UC5

AI --> UC11
UC11 ..> UC4 : <<extend>>

Guard --> UC6
UC6 ..> UC6a : <<include>>
UC6 ..> UC6b : <<include>>
AI --> UC6a
Warehouse --> UC6b
UC7 ..> UC6 : <<extend>>
Guard --> UC7

Guard --> UC8
Admin --> UC9
Admin --> UC10

note bottom of UC11
  BR-05 có trong BRD §4 nhưng
  BRD §5 thiếu FR tương ứng.
  Chờ trả lời OQ-05 —
  KHÔNG đưa vào estimate.
end note
@enduml
```

### 2.3 Use Case → Requirement Traceability

| Use Case | FR / ID | Actor chính | Phase | Status |
|---|---|---|---|---|
| Register Appointment | FR01 | Guest / Supplier / Employee | 1 | `PROPOSED` |
| Register Vehicle | FR01 | Guest / Supplier / Employee | 1 | `PROPOSED` |
| Approve Appointment | `DA-01` | Host | 1 | `DESIGN-ADDED` |
| Enter Site | FR03 | Guest / Employee | 1 | **`CONFIRMED`** |
| ├─ Recognize Plate | FR02 | Edge AI | 1 | **`CONFIRMED`** |
| ├─ Verify Face | FR02 | Edge AI | 1 | **`CONFIRMED`** |
| ├─ Evaluate Access Risk | `DA-04` | — | 1 | `DESIGN-ADDED` |
| └─ Notify Host | FR04 | — → Host | 1 | `PROPOSED` |
| Review Access | FR03 | Guard | 1 | **`CONFIRMED`** |
| Track Vehicle In Site | FR07 | Edge AI | **TBD** | ⚠️ `NEEDS CONFIRMATION` |
| Inspect Vehicle at Exit | FR05 | Guard | 1 | `PROPOSED` |
| ├─ Detect Objects | FR05 | Edge AI | 1 | `PROPOSED` |
| └─ Match Voucher | FR06 | Warehouse System | 2 | `PROPOSED` |
| Review Alert | FR05 | Guard | 1 | `PROPOSED` |
| View Evidence | `DA-03` | Guard | 1 | `DESIGN-ADDED` |
| Manage Devices | `DA-06` | Admin | 1 | `DESIGN-ADDED` |
| Audit Access | `DA-02` | Admin | 1 | `DESIGN-ADDED` |

---

## 3. Business Process — AS-IS vs TO-BE

Nguồn: BRD §6.

### 3.1 AS-IS — quy trình thủ công hiện tại

```mermaid
flowchart LR
    A["Khách / NV<br/>đến cổng"] --> B["Dừng xe<br/>chờ đợi"]
    B --> C["Xuất trình CCCD<br/>khai báo thủ công"]
    C --> D["Bảo vệ ghi sổ<br/>liên hệ người bên trong"]
    D --> E["Bảo vệ mở cổng<br/>thủ công"]
    E --> F["Xe vào bãi<br/>KHÔNG theo dõi"]
    F --> G["Xe ra cổng"]
    G --> H["Bảo vệ yêu cầu<br/>mở cốp / cửa"]
    H --> I["Kiểm tra<br/>bằng MẮT THƯỜNG"]
    I --> J["Mở cổng cho ra"]
```

### 3.2 TO-BE — quy trình đề xuất

```mermaid
flowchart TD
    A["1. Đăng ký trước qua Web/App Portal<br/>khuôn mặt, biển số, người gặp, thời gian"] --> B["2. Phương tiện tiến tới cổng"]
    B --> C["3. Camera AI tự động quét biển số<br/>+ đối chiếu khuôn mặt trong xe"]
    C --> D{"4. Hợp lệ?"}

    D -- "Có" --> E["Gửi lệnh mở cổng tự động"]
    D -- "Không chắc chắn" --> F["Báo bảo vệ<br/>bấm nút mở cổng"]
    D -- "Không hợp lệ" --> G["Giữ cổng đóng<br/>+ cảnh báo bảo vệ"]

    E --> H["Push notification<br/>cho Host"]
    F --> H

    H --> I["5. Xe vào bãi<br/>tracking vị trí dừng đỗ"]
    I --> J["6. Xe ra: yêu cầu bung cốp<br/>4 camera soi chiếu"]
    J --> K["AI phân tích vật thể mang theo"]
    K --> L{"Bất thường?"}

    L -- "Không" --> M["7. Mở cổng cho xe ra"]
    L -- "Có" --> N["Cảnh báo bảo vệ<br/>+ Evidence"]
    N --> O{"Bảo vệ quyết định"}
    O -- "Duyệt" --> M
    O -- "Từ chối" --> P["Chặn xe ra<br/>+ Security Alert"]

    style I fill:#eeeeee,stroke-dasharray: 5 5
    style G fill:#ffe0e0
    style P fill:#ffe0e0
```

| Bước TO-BE | FR | Status |
|---|---|---|
| 1. Đăng ký trước qua Portal | FR01 | `PROPOSED` |
| 2–3. Camera AI quét biển số + khuôn mặt | FR02 | **`CONFIRMED`** |
| 4. Kiểm tra hợp lệ → mở cổng / báo bảo vệ | FR03 | **`CONFIRMED`** |
| 4b. Push notification cho Host | FR04 | `PROPOSED` |
| 5. Tracking vị trí dừng đỗ trong bãi | FR07 | ⚠️ `NEEDS CONFIRMATION` (`OQ-05`) |
| 6. Bung cốp, 4 camera soi chiếu, AI phân tích | FR05 | `PROPOSED` — rủi ro `R-01` |
| 6b. Đối chiếu Phiếu xuất kho | FR06 | `PROPOSED` — Phase 2 |
| 7. Mở cổng cho ra nếu không bất thường | FR05 | `PROPOSED` |

> Bước 5 được vẽ **nét đứt** vì BRD nêu trong TO-BE nhưng không có FR tương ứng.
> Không triển khai cho tới khi `OQ-05` được trả lời.

---

## 4. Component Architecture

```mermaid
flowchart TB
    subgraph Presentation
        Portal["Visitor Portal"]
        GuardUI["Guard Dashboard"]
        AdminUI["Admin Portal"]
        API["FastAPI"]
    end

    subgraph Application
        AppointmentUC["Appointment UseCases"]
        AccessUC["Access UseCases"]
        InspectionUC["Inspection UseCases"]
        ReviewUC["Review UseCases"]
    end

    subgraph Domain
        Policy["Access Policy"]
        Risk["Risk Service"]
        Match["Voucher Matching"]
        Entities["Entities"]
        Ports["Ports"]
    end

    subgraph Infrastructure
        DB[("PostgreSQL")]
        Redis[("Redis")]
        Storage[("Object Storage")]
        Vision["Vision Adapter"]
        Camera["Camera Adapter"]
        IoT["IoT Adapter"]
        Inventory["Inventory Adapter"]
        Bus["Event Bus"]
    end

    Portal --> API
    GuardUI --> API
    AdminUI --> API

    API --> AppointmentUC
    API --> AccessUC
    API --> InspectionUC
    API --> ReviewUC

    AppointmentUC --> Entities
    AccessUC --> Policy
    AccessUC --> Risk
    InspectionUC --> Risk
    InspectionUC --> Match
    ReviewUC --> Entities

    Infrastructure --> Ports
```

---

## 5. Vehicle Entry Flow

```mermaid
flowchart TD
    A["Vehicle enters zone"] --> B["Vehicle Detection"]
    B --> C["LPR"]
    C --> D["Face Verification"]
    D --> E["Publish Observation"]
    E --> F["Resolve Appointment"]
    F --> G{"Valid?"}

    G -- No --> H["Guard Review"]
    G -- Yes --> I["Risk Assessment"]

    I --> J{"Risk"}
    J -- LOW --> K["ALLOW"]
    J -- MEDIUM --> H
    J -- HIGH --> L["BLOCK"]

    H --> M{"Guard Action"}
    M -- Approve --> K
    M -- Reject --> L

    K --> N["OPEN Command"]
    N --> O["Complete Access Event"]
    L --> O
```

---

## 6. Exit Inspection Flow

```mermaid
flowchart TD
    A["Vehicle arrives Exit"] --> B["Resolve Access Event"]
    B --> C["Create Inspection"]
    C --> D["Capture 4 Cameras"]
    D --> E["Store Evidence"]
    E --> F["Object Detection"]
    F --> G{"Voucher available?"}

    G -- Yes --> H["Load Voucher"]
    G -- No --> I["Risk Assessment"]
    H --> J["Match Objects"]
    J --> I

    I --> K{"Decision"}
    K -- LOW --> L["Approve Exit"]
    K -- REVIEW --> M["Guard Review"]
    K -- HIGH --> M

    M --> N{"Action"}
    N -- Rescan --> D
    N -- Approve --> L
    N -- Reject --> O["Block Exit"]

    L --> P["Open Gate"]
    O --> Q["Security Alert"]
```

---

## 7. Access State Machine

```mermaid
stateDiagram-v2
    [*] --> OBSERVED
    OBSERVED --> RESOLVED
    RESOLVED --> VALIDATING
    VALIDATING --> EVALUATING
    VALIDATING --> REVIEW_REQUIRED
    EVALUATING --> ALLOWED
    EVALUATING --> REVIEW_REQUIRED
    EVALUATING --> BLOCKED
    REVIEW_REQUIRED --> ALLOWED
    REVIEW_REQUIRED --> BLOCKED
    ALLOWED --> GATE_COMMAND_SENT
    GATE_COMMAND_SENT --> COMPLETED
    GATE_COMMAND_SENT --> DEVICE_ERROR
    DEVICE_ERROR --> COMPLETED
    BLOCKED --> COMPLETED
```

---

## 8. Inspection State Machine

```mermaid
stateDiagram-v2
    [*] --> CREATED
    CREATED --> CAPTURING
    CAPTURING --> ANALYZING
    ANALYZING --> APPROVED
    ANALYZING --> REVIEW_REQUIRED
    REVIEW_REQUIRED --> CAPTURING: Rescan
    REVIEW_REQUIRED --> APPROVED: Guard Approve
    REVIEW_REQUIRED --> REJECTED: Guard Reject
    APPROVED --> COMPLETED
    REJECTED --> COMPLETED
```

---

## 9. Edge AI Pipeline

```mermaid
flowchart LR
    RTSP["RTSP"] --> Decode["Frame Sampling"]
    Decode --> Vehicle["Vehicle Detection"]
    Vehicle --> Plate["LPR"]
    Vehicle --> Face["Face Verification"]
    Vehicle --> Zone{"Inspection Zone?"}
    Zone -- Yes --> Object["Object Detection"]

    Plate --> Event["Event Builder"]
    Face --> Event
    Object --> Event

    Event --> Evidence["Evidence Capture"]
    Event --> Publish["Publish Event"]
    Evidence --> Publish
```

---

## 10. Risk Engine

```mermaid
flowchart TB
    Identity["Identity"]
    Appointment["Appointment"]
    Security["Security"]
    Inspection["Inspection"]
    Voucher["Voucher"]

    Risk["Risk Assessment"]

    Identity --> Risk
    Appointment --> Risk
    Security --> Risk
    Inspection --> Risk
    Voucher --> Risk

    Risk --> Score["Score + Reasons"]
    Score --> Low["LOW"]
    Score --> Medium["MEDIUM"]
    Score --> High["HIGH"]
```

---

## 11. Multi-site Deployment

```mermaid
flowchart TB
    subgraph Central
        API["API"]
        Worker["Workers"]
        DB[("PostgreSQL")]
        Redis[("Redis")]
        Store[("Object Storage")]
        Obs["Observability"]
    end

    subgraph SiteA
        CamA["Camera"]
        EdgeA["Edge AI"]
        IoTA["IoT"]
        GateA["Barrier"]
        CamA --> EdgeA --> IoTA --> GateA
    end

    subgraph SiteB
        CamB["Camera"]
        EdgeB["Edge AI"]
        IoTB["IoT"]
        GateB["Barrier"]
        CamB --> EdgeB --> IoTB --> GateB
    end

    EdgeA <--> API
    IoTA <--> API
    EdgeB <--> API
    IoTB <--> API

    API --> Worker
    API --> DB
    API --> Redis
    API --> Store
    API --> Obs
```

---

## 12. Entry Sequence

```mermaid
sequenceDiagram
    actor Driver
    participant Camera
    participant Edge
    participant API
    participant UC as ProcessEntry
    participant UOW
    participant Risk
    participant Gate
    participant Host

    Driver->>Camera: enter zone
    Camera->>Edge: frames
    Edge->>Edge: LPR + Face
    Edge->>API: VehicleObserved
    API->>UC: execute
    UC->>UOW: resolve entities
    UOW-->>UC: data
    UC->>Risk: evaluate
    Risk-->>UC: ALLOW
    UC->>UOW: save decision
    UC->>UOW: commit
    UC->>Gate: OPEN
    Gate-->>UC: ACK
    UC->>Host: notify
```

---

## 13. Manual Review Sequence

```mermaid
sequenceDiagram
    participant Edge
    participant API
    participant UC
    participant Guard
    participant Gate
    participant Audit

    Edge->>API: observation low confidence
    API->>UC: process
    UC->>Guard: ReviewRequired
    Guard-->>UC: Approve(reason)
    UC->>Gate: OPEN
    Gate-->>UC: ACK
    UC->>Audit: save reason
```

---

## 14. Exit Voucher Mismatch

```mermaid
sequenceDiagram
    participant Camera
    participant Inspection
    participant Vision
    participant Inventory
    participant Matching
    participant Guard
    participant Gate

    Camera->>Inspection: vehicle observed
    Inspection->>Camera: capture 4 views
    Camera-->>Inspection: evidence
    Inspection->>Vision: detect objects
    Vision-->>Inspection: objects
    Inspection->>Inventory: get voucher
    Inventory-->>Inspection: approved items
    Inspection->>Matching: compare
    Matching-->>Inspection: MISMATCH
    Inspection->>Guard: ReviewRequired
    Guard-->>Inspection: Reject
    Inspection->>Gate: keep closed
```

---

# PlantUML

## 15. Core Domain Class Diagram

Bao phủ toàn bộ entity trong **BRD §7 Data Requirements**, giữ đúng cardinality mà BRD mô tả
(*"1 User có thể đăng ký nhiều Vehicle"*, *"1 Vehicle khi rời công ty có thể liên kết 1 ExportVoucher"*).

> Đây là **domain model** (có behavior). Mô hình bảng vật lý — kiểu dữ liệu, PK/FK, index,
> constraint — nằm ở tài liệu riêng: **`data-model-erd.md`**.

### 15.1 Bản Mermaid — xem nhanh

```mermaid
classDiagram
    class User {
        +id
        +fullName
        +userType
        +nationalIdRef
        +faceImageRef
        +isBlacklisted
    }

    class Vehicle {
        +id
        +plate
        +plateNormalized
        +type
        +ownerId
        +isBlacklisted
    }

    class Appointment {
        +id
        +visitorId
        +vehicleId
        +hostId
        +timeWindow
        +status
        +approve()
        +reject()
    }

    class AccessEvent {
        +id
        +direction
        +status
        +riskScore
        +decision
        +decisionReasons
        +recordDecision()
    }

    class InspectionSession {
        +id
        +status
        +riskScore
        +approve()
        +reject()
        +requestRescan()
    }

    class DetectedObject {
        +className
        +confidence
        +trackId
    }

    class Asset {
        +id
        +assetType
        +label
    }

    class SecurityAlert {
        +id
        +severity
        +status
    }

    class ExportVoucher {
        +id
        +code
        +status
    }

    class ExportVoucherItem {
        +assetType
        +quantity
        +unit
    }

    class Evidence {
        +id
        +objectKey
        +hash
        +cameraId
        +capturedAt
        +retentionClass
    }

    User "1" --> "*" Vehicle : owns
    Appointment "*" --> "1" User : visitor
    Appointment "*" --> "1" User : host
    Appointment "*" --> "1" Vehicle

    AccessEvent "*" --> "0..1" Appointment
    AccessEvent "*" --> "1" Vehicle
    AccessEvent "*" --> "0..1" User : driver
    AccessEvent "1" --> "0..1" InspectionSession
    AccessEvent "1" --> "*" Evidence

    InspectionSession "1" --> "*" DetectedObject
    InspectionSession "1" --> "*" Evidence
    InspectionSession --> SecurityAlert
    InspectionSession "0..1" --> "0..1" ExportVoucher
    ExportVoucher "1" --> "*" ExportVoucherItem
    ExportVoucherItem --> Asset
    DetectedObject ..> Asset : matched against

    note for AccessEvent "appointment_id NULLABLE. BRD §8 yêu cầu cảnh báo khi có phương tiện CHƯA ĐĂNG KÝ nên vẫn phải tạo AccessEvent."
    note for User "nationalIdRef / faceImageRef là tham chiếu đã mã hóa, KHÔNG lưu raw. Retention chờ OQ-07."
```

### 15.2 Bản PlantUML — chuẩn UML để bàn giao

```plantuml
@startuml
skinparam classAttributeIconSize 0

class User {
  +id
  +fullName
  +userType
  +nationalIdRef
  +faceImageRef
  +isBlacklisted
}
note right of User
  userType: GUEST | SUPPLIER
           | EMPLOYEE | HOST | GUARD
  nationalIdRef / faceImageRef là
  tham chiếu đã mã hóa, KHÔNG lưu raw.
  Retention policy: chờ OQ-07.
end note

class Vehicle {
  +id
  +plate
  +plateNormalized
  +type
  +ownerId
  +isBlacklisted
}

class Appointment {
  +id
  +visitorId
  +vehicleId
  +hostId
  +timeWindow
  +status
  +approve()
  +reject()
}

class AccessEvent {
  +id
  +direction
  +status
  +riskScore
  +decision
  +decisionReasons
  +recordDecision()
}

class InspectionSession {
  +id
  +status
  +riskScore
  +approve()
  +reject()
  +requestRescan()
}

class DetectedObject {
  +className
  +confidence
  +trackId
}

class Asset {
  +id
  +assetType
  +label
}

class SecurityAlert {
  +id
  +severity
  +status
}

class ExportVoucher {
  +id
  +code
  +status
}

class ExportVoucherItem {
  +assetType
  +quantity
  +unit
}

class Evidence {
  +id
  +objectKey
  +hash
  +cameraId
  +capturedAt
  +retentionClass
}

User "1" --> "*" Vehicle : owns
Appointment "*" --> "1" User : visitor
Appointment "*" --> "1" User : host
Appointment "*" --> "1" Vehicle

AccessEvent "*" --> "0..1" Appointment
AccessEvent "*" --> "1" Vehicle
AccessEvent "*" --> "0..1" User : driver
AccessEvent "1" --> "0..1" InspectionSession
AccessEvent "1" --> "*" Evidence

InspectionSession "1" --> "*" DetectedObject
InspectionSession "1" --> "*" Evidence
InspectionSession --> SecurityAlert
InspectionSession "0..1" --> "0..1" ExportVoucher
ExportVoucher "1" --> "*" ExportVoucherItem
ExportVoucherItem --> Asset
DetectedObject ..> Asset : matched against

note bottom of AccessEvent
  appointment_id là NULLABLE.
  BRD §8 yêu cầu cảnh báo khi có
  phương tiện CHƯA ĐĂNG KÝ
  => vẫn phải tạo AccessEvent.
end note
@enduml
```

> `ExportVoucher` / `ExportVoucherItem` / `Asset` thuộc **Phase 2** (`FR06`).
> Thiết kế sẵn quan hệ nhưng chưa triển khai cho tới khi có Inventory API contract.

---

## 16. Clean Architecture Dependency Diagram

```plantuml
@startuml
package Presentation
package Application
package Domain
package Infrastructure

Presentation --> Application
Application --> Domain
Infrastructure --> Domain

note right of Domain
No FastAPI
No SQLAlchemy
No Redis
No OpenCV
No Pydantic BaseModel
end note
@enduml
```
