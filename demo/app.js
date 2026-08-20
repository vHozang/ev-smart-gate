/**
 * EVN Smart-Gate MVP Demo Controller
 * Chuẩn mực thiết kế High-Agency (Anti-Emoji, Liquid Glass, Tactile Feedback)
 */

// Trạng thái ứng dụng
const state = {
  activeTab: 'guard-center',
  currentLane: 'lane-auto',
  currentScenario: 1,
  audioEnabled: true,
  gateState: 'CLOSED',
  portalRole: 'EMPLOYEE',
  auditLogCount: 1
};

// ============================================================================
// BỘ PHÁT HIỆU ỨNG ÂM THANH (Web Audio API)
// ============================================================================
let audioCtx = null;

function initAudio() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playSound(type) {
  if (!state.audioEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'alert') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.setValueAtTime(220, now + 0.15);
      osc.frequency.setValueAtTime(320, now + 0.3);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'click') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

// ============================================================================
// VẼ HÌNH ẢNH CAMERA TRỰC TIẾP TRÊN CANVAS
// ============================================================================
const canvas = document.getElementById('camera-canvas');
const ctx = canvas.getContext('2d');
let animFrameId = null;
let scanProgress = 0;

function renderCCTVFrame() {
  const w = canvas.width;
  const h = canvas.height;

  // Nền tối Slate
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#050811');
  grad.addColorStop(0.5, '#0b1324');
  grad.addColorStop(1, '#050811');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Làn đường góc nhìn phối cảnh
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.12)';
  ctx.lineWidth = 1;
  const horizon = h * 0.45;

  // Các vạch ngang lòng đường
  for (let y = horizon; y < h; y += (y - horizon + 10) * 0.25) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Vạch kẻ làn đường
  const centerX = w / 2;
  for (let xOffset = -260; xOffset <= 260; xOffset += 130) {
    ctx.beginPath();
    ctx.moveTo(centerX + xOffset * 0.15, horizon);
    ctx.lineTo(centerX + xOffset, h);
    ctx.stroke();
  }

  // Vẽ phương tiện theo kịch bản đang chọn
  const sc = window.SCENARIOS[state.currentScenario] || window.SCENARIOS[1];
  
  if (sc.vehicleType === 'CAR') {
    drawCarGraphic(w, h);
  } else if (sc.vehicleType === 'MOTORBIKE') {
    drawMotorbikeGraphic(w, h);
  } else if (sc.vehicleType === 'TRUCK') {
    drawTruckGraphic(w, h);
  }

  // Vệt quét AI mô phỏng
  scanProgress = (scanProgress + 1.5) % w;
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.25)';
  ctx.beginPath();
  ctx.moveTo(scanProgress, 0);
  ctx.lineTo(scanProgress, h);
  ctx.stroke();

  // Khung góc camera
  drawReticles(w, h);

  // Hạt nhiễu camera
  ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
  for (let i = 0; i < 25; i++) {
    const rx = Math.random() * w;
    const ry = Math.random() * h;
    ctx.fillRect(rx, ry, 2, 2);
  }

  animFrameId = requestAnimationFrame(renderCCTVFrame);
}

function drawReticles(w, h) {
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = 1.8;
  const size = 14;
  const pad = 16;

  // 4 góc khung ngắm
  ctx.beginPath();
  ctx.moveTo(pad, pad + size);
  ctx.lineTo(pad, pad);
  ctx.lineTo(pad + size, pad);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w - pad - size, pad);
  ctx.lineTo(w - pad, pad);
  ctx.lineTo(w - pad, pad + size);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(pad, h - pad - size);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(pad + size, h - pad);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w - pad - size, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.lineTo(w - pad, h - pad - size);
  ctx.stroke();
}

function drawCarGraphic(w, h) {
  const cx = w / 2;
  const cy = h * 0.58;

  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;

  // Kính trước và mui xe
  ctx.beginPath();
  ctx.moveTo(cx - 60, cy - 20);
  ctx.lineTo(cx - 35, cy - 65);
  ctx.lineTo(cx + 35, cy - 65);
  ctx.lineTo(cx + 60, cy - 20);
  ctx.closePath();
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.stroke();

  // Kính lái xe
  ctx.fillStyle = 'rgba(14, 165, 233, 0.18)';
  ctx.fillRect(cx - 30, cy - 58, 60, 32);

  // Thân trước
  ctx.beginPath();
  ctx.roundRect(cx - 95, cy - 20, 190, 65, 8);
  ctx.fillStyle = '#1e293b';
  ctx.fill();
  ctx.stroke();

  // Đèn xe
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(cx - 85, cy - 5, 25, 12);
  ctx.fillRect(cx + 60, cy - 5, 25, 12);

  // Biển số xe
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - 42, cy + 15, 84, 22);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 11px JetBrains Mono';
  ctx.textAlign = 'center';
  const sc = window.SCENARIOS[state.currentScenario] || window.SCENARIOS[1];
  ctx.fillText(sc.rawPlate, cx, cy + 30);
}

function drawMotorbikeGraphic(w, h) {
  const cx = w / 2;
  const cy = h * 0.55;

  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = 2;

  // Mũ bảo hiểm
  ctx.beginPath();
  ctx.arc(cx, cy - 60, 16, 0, Math.PI * 2);
  ctx.fillStyle = '#334155';
  ctx.fill();
  ctx.stroke();

  // Lưng người lái
  ctx.fillRect(cx - 28, cy - 42, 56, 40);

  // Đuôi xe máy
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(cx - 38, cy - 2, 76, 50);
  ctx.strokeRect(cx - 38, cy - 2, 76, 50);

  // Đèn hậu
  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(cx - 20, cy + 2, 40, 10);

  // Biển số sau xe máy
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - 32, cy + 18, 64, 26);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 10px JetBrains Mono';
  ctx.textAlign = 'center';
  const sc = window.SCENARIOS[state.currentScenario];
  ctx.fillText(sc.rawPlate, cx, cy + 35);
}

function drawTruckGraphic(w, h) {
  const cx = w / 2;
  const cy = h * 0.52;

  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;

  // Thùng xe tải
  ctx.strokeRect(cx - 110, cy - 75, 220, 100);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(cx - 110, cy - 75, 220, 100);

  // Cuộn cáp trong thùng xe
  if (state.currentScenario === 4) {
    ctx.strokeStyle = '#f43f5e';
    ctx.fillStyle = 'rgba(244, 63, 94, 0.25)';
    ctx.beginPath();
    ctx.arc(cx + 35, cy - 25, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Cản sau xe tải
  ctx.fillStyle = '#334155';
  ctx.fillRect(cx - 115, cy + 28, 230, 24);

  // Biển số xe tải
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - 45, cy + 30, 90, 20);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 11px JetBrains Mono';
  ctx.textAlign = 'center';
  const sc = window.SCENARIOS[state.currentScenario];
  ctx.fillText(sc.rawPlate, cx, cy + 44);
}

// ============================================================================
// ĐIỀU KHIỂN CHẠY KỊCH BẢN DEMO
// ============================================================================
window.runDemoScenario = function(scenarioId) {
  playSound('click');
  state.currentScenario = scenarioId;
  const sc = window.SCENARIOS[scenarioId];
  if (!sc) return;

  // Chuyển về màn hình Trực ban
  if (state.activeTab !== 'guard-center') {
    switchTab('guard-center');
  }

  // Cập nhật nút chọn nhanh
  document.querySelectorAll('.scenario-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === scenarioId - 1);
  });

  // Cập nhật nút chọn làn
  document.querySelectorAll('.lane-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lane === sc.lane);
  });

  // 1. Cập nhật thông tin Camera
  document.getElementById('current-cam-name').textContent = sc.camName;
  document.getElementById('tele-lane').textContent = sc.laneCode;
  document.getElementById('tele-timestamp').textContent = new Date().toLocaleTimeString();

  // 2. Cập nhật Dải tóm tắt biển số
  document.getElementById('spec-raw-plate').textContent = sc.rawPlate;
  document.getElementById('spec-norm-plate').textContent = sc.normPlate;
  document.getElementById('spec-plate-type').textContent = sc.plateType;
  document.getElementById('spec-ocr-fix').textContent = sc.ocrFix;

  // 3. Cập nhật Khung nhận diện trên Camera
  const pBox = document.getElementById('hud-plate-box');
  const fBox = document.getElementById('hud-face-box');
  const cBox = document.getElementById('hud-cargo-box');

  if (sc.hudBoxes.plate) {
    pBox.style.display = 'block';
    pBox.style.top = sc.hudBoxes.plate.top;
    pBox.style.left = sc.hudBoxes.plate.left;
    pBox.style.width = sc.hudBoxes.plate.width;
    pBox.style.height = sc.hudBoxes.plate.height;
    document.getElementById('hud-plate-tag').textContent = sc.hudBoxes.plate.text;
  }

  if (sc.hudBoxes.face) {
    fBox.style.display = 'block';
    fBox.style.top = sc.hudBoxes.face.top;
    fBox.style.left = sc.hudBoxes.face.left;
    fBox.style.width = sc.hudBoxes.face.width;
    fBox.style.height = sc.hudBoxes.face.height;
    document.getElementById('hud-face-tag').textContent = sc.hudBoxes.face.text;
  }

  if (sc.hudBoxes.cargo) {
    cBox.style.display = 'block';
    cBox.style.top = sc.hudBoxes.cargo.top;
    cBox.style.left = sc.hudBoxes.cargo.left;
    cBox.style.width = sc.hudBoxes.cargo.width;
    cBox.style.height = sc.hudBoxes.cargo.height;
    document.getElementById('hud-cargo-tag').textContent = sc.hudBoxes.cargo.text;
  } else {
    cBox.style.display = 'none';
  }

  // 4. Cập nhật Thẻ thông tin người ra vào
  document.getElementById('id-name').textContent = sc.driverName;
  document.getElementById('id-role').textContent = sc.driverRole;
  document.getElementById('id-reg-plate').textContent = sc.regPlate;
  document.getElementById('id-schedule').textContent = sc.scheduleText;
  document.getElementById('face-similarity-badge').textContent = `KHỚP: ${(sc.faceSimilarity * 100).toFixed(1)}%`;
  document.getElementById('identity-source').textContent = sc.identitySource;

  // 5. Cập nhật Bước 1: Kiểm tra điều kiện tiên quyết
  const blacklistVal = document.getElementById('val-blacklist');
  const hardBanner = document.getElementById('hard-rule-alert');
  const tier1Status = document.getElementById('tier-1-status');

  if (sc.hardRules.isBlacklisted) {
    blacklistVal.textContent = 'ĐỐI TƯỢNG BỊ CHẶN';
    blacklistVal.className = 'check-val val-red';
    tier1Status.textContent = 'TỪ CHỐI (VI PHẠM AN NINH)';
    tier1Status.className = 'step-status status-block';
    hardBanner.style.display = 'flex';
    playSound('alert');
  } else {
    blacklistVal.textContent = 'BÌNH THƯỜNG';
    blacklistVal.className = 'check-val val-green';
    tier1Status.textContent = 'HỢP LỆ (KHÔNG VI PHẠM)';
    tier1Status.className = 'step-status status-pass';
    hardBanner.style.display = 'none';
  }

  // 6. Cập nhật Bước 2: Điểm đánh giá rủi ro
  document.getElementById('risk-score-num').textContent = sc.riskScore;
  const chipsContainer = document.getElementById('score-breakdown-list');
  chipsContainer.innerHTML = '';
  sc.scoreChips.forEach(chip => {
    const span = document.createElement('span');
    span.className = `eval-chip ${chip.type}`;
    span.textContent = chip.text;
    chipsContainer.appendChild(span);
  });

  const gaugeFill = document.getElementById('risk-gauge-fill');
  gaugeFill.style.width = `${Math.min(100, Math.max(5, sc.riskScore))}%`;
  gaugeFill.className = 'gauge-fill ' + (sc.riskScore < 30 ? 'low' : sc.riskScore < 70 ? 'med' : 'high');

  // 7. Cập nhật Khung kết luận
  const dBadge = document.getElementById('decision-badge');
  dBadge.textContent = sc.decisionBadgeText;
  dBadge.className = `decision-badge ${sc.decisionBadgeClass}`;
  document.getElementById('decision-reason').textContent = sc.decisionReason;
  document.getElementById('gate-latency-val').textContent = sc.gateLatency;

  // 8. Đóng / Mở cần Barrier
  if (sc.autoOpenGate) {
    playSound('success');
    setBarrierState('OPENED');
  } else {
    setBarrierState('CLOSED');
  }

  // 9. Ghi vào Nhật ký ra vào
  appendAuditLog(sc.auditMessage);
};

// ============================================================================
// ĐIỀU KHIỂN VẬT LÝ CẦN BARRIER & CẢM BIẾN AN TOÀN
// ============================================================================
function setBarrierState(targetState) {
  const arm = document.getElementById('barrier-arm');
  const light = document.getElementById('barrier-light');
  const badge = document.getElementById('gate-state-badge');
  const loopSensor = document.getElementById('loop-sensor-badge');

  if (targetState === 'OPENED') {
    state.gateState = 'OPENED';
    arm.className = 'barrier-rod up';
    light.className = 'barrier-lamp green';
    badge.className = 'gate-status-badge status-opened';
    badge.textContent = 'CỔNG ĐANG MỞ (CHO PHÉP XE QUA)';
    
    // Mô phỏng xe di chuyển qua cảm biến an toàn sau 2.5s
    setTimeout(() => {
      loopSensor.innerHTML = '<span class="sensor-dot" style="background:#f59e0b;"></span> <span class="sensor-name">CẢM BIẾN: XE ĐANG ĐI QUA</span>';
      setTimeout(() => {
        loopSensor.innerHTML = '<span class="sensor-dot"></span> <span class="sensor-name">CẢM BIẾN: XE ĐÃ QUA AN TOÀN</span>';
        setBarrierState('CLOSED');
      }, 2000);
    }, 2500);

  } else {
    state.gateState = 'CLOSED';
    arm.className = 'barrier-rod down';
    light.className = 'barrier-lamp red';
    badge.className = 'gate-status-badge status-closed';
    badge.textContent = 'CỔNG ĐANG ĐÓNG';
  }
}

function guardManualAction(action) {
  playSound('click');
  if (action === 'OPEN') {
    const reason = prompt('Nhập lý do Bảo vệ Mở cổng thủ công:', 'Bảo vệ đã kiểm tra giấy tờ tay hợp lệ');
    if (reason) {
      playSound('success');
      setBarrierState('OPENED');
      appendAuditLog(`[BẢO VỆ MỞ CỔNG] Đã mở cổng thủ công. Lý do: "${reason}".`);
      alert('Đã gửi lệnh Mở cổng và ghi lại nhật ký trực ban thành công.');
    }
  } else if (action === 'BLOCK') {
    playSound('alert');
    setBarrierState('CLOSED');
    appendAuditLog(`[KHÓA BÁO ĐỘNG] Bảo vệ đã kích hoạt lệnh khóa cổng an ninh.`);
    alert('Đã khóa cổng và phát tín hiệu cảnh báo an ninh.');
  } else if (action === 'REVIEW') {
    playSound('click');
    appendAuditLog(`[YÊU CẦU KIỂM TRA] Bảo vệ chuyển sang luồng kiểm tra trực tiếp.`);
    alert('Đã chuyển sang luồng kiểm tra thực tế.');
  }
}

// ============================================================================
// GHI NHẬT KÝ RA VÀO THỜI GIAN THỰC
// ============================================================================
function appendAuditLog(message) {
  const terminal = document.getElementById('audit-terminal');
  const line = document.createElement('div');
  line.className = 'terminal-row';
  const time = new Date().toLocaleTimeString();
  line.innerHTML = `<span class="t-stamp">${time}</span> <span class="t-badge">[NHẬT KÝ]</span> ${message}`;
  terminal.appendChild(line);
  
  state.auditLogCount++;
  document.getElementById('log-count').textContent = `${state.auditLogCount} sự kiện`;
}

// ============================================================================
// ĐIỀU HƯỚNG MÀN HÌNH VÀ CHỌN LÀN
// ============================================================================
function switchTab(tabId) {
  playSound('click');
  state.activeTab = tabId;

  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  document.querySelectorAll('.tab-view').forEach(pane => {
    pane.classList.toggle('active', pane.id === `pane-${tabId}`);
  });
}

function switchLane(laneId) {
  playSound('click');
  state.currentLane = laneId;
  if (laneId === 'lane-auto') window.runDemoScenario(1);
  else if (laneId === 'lane-moto') window.runDemoScenario(3);
  else if (laneId === 'lane-exit') window.runDemoScenario(4);
}

function switchPortalRole(role) {
  playSound('click');
  state.portalRole = role;
  document.getElementById('role-employee-btn').classList.toggle('active', role === 'EMPLOYEE');
  document.getElementById('role-guest-btn').classList.toggle('active', role === 'GUEST');

  if (role === 'EMPLOYEE') {
    document.getElementById('p-fullname').value = 'Trần Thị Bích Ngọc';
    document.getElementById('p-idcard').value = 'EVN-2026-908';
    document.getElementById('p-department').value = 'Ban Kỹ thuật Viễn thông & CNTT';
    document.getElementById('p-purpose').value = 'Trực ca & Kiểm tra định kỳ';
  } else {
    document.getElementById('p-fullname').value = 'Công ty TNHH Thiết bị Điện Hoàng Nam';
    document.getElementById('p-idcard').value = '079088019923 (CCCD Đại diện)';
    document.getElementById('p-department').value = 'Đối tác Nhà thầu Xây lắp';
    document.getElementById('p-purpose').value = 'Giao cuộn cáp và máy biến áp theo Hợp đồng số 44';
  }
}

// ============================================================================
// XỬ LÝ ĐĂNG KÝ VÀ QUYỀN ĐƯỢC XÓA DỮ LIỆU
// ============================================================================
function handlePortalSubmit(e) {
  e.preventDefault();
  playSound('success');
  const name = document.getElementById('p-fullname').value;
  const plate = document.getElementById('p-plate').value;

  const authCode = 'EVN-SEC-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  document.getElementById('c-user').textContent = name;
  document.getElementById('c-id').textContent = `XN_${Date.now().toString().slice(-8)}`;
  document.getElementById('c-hash').textContent = authCode;
  document.getElementById('c-status').textContent = 'ĐANG CÓ HIỆU LỰC';
  document.getElementById('c-status').className = 'cert-status-tag';
  document.getElementById('deletion-trail-box').style.display = 'none';

  appendAuditLog(`Đã tạo hồ sơ đăng ký thành công cho [${name}] (Xe: ${plate}). Đã lưu cam kết bảo vệ thông tin.`);
  alert(`Đã đăng ký thành công hồ sơ cho [${name}]!\nDữ liệu nhận diện khuôn mặt và biển số xe đã được bảo vệ an toàn.`);
}

function triggerRightToErasure() {
  playSound('alert');
  const conf = confirm('BẠN CÓ CHẮC CHẮN MUỐN XÓA DỮ LIỆU KHUÔN MẶT CỦA MÌNH?\n\nHệ thống sẽ tiến hành xóa vĩnh viễn hình ảnh khuôn mặt trên toàn bộ máy chủ và camera theo đúng quy định bảo vệ dữ liệu cá nhân.');
  if (!conf) return;

  playSound('click');
  const trailBox = document.getElementById('deletion-trail-box');
  trailBox.style.display = 'block';

  document.getElementById('c-status').textContent = 'ĐÃ XÓA SẠCH DỮ LIỆU';
  document.getElementById('c-status').className = 'cert-status-tag val-red';

  const delCode = 'CHUNG_NHAN_XOA_' + Math.random().toString(36).substring(2, 8).toUpperCase();
  document.getElementById('del-hash').textContent = delCode;

  appendAuditLog(`Người dùng yêu cầu xóa thông tin khuôn mặt. Hệ thống đã xóa sạch hoàn toàn.`);
  playSound('success');
}

// ============================================================================
// KHỞI ĐỘNG HỆ THỐNG
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  const audioBtn = document.getElementById('audio-toggle');
  audioBtn.addEventListener('click', () => {
    state.audioEnabled = !state.audioEnabled;
    audioBtn.querySelector('.audio-text').textContent = state.audioEnabled ? 'ÂM THANH' : 'TẮT TIẾNG';
    playSound('click');
  });

  setInterval(() => {
    document.getElementById('live-clock').textContent = new Date().toLocaleTimeString();
  }, 1000);

  renderCCTVFrame();
  window.runDemoScenario(1);
});
