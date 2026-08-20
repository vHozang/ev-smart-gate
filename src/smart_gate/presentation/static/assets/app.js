import { ApiClient, ApiError } from "/assets/api.js";
import {
  downloadBlob,
  escapeHtml,
  formatDate,
  formatPercent,
  formatRelative,
  fromLocalInput,
  icon,
  initials,
  labelFor,
  openBlob,
  shortId,
  statusBadge,
  toLocalInput,
  uniqueEventId,
} from "/assets/ui.js";

const app = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toastRoot = document.querySelector("#toast-root");
const api = new ApiClient();

const roleLabels = {
  ADMIN: "Quản trị hệ thống",
  WAREHOUSE: "Điều hành kho",
  SECURITY: "An ninh cổng",
};

const navigation = [
  { section: "Điều hành", route: "/dashboard", label: "Tổng quan", icon: "dashboard" },
  {
    section: "Điều hành",
    route: "/gates",
    label: "Kiểm soát cổng",
    icon: "gate",
    roles: ["ADMIN", "SECURITY"],
  },
  { section: "Điều hành", route: "/warehouse", label: "Xuất kho", icon: "warehouse" },
  { section: "Hồ sơ", route: "/drivers", label: "Tài xế", icon: "driver" },
  { section: "Hồ sơ", route: "/vehicles", label: "Phương tiện", icon: "vehicle" },
  {
    section: "Hồ sơ",
    route: "/authorizations",
    label: "Ủy quyền",
    icon: "authorization",
  },
  { section: "Giám sát", route: "/gate-logs", label: "Nhật ký cổng", icon: "logs" },
  {
    section: "Giám sát",
    route: "/alerts",
    label: "Cảnh báo an ninh",
    icon: "alert",
    roles: ["ADMIN", "SECURITY"],
  },
  { section: "Giám sát", route: "/system", label: "Trạng thái hệ thống", icon: "system" },
];

const pageMetadata = {
  "/dashboard": ["Trung tâm điều hành", "Quan sát toàn bộ luồng vận hành theo thời gian thực"],
  "/gates": ["Kiểm soát cổng", "Xác minh khuôn mặt, biển số và phiếu xuất kho"],
  "/warehouse": ["Điều hành xuất kho", "Quản lý lệnh, kiểm hàng và phiếu QR đã ký"],
  "/drivers": ["Hồ sơ tài xế", "Đăng ký và quản lý nhận diện khuôn mặt"],
  "/vehicles": ["Hồ sơ phương tiện", "Quản lý biển số và thông tin phương tiện"],
  "/authorizations": ["Ủy quyền tài xế – xe", "Kiểm soát cặp vận hành có hiệu lực"],
  "/gate-logs": ["Nhật ký cổng", "Dấu vết xác minh và trạng thái barrier"],
  "/alerts": ["Trung tâm cảnh báo", "Tiếp nhận và xử lý sự kiện an ninh tức thời"],
  "/system": ["Trạng thái hệ thống", "Theo dõi API và các thành phần hạ tầng"],
};

const state = {
  user: null,
  route: normalizeRoute(location.hash.slice(1) || "/dashboard"),
  loading: false,
  sidebarOpen: false,
  gateTab: "entry",
  warehouseTab: "orders",
  orderView: "board",
  search: {},
  filters: {
    orderStatus: "ALL",
    logDirection: "ALL",
    logStatus: "ALL",
    alertSeverity: "ALL",
    alertStatus: "ALL",
  },
  drivers: [],
  vehicles: [],
  authorizations: [],
  orders: [],
  docks: [],
  gateLogs: [],
  alerts: [],
  health: { live: "checking", ready: "checking" },
  verificationResults: { entry: null, exit: null },
  socketStatus: "offline",
  socket: null,
  socketTimer: null,
  reconnectTimer: null,
  clockTimer: null,
  cameraStream: null,
};

function normalizeRoute(route) {
  const allowed = Object.keys(pageMetadata);
  return allowed.includes(route) ? route : "/dashboard";
}

function hasRole(...roles) {
  return roles.includes(state.user?.role);
}

function canManageMasterData() {
  return hasRole("ADMIN");
}

function canManageWarehouse() {
  return hasRole("ADMIN", "WAREHOUSE");
}

function canManageSecurity() {
  return hasRole("ADMIN", "SECURITY");
}

function driverById(id) {
  return state.drivers.find((item) => item.id === id);
}

function vehicleById(id) {
  return state.vehicles.find((item) => item.id === id);
}

function dockById(id) {
  return state.docks.find((item) => item.id === id);
}

function openAlertCount() {
  return state.alerts.filter((item) => ["OPEN", "ACKNOWLEDGED"].includes(item.status)).length;
}

function showToast(message, type = "success", title = "Thông báo") {
  const id = `toast-${Date.now()}-${Math.random()}`;
  const iconName = type === "error" ? "x" : type === "warning" ? "info" : "check";
  toastRoot.insertAdjacentHTML(
    "afterbegin",
    `<article class="toast ${type}" id="${id}">
      <div class="toast-icon">${icon(iconName)}</div>
      <div class="toast-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>
      <button class="toast-close" type="button" data-dismiss-toast="${id}" aria-label="Đóng">${icon("close")}</button>
    </article>`,
  );
  window.setTimeout(() => document.getElementById(id)?.remove(), 5200);
}

function showError(error) {
  if (error instanceof ApiError) {
    const suffix = error.code && error.code !== "UNKNOWN_ERROR" ? ` · ${error.code}` : "";
    showToast(`${error.message}${suffix}`, "error", "Không thể hoàn tất");
    return;
  }
  showToast(String(error?.message || error || "Lỗi không xác định"), "error", "Có lỗi xảy ra");
}

function openModal({ title, subtitle = "", body, footer = "", wide = false }) {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal">
    <section class="modal ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-panel>
      <header class="modal-header">
        <div><h2 id="modal-title">${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>
        <button class="btn btn-ghost btn-icon" type="button" data-action="close-modal" aria-label="Đóng">${icon("close")}</button>
      </header>
      <div class="modal-body">${body}</div>
      ${footer ? `<footer class="modal-footer">${footer}</footer>` : ""}
    </section>
  </div>`;
  document.body.style.overflow = "hidden";
  window.setTimeout(() => modalRoot.querySelector("input:not([type='hidden']), select, textarea")?.focus(), 30);
}

function closeModal() {
  stopCamera();
  modalRoot.innerHTML = "";
  document.body.style.overflow = "";
}

function confirmAction({ title, message, action, id, confirmLabel = "Xác nhận", danger = true }) {
  openModal({
    title,
    subtitle: "Thao tác này cần được xác nhận",
    body: `<div class="confirm-box">${escapeHtml(message)}</div>`,
    footer: `<button class="btn btn-secondary" type="button" data-action="close-modal">Quay lại</button>
      <button class="btn ${danger ? "btn-danger" : "btn-primary"}" type="button" data-action="${action}" data-id="${escapeHtml(id)}">${escapeHtml(confirmLabel)}</button>`,
  });
}

function pageHeader(eyebrow, title, description, actions = "") {
  return `<header class="page-header">
    <div class="page-heading">
      <div class="eyebrow">${escapeHtml(eyebrow)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ""}
  </header>`;
}

function emptyState(iconName, title, message, action = "") {
  return `<div class="empty-state">
    <div class="empty-illustration">${icon(iconName)}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(message)}</p>
    ${action}
  </div>`;
}

function renderLogin() {
  clearInterval(state.clockTimer);
  app.innerHTML = `<main class="login-screen">
    <section class="login-story">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true"></div>
        <div class="brand-copy"><strong>EV Smart Gate</strong><span>Kiểm soát thông minh</span></div>
      </div>
      <div class="login-headline">
        <div class="eyebrow">Trung tâm điều hành hợp nhất</div>
        <h1>Mỗi chuyến xe.<br />Một chuỗi <em>xác minh.</em></h1>
        <p>Đồng bộ cổng vào, bến xuất hàng và cổng ra trong một không gian vận hành an toàn, minh bạch và có thể truy vết.</p>
      </div>
      <div class="login-flow">
        <div class="login-flow-item"><strong>01 · Gate In</strong><span>Khuôn mặt + biển số</span></div>
        <div class="login-flow-item"><strong>02 · Dock</strong><span>Giám sát hàng hóa</span></div>
        <div class="login-flow-item"><strong>03 · Exit Slip</strong><span>QR ký Ed25519</span></div>
        <div class="login-flow-item"><strong>04 · Gate Out</strong><span>Xác minh ba chiều</span></div>
      </div>
    </section>
    <section class="login-panel">
      <div class="login-card">
        <div class="login-card-header">
          <div class="eyebrow">Khu vực được bảo vệ</div>
          <h2>Đăng nhập vận hành</h2>
          <p>Sử dụng tài khoản được phân quyền để truy cập hệ thống.</p>
        </div>
        <form class="login-form" data-form="login">
          <div class="field">
            <label for="login-username">Tên đăng nhập</label>
            <div class="input-wrap">${icon("driver")}<input id="login-username" name="username" value="admin" minlength="3" autocomplete="username" required /></div>
          </div>
          <div class="field">
            <label for="login-password">Mật khẩu</label>
            <div class="input-wrap">${icon("shield")}<input id="login-password" name="password" type="password" minlength="8" autocomplete="current-password" placeholder="Nhập mật khẩu" required />
              <button class="password-toggle" type="button" data-action="toggle-password" aria-label="Hiện mật khẩu">${icon("eye")}</button>
            </div>
          </div>
          <button class="btn btn-primary btn-block" type="submit">${icon("arrow")} Vào trung tâm điều hành</button>
        </form>
        <div class="login-note">${icon("info")}<span>Môi trường local dùng tài khoản trong <strong>.env.example</strong>. Phiên đăng nhập được lưu bằng cookie HttpOnly và bảo vệ CSRF.</span></div>
      </div>
    </section>
  </main>`;
}

function renderShell() {
  const routeMeta = pageMetadata[state.route] || pageMetadata["/dashboard"];
  const allowedNavigation = navigation.filter(
    (item) => !item.roles || item.roles.includes(state.user.role),
  );
  const sections = [...new Set(allowedNavigation.map((item) => item.section))];
  const alertCount = openAlertCount();
  const navHtml = sections
    .map(
      (section) => `<div class="nav-section-label">${escapeHtml(section)}</div>
        <nav class="nav-list">${allowedNavigation
          .filter((item) => item.section === section)
          .map(
            (item) => `<button class="nav-item ${state.route === item.route ? "active" : ""}" type="button" data-nav="${item.route}">
              ${icon(item.icon)}<span>${escapeHtml(item.label)}</span>
              ${item.route === "/alerts" && alertCount ? `<span class="nav-badge">${alertCount > 99 ? "99+" : alertCount}</span>` : ""}
            </button>`,
          )
          .join("")}</nav>`,
    )
    .join("");

  app.innerHTML = `<div class="app-shell ${state.sidebarOpen ? "sidebar-open" : ""}">
    <aside class="sidebar">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true"></div>
        <div class="brand-copy"><strong>EV Smart Gate</strong><span>Trung tâm vận hành</span></div>
      </div>
      <div class="site-status"><i class="status-pulse"></i><div><strong>Hệ thống đang trực tuyến</strong><span>API · MongoDB · MinIO</span></div></div>
      ${navHtml}
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="avatar">${escapeHtml(initials(state.user.username))}</div>
          <div class="sidebar-user-copy"><strong>${escapeHtml(state.user.username)}</strong><span>${escapeHtml(roleLabels[state.user.role] || state.user.role)}</span></div>
          <button class="btn btn-ghost btn-icon" type="button" data-action="logout" aria-label="Đăng xuất">${icon("logout")}</button>
        </div>
      </div>
    </aside>
    <button class="mobile-overlay" type="button" data-action="toggle-sidebar" aria-label="Đóng menu"></button>
    <div class="app-main">
      <header class="topbar">
        <button class="btn btn-ghost btn-icon mobile-menu" type="button" data-action="toggle-sidebar" aria-label="Mở menu">${icon("menu")}</button>
        <div class="topbar-title"><strong>${escapeHtml(routeMeta[0])}</strong><span>${escapeHtml(routeMeta[1])}</span></div>
        <div class="topbar-actions">
          <div class="live-clock"><strong data-clock-time>--:--:--</strong><span data-clock-date>Đang đồng bộ thời gian</span></div>
          <button class="btn btn-ghost btn-icon" type="button" data-action="refresh-all" aria-label="Làm mới">${icon("refresh")}</button>
          ${canManageSecurity() ? `<button class="btn btn-ghost btn-icon alert-button ${alertCount ? "has-alerts" : ""}" type="button" data-nav="/alerts" aria-label="Cảnh báo">${icon("alert")}</button>` : ""}
        </div>
      </header>
      <main class="page-content">${renderCurrentPage()}</main>
    </div>
  </div>`;
  updateClock();
  clearInterval(state.clockTimer);
  state.clockTimer = window.setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  const timeNode = document.querySelector("[data-clock-time]");
  const dateNode = document.querySelector("[data-clock-date]");
  if (timeNode) timeNode.textContent = now.toLocaleTimeString("vi-VN", { hour12: false });
  if (dateNode) {
    dateNode.textContent = new Intl.DateTimeFormat("vi-VN", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(now);
  }
}

function renderCurrentPage() {
  if (state.loading) {
    return `${pageHeader("Đang đồng bộ", "Dữ liệu vận hành", "Hệ thống đang nạp dữ liệu mới nhất từ trung tâm.")}<div class="loading-skeleton"></div>`;
  }
  const pages = {
    "/dashboard": renderDashboard,
    "/gates": renderGates,
    "/warehouse": renderWarehouse,
    "/drivers": renderDrivers,
    "/vehicles": renderVehicles,
    "/authorizations": renderAuthorizations,
    "/gate-logs": renderGateLogs,
    "/alerts": renderAlerts,
    "/system": renderSystem,
  };
  return (pages[state.route] || renderDashboard)();
}

function renderDashboard() {
  const activeDrivers = state.drivers.filter((item) => item.status === "ACTIVE").length;
  const activeVehicles = state.vehicles.filter((item) => item.status === "ACTIVE").length;
  const activeOrders = state.orders.filter((item) => !["COMPLETED", "CANCELLED"].includes(item.status)).length;
  const passedToday = state.gateLogs.filter(
    (item) => item.verification_status === "PASSED" && isToday(item.occurred_at),
  ).length;
  const recentLogs = state.gateLogs.slice(0, 6);
  const recentAlerts = [...state.alerts]
    .filter((item) => ["OPEN", "ACKNOWLEDGED"].includes(item.status))
    .sort((a, b) => b.sequence - a.sequence)
    .slice(0, 5);

  return `${pageHeader(
    "Toàn cảnh vận hành",
    `Chào ${state.user.username}, hệ thống đã sẵn sàng.`,
    "Theo dõi luồng phương tiện từ cổng vào, kiểm hàng tại dock đến hoàn tất cổng ra.",
    `<button class="btn btn-secondary" data-action="refresh-all">${icon("refresh")} Đồng bộ</button>`,
  )}
  <section class="kpi-grid">
    ${kpiCard("driver", activeDrivers, "Tài xế đang hoạt động", "mint")}
    ${kpiCard("vehicle", activeVehicles, "Phương tiện đã đăng ký", "amber")}
    ${kpiCard("package", activeOrders, "Lệnh đang trong quy trình", "")}
    ${kpiCard(canManageSecurity() && openAlertCount() ? "alert" : "gate", canManageSecurity() ? openAlertCount() : passedToday, canManageSecurity() ? "Cảnh báo cần xử lý" : "Lượt cổng đạt hôm nay", canManageSecurity() && openAlertCount() ? "coral" : "mint")}
  </section>
  <section class="dashboard-layout">
    <div>
      <article class="control-hero">
        <div class="control-hero-content">
          <div class="eyebrow">Chuỗi xác minh fail-closed</div>
          <h2>Cổng chỉ mở khi <em>con người, phương tiện và lệnh</em> cùng khớp.</h2>
          <p>AI tạo quan sát; nghiệp vụ quyết định; barrier xác nhận. Mọi sai lệch đều được lưu dấu và chuyển tới bộ phận an ninh.</p>
          <div class="hero-actions">
            ${canManageSecurity() ? `<button class="btn btn-accent" data-nav="/gates">${icon("gate")} Thực hiện xác minh</button>` : `<button class="btn btn-accent" data-nav="/warehouse">${icon("warehouse")} Mở điều hành kho</button>`}
            <button class="btn btn-secondary" data-nav="/gate-logs">${icon("logs")} Xem nhật ký</button>
          </div>
        </div>
      </article>
      <div class="workflow-strip">
        ${workflowSummary("01", "Gate In", state.gateLogs.filter((item) => item.direction === "ENTRY" && isToday(item.occurred_at)).length, "lượt hôm nay")}
        ${workflowSummary("02", "Đang xếp hàng", state.orders.filter((item) => item.status === "LOADING").length, "lệnh tại dock")}
        ${workflowSummary("03", "Phiếu đã cấp", state.orders.filter((item) => item.status === "SLIP_ISSUED").length, "chờ Gate Out")}
        ${workflowSummary("04", "Hoàn tất", state.orders.filter((item) => item.status === "COMPLETED").length, "lệnh xuất kho")}
      </div>
      <article class="card" style="margin-top:18px">
        <header class="card-header"><div><h2>Hoạt động cổng gần đây</h2><p>Kết quả xác minh và trạng thái barrier</p></div><button class="btn btn-ghost" data-nav="/gate-logs">Xem tất cả ${icon("arrow")}</button></header>
        ${recentLogs.length ? `<div class="activity-list">${recentLogs.map(renderLogActivity).join("")}</div>` : emptyState("gate", "Chưa có lượt qua cổng", "Thực hiện Gate In đầu tiên để bắt đầu chuỗi vận hành.")}
      </article>
    </div>
    <aside class="card">
      <header class="card-header"><div><h2>${canManageSecurity() ? "Tín hiệu an ninh" : "Lệnh cần chú ý"}</h2><p>${canManageSecurity() ? "Ưu tiên sự kiện đang mở" : "Các lệnh đang chờ thao tác"}</p></div>${canManageSecurity() ? `<span class="status-badge status-${state.socketStatus === "connected" ? "active" : "inactive"}"><i></i>${state.socketStatus === "connected" ? "Trực tuyến" : "Mất kết nối"}</span>` : ""}</header>
      ${canManageSecurity() ? renderDashboardAlerts(recentAlerts) : renderDashboardOrders()}
    </aside>
  </section>`;
}

function kpiCard(iconName, value, label, color) {
  return `<article class="kpi-card"><div class="kpi-top"><div class="kpi-icon ${color}">${icon(iconName)}</div><span class="status-badge status-active"><i></i>Trực tuyến</span></div><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-label">${escapeHtml(label)}</div></article>`;
}

function workflowSummary(number, label, value, caption) {
  return `<div class="workflow-step"><span>${number} · ${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(caption)}</small></div>`;
}

function renderLogActivity(item) {
  const passed = item.verification_status === "PASSED";
  const name = driverById(item.driver_id)?.full_name || "Chưa nhận diện tài xế";
  return `<button class="activity-item" type="button" data-action="view-gate-log" data-id="${item.id}" style="width:100%;border:0;background:transparent;text-align:left">
    <div class="activity-icon ${passed ? "passed" : "failed"}">${icon(passed ? "check" : "x")}</div>
    <div class="activity-copy"><strong>${escapeHtml(item.observed_plate || "Không đọc được biển số")} · ${escapeHtml(name)}</strong><span>${labelFor(item.direction)} · ${labelFor(item.barrier_status)} · ${item.reason_codes?.length ? item.reason_codes.join(", ") : "Không có sai lệch"}</span></div>
    <span class="activity-time">${escapeHtml(formatRelative(item.occurred_at))}</span>
  </button>`;
}

function renderDashboardAlerts(items) {
  if (!items.length) {
    return emptyState("shield", "Không có cảnh báo mở", "Tất cả sự kiện an ninh đã được xử lý.");
  }
  return `<div class="activity-list">${items
    .map(
      (item) => `<button class="activity-item" type="button" data-nav="/alerts" style="width:100%;border:0;background:transparent;text-align:left">
        <div class="activity-icon critical">${icon("alert")}</div>
        <div class="activity-copy"><strong>${escapeHtml(item.message)}</strong><span>${escapeHtml(item.alert_type)} · ${labelFor(item.severity)}</span></div>
        <span class="activity-time">#${item.sequence}</span>
      </button>`,
    )
    .join("")}</div>`;
}

function renderDashboardOrders() {
  const items = state.orders
    .filter((item) => !["COMPLETED", "CANCELLED"].includes(item.status))
    .slice(0, 6);
  if (!items.length) return emptyState("package", "Không có lệnh chờ", "Kho hiện không có lệnh xuất hàng đang hoạt động.");
  return `<div class="activity-list">${items
    .map((item) => {
      const vehicle = vehicleById(item.assigned_vehicle_id);
      return `<button class="activity-item" type="button" data-action="view-order" data-id="${escapeHtml(item.order_id)}" style="width:100%;border:0;background:transparent;text-align:left">
        <div class="activity-icon">${icon("package")}</div><div class="activity-copy"><strong>${escapeHtml(item.order_id)}</strong><span>${escapeHtml(vehicle?.plate_number || "Chưa có xe")} · ${labelFor(item.status)}</span></div><span class="activity-time">${escapeHtml(formatRelative(item.valid_until))}</span>
      </button>`;
    })
    .join("")}</div>`;
}

function renderDrivers() {
  const query = (state.search.drivers || "").toLowerCase();
  const items = state.drivers.filter((item) =>
    [item.full_name, item.employee_code, item.phone].some((value) => String(value || "").toLowerCase().includes(query)),
  );
  const action = canManageMasterData()
    ? `<button class="btn btn-primary" data-action="open-driver">${icon("plus")} Đăng ký tài xế</button>`
    : "";
  return `${pageHeader("Sinh trắc học đã mã hóa", "Hồ sơ tài xế", "Ảnh enrollment được xử lý thành embedding và mã hóa AES-GCM trước khi lưu.", action)}
    ${renderSearchToolbar("drivers", "Tìm theo tên, mã nhân viên hoặc số điện thoại")}
    <div class="table-shell">${items.length ? `<div class="table-scroll"><table><thead><tr><th>Tài xế</th><th>Mã nhân viên</th><th>Điện thoại</th><th>Mô hình khuôn mặt</th><th>Enrollment</th><th>Trạng thái</th><th></th></tr></thead><tbody>${items.map(renderDriverRow).join("")}</tbody></table></div>` : emptyState("driver", "Chưa có hồ sơ phù hợp", query ? "Không tìm thấy tài xế theo từ khóa hiện tại." : "Đăng ký tài xế đầu tiên bằng ảnh khuôn mặt rõ nét.", action)}</div>`;
}

function renderDriverRow(item) {
  return `<tr><td><div class="entity-cell"><div class="entity-avatar">${escapeHtml(initials(item.full_name))}</div><div class="entity-copy"><strong>${escapeHtml(item.full_name)}</strong><span title="${escapeHtml(item.id)}">ID ${escapeHtml(shortId(item.id))}</span></div></div></td>
    <td>${escapeHtml(item.employee_code || "—")}</td><td>${escapeHtml(item.phone || "—")}</td>
    <td><strong>${escapeHtml(item.face_model)}</strong><br/><small>Embedding ${escapeHtml(item.embedding_version)}</small></td>
    <td>${escapeHtml(formatDate(item.enrolled_at))}</td><td>${statusBadge(item.status)}</td>
    <td><div class="row-actions">${canManageMasterData() ? `<button class="btn btn-ghost btn-icon" data-action="edit-driver" data-id="${item.id}" title="Chỉnh sửa">${icon("edit")}</button>${item.status === "ACTIVE" ? `<button class="btn btn-ghost btn-icon" data-action="deactivate-driver" data-id="${item.id}" title="Ngừng hoạt động">${icon("trash")}</button>` : ""}` : `<button class="btn btn-ghost btn-icon" data-action="view-driver" data-id="${item.id}" title="Xem">${icon("eye")}</button>`}</div></td></tr>`;
}

function renderVehicles() {
  const query = (state.search.vehicles || "").toLowerCase();
  const items = state.vehicles.filter((item) =>
    [item.plate_number, item.vehicle_type, item.make, item.model, item.color].some((value) => String(value || "").toLowerCase().includes(query)),
  );
  const action = canManageMasterData()
    ? `<button class="btn btn-primary" data-action="open-vehicle">${icon("plus")} Thêm phương tiện</button>`
    : "";
  return `${pageHeader("Biển số được chuẩn hóa", "Hồ sơ phương tiện", "Mỗi biển số là duy nhất; dữ liệu được dùng cho đối chiếu exact và fuzzy tại cổng.", action)}
    ${renderSearchToolbar("vehicles", "Tìm biển số, loại xe, hãng hoặc màu sắc")}
    <div class="table-shell">${items.length ? `<div class="table-scroll"><table><thead><tr><th>Phương tiện</th><th>Biển số</th><th>Loại xe</th><th>Hãng / Model</th><th>Màu sắc</th><th>Trạng thái</th><th></th></tr></thead><tbody>${items.map(renderVehicleRow).join("")}</tbody></table></div>` : emptyState("vehicle", "Chưa có phương tiện phù hợp", query ? "Không tìm thấy phương tiện theo từ khóa hiện tại." : "Thêm phương tiện để bắt đầu tạo quan hệ ủy quyền.", action)}</div>`;
}

function renderVehicleRow(item) {
  return `<tr><td><div class="entity-cell"><div class="entity-avatar vehicle">${icon("vehicle")}</div><div class="entity-copy"><strong>${escapeHtml(item.make || "Phương tiện")}</strong><span>ID ${escapeHtml(shortId(item.id))}</span></div></div></td>
    <td><span class="plate-number">${escapeHtml(item.plate_number)}</span></td><td>${escapeHtml(item.vehicle_type)}</td><td>${escapeHtml([item.make, item.model].filter(Boolean).join(" · ") || "—")}</td><td>${escapeHtml(item.color || "—")}</td><td>${statusBadge(item.status)}</td>
    <td><div class="row-actions">${canManageMasterData() ? `<button class="btn btn-ghost btn-icon" data-action="edit-vehicle" data-id="${item.id}" title="Chỉnh sửa">${icon("edit")}</button>${item.status === "ACTIVE" ? `<button class="btn btn-ghost btn-icon" data-action="deactivate-vehicle" data-id="${item.id}" title="Ngừng hoạt động">${icon("trash")}</button>` : ""}` : `<button class="btn btn-ghost btn-icon" data-action="view-vehicle" data-id="${item.id}" title="Xem">${icon("eye")}</button>`}</div></td></tr>`;
}

function renderAuthorizations() {
  const query = (state.search.authorizations || "").toLowerCase();
  const items = state.authorizations.filter((item) => {
    const driver = driverById(item.driver_id);
    const vehicle = vehicleById(item.vehicle_id);
    return [driver?.full_name, vehicle?.plate_number].some((value) => String(value || "").toLowerCase().includes(query));
  });
  const action = canManageMasterData()
    ? `<button class="btn btn-primary" data-action="open-authorization">${icon("plus")} Tạo ủy quyền</button>`
    : "";
  return `${pageHeader("Quan hệ có thời hạn", "Ủy quyền tài xế – phương tiện", "Gate In chỉ đạt khi khuôn mặt và biển số thuộc cùng một cặp ủy quyền đang hiệu lực.", action)}
    ${renderSearchToolbar("authorizations", "Tìm tên tài xế hoặc biển số")}
    <div class="table-shell">${items.length ? `<div class="table-scroll"><table><thead><tr><th>Tài xế</th><th>Phương tiện</th><th>Hiệu lực từ</th><th>Hiệu lực đến</th><th>Trạng thái</th><th></th></tr></thead><tbody>${items.map(renderAuthorizationRow).join("")}</tbody></table></div>` : emptyState("authorization", "Chưa có quan hệ ủy quyền", "Tạo cặp tài xế – phương tiện trước khi thực hiện Gate In.", action)}</div>`;
}

function renderAuthorizationRow(item) {
  const driver = driverById(item.driver_id);
  const vehicle = vehicleById(item.vehicle_id);
  return `<tr><td><div class="entity-cell"><div class="entity-avatar">${escapeHtml(initials(driver?.full_name))}</div><div class="entity-copy"><strong>${escapeHtml(driver?.full_name || "Không tìm thấy")}</strong><span>${escapeHtml(driver?.employee_code || shortId(item.driver_id))}</span></div></div></td>
    <td><span class="plate-number">${escapeHtml(vehicle?.plate_number || shortId(item.vehicle_id))}</span></td><td>${escapeHtml(formatDate(item.valid_from))}</td><td>${item.valid_until ? escapeHtml(formatDate(item.valid_until)) : "Không giới hạn"}</td><td>${statusBadge(item.status)}</td>
    <td><div class="row-actions">${canManageMasterData() && item.status === "ACTIVE" ? `<button class="btn btn-danger" data-action="revoke-authorization" data-driver-id="${item.driver_id}" data-vehicle-id="${item.vehicle_id}">Thu hồi</button>` : ""}</div></td></tr>`;
}

function renderSearchToolbar(key, placeholder) {
  return `<form class="search-toolbar" data-form="search" data-key="${key}"><div class="search-box">${icon("search")}<input name="query" value="${escapeHtml(state.search[key] || "")}" placeholder="${escapeHtml(placeholder)}" /></div><button class="btn btn-secondary" type="submit">${icon("search")} Tìm kiếm</button>${state.search[key] ? `<button class="btn btn-ghost" type="button" data-action="clear-search" data-key="${key}">Xóa lọc</button>` : ""}</form>`;
}

function renderWarehouse() {
  const tabs = `<div class="page-actions"><button class="btn ${state.warehouseTab === "orders" ? "btn-primary" : "btn-secondary"}" data-action="warehouse-tab" data-tab="orders">${icon("package")} Lệnh xuất kho</button><button class="btn ${state.warehouseTab === "docks" ? "btn-primary" : "btn-secondary"}" data-action="warehouse-tab" data-tab="docks">${icon("warehouse")} Phiên kiểm hàng</button>${canManageWarehouse() ? `<button class="btn btn-accent" data-action="open-order">${icon("plus")} Tạo lệnh mới</button>` : ""}</div>`;
  return `${pageHeader("Điều phối kho", "Điều hành xuất kho", "Quản lý chuỗi PENDING → LOADING → READY_FOR_EXIT → SLIP_ISSUED → COMPLETED.", tabs)}${state.warehouseTab === "docks" ? renderDocks() : renderOrders()}`;
}

function renderOrders() {
  const query = (state.search.orders || "").toLowerCase();
  let items = state.orders.filter((item) => {
    const driver = driverById(item.assigned_driver_id);
    const vehicle = vehicleById(item.assigned_vehicle_id);
    return [item.order_id, driver?.full_name, vehicle?.plate_number].some((value) => String(value || "").toLowerCase().includes(query));
  });
  if (state.filters.orderStatus !== "ALL") {
    items = items.filter((item) => item.status === state.filters.orderStatus);
  }
  return `<div class="search-toolbar"><form class="search-box" data-form="search" data-key="orders">${icon("search")}<input name="query" value="${escapeHtml(state.search.orders || "")}" placeholder="Tìm mã lệnh, tài xế hoặc biển số" /></form><select class="toolbar-select" data-filter="orderStatus"><option value="ALL">Tất cả trạng thái</option>${["PENDING", "LOADING", "READY_FOR_EXIT", "SLIP_ISSUED", "COMPLETED", "CANCELLED"].map((value) => `<option value="${value}" ${state.filters.orderStatus === value ? "selected" : ""}>${labelFor(value)}</option>`).join("")}</select><button class="btn btn-secondary" data-action="toggle-order-view">${icon(state.orderView === "board" ? "logs" : "dashboard")} ${state.orderView === "board" ? "Dạng bảng" : "Dạng luồng"}</button></div>
    ${state.orderView === "board" ? renderOrderBoard(items) : renderOrderTable(items)}`;
}

function renderOrderBoard(items) {
  const columns = [
    ["PENDING", "Chờ tiếp nhận", ["PENDING"]],
    ["LOADING", "Đang tại dock", ["LOADING"]],
    ["READY_FOR_EXIT", "Chờ rời kho", ["READY_FOR_EXIT", "SLIP_ISSUED"]],
    ["COMPLETED", "Đã kết thúc", ["COMPLETED", "CANCELLED"]],
  ];
  if (!items.length) return `<div class="card">${emptyState("package", "Chưa có lệnh xuất kho", "Tạo lệnh mới sau khi tài xế và phương tiện đã được ủy quyền.")}</div>`;
  return `<div class="order-board">${columns
    .map(([status, title, statuses]) => {
      const columnItems = items.filter((item) => statuses.includes(item.status));
      return `<section class="order-column"><header class="order-column-header"><strong>${escapeHtml(title)}</strong><span class="count-pill">${columnItems.length}</span></header><div class="order-stack">${columnItems.map(renderOrderCard).join("") || `<div class="empty-state" style="min-height:130px;padding:20px 8px"><p>Không có lệnh</p></div>`}</div></section>`;
    })
    .join("")}</div>`;
}

function renderOrderCard(item) {
  const driver = driverById(item.assigned_driver_id);
  const vehicle = vehicleById(item.assigned_vehicle_id);
  return `<article class="order-card" data-action="view-order" data-id="${escapeHtml(item.order_id)}"><div class="order-card-head"><h3>${escapeHtml(item.order_id)}</h3>${statusBadge(item.status)}</div><div class="order-card-meta"><span>${icon("driver")} ${escapeHtml(driver?.full_name || shortId(item.assigned_driver_id))}</span><span>${icon("vehicle")} ${escapeHtml(vehicle?.plate_number || shortId(item.assigned_vehicle_id))}</span><span>${icon("clock")} Hết hạn ${escapeHtml(formatRelative(item.valid_until))}</span></div></article>`;
}

function renderOrderTable(items) {
  if (!items.length) return `<div class="card">${emptyState("package", "Không có lệnh phù hợp", "Thay đổi bộ lọc hoặc tạo một lệnh xuất kho mới.")}</div>`;
  return `<div class="table-shell"><div class="table-scroll"><table><thead><tr><th>Lệnh xuất kho</th><th>Tài xế</th><th>Phương tiện</th><th>Hiệu lực</th><th>Phiếu</th><th>Trạng thái</th><th></th></tr></thead><tbody>${items
    .map((item) => {
      const driver = driverById(item.assigned_driver_id);
      const vehicle = vehicleById(item.assigned_vehicle_id);
      return `<tr><td><div class="entity-cell"><div class="entity-avatar order">${icon("package")}</div><div class="entity-copy"><strong>${escapeHtml(item.order_id)}</strong><span>${item.cargo_metadata?.length || 0} dòng hàng</span></div></div></td><td>${escapeHtml(driver?.full_name || shortId(item.assigned_driver_id))}</td><td><span class="plate-number">${escapeHtml(vehicle?.plate_number || shortId(item.assigned_vehicle_id))}</span></td><td>${escapeHtml(formatDate(item.valid_from))}<br/><small>đến ${escapeHtml(formatDate(item.valid_until))}</small></td><td>Phiên bản ${item.slip_version || 0}</td><td>${statusBadge(item.status)}</td><td><button class="btn btn-ghost btn-icon" data-action="view-order" data-id="${escapeHtml(item.order_id)}">${icon("eye")}</button></td></tr>`;
    })
    .join("")}</tbody></table></div></div>`;
}

function renderDocks() {
  if (!state.docks.length) {
    return `<div class="card">${emptyState("warehouse", "Chưa có phiên kiểm hàng", "Phiên dock được tạo từ một lệnh PENDING sau khi Gate In đạt.")}</div>`;
  }
  return `<div class="grid grid-3">${state.docks
    .map((dock) => {
      const order = state.orders.find((item) => item.order_id === dock.order_id);
      const vehicle = vehicleById(order?.assigned_vehicle_id);
      return `<article class="card"><div class="card-body"><div class="order-card-head"><div><div class="eyebrow">Phiên kiểm hàng</div><h3 style="margin:0;font-family:var(--font-display);font-size:23px">${escapeHtml(dock.order_id)}</h3></div>${statusBadge(dock.status)}</div><div class="info-list" style="margin-top:12px"><div class="info-row"><span>Phương tiện</span><strong>${escapeHtml(vehicle?.plate_number || "—")}</strong></div><div class="info-row"><span>Trạng thái hàng</span><strong>${escapeHtml(labelFor(dock.current_cargo_state))}</strong></div><div class="info-row"><span>Số lần chụp</span><strong>${dock.capture_count}</strong></div></div><button class="btn btn-secondary btn-block" style="margin-top:14px" data-action="view-dock" data-id="${dock.id}">${icon("eye")} Mở phiên kiểm hàng</button></div></article>`;
    })
    .join("")}</div>`;
}

function renderGates() {
  const isEntry = state.gateTab === "entry";
  const result = state.verificationResults[state.gateTab];
  const tabs = `<button class="btn ${isEntry ? "btn-primary" : "btn-secondary"}" data-action="gate-tab" data-tab="entry">${icon("gate")} Gate In</button><button class="btn ${!isEntry ? "btn-primary" : "btn-secondary"}" data-action="gate-tab" data-tab="exit">${icon("logout")} Gate Out</button>`;
  return `${pageHeader("Xác minh có hỗ trợ AI", isEntry ? "Xác minh cổng vào" : "Xác minh cổng ra", isEntry ? "Đối chiếu khuôn mặt, biển số và quan hệ ủy quyền đang hiệu lực." : "Đối chiếu ba chiều giữa QR đã ký, khuôn mặt, biển số và lệnh nội bộ.", tabs)}
    <div class="verification-layout"><section class="card verification-panel">${renderGateForm(isEntry)}</section><aside class="verification-side"><section class="card verification-result">${renderVerificationResult(result)}</section>${renderGateGuidance(isEntry)}</aside></div>`;
}

function renderGateForm(isEntry) {
  const prefix = isEntry ? "entry" : "exit";
  const slipOrders = state.orders.filter((item) => item.status === "SLIP_ISSUED");
  return `<form data-form="gate-${prefix}">
    <div class="field-row"><div class="field"><label for="gate-${prefix}-event">Event ID chống lặp</label><input id="gate-${prefix}-event" name="event_id" value="${escapeHtml(uniqueEventId(prefix))}" minlength="8" maxlength="128" required /><span class="field-hint">Giữ nguyên ID khi retry cùng một sự kiện.</span></div><div class="field"><label for="gate-${prefix}-id">Mã cổng</label><input id="gate-${prefix}-id" name="gate_id" value="${isEntry ? "gate-in-01" : "gate-out-01"}" required /></div></div>
    <div class="capture-grid ${isEntry ? "" : "three"}">
      ${fileDrop(`gate-${prefix}-plate`, "plate_image", "Ảnh biển số", "Ưu tiên khung hình chính diện", "environment", true, "plate")}
      ${fileDrop(`gate-${prefix}-face`, "face_image", "Ảnh khuôn mặt", "Khuôn mặt rõ, đủ sáng", "user", true, "face")}
      ${!isEntry ? fileDrop("gate-exit-slip", "slip_image", "QR phiếu xuất kho", "Ảnh QR đầy đủ bốn góc", "environment") : ""}
    </div>
    ${!isEntry && slipOrders.length ? `<div class="field-row" style="margin-bottom:16px"><div class="field"><label for="gate-slip-order">Lấy QR từ lệnh đã cấp</label><select id="gate-slip-order"><option value="">Chọn lệnh xuất kho</option>${slipOrders.map((item) => `<option value="${escapeHtml(item.order_id)}">${escapeHtml(item.order_id)} · ${escapeHtml(vehicleById(item.assigned_vehicle_id)?.plate_number || "")}</option>`).join("")}</select></div><div class="field" style="align-content:end"><button class="btn btn-secondary" type="button" data-action="load-order-qr">${icon("qr")} Nạp QR của lệnh</button></div></div>` : ""}
    <button class="btn btn-primary btn-block" type="submit">${icon("shield")} ${isEntry ? "Xác minh và yêu cầu mở Gate In" : "Xác minh ba chiều và yêu cầu mở Gate Out"}</button>
  </form>`;
}

function fileDrop(id, name, title, hint, facingMode, cameraButton = true, demoType = null) {
  return `<div class="file-drop" data-drop-for="${id}"><input id="${id}" name="${name}" type="file" accept="image/*" capture="${facingMode}" required /><img class="file-drop-preview" data-preview-for="${id}" alt="" hidden /><div class="file-drop-content"><div class="file-drop-icon">${icon("camera")}</div><strong data-file-title>${escapeHtml(title)}</strong><span data-file-hint>${escapeHtml(hint)}</span><div style="display:flex;flex-wrap:wrap;justify-content:center;gap:7px;margin-top:12px"><label class="btn btn-secondary" for="${id}">${icon("upload")} Chọn ảnh</label>${cameraButton ? `<button class="btn btn-secondary" type="button" data-action="open-camera" data-target="${id}" data-facing="${facingMode}">${icon("camera")} Camera</button>` : ""}${demoType ? `<button class="btn btn-secondary" type="button" data-action="load-demo-image" data-target="${id}" data-demo-type="${demoType}">${icon("package")} Ảnh mẫu</button>` : ""}</div></div></div>`;
}

function renderVerificationResult(result) {
  if (!result) {
    return `<div class="result-idle"><div class="radar"><i class="radar-line"></i></div><strong>Đang chờ dữ liệu xác minh</strong><p>Tải ảnh hoặc chụp trực tiếp từ camera để bắt đầu.</p></div>`;
  }
  const passed = result.verification_status === "PASSED";
  const trulyOpened = result.permit_granted && result.barrier_status === "OPENED";
  const resolvedDriver = driverById(result.driver_id);
  const resolvedVehicle = vehicleById(result.vehicle_id);
  return `<div class="result-hero"><div class="result-symbol ${passed ? "passed" : "failed"}">${icon(passed ? "check" : "x")}</div><h3>${trulyOpened ? "Đã mở cổng" : passed ? "Xác minh đạt · cổng chưa mở" : "Từ chối qua cổng"}</h3><p>${trulyOpened ? "Barrier đã ACK lệnh mở an toàn." : passed ? `Barrier: ${labelFor(result.barrier_status)}` : "Hệ thống giữ cổng đóng và đã lưu sự kiện."}</p></div>
    <div class="score-grid"><div class="score-item"><strong>${formatPercent(result.face_similarity)}</strong><span>Khuôn mặt</span></div><div class="score-item"><strong>${formatPercent(result.plate_score)}</strong><span>Biển số</span></div><div class="score-item"><strong>${formatPercent(result.verification_score)}</strong><span>Tổng hợp</span></div></div>
    <div class="info-list" style="margin-top:12px"><div class="info-row"><span>Biển số quan sát</span><strong><span class="plate-number">${escapeHtml(result.observed_plate || "—")}</span></strong></div><div class="info-row"><span>Tài xế đã đối chiếu</span><strong>${escapeHtml(resolvedDriver?.full_name || result.driver_id || "—")}</strong></div><div class="info-row"><span>Phương tiện đã đối chiếu</span><strong>${escapeHtml(resolvedVehicle?.plate_number || result.vehicle_id || "—")}</strong></div><div class="info-row"><span>Lệnh xuất kho</span><strong>${escapeHtml(result.order_id || "—")}</strong></div><div class="info-row"><span>Event ID</span><strong>${escapeHtml(result.event_id)}</strong></div></div>
    <div class="reason-list">${(result.reason_codes?.length ? result.reason_codes : ["VERIFIED_WITHOUT_MISMATCH"]).map((code) => `<span class="reason-chip">${escapeHtml(code)}</span>`).join("")}</div>`;
}

function renderGateGuidance(isEntry) {
  const steps = isEntry
    ? [["camera", "Chụp dữ liệu", "Hai ảnh độc lập cho khuôn mặt và biển số."], ["shield", "Đối chiếu", "Face ≥ 0.75, plate exact/fuzzy duy nhất, cặp đã ủy quyền."], ["gate", "Barrier ACK", "Chỉ hiển thị đã mở khi thiết bị trả xác nhận."]]
    : [["qr", "Kiểm chữ ký QR", "Xác minh kid, JTI, phiên bản và thời hạn Ed25519."], ["shield", "Khớp ba chiều", "QR = khuôn mặt/biển số live = lệnh nội bộ."], ["logout", "Hoàn tất lệnh", "Order chỉ COMPLETED sau khi barrier ACK."]];
  return `<section class="card"><header class="card-header"><div><h3>Chuỗi kiểm soát</h3><p>Hệ thống luôn fail-closed</p></div></header><div class="card-body"><div class="timeline">${steps.map(([iconName, title, text]) => `<div class="timeline-item"><div class="timeline-dot">${icon(iconName)}</div><div class="timeline-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div></div>`).join("")}</div></div></section>`;
}

function renderGateLogs() {
  let items = state.gateLogs;
  const query = (state.search.logs || "").toLowerCase();
  if (query) items = items.filter((item) => [item.event_id, item.observed_plate, item.order_id, ...(item.reason_codes || [])].some((value) => String(value || "").toLowerCase().includes(query)));
  if (state.filters.logDirection !== "ALL") items = items.filter((item) => item.direction === state.filters.logDirection);
  if (state.filters.logStatus !== "ALL") items = items.filter((item) => item.verification_status === state.filters.logStatus);
  return `${pageHeader("Dấu vết kiểm toán", "Nhật ký xác minh cổng", "Truy vết điểm số, model, reason code, ảnh bằng chứng và trạng thái barrier.", `<button class="btn btn-secondary" data-action="reload-gate-logs">${icon("refresh")} Tải mới</button>`)}
    <div class="search-toolbar"><form class="search-box" data-form="search" data-key="logs">${icon("search")}<input name="query" value="${escapeHtml(state.search.logs || "")}" placeholder="Tìm event, biển số, order hoặc reason code" /></form><select class="toolbar-select" data-filter="logDirection"><option value="ALL">Cả hai chiều</option><option value="ENTRY" ${state.filters.logDirection === "ENTRY" ? "selected" : ""}>Cổng vào</option><option value="EXIT" ${state.filters.logDirection === "EXIT" ? "selected" : ""}>Cổng ra</option></select><select class="toolbar-select" data-filter="logStatus"><option value="ALL">Mọi kết quả</option><option value="PASSED" ${state.filters.logStatus === "PASSED" ? "selected" : ""}>Đạt</option><option value="FAILED" ${state.filters.logStatus === "FAILED" ? "selected" : ""}>Không đạt</option></select></div>
    <div class="table-shell">${items.length ? `<div class="table-scroll"><table><thead><tr><th>Thời gian / Event</th><th>Chiều</th><th>Biển số</th><th>Điểm xác minh</th><th>Kết quả</th><th>Barrier</th><th>Lý do</th><th></th></tr></thead><tbody>${items.map(renderGateLogRow).join("")}</tbody></table></div>` : emptyState("logs", "Không có nhật ký phù hợp", "Thay đổi bộ lọc hoặc thực hiện một lượt xác minh tại cổng.")}</div>`;
}

function renderGateLogRow(item) {
  return `<tr><td><div class="entity-copy"><strong>${escapeHtml(formatDate(item.occurred_at))}</strong><span title="${escapeHtml(item.event_id)}">${escapeHtml(shortId(item.event_id, 18))}</span></div></td><td>${statusBadge(item.direction)}</td><td><span class="plate-number">${escapeHtml(item.observed_plate || "—")}</span></td><td><strong>${formatPercent(item.verification_score)}</strong><br/><small>Face ${formatPercent(item.face_similarity)} · Plate ${formatPercent(item.plate_score)}</small></td><td>${statusBadge(item.verification_status)}</td><td>${statusBadge(item.barrier_status)}</td><td><span title="${escapeHtml((item.reason_codes || []).join(", "))}">${escapeHtml(shortId((item.reason_codes || []).join(", ") || "Không sai lệch", 28))}</span></td><td><button class="btn btn-ghost btn-icon" data-action="view-gate-log" data-id="${item.id}">${icon("eye")}</button></td></tr>`;
}

function renderAlerts() {
  let items = [...state.alerts].sort((a, b) => b.sequence - a.sequence);
  if (state.filters.alertSeverity !== "ALL") items = items.filter((item) => item.severity === state.filters.alertSeverity);
  if (state.filters.alertStatus !== "ALL") items = items.filter((item) => item.status === state.filters.alertStatus);
  return `${pageHeader("An ninh thời gian thực", "Trung tâm cảnh báo", "WebSocket đẩy cảnh báo tức thời; REST sequence giúp đồng bộ lại sau mất kết nối.", `<button class="btn btn-secondary" data-action="reload-alerts">${icon("refresh")} Đồng bộ cảnh báo</button>`)}
    <div class="search-toolbar"><select class="toolbar-select" data-filter="alertSeverity"><option value="ALL">Mọi mức độ</option>${["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((value) => `<option value="${value}" ${state.filters.alertSeverity === value ? "selected" : ""}>${labelFor(value)}</option>`).join("")}</select><select class="toolbar-select" data-filter="alertStatus"><option value="ALL">Mọi trạng thái</option>${["OPEN", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"].map((value) => `<option value="${value}" ${state.filters.alertStatus === value ? "selected" : ""}>${labelFor(value)}</option>`).join("")}</select></div>
    <div class="alert-grid"><section>${items.length ? `<div class="alert-list">${items.map(renderAlertCard).join("")}</div>` : `<div class="card">${emptyState("shield", "Không có cảnh báo", "Không có sự kiện phù hợp với bộ lọc hiện tại.")}</div>`}</section><aside class="card socket-panel"><header class="card-header"><div><h3>Kênh thời gian thực</h3><p>WebSocket bảo vệ bằng session</p></div></header><div class="card-body"><div class="socket-visual">${icon("radio")}<strong data-socket-state>${state.socketStatus === "connected" ? "Đang nhận tín hiệu" : state.socketStatus === "connecting" ? "Đang kết nối" : "Mất kết nối"}</strong><span>Sequence mới nhất #${Math.max(0, ...state.alerts.map((item) => item.sequence || 0))}</span></div><div class="info-list" style="margin-top:12px"><div class="info-row"><span>Cảnh báo đang mở</span><strong>${openAlertCount()}</strong></div><div class="info-row"><span>Tổng sự kiện đã tải</span><strong>${state.alerts.length}</strong></div><div class="info-row"><span>Cơ chế phục hồi</span><strong>REST resync</strong></div></div></div></aside></div>`;
}

function renderAlertCard(item) {
  const canAcknowledge = item.status === "OPEN";
  const canResolve = ["OPEN", "ACKNOWLEDGED"].includes(item.status);
  return `<article class="alert-card" data-severity="${item.severity}"><i class="alert-stripe"></i><div class="alert-icon">${icon("alert")}</div><div class="alert-copy"><strong>${escapeHtml(item.message)}</strong><p>${escapeHtml(item.alert_type)}</p><div class="alert-meta">${statusBadge(item.severity)}${statusBadge(item.status)}<span>#${item.sequence}</span><span>${escapeHtml(formatRelative(item.occurred_at))}</span></div></div><div class="alert-actions">${canAcknowledge ? `<button class="btn btn-secondary" data-action="update-alert" data-id="${item.id}" data-status="ACKNOWLEDGED">Tiếp nhận</button>` : ""}${canResolve ? `<button class="btn btn-primary" data-action="update-alert" data-id="${item.id}" data-status="RESOLVED">Đã xử lý</button><button class="btn btn-ghost btn-icon" data-action="update-alert" data-id="${item.id}" data-status="FALSE_POSITIVE" title="Đánh dấu cảnh báo giả">${icon("x")}</button>` : ""}</div></article>`;
}

function renderSystem() {
  const liveOk = state.health.live === "ok";
  const readyOk = state.health.ready === "ready";
  return `${pageHeader("Giám sát hệ thống", "Trạng thái hệ thống", "Kiểm tra nhanh API, cơ sở dữ liệu và các điểm tích hợp vận hành.", `<button class="btn btn-secondary" data-action="check-health">${icon("refresh")} Kiểm tra lại</button><a class="btn btn-primary" href="/docs" target="_blank" rel="noreferrer">${icon("external")} Swagger API</a>`)}
    <section class="grid grid-3"><article class="card"><div class="card-body"><div class="kpi-top"><div class="kpi-icon ${liveOk ? "mint" : "coral"}">${icon("radio")}</div>${statusBadge(liveOk ? "ACTIVE" : "INACTIVE")}</div><div class="kpi-value" style="font-size:28px">API trực tuyến</div><div class="kpi-label">${liveOk ? "FastAPI đang nhận yêu cầu" : "Không nhận được tín hiệu liveness"}</div></div></article><article class="card"><div class="card-body"><div class="kpi-top"><div class="kpi-icon ${readyOk ? "mint" : "coral"}">${icon("system")}</div>${statusBadge(readyOk ? "ACTIVE" : "INACTIVE")}</div><div class="kpi-value" style="font-size:28px">MongoDB sẵn sàng</div><div class="kpi-label">${readyOk ? "Replica set sẵn sàng truy vấn" : "Cơ sở dữ liệu chưa sẵn sàng"}</div></div></article><article class="card"><div class="card-body"><div class="kpi-top"><div class="kpi-icon amber">${icon("radio")}</div>${statusBadge(state.socketStatus === "connected" ? "ACTIVE" : "INACTIVE")}</div><div class="kpi-value" style="font-size:28px">Luồng cảnh báo</div><div class="kpi-label">${state.socketStatus === "connected" ? "WebSocket đang kết nối" : canManageSecurity() ? "WebSocket đang khôi phục" : "Vai trò không sử dụng kênh cảnh báo"}</div></div></article></section>
    <section class="grid grid-2" style="margin-top:18px"><article class="card"><header class="card-header"><div><h2>Điểm truy cập nội bộ</h2><p>Các dịch vụ được Docker Compose công bố</p></div></header><div class="card-body"><div class="info-list">${endpointRow("Giao diện điều hành", location.origin, true)}${endpointRow("OpenAPI / Swagger", `${location.origin}/docs`, true)}${endpointRow("MinIO Console", `${location.protocol}//${location.hostname}:9001`, true)}${endpointRow("Barrier Simulator", `${location.protocol}//${location.hostname}:18080`, true)}${endpointRow("Camera Simulator", `${location.protocol}//${location.hostname}:18081`, true)}</div></div></article><article class="card"><header class="card-header"><div><h2>Nguyên tắc an toàn</h2><p>Các bảo đảm được duy trì xuyên suốt quy trình</p></div></header><div class="card-body"><div class="timeline"><div class="timeline-item"><div class="timeline-dot">${icon("shield")}</div><div class="timeline-copy"><strong>Session HttpOnly + CSRF</strong><span>Giao diện không lưu session token trong localStorage.</span></div></div><div class="timeline-item"><div class="timeline-dot">${icon("gate")}</div><div class="timeline-copy"><strong>Barrier ACK bắt buộc</strong><span>Kết quả AI không thể trực tiếp mở cổng.</span></div></div><div class="timeline-item"><div class="timeline-dot">${icon("qr")}</div><div class="timeline-copy"><strong>QR ký Ed25519</strong><span>Token giả, hết hạn hoặc replay đều bị từ chối.</span></div></div></div></div></article></section>`;
}

function endpointRow(label, url, link) {
  return `<div class="info-row"><span>${escapeHtml(label)}</span><strong>${link ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)} ${icon("external")}</a>` : escapeHtml(url)}</strong></div>`;
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

async function restoreSession() {
  try {
    const user = await api.get("/api/v1/auth/me", { skipUnauthorizedEvent: true });
    state.user = user;
    api.setCsrfToken(user.csrf_token);
    await loadAllData();
    connectWebSocket();
  } catch (error) {
    state.user = null;
    api.setCsrfToken(null);
    renderLogin();
    if (!(error instanceof ApiError) || error.status !== 401) showError(error);
  }
}

async function loadAllData({ showLoading = true } = {}) {
  if (!state.user) return;
  if (showLoading) {
    state.loading = true;
    renderShell();
  }
  const requests = [
    ["drivers", api.get("/api/v1/drivers")],
    ["vehicles", api.get("/api/v1/vehicles")],
    ["authorizations", api.get("/api/v1/driver-vehicle-authorizations")],
    ["orders", api.get("/api/v1/warehouse/orders")],
    ["docks", api.get("/api/v1/warehouse/dock-sessions?limit=200")],
    ["gateLogs", api.get("/api/v1/gate-logs?limit=300")],
  ];
  if (canManageSecurity()) requests.push(["alerts", api.get("/api/v1/security/alerts?after_sequence=0&limit=1000")]);
  const settled = await Promise.allSettled(requests.map(([, promise]) => promise));
  settled.forEach((result, index) => {
    const key = requests[index][0];
    if (result.status === "fulfilled") state[key] = result.value;
  });
  await checkHealth(false);
  state.loading = false;
  renderShell();
}

async function checkHealth(shouldRender = true) {
  const [live, ready] = await Promise.allSettled([api.get("/health/live"), api.get("/health/ready")]);
  state.health.live = live.status === "fulfilled" ? live.value.status : "down";
  state.health.ready = ready.status === "fulfilled" ? ready.value.status : "not_ready";
  if (shouldRender && state.user) renderShell();
}

async function reloadGateLogs() {
  state.gateLogs = await api.get("/api/v1/gate-logs?limit=300");
  renderShell();
}

async function reloadAlerts(afterSequence = 0) {
  if (!canManageSecurity()) return;
  const incoming = await api.get(`/api/v1/security/alerts?after_sequence=${afterSequence}&limit=1000`);
  if (afterSequence === 0) {
    state.alerts = incoming;
  } else {
    const merged = new Map(state.alerts.map((item) => [item.id, item]));
    incoming.forEach((item) => merged.set(item.id, item));
    state.alerts = [...merged.values()];
  }
  renderShell();
}

function connectWebSocket() {
  disconnectWebSocket();
  if (!state.user || !canManageSecurity()) return;
  state.socketStatus = "connecting";
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws/v1/security/alerts`);
  state.socket = socket;
  socket.addEventListener("open", () => {
    state.socketStatus = "connected";
    updateSocketStatus();
    if (["/dashboard", "/alerts"].includes(state.route) && !modalRoot.innerHTML) renderShell();
    state.socketTimer = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
    }, 25000);
  });
  socket.addEventListener("message", async (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "pong") return;
      await reloadAlertsWithoutRender();
      if (["/dashboard", "/alerts"].includes(state.route) && !modalRoot.innerHTML) renderShell();
      showToast("Có cảnh báo an ninh mới vừa được ghi nhận.", "warning", "Tín hiệu thời gian thực");
    } catch (error) {
      console.warn("Không thể xử lý thông điệp WebSocket", error);
    }
  });
  socket.addEventListener("close", () => {
    if (state.socket !== socket) return;
    clearInterval(state.socketTimer);
    state.socket = null;
    state.socketStatus = "offline";
    updateSocketStatus();
    if (["/dashboard", "/alerts"].includes(state.route) && !modalRoot.innerHTML) renderShell();
    if (state.user && canManageSecurity()) {
      state.reconnectTimer = window.setTimeout(connectWebSocket, 3500);
    }
  });
  socket.addEventListener("error", () => socket.close());
}

function disconnectWebSocket() {
  clearTimeout(state.reconnectTimer);
  clearInterval(state.socketTimer);
  if (state.socket) {
    state.socket.onclose = null;
    state.socket.close();
  }
  state.socket = null;
  state.socketStatus = "offline";
}

function updateSocketStatus() {
  const node = document.querySelector("[data-socket-state]");
  if (node) node.textContent = state.socketStatus === "connected" ? "Đang nhận tín hiệu" : state.socketStatus === "connecting" ? "Đang kết nối" : "Mất kết nối";
}

function openDriverModal(driverId = null, readOnly = false) {
  const driver = driverId ? driverById(driverId) : null;
  openModal({
    title: readOnly ? "Chi tiết tài xế" : driver ? "Cập nhật tài xế" : "Đăng ký tài xế",
    subtitle: driver ? `Hồ sơ ${driver.full_name}` : "Ảnh khuôn mặt sẽ được trích xuất embedding tại backend",
    body: `<form id="driver-form" data-form="driver-save" data-id="${escapeHtml(driver?.id || "")}"><div class="form-section"><div class="form-section-title">${icon("driver")} Thông tin nhận diện</div><div class="field"><label>Họ và tên</label><input name="full_name" value="${escapeHtml(driver?.full_name || "")}" minlength="2" maxlength="200" ${readOnly ? "disabled" : "required"} /></div><div class="field-row" style="margin-top:14px"><div class="field"><label>Mã nhân viên</label><input name="employee_code" value="${escapeHtml(driver?.employee_code || "")}" maxlength="64" ${readOnly ? "disabled" : ""} /></div><div class="field"><label>Số điện thoại</label><input name="phone" value="${escapeHtml(driver?.phone || "")}" maxlength="32" ${readOnly ? "disabled" : ""} /></div></div></div>${readOnly ? `<div class="detail-grid"><div class="detail-box"><span>Mô hình</span><strong>${escapeHtml(driver.face_model)}</strong></div><div class="detail-box"><span>Embedding</span><strong>${escapeHtml(driver.embedding_version)}</strong></div><div class="detail-box"><span>Enrollment</span><strong>${escapeHtml(formatDate(driver.enrolled_at))}</strong></div><div class="detail-box"><span>Trạng thái</span><strong>${labelFor(driver.status)}</strong></div></div>` : `<div class="form-section"><div class="form-section-title">${icon("camera")} Ảnh enrollment ${driver ? "(không bắt buộc khi cập nhật)" : ""}</div>${fileDrop("driver-face-image", "face_image", driver ? "Chọn ảnh mới nếu cần" : "Ảnh khuôn mặt chính diện", "Một khuôn mặt, đủ sáng, không che khuất", "user", false, "face")}</div>`}</form>`,
    footer: readOnly ? `<button class="btn btn-primary" data-action="close-modal">Đóng</button>` : `<button class="btn btn-secondary" data-action="close-modal">Hủy</button><button class="btn btn-primary" type="submit" form="driver-form">${icon("check")} ${driver ? "Lưu thay đổi" : "Tạo hồ sơ"}</button>`,
  });
  if (driver) modalRoot.querySelector("#driver-face-image")?.removeAttribute("required");
}

function openVehicleModal(vehicleId = null, readOnly = false) {
  const vehicle = vehicleId ? vehicleById(vehicleId) : null;
  openModal({
    title: readOnly ? "Chi tiết phương tiện" : vehicle ? "Cập nhật phương tiện" : "Thêm phương tiện",
    subtitle: "Biển số sẽ được chuẩn hóa tự động để phục vụ đối chiếu",
    body: `<form id="vehicle-form" data-form="vehicle-save" data-id="${escapeHtml(vehicle?.id || "")}"><div class="field-row"><div class="field"><label>Biển số</label><input name="plate_number" value="${escapeHtml(vehicle?.plate_number || "")}" minlength="4" maxlength="32" ${readOnly ? "disabled" : "required"} placeholder="30A-123.45" /></div><div class="field"><label>Loại phương tiện</label><input name="vehicle_type" value="${escapeHtml(vehicle?.vehicle_type || "truck")}" minlength="2" maxlength="64" ${readOnly ? "disabled" : "required"} /></div></div><div class="field-row three" style="margin-top:14px"><div class="field"><label>Hãng xe</label><input name="make" value="${escapeHtml(vehicle?.make || "")}" ${readOnly ? "disabled" : ""} /></div><div class="field"><label>Model</label><input name="model" value="${escapeHtml(vehicle?.model || "")}" ${readOnly ? "disabled" : ""} /></div><div class="field"><label>Màu sắc</label><input name="color" value="${escapeHtml(vehicle?.color || "")}" ${readOnly ? "disabled" : ""} /></div></div>${readOnly ? `<div class="detail-grid" style="margin-top:18px"><div class="detail-box"><span>Biển số chuẩn hóa</span><strong>${escapeHtml(vehicle.plate_normalized)}</strong></div><div class="detail-box"><span>Trạng thái</span><strong>${labelFor(vehicle.status)}</strong></div></div>` : ""}</form>`,
    footer: readOnly ? `<button class="btn btn-primary" data-action="close-modal">Đóng</button>` : `<button class="btn btn-secondary" data-action="close-modal">Hủy</button><button class="btn btn-primary" type="submit" form="vehicle-form">${icon("check")} ${vehicle ? "Lưu thay đổi" : "Thêm phương tiện"}</button>`,
  });
}

function openAuthorizationModal() {
  const drivers = state.drivers.filter((item) => item.status === "ACTIVE");
  const vehicles = state.vehicles.filter((item) => item.status === "ACTIVE");
  const now = new Date();
  const until = new Date(now.getTime() + 8 * 3600000);
  openModal({
    title: "Tạo quan hệ ủy quyền",
    subtitle: "Khoảng hiệu lực không được chồng lấn với ủy quyền đang hoạt động",
    body: `<form id="authorization-form" data-form="authorization-save"><div class="field-row"><div class="field"><label>Tài xế</label><select name="driver_id" required><option value="">Chọn tài xế</option>${drivers.map((item) => `<option value="${item.id}">${escapeHtml(item.full_name)}${item.employee_code ? ` · ${escapeHtml(item.employee_code)}` : ""}</option>`).join("")}</select></div><div class="field"><label>Phương tiện</label><select name="vehicle_id" required><option value="">Chọn phương tiện</option>${vehicles.map((item) => `<option value="${item.id}">${escapeHtml(item.plate_number)} · ${escapeHtml(item.vehicle_type)}</option>`).join("")}</select></div></div><div class="field-row" style="margin-top:14px"><div class="field"><label>Hiệu lực từ</label><input name="valid_from" type="datetime-local" value="${toLocalInput(now)}" required /></div><div class="field"><label>Hiệu lực đến</label><input name="valid_until" type="datetime-local" value="${toLocalInput(until)}" /><span class="field-hint">Có thể để trống nếu không giới hạn.</span></div></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">Hủy</button><button class="btn btn-primary" type="submit" form="authorization-form">${icon("authorization")} Cấp ủy quyền</button>`,
  });
}

function openOrderModal(orderId = null) {
  const order = orderId ? state.orders.find((item) => item.order_id === orderId) : null;
  const now = new Date(Date.now() - 5 * 60000);
  const until = new Date(Date.now() + 8 * 3600000);
  const cargo = order?.cargo_metadata?.length ? order.cargo_metadata : [{ sku: "", quantity: 1 }];
  openModal({
    title: order ? "Cập nhật lệnh xuất kho" : "Tạo lệnh xuất kho",
    subtitle: "Tài xế và phương tiện phải có ủy quyền hiệu lực tại valid_from",
    wide: true,
    body: `<form id="order-form" data-form="order-save" data-id="${escapeHtml(order?.order_id || "")}"><div class="form-section"><div class="form-section-title">${icon("package")} Thông tin lệnh</div><div class="field-row three"><div class="field"><label>Mã lệnh</label><input name="order_id" value="${escapeHtml(order?.order_id || `ORD-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`)}" minlength="3" maxlength="128" ${order ? "disabled" : "required"} /></div><div class="field"><label>Tài xế</label><select name="assigned_driver_id" required>${state.drivers.filter((item) => item.status === "ACTIVE").map((item) => `<option value="${item.id}" ${order?.assigned_driver_id === item.id ? "selected" : ""}>${escapeHtml(item.full_name)}</option>`).join("")}</select></div><div class="field"><label>Phương tiện</label><select name="assigned_vehicle_id" required>${state.vehicles.filter((item) => item.status === "ACTIVE").map((item) => `<option value="${item.id}" ${order?.assigned_vehicle_id === item.id ? "selected" : ""}>${escapeHtml(item.plate_number)}</option>`).join("")}</select></div></div><div class="field-row" style="margin-top:14px"><div class="field"><label>Hiệu lực từ</label><input name="valid_from" type="datetime-local" value="${toLocalInput(order?.valid_from || now)}" required /></div><div class="field"><label>Hiệu lực đến</label><input name="valid_until" type="datetime-local" value="${toLocalInput(order?.valid_until || until)}" required /></div></div></div><div class="form-section"><div class="form-section-title">${icon("package")} Danh sách hàng hóa</div><div class="json-items" data-cargo-items>${cargo.map(renderCargoRow).join("")}</div><button class="btn btn-ghost" type="button" data-action="add-cargo-row" style="margin-top:10px">${icon("plus")} Thêm dòng hàng</button></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">Hủy</button><button class="btn btn-primary" type="submit" form="order-form">${icon("check")} ${order ? "Lưu thay đổi" : "Tạo lệnh"}</button>`,
  });
}

function renderCargoRow(item = {}) {
  return `<div class="json-item-row cargo-row"><input name="cargo_sku" value="${escapeHtml(item.sku || item.name || "")}" placeholder="SKU / Tên hàng" required /><input name="cargo_quantity" type="number" min="0" step="0.01" value="${escapeHtml(item.quantity ?? 1)}" placeholder="Số lượng" required /><button class="btn btn-danger btn-icon" type="button" data-action="remove-cargo-row" aria-label="Xóa dòng">${icon("trash")}</button></div>`;
}

function openOrderDetail(orderId) {
  const order = state.orders.find((item) => item.order_id === orderId);
  if (!order) return;
  const driver = driverById(order.assigned_driver_id);
  const vehicle = vehicleById(order.assigned_vehicle_id);
  const dock = dockById(order.dock_session_id);
  const actions = [];
  if (canManageWarehouse() && order.status === "PENDING") {
    actions.push(`<button class="btn btn-secondary" data-action="edit-order" data-id="${escapeHtml(order.order_id)}">${icon("edit")} Chỉnh sửa</button>`);
    actions.push(`<button class="btn btn-primary" data-action="start-dock" data-id="${escapeHtml(order.order_id)}">${icon("warehouse")} Bắt đầu kiểm hàng</button>`);
    actions.push(`<button class="btn btn-danger" data-action="cancel-order" data-id="${escapeHtml(order.order_id)}">Hủy lệnh</button>`);
  }
  if (order.status === "LOADING" && dock) actions.push(`<button class="btn btn-primary" data-action="view-dock" data-id="${dock.id}">${icon("warehouse")} Mở phiên dock</button>`);
  if (canManageWarehouse() && order.status === "READY_FOR_EXIT") actions.push(`<button class="btn btn-accent" data-action="issue-slip" data-id="${escapeHtml(order.order_id)}">${icon("qr")} Phát hành Exit Slip</button>`);
  if (order.status === "SLIP_ISSUED") {
    actions.push(`<button class="btn btn-secondary" data-action="preview-slip" data-id="${escapeHtml(order.order_id)}">${icon("qr")} Xem QR</button>`);
    actions.push(`<button class="btn btn-secondary" data-action="download-slip" data-id="${escapeHtml(order.order_id)}" data-type="pdf">${icon("download")} Tải PDF</button>`);
    if (canManageWarehouse()) actions.push(`<button class="btn btn-primary" data-action="reissue-slip" data-id="${escapeHtml(order.order_id)}">Cấp lại phiếu</button>`);
  }
  openModal({
    title: order.order_id,
    subtitle: `Lệnh xuất kho · ${labelFor(order.status)}`,
    wide: true,
    body: `<div class="detail-grid"><div class="detail-box"><span>Tài xế</span><strong>${escapeHtml(driver?.full_name || order.assigned_driver_id)}</strong></div><div class="detail-box"><span>Phương tiện</span><strong>${escapeHtml(vehicle?.plate_number || order.assigned_vehicle_id)}</strong></div><div class="detail-box"><span>Hiệu lực</span><strong>${escapeHtml(formatDate(order.valid_from))}</strong></div><div class="detail-box"><span>Hết hạn</span><strong>${escapeHtml(formatDate(order.valid_until))}</strong></div><div class="detail-box"><span>Phiên dock</span><strong>${escapeHtml(order.dock_session_id || "Chưa tạo")}</strong></div><div class="detail-box"><span>Phiên bản phiếu</span><strong>${order.slip_version || 0}</strong></div></div><div class="form-section" style="margin-top:22px"><div class="form-section-title">${icon("package")} Hàng hóa</div>${order.cargo_metadata?.length ? `<div class="table-shell"><table><thead><tr><th>SKU / Tên hàng</th><th>Số lượng</th></tr></thead><tbody>${order.cargo_metadata.map((item) => `<tr><td>${escapeHtml(item.sku || item.name || JSON.stringify(item))}</td><td>${escapeHtml(item.quantity ?? "—")}</td></tr>`).join("")}</tbody></table></div>` : `<p>Không có metadata hàng hóa.</p>`}</div><div class="form-section"><div class="form-section-title">${icon("logs")} Tiến trình</div>${renderOrderProgress(order.status)}</div>`,
    footer: `<button class="btn btn-ghost" data-action="close-modal">Đóng</button>${actions.join("")}`,
  });
}

function renderOrderProgress(status) {
  const steps = ["PENDING", "LOADING", "READY_FOR_EXIT", "SLIP_ISSUED", "COMPLETED"];
  const current = steps.indexOf(status);
  return `<div class="workflow-strip" style="grid-template-columns:repeat(5,1fr)">${steps.map((step, index) => `<div class="workflow-step" style="min-height:86px;padding:13px"><span>0${index + 1}</span><strong style="font-size:13px;color:${index <= current ? "var(--ink-900)" : "rgba(16,44,43,.3)"}">${escapeHtml(labelFor(step))}</strong></div>`).join("")}</div>`;
}

function openDockDetail(dockId) {
  const dock = dockById(dockId);
  if (!dock) return;
  const order = state.orders.find((item) => item.order_id === dock.order_id);
  const actions = [];
  if (canManageWarehouse() && ["ACTIVE", "REVIEW_REQUIRED"].includes(dock.status)) {
    actions.push(`<button class="btn btn-secondary" data-action="open-dock-capture" data-id="${dock.id}">${icon("camera")} Ghi nhận ảnh hàng</button>`);
    actions.push(`<button class="btn btn-primary" data-action="open-dock-finalize" data-id="${dock.id}">${icon("check")} Nhân viên kho kết luận</button>`);
  }
  openModal({
    title: `Phiên dock · ${dock.order_id}`,
    subtitle: `${labelFor(dock.status)} · ${dock.capture_count} lần ghi nhận`,
    wide: true,
    body: `<div class="detail-grid"><div class="detail-box"><span>Trạng thái hàng</span><strong>${escapeHtml(labelFor(dock.current_cargo_state))}</strong></div><div class="detail-box"><span>Gate In log</span><strong>${escapeHtml(dock.entry_gate_log_id)}</strong></div><div class="detail-box"><span>Phương tiện</span><strong>${escapeHtml(vehicleById(order?.assigned_vehicle_id)?.plate_number || "—")}</strong></div><div class="detail-box"><span>Ghi chú operator</span><strong>${escapeHtml(dock.operator_note || "Chưa có")}</strong></div></div><div class="form-section" style="margin-top:22px"><div class="form-section-title">${icon("camera")} Timeline ảnh kiểm hàng</div>${dock.captures?.length ? `<div class="evidence-gallery">${dock.captures.map((capture) => `<article class="evidence-card"><img src="/api/v1/warehouse/dock-sessions/${dock.id}/captures/${capture.index}/image" alt="Ảnh kiểm hàng lần ${capture.index + 1}" loading="lazy" /><div class="evidence-label"><strong>Lần ${capture.index + 1} · ${escapeHtml(labelFor(capture.cargo_state))}</strong><br/>${escapeHtml(formatDate(capture.captured_at))} · ${capture.detections.length} detection</div></article>`).join("")}</div>` : emptyState("camera", "Chưa có ảnh kiểm hàng", "Ghi nhận ít nhất một ảnh trước khi operator finalize.")}</div>`,
    footer: `<button class="btn btn-ghost" data-action="close-modal">Đóng</button>${actions.join("")}`,
  });
}

function openDockCapture(dockId) {
  openModal({
    title: "Ghi nhận trạng thái hàng",
    subtitle: "AI lưu detection; cargo_state có thể được operator chỉ định",
    body: `<form id="dock-capture-form" data-form="dock-capture" data-id="${dockId}">${fileDrop("dock-cargo-image", "image", "Ảnh khoang hàng / pallet", "Chụp toàn cảnh vùng xếp hàng", "environment", false, "cargo")}<div class="field" style="margin-top:16px"><label>Trạng thái quan sát (tùy chọn)</label><select name="cargo_state"><option value="">Để AI suy luận</option>${["EMPTY", "LOADING", "LOADED", "ANOMALY", "UNKNOWN"].map((value) => `<option value="${value}">${labelFor(value)}</option>`).join("")}</select></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">Hủy</button><button class="btn btn-primary" type="submit" form="dock-capture-form">${icon("camera")} Lưu ghi nhận</button>`,
  });
}

function openDockFinalize(dockId) {
  openModal({
    title: "Nhân viên kho kết luận",
    subtitle: "Chỉ LOADED mới đưa lệnh sang READY_FOR_EXIT; ANOMALY giữ phiên cần rà soát",
    body: `<form id="dock-finalize-form" data-form="dock-finalize" data-id="${dockId}"><div class="field"><label>Kết luận hàng hóa</label><select name="final_cargo_state" required><option value="LOADED">Đã xếp đủ · Cho phép chuẩn bị phiếu</option><option value="ANOMALY">Phát hiện bất thường · Cần rà soát</option></select></div><div class="field" style="margin-top:14px"><label>Ghi chú operator</label><textarea name="operator_note" minlength="2" maxlength="1000" placeholder="Mô tả kết quả kiểm tra, số seal hoặc sai lệch..." required></textarea></div></form>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">Hủy</button><button class="btn btn-primary" type="submit" form="dock-finalize-form">${icon("check")} Xác nhận kết luận</button>`,
  });
}

function openGateLogDetail(logId) {
  const item = state.gateLogs.find((log) => log.id === logId);
  if (!item) return;
  const driver = driverById(item.driver_id);
  const vehicle = vehicleById(item.vehicle_id);
  openModal({
    title: `${labelFor(item.direction)} · ${item.observed_plate || "Không nhận diện"}`,
    subtitle: item.event_id,
    wide: true,
    body: `<div class="detail-grid"><div class="detail-box"><span>Kết quả</span><strong>${labelFor(item.verification_status)}</strong></div><div class="detail-box"><span>Barrier</span><strong>${labelFor(item.barrier_status)}</strong></div><div class="detail-box"><span>Tài xế</span><strong>${escapeHtml(driver?.full_name || item.driver_id || "Không xác định")}</strong></div><div class="detail-box"><span>Phương tiện</span><strong>${escapeHtml(vehicle?.plate_number || item.vehicle_id || "Không xác định")}</strong></div><div class="detail-box"><span>Face similarity</span><strong>${formatPercent(item.face_similarity)}</strong></div><div class="detail-box"><span>Plate score / kiểu khớp</span><strong>${formatPercent(item.plate_score)} · ${labelFor(item.plate_match_type)}</strong></div><div class="detail-box"><span>Điểm tổng hợp</span><strong>${formatPercent(item.verification_score)}</strong></div><div class="detail-box"><span>Thời gian</span><strong>${escapeHtml(formatDate(item.occurred_at))}</strong></div></div><div class="form-section" style="margin-top:22px"><div class="form-section-title">${icon("info")} Reason codes</div><div class="reason-list" style="justify-content:flex-start">${(item.reason_codes?.length ? item.reason_codes : ["Không có sai lệch"]).map((code) => `<span class="reason-chip">${escapeHtml(code)}</span>`).join("")}</div></div>${item.snapshot_count ? `<div class="form-section"><div class="form-section-title">${icon("camera")} Ảnh bằng chứng</div><div class="evidence-gallery">${Array.from({ length: item.snapshot_count }, (_, index) => `<article class="evidence-card"><img src="/api/v1/gate-logs/${item.id}/snapshots/${index}" alt="Ảnh bằng chứng ${index + 1}" loading="lazy" /><div class="evidence-label">Snapshot ${index + 1}</div></article>`).join("")}</div></div>` : ""}<div class="form-section"><div class="form-section-title">${icon("system")} Model và threshold</div><pre style="white-space:pre-wrap;font-size:11px;background:var(--ink-950);color:var(--mint);padding:14px;border-radius:10px">${escapeHtml(JSON.stringify({ threshold_version: item.threshold_version, model_versions: item.model_versions }, null, 2))}</pre></div>`,
    footer: `<button class="btn btn-primary" data-action="close-modal">Đóng</button>`,
  });
}

function openSlipPreview(orderId) {
  openModal({
    title: `Exit Slip · ${orderId}`,
    subtitle: "QR chứa compact JWS Ed25519 và chỉ có hiệu lực với phiên bản hiện tại",
    body: `<div style="display:grid;place-items:center;padding:10px"><img src="/api/v1/warehouse/orders/${encodeURIComponent(orderId)}/exit-slip/qr" alt="QR Exit Slip ${escapeHtml(orderId)}" style="width:min(100%,360px);border:14px solid white;border-radius:16px;box-shadow:var(--shadow-md)" /></div>`,
    footer: `<button class="btn btn-secondary" data-action="download-slip" data-id="${escapeHtml(orderId)}" data-type="html">${icon("external")} Mở bản HTML</button><button class="btn btn-primary" data-action="download-slip" data-id="${escapeHtml(orderId)}" data-type="pdf">${icon("download")} Tải PDF</button>`,
  });
}

async function openCamera(targetId, facingMode = "environment") {
  openModal({
    title: "Chụp ảnh từ camera",
    subtitle: "Ảnh chỉ được gửi lên máy chủ khi bạn xác nhận form nghiệp vụ",
    body: `<div style="overflow:hidden;border-radius:14px;background:var(--ink-950);aspect-ratio:16/10"><video id="camera-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video></div>`,
    footer: `<button class="btn btn-secondary" data-action="close-modal">Hủy</button><button class="btn btn-accent" data-action="capture-camera" data-target="${escapeHtml(targetId)}">${icon("camera")} Chụp ảnh</button>`,
  });
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
    const video = modalRoot.querySelector("#camera-video");
    if (video) video.srcObject = state.cameraStream;
  } catch (error) {
    showToast("Trình duyệt không thể truy cập camera. Hãy cấp quyền hoặc chọn ảnh từ máy.", "error", "Camera không khả dụng");
    closeModal();
  }
}

function stopCamera() {
  state.cameraStream?.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
}

async function captureCamera(targetId) {
  const video = modalRoot.querySelector("#camera-video");
  const input = document.getElementById(targetId);
  if (!video || !input || !video.videoWidth) {
    showToast("Camera chưa sẵn sàng để chụp.", "warning");
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return;
  setFileInput(input, new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
  closeModal();
}

function setFileInput(input, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function loadDemoImage(targetId, demoType) {
  const input = document.getElementById(targetId);
  if (!input) return;
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const context = canvas.getContext("2d");
  context.fillStyle = demoType === "cargo" ? "#e8e0ce" : "#102c2b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#f2b84b";
  context.lineWidth = 12;
  context.strokeRect(65, 65, 830, 410);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = demoType === "cargo" ? "#102c2b" : "#fffdf8";
  context.font = "700 42px sans-serif";
  const labels = {
    face: "KHUÔN MẶT MÔ PHỎNG",
    plate: "BIỂN SỐ 30A-12345",
    cargo: "HÀNG HÓA MÔ PHỎNG",
  };
  context.fillText(labels[demoType] || "DỮ LIỆU MÔ PHỎNG", 480, 270);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return;
  setFileInput(input, new File([blob], `${demoType}-mo-phong.jpg`, { type: "image/jpeg" }));
}

function updateFilePreview(input) {
  const file = input.files?.[0];
  const drop = document.querySelector(`[data-drop-for="${CSS.escape(input.id)}"]`);
  if (!drop) return;
  const preview = drop.querySelector(`[data-preview-for="${CSS.escape(input.id)}"]`);
  if (!file) {
    drop.classList.remove("has-file");
    if (preview) preview.hidden = true;
    return;
  }
  drop.classList.add("has-file");
  drop.querySelector("[data-file-title]").textContent = file.name;
  drop.querySelector("[data-file-hint]").textContent = `${Math.max(1, Math.round(file.size / 1024))} KB · sẵn sàng gửi`;
  if (preview) {
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  }
}

function setFormLoading(form, loading) {
  const button = document.querySelector(`[form="${form.id}"][type="submit"]`) || form.querySelector("button[type='submit']");
  if (button) {
    button.disabled = loading;
    button.classList.toggle("is-loading", loading);
  }
}

function cleanFormData(form) {
  const data = new FormData(form);
  for (const [key, value] of [...data.entries()]) {
    if (typeof value === "string" && value.trim() === "") data.delete(key);
    if (value instanceof File && value.size === 0) data.delete(key);
  }
  return data;
}

async function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.form;
  if (type === "search") {
    state.search[form.dataset.key] = new FormData(form).get("query")?.toString().trim() || "";
    renderShell();
    return;
  }
  setFormLoading(form, true);
  try {
    if (type === "login") await submitLogin(form);
    if (type === "driver-save") await submitDriver(form);
    if (type === "vehicle-save") await submitVehicle(form);
    if (type === "authorization-save") await submitAuthorization(form);
    if (type === "order-save") await submitOrder(form);
    if (type === "dock-capture") await submitDockCapture(form);
    if (type === "dock-finalize") await submitDockFinalize(form);
    if (type === "gate-entry" || type === "gate-exit") await submitGateVerification(form, type === "gate-entry" ? "entry" : "exit");
  } catch (error) {
    showError(error);
  } finally {
    setFormLoading(form, false);
  }
}

async function submitLogin(form) {
  const values = Object.fromEntries(new FormData(form));
  const result = await api.post("/api/v1/auth/login", values, { skipUnauthorizedEvent: true });
  state.user = { id: result.user_id, username: result.username, role: result.role, csrf_token: result.csrf_token };
  api.setCsrfToken(result.csrf_token);
  await loadAllData();
  connectWebSocket();
  showToast(`Đăng nhập thành công với vai trò ${roleLabels[result.role] || result.role}.`);
}

async function submitDriver(form) {
  const id = form.dataset.id;
  const payload = cleanFormData(form);
  await (id ? api.patch(`/api/v1/drivers/${id}`, payload) : api.post("/api/v1/drivers", payload));
  closeModal();
  state.drivers = await api.get("/api/v1/drivers");
  renderShell();
  showToast(id ? "Hồ sơ tài xế đã được cập nhật." : "Tài xế đã được enrollment thành công.");
}

async function submitVehicle(form) {
  const id = form.dataset.id;
  const values = Object.fromEntries(new FormData(form));
  const payload = { ...values };
  Object.keys(payload).forEach((key) => {
    if (payload[key] === "") delete payload[key];
  });
  if (!id) payload.metadata = {};
  await (id ? api.patch(`/api/v1/vehicles/${id}`, payload) : api.post("/api/v1/vehicles", payload));
  closeModal();
  state.vehicles = await api.get("/api/v1/vehicles");
  renderShell();
  showToast(id ? "Thông tin phương tiện đã được cập nhật." : "Phương tiện đã được thêm vào hệ thống.");
}

async function submitAuthorization(form) {
  const values = Object.fromEntries(new FormData(form));
  const payload = { driver_id: values.driver_id, vehicle_id: values.vehicle_id, valid_from: fromLocalInput(values.valid_from) };
  if (values.valid_until) payload.valid_until = fromLocalInput(values.valid_until);
  await api.post("/api/v1/driver-vehicle-authorizations", payload);
  closeModal();
  state.authorizations = await api.get("/api/v1/driver-vehicle-authorizations");
  renderShell();
  showToast("Quan hệ tài xế – phương tiện đã được cấp hiệu lực.");
}

async function submitOrder(form) {
  const existingId = form.dataset.id;
  const values = Object.fromEntries(new FormData(form));
  const cargo = [...form.querySelectorAll(".cargo-row")].map((row) => ({
    sku: row.querySelector("[name='cargo_sku']").value.trim(),
    quantity: Number(row.querySelector("[name='cargo_quantity']").value),
  }));
  const payload = {
    assigned_driver_id: values.assigned_driver_id,
    assigned_vehicle_id: values.assigned_vehicle_id,
    cargo_metadata: cargo,
    valid_from: fromLocalInput(values.valid_from),
    valid_until: fromLocalInput(values.valid_until),
  };
  if (!existingId) payload.order_id = values.order_id;
  await (existingId ? api.patch(`/api/v1/warehouse/orders/${encodeURIComponent(existingId)}`, payload) : api.post("/api/v1/warehouse/orders", payload));
  closeModal();
  state.orders = await api.get("/api/v1/warehouse/orders");
  renderShell();
  showToast(existingId ? "Lệnh xuất kho đã được cập nhật." : "Lệnh xuất kho đã được tạo.");
}

async function submitDockCapture(form) {
  const dockId = form.dataset.id;
  await api.post(`/api/v1/warehouse/dock-sessions/${dockId}/captures`, cleanFormData(form));
  closeModal();
  await refreshWarehouseData();
  openDockDetail(dockId);
  showToast("Ảnh và kết quả nhận diện hàng hóa đã được lưu.");
}

async function submitDockFinalize(form) {
  const dockId = form.dataset.id;
  const values = Object.fromEntries(new FormData(form));
  await api.post(`/api/v1/warehouse/dock-sessions/${dockId}/finalize`, values);
  closeModal();
  await refreshWarehouseData();
  openDockDetail(dockId);
  showToast(values.final_cargo_state === "LOADED" ? "Phiên dock đã được duyệt; lệnh sẵn sàng cấp phiếu." : "Phiên dock được giữ ở trạng thái cần rà soát.", values.final_cargo_state === "LOADED" ? "success" : "warning");
}

async function submitGateVerification(form, direction) {
  const endpoint = direction === "entry" ? "/api/v1/gates/entry/verifications" : "/api/v1/gates/exit/verifications";
  const result = await api.post(endpoint, cleanFormData(form));
  state.verificationResults[direction] = result;
  await Promise.all([reloadGateLogsWithoutRender(), canManageSecurity() ? reloadAlertsWithoutRender() : Promise.resolve(), direction === "exit" ? refreshOrdersWithoutRender() : Promise.resolve()]);
  renderShell();
  showToast(result.permit_granted ? "Barrier đã xác nhận mở cổng." : result.verification_status === "PASSED" ? "Xác minh đạt nhưng barrier chưa mở." : "Xác minh không đạt; cổng được giữ đóng.", result.permit_granted ? "success" : "warning", result.permit_granted ? "Cho phép qua cổng" : "Cổng giữ đóng");
}

async function reloadGateLogsWithoutRender() {
  state.gateLogs = await api.get("/api/v1/gate-logs?limit=300");
}

async function reloadAlertsWithoutRender() {
  state.alerts = await api.get("/api/v1/security/alerts?after_sequence=0&limit=1000");
}

async function refreshOrdersWithoutRender() {
  state.orders = await api.get("/api/v1/warehouse/orders");
}

async function refreshWarehouseData() {
  const [orders, docks] = await Promise.all([api.get("/api/v1/warehouse/orders"), api.get("/api/v1/warehouse/dock-sessions?limit=200")]);
  state.orders = orders;
  state.docks = docks;
  renderShell();
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (!action) return;
  if (action === "close-modal") return closeModal();
  if (action === "toggle-password") {
    const input = document.querySelector("#login-password");
    if (input) input.type = input.type === "password" ? "text" : "password";
    return;
  }
  if (action === "toggle-sidebar") {
    state.sidebarOpen = !state.sidebarOpen;
    renderShell();
    return;
  }
  if (action === "refresh-all") return loadAllData();
  if (action === "logout") return logout();
  if (action === "open-driver") return openDriverModal();
  if (action === "edit-driver") return openDriverModal(button.dataset.id);
  if (action === "view-driver") return openDriverModal(button.dataset.id, true);
  if (action === "deactivate-driver") return confirmAction({ title: "Ngừng hoạt động tài xế", message: "Hồ sơ sẽ không còn được dùng để xác minh Gate In/Gate Out.", action: "confirm-deactivate-driver", id: button.dataset.id, confirmLabel: "Ngừng hoạt động" });
  if (action === "confirm-deactivate-driver") return deactivateDriver(button.dataset.id);
  if (action === "open-vehicle") return openVehicleModal();
  if (action === "edit-vehicle") return openVehicleModal(button.dataset.id);
  if (action === "view-vehicle") return openVehicleModal(button.dataset.id, true);
  if (action === "deactivate-vehicle") return confirmAction({ title: "Ngừng hoạt động phương tiện", message: "Phương tiện sẽ không còn được đối chiếu như một hồ sơ hợp lệ tại cổng.", action: "confirm-deactivate-vehicle", id: button.dataset.id, confirmLabel: "Ngừng hoạt động" });
  if (action === "confirm-deactivate-vehicle") return deactivateVehicle(button.dataset.id);
  if (action === "open-authorization") return openAuthorizationModal();
  if (action === "revoke-authorization") return revokeAuthorization(button.dataset.driverId, button.dataset.vehicleId);
  if (action === "clear-search") {
    state.search[button.dataset.key] = "";
    renderShell();
    return;
  }
  if (action === "warehouse-tab") {
    state.warehouseTab = button.dataset.tab;
    renderShell();
    return;
  }
  if (action === "toggle-order-view") {
    state.orderView = state.orderView === "board" ? "table" : "board";
    renderShell();
    return;
  }
  if (action === "open-order") return openOrderModal();
  if (action === "edit-order") return openOrderModal(button.dataset.id);
  if (action === "view-order") return openOrderDetail(button.dataset.id);
  if (action === "cancel-order") return confirmAction({ title: "Hủy lệnh xuất kho", message: `Lệnh ${button.dataset.id} sẽ chuyển sang trạng thái terminal CANCELLED.`, action: "confirm-cancel-order", id: button.dataset.id, confirmLabel: "Hủy lệnh" });
  if (action === "confirm-cancel-order") return cancelOrder(button.dataset.id);
  if (action === "start-dock") return startDock(button.dataset.id);
  if (action === "view-dock") return openDockDetail(button.dataset.id);
  if (action === "open-dock-capture") return openDockCapture(button.dataset.id);
  if (action === "open-dock-finalize") return openDockFinalize(button.dataset.id);
  if (action === "issue-slip") return issueSlip(button.dataset.id, false);
  if (action === "reissue-slip") return confirmAction({ title: "Cấp lại Exit Slip", message: "Phiên bản phiếu sẽ tăng và QR cũ bị vô hiệu ngay lập tức.", action: "confirm-reissue-slip", id: button.dataset.id, confirmLabel: "Cấp lại phiếu", danger: false });
  if (action === "confirm-reissue-slip") return issueSlip(button.dataset.id, true);
  if (action === "preview-slip") return openSlipPreview(button.dataset.id);
  if (action === "download-slip") return downloadSlip(button.dataset.id, button.dataset.type);
  if (action === "add-cargo-row") {
    modalRoot.querySelector("[data-cargo-items]")?.insertAdjacentHTML("beforeend", renderCargoRow());
    return;
  }
  if (action === "remove-cargo-row") {
    const rows = modalRoot.querySelectorAll(".cargo-row");
    if (rows.length > 1) button.closest(".cargo-row")?.remove();
    else showToast("Lệnh cần ít nhất một dòng hàng hóa.", "warning");
    return;
  }
  if (action === "gate-tab") {
    state.gateTab = button.dataset.tab;
    renderShell();
    return;
  }
  if (action === "open-camera") return openCamera(button.dataset.target, button.dataset.facing);
  if (action === "capture-camera") return captureCamera(button.dataset.target);
  if (action === "load-demo-image") return loadDemoImage(button.dataset.target, button.dataset.demoType);
  if (action === "load-order-qr") return loadOrderQr();
  if (action === "view-gate-log") return openGateLogDetail(button.dataset.id);
  if (action === "reload-gate-logs") return reloadGateLogs();
  if (action === "reload-alerts") return reloadAlerts();
  if (action === "update-alert") return updateAlert(button.dataset.id, button.dataset.status);
  if (action === "check-health") return checkHealth();
}

async function logout() {
  try {
    await api.post("/api/v1/auth/logout", {});
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) showError(error);
  }
  clearSession();
}

function clearSession() {
  disconnectWebSocket();
  closeModal();
  state.user = null;
  state.drivers = [];
  state.vehicles = [];
  state.authorizations = [];
  state.orders = [];
  state.docks = [];
  state.gateLogs = [];
  state.alerts = [];
  api.setCsrfToken(null);
  renderLogin();
}

async function deactivateDriver(id) {
  try {
    await api.delete(`/api/v1/drivers/${id}`);
    closeModal();
    state.drivers = await api.get("/api/v1/drivers");
    renderShell();
    showToast("Tài xế đã được chuyển sang trạng thái ngừng hoạt động.");
  } catch (error) {
    showError(error);
  }
}

async function deactivateVehicle(id) {
  try {
    await api.delete(`/api/v1/vehicles/${id}`);
    closeModal();
    state.vehicles = await api.get("/api/v1/vehicles");
    renderShell();
    showToast("Phương tiện đã được chuyển sang trạng thái ngừng hoạt động.");
  } catch (error) {
    showError(error);
  }
}

async function revokeAuthorization(driverId, vehicleId) {
  try {
    await api.delete(`/api/v1/driver-vehicle-authorizations/${driverId}/${vehicleId}`);
    state.authorizations = await api.get("/api/v1/driver-vehicle-authorizations");
    renderShell();
    showToast("Ủy quyền đã được thu hồi.");
  } catch (error) {
    showError(error);
  }
}

async function cancelOrder(orderId) {
  try {
    await api.delete(`/api/v1/warehouse/orders/${encodeURIComponent(orderId)}`);
    closeModal();
    state.orders = await api.get("/api/v1/warehouse/orders");
    renderShell();
    showToast("Lệnh xuất kho đã được hủy.", "warning");
  } catch (error) {
    showError(error);
  }
}

async function startDock(orderId) {
  try {
    const dock = await api.post(`/api/v1/warehouse/orders/${encodeURIComponent(orderId)}/dock-sessions`, {});
    closeModal();
    await refreshWarehouseData();
    openDockDetail(dock.id);
    showToast("Phiên kiểm hàng đã bắt đầu.");
  } catch (error) {
    showError(error);
  }
}

async function issueSlip(orderId, reissue) {
  try {
    const suffix = reissue ? "/reissue" : "";
    await api.post(`/api/v1/warehouse/orders/${encodeURIComponent(orderId)}/exit-slip${suffix}`, {});
    closeModal();
    state.orders = await api.get("/api/v1/warehouse/orders");
    renderShell();
    openSlipPreview(orderId);
    showToast(reissue ? "Exit Slip mới đã được cấp; QR cũ không còn hiệu lực." : "Exit Slip đã được ký và lưu an toàn.");
  } catch (error) {
    showError(error);
  }
}

async function downloadSlip(orderId, type) {
  try {
    const blob = await api.blob(`/api/v1/warehouse/orders/${encodeURIComponent(orderId)}/exit-slip/${type}`);
    if (type === "html") openBlob(blob);
    else downloadBlob(blob, `${orderId}-exit-slip.${type === "qr" ? "png" : type}`);
  } catch (error) {
    showError(error);
  }
}

async function loadOrderQr() {
  const select = document.querySelector("#gate-slip-order");
  const input = document.querySelector("#gate-exit-slip");
  if (!select?.value || !input) {
    showToast("Hãy chọn một lệnh đã cấp phiếu.", "warning");
    return;
  }
  try {
    const blob = await api.blob(`/api/v1/warehouse/orders/${encodeURIComponent(select.value)}/exit-slip/qr`);
    setFileInput(input, new File([blob], `${select.value}-qr.png`, { type: "image/png" }));
    showToast("QR của lệnh đã được nạp vào biểu mẫu Gate Out.");
  } catch (error) {
    showError(error);
  }
}

async function updateAlert(id, status) {
  try {
    const updated = await api.patch(`/api/v1/security/alerts/${id}`, { status });
    state.alerts = state.alerts.map((item) => (item.id === id ? updated : item));
    renderShell();
    showToast(`Cảnh báo đã chuyển sang “${labelFor(status)}”.`);
  } catch (error) {
    showError(error);
  }
}

app.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    event.preventDefault();
    location.hash = nav.dataset.nav;
    return;
  }
  const action = event.target.closest("[data-action]");
  if (action) {
    if (action.dataset.action === "close-modal" && event.target.closest("[data-modal-panel]") && !event.target.closest("button")) return;
    event.preventDefault();
    handleAction(action);
  }
});

modalRoot.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  if (action.dataset.action === "close-modal" && event.target.closest("[data-modal-panel]") && !event.target.closest("button")) return;
  event.preventDefault();
  handleAction(action);
});

document.addEventListener("submit", handleSubmit);

document.addEventListener("change", (event) => {
  if (event.target.matches("input[type='file']")) updateFilePreview(event.target);
  if (event.target.matches("[data-filter]")) {
    state.filters[event.target.dataset.filter] = event.target.value;
    renderShell();
  }
});

toastRoot.addEventListener("click", (event) => {
  const button = event.target.closest("[data-dismiss-toast]");
  if (button) document.getElementById(button.dataset.dismissToast)?.remove();
});

window.addEventListener("hashchange", () => {
  const nextRoute = normalizeRoute(location.hash.slice(1));
  const definition = navigation.find((item) => item.route === nextRoute);
  if (definition?.roles && !definition.roles.includes(state.user?.role)) {
    location.hash = "/dashboard";
    return;
  }
  state.route = nextRoute;
  state.sidebarOpen = false;
  if (state.user) renderShell();
});

window.addEventListener("smartgate:unauthorized", () => {
  if (state.user) {
    showToast("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "warning", "Phiên đã kết thúc");
    clearSession();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalRoot.innerHTML) closeModal();
});

restoreSession();
