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
  });
});
