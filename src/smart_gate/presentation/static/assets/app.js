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
  {
    section: "Hồ sơ",
    route: "/employee-cards",
    label: "Thẻ nhân viên",
    icon: "card",
    roles: ["ADMIN"],
  },
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
  "/gates": ["Kiểm soát cổng", "Xác minh thẻ nhân viên, khuôn mặt và biển số xe"],
  "/employee-cards": ["Quản lý thẻ nhân viên", "Cấp, thay thế và quản lý vòng đời thẻ RFID"],
  "/drivers": ["Hồ sơ tài xế", "Đăng ký và quản lý nhận diện khuôn mặt"],
  "/vehicles": ["Hồ sơ phương tiện", "Quản lý biển số và thông tin phương tiện"],
  "/authorizations": ["Ủy quyền tài xế – xe", "Kiểm soát cặp vận hành có hiệu lực"],
  "/gate-logs": ["Nhật ký cổng", "Dấu vết xác minh và trạng thái barrier"],
  "/alerts": ["Trung tâm cảnh báo", "Tiếp nhận và xử lý sự kiện an ninh tức thời"],
  "/system": ["Trạng thái hệ thống", "Theo dõi API và các thành phần hạ tầng"],
};

const state = {
  user: null,
  route: authorizedRoute(normalizeRoute(location.hash.slice(1) || "/dashboard")),
  loading: false,
  sidebarOpen: false,
  gateTab: "entry",
  search: {},
  filters: {
    logDirection: "ALL",
    logStatus: "ALL",
    alertSeverity: "ALL",
    alertStatus: "ALL",
  },
  drivers: [],
  vehicles: [],
  authorizations: [],
  employeeCards: [],
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

function authorizedRoute(route) {
  const navItem = navigation.find((n) => n.route === route);
  if (navItem?.roles && state.user && !navItem.roles.includes(state.user.role)) {
    return "/dashboard";
  }
  return route;
}

function hasRole(...roles) {
  return roles.includes(state.user?.role);
}

function canManageMasterData() {
  return hasRole("ADMIN");
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

function cardById(id) {
  return state.employeeCards.find((c) => c.id === id);
}

function maskCardUidForDisplay(value) {
  return value || "—";
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
        <div class="brand-copy"><strong>EV Smart Gate</strong><span>Kiểm soát bãi xe thông minh</span></div>
      </div>
      <div class="login-headline">
        <div class="eyebrow">Trung tâm điều hành bãi xe</div>
        <h1>Mỗi lượt xe.<br />Một chuỗi <em>xác minh.</em></h1>
        <p>Kiểm soát ra vào bãi đỗ xe thông minh bằng sự kết hợp giữa thẻ nhân viên RFID, nhận diện sinh trắc học khuôn mặt và nhận diện biển số xe.</p>
      </div>
      <div class="login-flow">
        <div class="login-flow-item"><strong>01 · Thẻ RFID</strong><span>Xác thực thẻ nhân viên</span></div>
        <div class="login-flow-item"><strong>02 · Khuôn mặt</strong><span>Đối chiếu sinh trắc học</span></div>
        <div class="login-flow-item"><strong>03 · Biển số xe</strong><span>Nhận diện ANPR</span></div>
        <div class="login-flow-item"><strong>04 · Barrier</strong><span>Xác nhận đóng/mở an toàn</span></div>
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
  state.route = authorizedRoute(state.route);
  if (location.hash && normalizeRoute(location.hash.slice(1)) !== state.route) {
    location.hash = state.route;
  }
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
    "/employee-cards": renderEmployeeCards,
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
  const activeCards = state.employeeCards.filter((item) => item.status === "ACTIVE").length;
  const successfulEntries = state.gateLogs.filter(
    (item) => item.direction === "ENTRY" && item.verification_status === "PASSED",
  ).length;
  const successfulExits = state.gateLogs.filter(
    (item) => item.direction === "EXIT" && item.verification_status === "PASSED",
  ).length;
  const safeRejections = state.gateLogs.filter(
    (item) => item.verification_status === "FAILED",
  ).length;
  const entryPassedToday = state.gateLogs.filter(
    (item) => item.direction === "ENTRY" && item.verification_status === "PASSED" && isToday(item.occurred_at),
  ).length;
  const exitPassedToday = state.gateLogs.filter(
    (item) => item.direction === "EXIT" && item.verification_status === "PASSED" && isToday(item.occurred_at),
  ).length;
  const failedToday = state.gateLogs.filter(
    (item) => item.verification_status === "FAILED" && isToday(item.occurred_at),
  ).length;
  const recentLogs = state.gateLogs.slice(0, 6);
  const recentAlerts = [...state.alerts]
    .filter((item) => ["OPEN", "ACKNOWLEDGED"].includes(item.status))
    .sort((a, b) => b.sequence - a.sequence)
    .slice(0, 5);

  return `${pageHeader(
    "Toàn cảnh vận hành bãi xe",
    `Chào ${state.user.username}, hệ thống đã sẵn sàng.`,
    "Theo dõi luồng phương tiện qua cổng vào và cổng ra theo thời gian thực.",
    `<button class="btn btn-secondary" data-action="refresh-all">${icon("refresh")} Đồng bộ</button>`,
  )}
  <section class="kpi-grid">
    ${kpiCard("gate", successfulEntries, "Vào bãi thành công", "mint")}
    ${kpiCard("gate", successfulExits, "Ra bãi thành công", "amber")}
    ${kpiCard("card", activeCards, "Thẻ đang hoạt động", "")}
    ${kpiCard("shield", safeRejections, "Từ chối an toàn", "coral")}
  </section>
  <section class="dashboard-layout">
    <div>
      <article class="control-hero">
        <div class="control-hero-content">
          <div class="eyebrow">Chuỗi xác minh ba yếu tố</div>
          <h2>Cổng chỉ mở khi <em>thẻ nhân viên, khuôn mặt và biển số</em> cùng khớp.</h2>
          <p>AI tạo quan sát; nghiệp vụ xác minh; barrier xác nhận. Mọi sai lệch đều được lưu dấu và chuyển tới bộ phận an ninh.</p>
          <div class="hero-actions">
            ${canManageSecurity() ? `<button class="btn btn-accent" data-nav="/gates">${icon("gate")} Thực hiện xác minh</button>` : ""}
            <button class="btn btn-secondary" data-nav="/gate-logs">${icon("logs")} Xem nhật ký</button>
          </div>
        </div>
      </article>
      <div class="workflow-strip">
        ${workflowSummary("01", "Vào bãi", entryPassedToday, "lượt vào đạt")}
        ${workflowSummary("02", "Ra bãi", exitPassedToday, "lượt ra đạt")}
        ${workflowSummary("03", "Thẻ hoạt động", activeCards, "thẻ RFID")}
        ${workflowSummary("04", "Từ chối", failedToday, "lượt không đạt")}
      </div>
      <article class="card" style="margin-top:18px">
        <header class="card-header"><div><h2>Hoạt động cổng gần đây</h2><p>Kết quả xác minh và trạng thái barrier</p></div><button class="btn btn-ghost" data-nav="/gate-logs">Xem tất cả ${icon("arrow")}</button></header>
        ${recentLogs.length ? `<div class="activity-list">${recentLogs.map(renderLogActivity).join("")}</div>` : emptyState("gate", "Chưa có lượt qua cổng", "Thực hiện Gate In đầu tiên để bắt đầu chuỗi vận hành.")}
      </article>
    </div>
    <aside class="card">
      <header class="card-header"><div><h2>Tín hiệu an ninh</h2><p>Ưu tiên sự kiện đang mở</p></div>${canManageSecurity() ? `<span class="status-badge status-${state.socketStatus === "connected" ? "active" : "inactive"}"><i></i>${state.socketStatus === "connected" ? "Trực tuyến" : "Mất kết nối"}</span>` : ""}</header>
      ${renderDashboardAlerts(recentAlerts)}
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

function renderEmployeeCards() {
  const byDriver = new Map();
  for (const card of state.employeeCards) {
    const list = byDriver.get(card.driver_id) || [];
    list.push(card);
    byDriver.set(card.driver_id, list);
  }

  let content = "";
  const actions = `<div class="page-actions">
    <button class="btn btn-accent" data-action="open-card-modal">${icon("plus")} Cấp thẻ mới</button>
  </div>`;

  if (!state.employeeCards.length) {
    content = `<div class="card">${emptyState("card", "Chưa có thẻ nhân viên", "Cấp thẻ RFID cho tài xế để bắt đầu kiểm soát bãi xe.")}</div>`;
  } else {
    for (const [driverId, cards] of byDriver) {
      const driver = driverById(driverId);
      const driverName = driver?.full_name || driverId;
      const activeCard = cards.find((c) => c.status === "ACTIVE");
      const history = cards.filter((c) => c.status !== "ACTIVE");

      content += `<article class="card" style="margin-bottom:18px">
        <div class="card-body">
          <div class="card-head">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="entity-avatar">${escapeHtml(initials(driverName))}</div>
              <div>
                <h3 style="margin:0;font-size:18px">${escapeHtml(driverName)}</h3>
                <span class="text-muted" style="font-size:13px">${driver?.employee_code ? escapeHtml(driver.employee_code) : `ID ${escapeHtml(shortId(driverId))}`}</span>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" data-action="open-card-modal" data-driver="${driverId}">${icon("plus")} Cấp thẻ</button>
          </div>
          ${activeCard ? renderEmployeeCardRow(activeCard, true) : '<p class="text-muted" style="margin:10px 0 0 0">Không có thẻ đang hoạt động</p>'}
          ${history.length ? `<div class="card-history"><div class="card-history-title">Lịch sử thẻ</div>${history.map((c) => renderEmployeeCardRow(c, false)).join("")}</div>` : ""}
        </div>
      </article>`;
    }
  }

  return `${pageHeader("Thẻ nhân viên", "Quản lý thẻ nhân viên", "Cấp, thay thế và quản lý vòng đời thẻ RFID.", actions)}${content}`;
}

function renderEmployeeCardRow(card, isActive) {
  const statusLabels = {
    ACTIVE: "Đang hoạt động",
    BLOCKED: "Đã khóa",
    LOST: "Đã báo mất",
    REPLACED: "Đã thay thế",
  };
  const statusClass = `card-status card-status-${card.status.toLowerCase()}`;

  let actions = "";
  if (isActive) {
    actions = `
      <button class="btn btn-secondary btn-sm" data-action="replace-card" data-id="${card.id}">Thay thẻ</button>
      <button class="btn btn-secondary btn-sm" data-action="block-card" data-id="${card.id}">Khóa thẻ</button>
      <button class="btn btn-secondary btn-sm" data-action="lost-card" data-id="${card.id}">Báo mất</button>
    `;
  }

  const isUpdated = Boolean(card.updated_at && card.updated_at !== card.issued_at);

  return `<div class="card-history-item ${isActive ? "card-active" : ""}">
    <div class="card-row">
      <span class="card-uid">${escapeHtml(maskCardUidForDisplay(card.card_uid_masked))}</span>
      <span class="${statusClass}">${statusLabels[card.status] || card.status}</span>
      ${card.status_reason ? `<span class="text-muted">${escapeHtml(card.status_reason)}</span>` : ""}
      <span class="text-muted">${escapeHtml(formatDate(card.issued_at))}</span>
      ${isUpdated ? `<span class="text-muted">Cập nhật: ${escapeHtml(formatDate(card.updated_at))}</span>` : ""}
      ${card.replaces_card_id ? `<span class="text-muted">Thay thẻ: ${escapeHtml(shortId(card.replaces_card_id))}</span>` : ""}
      ${card.replaced_by_card_id ? `<span class="text-muted">Được thay bởi: ${escapeHtml(shortId(card.replaced_by_card_id))}</span>` : ""}
    </div>
    ${actions ? `<div class="card-actions">${actions}</div>` : ""}
  </div>`;
}

function openEmployeeCardModal(driverId = null) {
  const drivers = state.drivers.filter((d) => d.status === "ACTIVE");
  openModal({
    title: "Cấp thẻ nhân viên",
    body: `<form data-form="issue-card">
      <div class="field">
        <label for="card-driver">Tài xế</label>
        <select id="card-driver" name="driver_id" required>
          <option value="">Chọn tài xế</option>
          ${drivers.map((d) => `<option value="${d.id}" ${driverId === d.id ? "selected" : ""}>${escapeHtml(d.full_name)}${d.employee_code ? ` · ${escapeHtml(d.employee_code)}` : ""}</option>`).join("")}
        </select>
      </div>
      <div class="field" style="margin-top:14px">
        <label for="card-uid">UID thẻ RFID</label>
        <input id="card-uid" name="card_uid" type="password" minlength="4" maxlength="128" autocomplete="off" aria-label="UID thẻ nhân viên" required />
      </div>
      <div class="field" style="margin-top:14px">
        <label for="card-reason">Lý do (tùy chọn)</label>
        <input id="card-reason" name="status_reason" maxlength="500" />
      </div>
      <button type="submit" class="btn btn-accent btn-block" style="margin-top:18px">Cấp thẻ</button>
    </form>`,
  });
}

function openReplaceEmployeeCardModal(cardId) {
  openModal({
    title: "Thay thẻ nhân viên",
    body: `<form data-form="replace-card" data-card-id="${cardId}">
      <div class="field">
        <label for="replace-uid">UID thẻ mới</label>
        <input id="replace-uid" name="card_uid" type="password" minlength="4" maxlength="128" autocomplete="off" aria-label="UID thẻ nhân viên" required />
      </div>
      <div class="field" style="margin-top:14px">
        <label for="replace-reason">Lý do thay thẻ</label>
        <input id="replace-reason" name="status_reason" minlength="2" maxlength="500" required />
      </div>
      <button type="submit" class="btn btn-accent btn-block" style="margin-top:18px">Thay thẻ</button>
    </form>`,
  });
}

function openEmployeeCardStatusModal(cardId, status) {
  const labels = { BLOCKED: "Khóa thẻ", LOST: "Báo mất thẻ" };
  openModal({
    title: labels[status] || "Đổi trạng thái thẻ",
    body: `<form data-form="card-status" data-card-id="${cardId}" data-status="${status}">
      <div class="field">
        <label for="status-reason">Lý do</label>
        <input id="status-reason" name="status_reason" minlength="2" maxlength="500" required />
      </div>
      <button type="submit" class="btn btn-danger btn-block" style="margin-top:18px">${labels[status] || "Xác nhận"}</button>
    </form>`,
  });
}

async function submitEmployeeCard(form) {
  const data = new FormData(form);
  await api.post("/api/v1/employee-cards", {
    driver_id: data.get("driver_id"),
    card_uid: data.get("card_uid"),
    status_reason: data.get("status_reason") || null,
    metadata: { source: "operator-console" },
  });
  closeModal();
  await loadAllData({ showLoading: false });
  showToast("Cấp thẻ thành công", "success");
}

async function replaceEmployeeCard(cardId, form) {
  const data = new FormData(form);
  await api.post(`/api/v1/employee-cards/${cardId}/replace`, {
    card_uid: data.get("card_uid"),
    status_reason: data.get("status_reason"),
  });
  closeModal();
  await loadAllData({ showLoading: false });
  showToast("Thay thẻ thành công", "success");
}

async function changeEmployeeCardStatus(cardId, status, reason) {
  const endpoint = status === "BLOCKED" ? "block" : "report-lost";
  await api.post(`/api/v1/employee-cards/${cardId}/${endpoint}`, {
    status_reason: reason,
  });
  closeModal();
  await loadAllData({ showLoading: false });
  showToast(status === "BLOCKED" ? "Đã khóa thẻ" : "Đã báo mất thẻ", "success");
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
  return `${pageHeader("Quan hệ có thời hạn", "Ủy quyền tài xế – phương tiện", "Gate In chỉ đạt khi thẻ RFID, khuôn mặt và biển số thuộc cùng một cặp ủy quyền đang hiệu lực.", action)}
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

const reasonMap = {
  CARD_UID_INVALID: "UID thẻ không hợp lệ",
  CARD_NOT_FOUND: "Thẻ không tìm thấy trong hệ thống",
  CARD_NOT_ACTIVE: "Thẻ không còn hoạt động",
  CARD_OWNER_NOT_FOUND: "Chủ thẻ không tìm thấy",
  CARD_OWNER_INACTIVE: "Chủ thẻ không còn hoạt động",
  FACE_NOT_CARD_OWNER: "Khuôn mặt không khớp với chủ thẻ",
  FACE_LOW_CONFIDENCE: "Không nhận diện được khuôn mặt",
  FACE_SPOOF: "Phát hiện giả mạo khuôn mặt",
  VEHICLE_NOT_MATCHED: "Không nhận diện được biển số xe",
  PLATE_LOW_CONFIDENCE: "Biển số xe không rõ ràng",
  DRIVER_VEHICLE_NOT_AUTHORIZED: "Chủ thẻ không được phép sử dụng xe này",
  EVIDENCE_STORE_UNEXPECTED_ERROR: "Lỗi lưu trữ bằng chứng",
  AI_PIPELINE_UNEXPECTED_ERROR: "Lỗi hệ thống nhận diện",
  ALL_CHECKS_PASSED: "Tất cả kiểm tra đạt yêu cầu",
};

function renderGates() {
  const isEntry = state.gateTab === "entry";
  const result = state.verificationResults[state.gateTab];
  const tabs = `<button class="btn ${isEntry ? "btn-primary" : "btn-secondary"}" data-action="gate-tab" data-tab="entry">${icon("gate")} Gate In</button><button class="btn ${!isEntry ? "btn-primary" : "btn-secondary"}" data-action="gate-tab" data-tab="exit">${icon("logout")} Gate Out</button>`;
  return `${pageHeader("Xác minh có hỗ trợ AI", isEntry ? "Xác minh cổng vào" : "Xác minh cổng ra", isEntry ? "Đối chiếu thẻ nhân viên, khuôn mặt, biển số và quan hệ ủy quyền đang hiệu lực." : "Đối chiếu ba yếu tố giữa thẻ nhân viên, khuôn mặt và biển số xe tại cổng ra.", tabs)}
    <div class="verification-layout"><section class="card verification-panel">${renderGateForm(isEntry)}</section><aside class="verification-side"><section class="card">${renderVerificationResult(result)}</section>${renderGateGuidance(isEntry)}</aside></div>`;
}

function renderGateForm(isEntry) {
  const prefix = isEntry ? "entry" : "exit";
  const submitLabel = isEntry ? "Xác minh và mở Gate In" : "Xác minh và mở Gate Out";
  return `<form data-form="gate-${prefix}">
    <div class="field-row"><div class="field"><label for="gate-${prefix}-event">Event ID chống lặp</label><input id="gate-${prefix}-event" name="event_id" value="${escapeHtml(uniqueEventId(prefix))}" minlength="8" maxlength="128" required /><span class="field-hint">Giữ nguyên ID khi retry cùng một sự kiện.</span></div><div class="field"><label for="gate-${prefix}-id">Mã cổng</label><input id="gate-${prefix}-id" name="gate_id" value="${isEntry ? "gate-in-01" : "gate-out-01"}" required /></div></div>
    <div class="gate-steps" style="margin-top:16px">
      <div class="gate-step">
        <div class="gate-step-number">01</div>
        <div class="gate-step-content" style="flex:1">
          <label for="gate-${prefix}-card-uid" style="font-weight:600;display:block;margin-bottom:6px">01 · Quẹt thẻ nhân viên</label>
          <input id="gate-${prefix}-card-uid" name="card_uid" type="password" minlength="4" maxlength="128" autocomplete="off" aria-label="UID thẻ nhân viên" placeholder="Quẹt thẻ hoặc nhập UID..." required />
          <span class="field-hint" style="display:block;margin-top:4px">Quẹt thẻ hoặc nhập UID nhân viên để tiếp tục</span>
        </div>
      </div>
      <div class="gate-step">
        <div class="gate-step-number">02</div>
        <div class="gate-step-content" style="flex:1">
          <div style="font-weight:600;margin-bottom:6px">02 · Xác minh khuôn mặt chủ thẻ</div>
          <div class="file-drop" data-drop-for="gate-${prefix}-face">
            <input id="gate-${prefix}-face" name="face_image" type="file" accept="image/*" capture="user" aria-label="Ảnh khuôn mặt" required />
            <img class="file-drop-preview" data-preview-for="gate-${prefix}-face" alt="Xem trước" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" hidden />
            <div class="file-drop-content">
              <div class="file-drop-icon">${icon("camera")}</div>
              <strong data-file-title>Ảnh khuôn mặt</strong>
              <span data-file-hint>Khuôn mặt rõ, đủ sáng</span>
              <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:7px;margin-top:12px">
                <label class="btn btn-secondary" for="gate-${prefix}-face">${icon("upload")} Chọn ảnh</label>
                <button class="btn btn-secondary" type="button" data-action="open-camera" data-target="gate-${prefix}-face" data-facing="user">${icon("camera")} Camera</button>
                <button class="btn btn-secondary" type="button" data-action="load-demo-image" data-target="gate-${prefix}-face" data-demo-type="face">${icon("package")} Ảnh mẫu</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="gate-step">
        <div class="gate-step-number">03</div>
        <div class="gate-step-content" style="flex:1">
          <div style="font-weight:600;margin-bottom:6px">03 · Nhận diện biển số xe</div>
          <div class="file-drop" data-drop-for="gate-${prefix}-plate">
            <input id="gate-${prefix}-plate" name="plate_image" type="file" accept="image/*" capture="environment" aria-label="Ảnh biển số" required />
            <img class="file-drop-preview" data-preview-for="gate-${prefix}-plate" alt="Xem trước" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" hidden />
            <div class="file-drop-content">
              <div class="file-drop-icon">${icon("camera")}</div>
              <strong data-file-title>Ảnh biển số</strong>
              <span data-file-hint>Ưu tiên khung hình chính diện</span>
              <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:7px;margin-top:12px">
                <label class="btn btn-secondary" for="gate-${prefix}-plate">${icon("upload")} Chọn ảnh</label>
                <button class="btn btn-secondary" type="button" data-action="open-camera" data-target="gate-${prefix}-plate" data-facing="environment">${icon("camera")} Camera</button>
                <button class="btn btn-secondary" type="button" data-action="load-demo-image" data-target="gate-${prefix}-plate" data-demo-type="plate">${icon("package")} Ảnh mẫu</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <button class="btn btn-primary btn-block" type="submit" style="margin-top:18px">${icon("shield")} ${submitLabel}</button>
  </form>`;
}

function fileDrop(id, name, title, hint, facingMode, cameraButton = true, demoType = null) {
  return `<div class="file-drop" data-drop-for="${id}"><input id="${id}" name="${name}" type="file" accept="image/*" capture="${facingMode}" aria-label="${escapeHtml(title)}" required /><img class="file-drop-preview" data-preview-for="${id}" alt="Xem trước" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" hidden /><div class="file-drop-content"><div class="file-drop-icon">${icon("camera")}</div><strong data-file-title>${escapeHtml(title)}</strong><span data-file-hint>${escapeHtml(hint)}</span><div style="display:flex;flex-wrap:wrap;justify-content:center;gap:7px;margin-top:12px"><label class="btn btn-secondary" for="${id}">${icon("upload")} Chọn ảnh</label>${cameraButton ? `<button class="btn btn-secondary" type="button" data-action="open-camera" data-target="${id}" data-facing="${facingMode}">${icon("camera")} Camera</button>` : ""}${demoType ? `<button class="btn btn-secondary" type="button" data-action="load-demo-image" data-target="${id}" data-demo-type="${demoType}">${icon("package")} Ảnh mẫu</button>` : ""}</div></div></div>`;
}

function renderVerificationResult(result) {
  if (!result) {
    return `<div class="verification-result"><div class="result-idle"><div class="radar"><i class="radar-line"></i></div><strong>Đang chờ dữ liệu xác minh</strong><p>Quẹt thẻ và tải ảnh hoặc chụp trực tiếp từ camera để bắt đầu.</p></div></div>`;
  }

  const reasonMap = {
    CARD_UID_INVALID: "UID thẻ không hợp lệ",
    CARD_NOT_FOUND: "Thẻ không tìm thấy trong hệ thống",
    CARD_NOT_ACTIVE: "Thẻ không còn hoạt động",
    CARD_OWNER_NOT_FOUND: "Chủ thẻ không tìm thấy",
    CARD_OWNER_INACTIVE: "Chủ thẻ không còn hoạt động",
    FACE_NOT_CARD_OWNER: "Khuôn mặt không khớp với chủ thẻ",
    FACE_LOW_CONFIDENCE: "Không nhận diện được khuôn mặt",
    FACE_SPOOF: "Phát hiện giả mạo khuôn mặt",
    VEHICLE_NOT_MATCHED: "Không nhận diện được biển số xe",
    PLATE_LOW_CONFIDENCE: "Biển số xe không rõ ràng",
    DRIVER_VEHICLE_NOT_AUTHORIZED: "Chủ thẻ không được phép sử dụng xe này",
    EVIDENCE_STORE_UNEXPECTED_ERROR: "Lỗi lưu trữ bằng chứng",
    AI_PIPELINE_UNEXPECTED_ERROR: "Lỗi hệ thống nhận diện",
    ALL_CHECKS_PASSED: "Tất cả kiểm tra đạt yêu cầu",
  };

  const factors = [
    { label: "Thẻ nhân viên", key: "card_verified", icon: "card" },
    { label: "Khuôn mặt", key: "face_verified", icon: "face" },
    { label: "Biển số xe", key: "plate_verified", icon: "vehicle" },
    { label: "Ủy quyền", key: "authorization_verified", icon: "authorization" },
  ];

  const factorGrid = factors.map(f => `
    <div class="factor-result ${result[f.key] ? 'factor-pass' : 'factor-fail'}">
      <span>${f.label}</span>
      <span class="factor-badge">${result[f.key] ? '✓' : '✗'}</span>
    </div>
  `).join("");

  let heading, headingClass;
  const barrierOpened = result.verification_status === "PASSED" && result.permit_granted && result.barrier_status === "OPENED";
  if (barrierOpened) {
    heading = "Đã mở cổng";
    headingClass = "result-success";
  } else if (result.verification_status === "PASSED") {
    heading = "Xác thực hợp lệ — barrier chưa xác nhận";
    headingClass = "result-warning";
  } else {
    heading = "Từ chối";
    headingClass = "result-fail";
  }

  const driverName = result.driver_name || driverById(result.driver_id)?.full_name;
  const vehicleType = result.vehicle_type || vehicleById(result.vehicle_id)?.vehicle_type;

  return `
    <div class="verification-result ${headingClass}">
      <h3>${heading}</h3>
      <div class="factor-grid">${factorGrid}</div>
      <div class="info-list" style="margin-top:12px">
        ${driverName ? `<div class="info-row"><span>Nhân viên</span><strong>${escapeHtml(driverName)}</strong></div>` : ""}
        ${result.observed_plate ? `<div class="info-row"><span>Biển số</span><strong class="plate-number">${escapeHtml(result.observed_plate)}</strong></div>` : ""}
        ${vehicleType ? `<div class="info-row"><span>Loại xe</span><strong>${escapeHtml(vehicleType)}</strong></div>` : ""}
        ${result.reason_codes?.length ? `<div class="info-row"><span>Chi tiết</span><strong>${result.reason_codes.map(c => escapeHtml(reasonMap[c] || c)).join(", ")}</strong></div>` : ""}
        <div class="info-row"><span>Barrier</span><strong>${result.barrier_status === "OPENED" ? "Đã mở barrier" : result.barrier_status === "FAILED" ? "Barrier không phản hồi" : "Barrier đóng"}</strong></div>
      </div>
    </div>`;
}

function renderGateGuidance(isEntry) {
  const steps = isEntry
    ? [["card", "Quẹt thẻ RFID", "Quẹt thẻ hoặc nhập UID nhân viên hợp lệ."], ["camera", "Chụp dữ liệu", "Hai ảnh độc lập cho khuôn mặt và biển số."], ["shield", "Đối chiếu", "Thẻ ACTIVE, Face ≥ 0.75, biển số khớp ủy quyền."], ["gate", "Barrier ACK", "Chỉ hiển thị đã mở khi thiết bị trả xác nhận."]]
    : [["card", "Quẹt thẻ RFID", "Quẹt thẻ hoặc nhập UID nhân viên khi rời bãi."], ["camera", "Chụp dữ liệu", "Xác minh lại khuôn mặt và biển số."], ["shield", "Khớp ba yếu tố", "Thẻ + khuôn mặt + biển số trùng khớp ủy quyền."], ["gate", "Barrier ACK", "Hoàn tất lượt qua cổng sau khi barrier ACK."]];
  return `<section class="card"><header class="card-header"><div><h3>Chuỗi kiểm soát bãi xe</h3><p>Hệ thống luôn fail-closed</p></div></header><div class="card-body"><div class="timeline">${steps.map(([iconName, title, text]) => `<div class="timeline-item"><div class="timeline-dot">${icon(iconName)}</div><div class="timeline-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div></div>`).join("")}</div></div></section>`;
}

function renderGateLogs() {
  let items = state.gateLogs;
  const query = (state.search.logs || "").toLowerCase();
  if (query) items = items.filter((item) => [item.event_id, item.observed_plate, ...(item.reason_codes || [])].some((value) => String(value || "").toLowerCase().includes(query)));
  if (state.filters.logDirection !== "ALL") items = items.filter((item) => item.direction === state.filters.logDirection);
  if (state.filters.logStatus !== "ALL") items = items.filter((item) => item.verification_status === state.filters.logStatus);
  return `${pageHeader("Dấu vết kiểm toán", "Nhật ký xác minh cổng", "Truy vết điểm số, model, reason code, ảnh bằng chứng và trạng thái barrier.", `<button class="btn btn-secondary" data-action="reload-gate-logs">${icon("refresh")} Tải mới</button>`)}
    <div class="search-toolbar"><form class="search-box" data-form="search" data-key="logs">${icon("search")}<input name="query" value="${escapeHtml(state.search.logs || "")}" placeholder="Tìm event, biển số hoặc reason code" /></form><select class="toolbar-select" data-filter="logDirection"><option value="ALL">Cả hai chiều</option><option value="ENTRY" ${state.filters.logDirection === "ENTRY" ? "selected" : ""}>Cổng vào</option><option value="EXIT" ${state.filters.logDirection === "EXIT" ? "selected" : ""}>Cổng ra</option></select><select class="toolbar-select" data-filter="logStatus"><option value="ALL">Mọi kết quả</option><option value="PASSED" ${state.filters.logStatus === "PASSED" ? "selected" : ""}>Đạt</option><option value="FAILED" ${state.filters.logStatus === "FAILED" ? "selected" : ""}>Không đạt</option></select></div>
    <div class="table-shell">${items.length ? `<div class="table-scroll"><table><thead><tr><th>Thời gian / Event</th><th>Chiều</th><th>Nhân viên</th><th>Biển số / Loại xe</th><th>Yếu tố xác minh</th><th>Kết quả</th><th>Barrier</th><th>Lý do</th><th></th></tr></thead><tbody>${items.map(renderGateLogRow).join("")}</tbody></table></div>` : emptyState("logs", "Không có nhật ký phù hợp", "Thay đổi bộ lọc hoặc thực hiện một lượt xác minh tại cổng.")}</div>`;
}

function renderGateLogRow(item) {
  const driver = driverById(item.driver_id);
  const vehicle = vehicleById(item.vehicle_id);
  const driverName = item.driver_name || driver?.full_name || "—";
  const vehicleType = item.vehicle_type || vehicle?.vehicle_type || "—";
  const reasons = (item.reason_codes || []).map((code) => reasonMap[code] || code).join(", ") || "Đạt tất cả kiểm tra";

  const factorBadges = `
    <div class="factor-mini-badges" style="display:flex;gap:4px;flex-wrap:wrap">
      <span class="factor-result ${item.card_verified ? "factor-pass" : "factor-fail"}" style="padding:2px 6px;font-size:11px" title="Thẻ nhân viên">Thẻ ${item.card_verified ? "✓" : "✗"}</span>
      <span class="factor-result ${item.face_verified ? "factor-pass" : "factor-fail"}" style="padding:2px 6px;font-size:11px" title="Khuôn mặt">Face ${item.face_verified ? "✓" : "✗"}</span>
      <span class="factor-result ${item.plate_verified ? "factor-pass" : "factor-fail"}" style="padding:2px 6px;font-size:11px" title="Biển số xe">Biển số ${item.plate_verified ? "✓" : "✗"}</span>
      <span class="factor-result ${item.authorization_verified ? "factor-pass" : "factor-fail"}" style="padding:2px 6px;font-size:11px" title="Ủy quyền">Ủy quyền ${item.authorization_verified ? "✓" : "✗"}</span>
    </div>
  `;

  return `<tr>
    <td><div class="entity-copy"><strong>${escapeHtml(formatDate(item.occurred_at))}</strong><span title="${escapeHtml(item.event_id)}">${escapeHtml(shortId(item.event_id, 18))}</span></div></td>
    <td>${statusBadge(item.direction)}</td>
    <td><strong>${escapeHtml(driverName)}</strong></td>
    <td><span class="plate-number">${escapeHtml(item.observed_plate || "—")}</span><br/><small style="color:rgba(16,44,43,0.65)">${escapeHtml(vehicleType)}</small></td>
    <td>${factorBadges}</td>
    <td>${statusBadge(item.verification_status)}</td>
    <td>${statusBadge(item.barrier_status)}</td>
    <td><span title="${escapeHtml(reasons)}">${escapeHtml(shortId(reasons, 32))}</span></td>
    <td><button class="btn btn-ghost btn-icon" data-action="view-gate-log" data-id="${item.id}" title="Xem chi tiết">${icon("eye")}</button></td>
  </tr>`;
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
    <section class="grid grid-2" style="margin-top:18px"><article class="card"><header class="card-header"><div><h2>Điểm truy cập nội bộ</h2><p>Các dịch vụ trong cụm vận hành</p></div></header><div class="card-body"><div class="info-list">${endpointRow("Giao diện điều hành", location.origin, true)}${endpointRow("OpenAPI / Swagger", `${location.origin}/docs`, true)}${endpointRow("MinIO Console", `${location.protocol}//${location.hostname}:9001`, true)}${endpointRow("Barrier Simulator", `${location.protocol}//${location.hostname}:18080`, true)}${endpointRow("Camera Simulator", `${location.protocol}//${location.hostname}:18081`, true)}</div></div></article><article class="card"><header class="card-header"><div><h2>Nguyên tắc an toàn</h2><p>Các bảo đảm được duy trì xuyên suốt quy trình</p></div></header><div class="card-body"><div class="timeline"><div class="timeline-item"><div class="timeline-dot">${icon("shield")}</div><div class="timeline-copy"><strong>Session HttpOnly + CSRF</strong><span>Giao diện không lưu session token trong localStorage.</span></div></div><div class="timeline-item"><div class="timeline-dot">${icon("gate")}</div><div class="timeline-copy"><strong>Barrier ACK bắt buộc</strong><span>Kết quả AI không thể trực tiếp mở cổng.</span></div></div><div class="timeline-item"><div class="timeline-dot">${icon("card")}</div><div class="timeline-copy"><strong>Xác thực ba yếu tố</strong><span>Thẻ RFID, khuôn mặt và biển số xe bảo đảm tính toàn vẹn.</span></div></div></div></div></article></section>`;
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
    state.route = authorizedRoute(state.route);
    if (location.hash && normalizeRoute(location.hash.slice(1)) !== state.route) {
      location.hash = state.route;
    }
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
    ["gateLogs", api.get("/api/v1/gate-logs?limit=300")],
  ];
  if (state.user?.role === "ADMIN") {
    requests.push(["employeeCards", api.get("/api/v1/employee-cards")]);
  }
  if (canManageSecurity()) {
    requests.push(["alerts", api.get("/api/v1/security/alerts?after_sequence=0&limit=1000")]);
  }
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

function openGateLogDetail(logId) {
  const item = state.gateLogs.find((log) => log.id === logId);
  if (!item) return;
  const driver = driverById(item.driver_id);
  const vehicle = vehicleById(item.vehicle_id);
  const driverName = item.driver_name || driver?.full_name || item.driver_id || "Không xác định";
  const vehicleType = item.vehicle_type || vehicle?.vehicle_type || "—";
  const plateNumber = item.observed_plate || vehicle?.plate_number || "Không nhận diện";

  const factors = [
    { label: "Thẻ nhân viên", key: "card_verified" },
    { label: "Khuôn mặt", key: "face_verified" },
    { label: "Biển số xe", key: "plate_verified" },
    { label: "Ủy quyền", key: "authorization_verified" },
  ];

  const factorGrid = factors.map(f => `
    <div class="factor-result ${item[f.key] ? "factor-pass" : "factor-fail"}">
      <span>${f.label}</span>
      <span class="factor-badge">${item[f.key] ? "✓" : "✗"}</span>
    </div>
  `).join("");

  const reasonLabels = (item.reason_codes?.length ? item.reason_codes : ["ALL_CHECKS_PASSED"])
    .map(code => reasonMap[code] || code);

  openModal({
    title: `${labelFor(item.direction)} · ${plateNumber}`,
    subtitle: item.event_id,
    wide: true,
    body: `<div class="detail-grid">
      <div class="detail-box"><span>Kết quả</span><strong>${labelFor(item.verification_status)}</strong></div>
      <div class="detail-box"><span>Barrier</span><strong>${labelFor(item.barrier_status)}</strong></div>
      <div class="detail-box"><span>Nhân viên</span><strong>${escapeHtml(driverName)}</strong></div>
      <div class="detail-box"><span>Biển số / Loại xe</span><strong>${escapeHtml(plateNumber)} · ${escapeHtml(vehicleType)}</strong></div>
      <div class="detail-box"><span>Face similarity</span><strong>${formatPercent(item.face_similarity)}</strong></div>
      <div class="detail-box"><span>Plate score / kiểu khớp</span><strong>${formatPercent(item.plate_score)} · ${labelFor(item.plate_match_type)}</strong></div>
      <div class="detail-box"><span>Điểm tổng hợp</span><strong>${formatPercent(item.verification_score)}</strong></div>
      <div class="detail-box"><span>Thời gian</span><strong>${escapeHtml(formatDate(item.occurred_at))}</strong></div>
    </div>
    <div class="form-section" style="margin-top:18px">
      <div class="form-section-title">${icon("shield")} Yếu tố xác minh</div>
      <div class="factor-grid">${factorGrid}</div>
    </div>
    <div class="form-section" style="margin-top:18px">
      <div class="form-section-title">${icon("info")} Lý do xác minh</div>
      <div class="reason-list" style="justify-content:flex-start">
        ${reasonLabels.map((text) => `<span class="reason-chip">${escapeHtml(text)}</span>`).join("")}
      </div>
    </div>
    ${item.snapshot_count ? `<div class="form-section"><div class="form-section-title">${icon("camera")} Ảnh bằng chứng</div><div class="evidence-gallery">${Array.from({ length: item.snapshot_count }, (_, index) => `<article class="evidence-card"><img src="/api/v1/gate-logs/${item.id}/snapshots/${index}" alt="Ảnh bằng chứng ${index + 1}" loading="lazy" /><div class="evidence-label">Snapshot ${index + 1}</div></article>`).join("")}</div></div>` : ""}
    <div class="form-section"><div class="form-section-title">${icon("system")} Model và threshold</div><pre style="white-space:pre-wrap;font-size:11px;background:var(--ink-950);color:var(--mint);padding:14px;border-radius:10px">${escapeHtml(JSON.stringify({ threshold_version: item.threshold_version, model_versions: item.model_versions }, null, 2))}</pre></div>`,
    footer: `<button class="btn btn-primary" data-action="close-modal">Đóng</button>`,
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
  context.fillStyle = "#102c2b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#f2b84b";
  context.lineWidth = 12;
  context.strokeRect(65, 65, 830, 410);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#fffdf8";
  context.font = "700 42px sans-serif";
  const labels = {
    face: "KHUÔN MẶT MÔ PHỎNG",
    plate: "BIỂN SỐ 30A-12345",
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
    if (type === "issue-card") await submitEmployeeCard(form);
    if (type === "replace-card") await replaceEmployeeCard(form.dataset.cardId, form);
    if (type === "card-status") await changeEmployeeCardStatus(form.dataset.cardId, form.dataset.status, new FormData(form).get("status_reason"));
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
  state.route = authorizedRoute(state.route);
  if (location.hash && normalizeRoute(location.hash.slice(1)) !== state.route) {
    location.hash = state.route;
  }
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

async function submitGateVerification(form, direction) {
  const endpoint = direction === "entry" ? "/api/v1/gates/entry/verifications" : "/api/v1/gates/exit/verifications";
  const rawData = new FormData(form);
  const data = new FormData();
  const allowed = ["event_id", "gate_id", "card_uid", "face_image", "plate_image"];
  for (const field of allowed) {
    const val = rawData.get(field);
    if (val !== null && val !== undefined && val !== "") {
      if (val instanceof File && val.size === 0) continue;
      data.append(field, val);
    }
  }
  const result = await api.post(endpoint, data);
  const cardUidInput = form.querySelector('input[name="card_uid"]');
  if (cardUidInput) {
    cardUidInput.value = "";
  }
  state.verificationResults[direction] = result;
  await Promise.all([reloadGateLogsWithoutRender(), canManageSecurity() ? reloadAlertsWithoutRender() : Promise.resolve()]);
  renderShell();
  const barrierOpened = result.verification_status === "PASSED" && result.permit_granted && result.barrier_status === "OPENED";
  showToast(
    barrierOpened ? "Barrier đã xác nhận mở cổng."
      : result.verification_status === "PASSED" ? "Xác minh đạt nhưng barrier chưa mở."
      : "Xác minh không đạt; cổng được giữ đóng.",
    barrierOpened ? "success" : "warning",
    barrierOpened ? "Cho phép qua cổng" : "Cổng giữ đóng"
  );
}

async function reloadGateLogsWithoutRender() {
  state.gateLogs = await api.get("/api/v1/gate-logs?limit=300");
}

async function reloadAlertsWithoutRender() {
  state.alerts = await api.get("/api/v1/security/alerts?after_sequence=0&limit=1000");
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
  if (action === "open-card-modal") return openEmployeeCardModal(button.dataset.driver || null);
  if (action === "replace-card") return openReplaceEmployeeCardModal(button.dataset.id);
  if (action === "block-card") return openEmployeeCardStatusModal(button.dataset.id, "BLOCKED");
  if (action === "lost-card") return openEmployeeCardStatusModal(button.dataset.id, "LOST");
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
  if (action === "gate-tab") {
    state.gateTab = button.dataset.tab;
    renderShell();
    return;
  }
  if (action === "open-camera") return openCamera(button.dataset.target, button.dataset.facing);
  if (action === "capture-camera") return captureCamera(button.dataset.target);
  if (action === "load-demo-image") return loadDemoImage(button.dataset.target, button.dataset.demoType);
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
  state.employeeCards = [];
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
  if (
    action.dataset.action === "close-modal" &&
    action.classList.contains("modal-backdrop") &&
    event.target.closest("[data-modal-panel]")
  ) return;
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
  const rawRoute = normalizeRoute(location.hash.slice(1));
  const nextRoute = authorizedRoute(rawRoute);
  if (nextRoute !== rawRoute) {
    location.hash = nextRoute;
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
