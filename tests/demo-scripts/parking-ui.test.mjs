import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "src", "smart_gate", "presentation", "static");
const appSource = readFileSync(join(root, "assets", "app.js"), "utf8");
const htmlSource = readFileSync(join(root, "index.html"), "utf8");
const allSource = appSource + htmlSource;

// Extract visible copy — string literals and template text
const visibleCopy = allSource;

describe("Parking-only SPA guard", () => {
  it("has no warehouse navigation or routes", () => {
    assert.doesNotMatch(appSource, /route:\s*["']\/warehouse["']/);
    assert.doesNotMatch(appSource, /renderWarehouse|refreshOrdersWithoutRender|slip_image/);
  });

  it("has no warehouse visible copy", () => {
    assert.doesNotMatch(visibleCopy, /Xuất kho|lệnh kho|dock|Exit Slip|QR phiếu xuất/i);
  });

  it("has employee-card route and features", () => {
    assert.match(appSource, /\/employee-cards/);
    assert.match(appSource, /card_uid/);
    assert.match(appSource, /card_verified/);
    assert.match(appSource, /authorization_verified/);
  });

  it("has updated meta description with RFID", () => {
    assert.match(htmlSource, /thẻ nhân viên RFID/);
  });

  it("has dashboard parking KPI grid metrics", () => {
    assert.match(appSource, /Vào bãi thành công/);
    assert.match(appSource, /Ra bãi thành công/);
    assert.match(appSource, /Thẻ đang hoạt động/);
    assert.match(appSource, /Từ chối an toàn/);
  });

  it("has card history audit fields", () => {
    assert.match(appSource, /updated_at/);
    assert.match(appSource, /replaces_card_id/);
    assert.match(appSource, /replaced_by_card_id/);
    assert.match(appSource, /Cập nhật:/);
    assert.match(appSource, /Thay thẻ:/);
    assert.match(appSource, /Được thay bởi:/);
  });

  it("has authorizedRoute helper protecting role-restricted routes", () => {
    assert.match(appSource, /function authorizedRoute\(route\)/);
  });

  it("has cleaned up dead warehouse artifacts", () => {
    const uiSource = readFileSync(join(root, "assets", "ui.js"), "utf8");
    const cssSource = readFileSync(join(root, "assets", "styles.css"), "utf8");
    assert.doesNotMatch(uiSource, /warehouse:\s*['"]/);
    assert.doesNotMatch(uiSource, /READY_FOR_EXIT/);
    assert.doesNotMatch(uiSource, /SLIP_ISSUED/);
    assert.doesNotMatch(cssSource, /\.order-board/);
    assert.doesNotMatch(cssSource, /\.order-card/);
    assert.doesNotMatch(cssSource, /\.entity-avatar\.order/);
    assert.doesNotMatch(cssSource, /status-ready-for-exit/);
    assert.doesNotMatch(cssSource, /status-slip-issued/);
    assert.doesNotMatch(uiSource, /qr:\s*['"]/);
  });

  it("gate form has three-factor fields and no warehouse controls", () => {
    // Extract renderGateForm function body for scoped assertions
    const gateFormMatch = appSource.match(/function renderGateForm\b[\s\S]*?^}/m);
    assert.ok(gateFormMatch, "renderGateForm function exists");
    const gateFormBody = gateFormMatch[0];

    // Gate form specifically uses these input names
    assert.match(gateFormBody, /name=["']card_uid["']/);
    assert.match(gateFormBody, /name=["']face_image["']/);
    assert.match(gateFormBody, /name=["']plate_image["']/);

    // card_uid is password type with autocomplete off in gate form
    assert.match(gateFormBody, /type=["']password["']/);
    assert.match(gateFormBody, /autocomplete=["']off["']/);

    // No warehouse gate artifacts anywhere in app
    assert.doesNotMatch(appSource, /name=["']slip_image["']/);
    assert.doesNotMatch(appSource, /gate-slip-order|load-order-qr/);
    assert.doesNotMatch(appSource, /name=["']order_id["']/);
    assert.doesNotMatch(appSource, /refreshOrdersWithoutRender/);

    // No device-specific hint
    assert.doesNotMatch(appSource, /vào đầu đọc/i);

    // card_uid is cleared after submit in submitGateVerification
    const submitMatch = appSource.match(/async function submitGateVerification[\s\S]*?^}/m);
    assert.ok(submitMatch, "submitGateVerification function exists");
    assert.match(submitMatch[0], /cardUidInput\.value\s*=\s*["']["']/);
  });

  it("gate results show all 14 reason codes with Vietnamese mappings and barrier safety", () => {
    // Extract renderVerificationResult for scoped checks
    const resultMatch = appSource.match(/function renderVerificationResult[\s\S]*?^}/m);
    assert.ok(resultMatch, "renderVerificationResult function exists");
    const resultBody = resultMatch[0];

    // All 14 stable reason codes must be in the result renderer
    const reasonCodes = [
      "CARD_UID_INVALID", "CARD_NOT_FOUND", "CARD_NOT_ACTIVE",
      "CARD_OWNER_NOT_FOUND", "CARD_OWNER_INACTIVE",
      "FACE_NOT_CARD_OWNER", "FACE_LOW_CONFIDENCE", "FACE_SPOOF",
      "VEHICLE_NOT_MATCHED", "PLATE_LOW_CONFIDENCE",
      "DRIVER_VEHICLE_NOT_AUTHORIZED",
      "EVIDENCE_STORE_UNEXPECTED_ERROR", "AI_PIPELINE_UNEXPECTED_ERROR",
      "ALL_CHECKS_PASSED",
    ];
    for (const code of reasonCodes) {
      assert.match(resultBody, new RegExp(code), `Missing reason code in result renderer: ${code}`);
    }

    // Four factor booleans used individually in result renderer
    assert.match(resultBody, /card_verified/);
    assert.match(resultBody, /face_verified/);
    assert.match(resultBody, /plate_verified/);
    assert.match(resultBody, /authorization_verified/);

    // Barrier safety: three-way conjunction for success heading
    assert.match(resultBody, /verification_status\s*===\s*["']PASSED["'].*permit_granted.*barrier_status\s*===\s*["']OPENED["']/);

    // Barrier warning copy exists
    assert.match(resultBody, /Xác thực hợp lệ — barrier chưa xác nhận/);

    // Submit labels
    assert.match(appSource, /Xác minh và mở Gate In/);
    assert.match(appSource, /Xác minh và mở Gate Out/);
  });

  it("gate history shows factor badges with direction and driver info", () => {
    // Gate log rendering uses factor classes
    const logRowMatch = appSource.match(/function renderGateLogRow[\s\S]*?^}/m);
    assert.ok(logRowMatch, "renderGateLogRow function exists");
    const logRowBody = logRowMatch[0];

    assert.match(logRowBody, /factor-pass|factor-fail/);
    assert.match(logRowBody, /factor-result/);
    assert.match(logRowBody, /direction/);
    assert.match(logRowBody, /driver_name|driverById/);
    assert.match(logRowBody, /vehicle_type/);
    assert.match(logRowBody, /barrier_status/);

    // Factor grid class in either result or history
    assert.match(appSource, /factor-grid/);
  });
});
