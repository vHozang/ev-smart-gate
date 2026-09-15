import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

interface TimelineEntry {
  id: string;
  step: string;
  startMs: number;
  endMs: number;
}

interface DemoIdentity {
  driverId: string;
  driverName: string;
  vehicleId: string;
  plateNumber: string;
  vehicleType: string;
  oldCardUid: string;
  newCardUid: string;
  faceImage: Buffer;
  plateImage: Buffer;
}

const outputDirectory = path.resolve("dist/demo");
const baseURL = process.env.DEMO_BASE_URL || "http://localhost:8000";
const cameraURL = process.env.DEMO_CAMERA_URL || "http://localhost:18081";
const username = process.env.ADMIN_USERNAME || "admin";
const password = process.env.ADMIN_PASSWORD;

function assertConfiguredPassword(value: string | undefined): asserts value is string {
  if (!value) {
    throw new Error("ADMIN_PASSWORD must be supplied by .env or the safe local .env.example file.");
  }
}

async function expectOk(response: Awaited<ReturnType<APIRequestContext["get"]>>, label: string) {
  expect(response.ok(), `${label}: HTTP ${response.status()}`).toBeTruthy();
}

async function prepareDemoIdentity(page: Page): Promise<DemoIdentity> {
  const runLabel = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const driverName = `Tài xế Demo ${runLabel.slice(-6)}`;
  const employeeCode = `MVP-${runLabel}`;
  const plateNumber = "30A-12345";
  const oldCardUid = `DEMO-${runLabel}-OLDC`;
  const newCardUid = `DEMO-${runLabel}-NEWC`;

  const [faceResponse, plateResponse] = await Promise.all([
    page.request.get(`${cameraURL}/face.jpg`),
    page.request.get(`${cameraURL}/plate.jpg`),
  ]);
  await expectOk(faceResponse, "Load simulated face image");
  await expectOk(plateResponse, "Load simulated plate image");

  // JPEG decoders ignore bytes after EOI, while simulated face embeddings remain unique per run.
  const faceImage = Buffer.concat([await faceResponse.body(), Buffer.from(employeeCode)]);
  const plateImage = await plateResponse.body();

  const meResponse = await page.request.get(`${baseURL}/api/v1/auth/me`);
  await expectOk(meResponse, "Read authenticated demo session");
  const csrfToken = (await meResponse.json()).csrf_token as string;
  const mutationHeaders = { "X-CSRF-Token": csrfToken };

  const driverResponse = await page.request.post(`${baseURL}/api/v1/drivers`, {
    headers: mutationHeaders,
    multipart: {
      full_name: driverName,
      employee_code: employeeCode,
      face_image: {
        name: "mvp-demo-face.jpg",
        mimeType: "image/jpeg",
        buffer: faceImage,
      },
    },
  });
  await expectOk(driverResponse, "Create demo driver");
  const driver = await driverResponse.json();

  const vehiclesResponse = await page.request.get(`${baseURL}/api/v1/vehicles`);
  await expectOk(vehiclesResponse, "List demo vehicles");
  const vehicles = (await vehiclesResponse.json()) as Array<{
    id: string;
    plate_number: string;
    plate_normalized: string;
    vehicle_type: string;
    status: string;
  }>;
  let vehicle = vehicles.find(
    (candidate) => candidate.plate_normalized === "30A12345" && candidate.status === "ACTIVE",
  );
  if (!vehicle) {
    const vehicleResponse = await page.request.post(`${baseURL}/api/v1/vehicles`, {
      headers: mutationHeaders,
      data: {
        plate_number: plateNumber,
        vehicle_type: "Xe điện",
        make: "VinFast",
        model: "VF e34",
        color: "Xanh",
        metadata: { purpose: "automated-demo" },
      },
    });
    await expectOk(vehicleResponse, "Create demo vehicle");
    vehicle = await vehicleResponse.json();
  }

  const now = Date.now();
  const authorizationResponse = await page.request.post(
    `${baseURL}/api/v1/driver-vehicle-authorizations`,
    {
      headers: mutationHeaders,
      data: {
        driver_id: driver.id,
        vehicle_id: vehicle.id,
        valid_from: new Date(now - 10 * 60_000).toISOString(),
        valid_until: new Date(now + 9 * 60 * 60_000).toISOString(),
      },
    },
  );
  await expectOk(authorizationResponse, "Authorize demo driver and vehicle");

  return {
    driverId: driver.id,
    driverName,
    vehicleId: vehicle.id,
    plateNumber: vehicle.plate_number,
    vehicleType: vehicle.vehicle_type,
    oldCardUid,
    newCardUid,
    faceImage,
    plateImage,
  };
}

async function setImage(page: Page, accessibleName: string, filename: string, buffer: Buffer) {
  await page.getByLabel(accessibleName, { exact: true }).setInputFiles({
    name: filename,
    mimeType: "image/jpeg",
    buffer,
  });
}

test("MVP narrated demo", async ({ page }, testInfo) => {
  assertConfiguredPassword(password);
  const timeline: TimelineEntry[] = [];
  const demoStartedAt = Date.now();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  async function demoStep(
    id: string,
    title: string,
    action: () => Promise<void>,
    holdMs = 6_000,
  ) {
    const startMs = Date.now() - demoStartedAt;
    await test.step(title, async () => {
      await action();
      if (holdMs > 0) await page.waitForTimeout(holdMs);
    });
    timeline.push({ id, step: title, startMs, endMs: Date.now() - demoStartedAt });
  }

  let identity: DemoIdentity;

  // 1. intro — Open parking control center
  await demoStep("intro", "Mở trung tâm kiểm soát bãi xe EV Smart Gate", async () => {
    await page.goto("/");
    await expect(page).toHaveTitle(/EV Smart Gate/);
    await expect(page.getByRole("heading", { name: "Đăng nhập vận hành" })).toBeVisible();

    const introBodyText = await page.locator("body").textContent();
    expect(introBodyText).not.toMatch(/Xuất kho|lệnh kho|dock|Exit Slip|QR phiếu xuất/i);
  });

  // 2. login — Log in with safe operations session
  await demoStep("login", "Đăng nhập bằng phiên vận hành an toàn", async () => {
    await page.getByLabel("Tên đăng nhập").fill(username);
    await page.evaluate((secret) => {
      const input = document.querySelector<HTMLInputElement>("#login-password");
      if (!input) throw new Error("Password field was not found.");
      input.value = secret;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, password);
    await page.getByRole("button", { name: /Vào trung tâm điều hành/ }).click();
    await expect(page.getByRole("heading", { name: /hệ thống đã sẵn sàng/i })).toBeVisible();

    // Assert absence of warehouse copy after login
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/Xuất kho|lệnh kho|dock|Exit Slip|QR phiếu xuất/i);
  });

  identity = await prepareDemoIdentity(page);

  // 3. identity-registration — Show employee profile, face, vehicle & vehicle type
  await demoStep("identity-registration", "Hiển thị hồ sơ nhân viên, khuôn mặt, xe và loại xe", async () => {
    await page.getByRole("button", { name: "Làm mới" }).click();
    // Show driver page with face enrollment
    await page.getByRole("button", { name: "Tài xế", exact: true }).click();
    await expect(page.getByText(identity.driverName, { exact: true })).toBeVisible();
    // Show vehicle page with plate and vehicle type
    await page.getByRole("button", { name: "Phương tiện", exact: true }).click();
    const vehicleRow = page.getByRole("row").filter({ hasText: identity.plateNumber });
    await expect(vehicleRow.getByText(identity.plateNumber, { exact: true })).toBeVisible();
    await expect(vehicleRow.getByText(identity.vehicleType, { exact: true })).toBeVisible();
    // Show authorization linking driver to vehicle
    await page.getByRole("button", { name: /Ủy quyền/ }).click();
    const authRow = page.getByRole("row").filter({ hasText: identity.driverName });
    await expect(authRow.getByText(identity.driverName, { exact: true })).toBeVisible();
    await expect(authRow.getByText(identity.plateNumber, { exact: true })).toBeVisible();
  });

  // 4. card-issuance — Issue employee card
  await demoStep("card-issuance", "Cấp thẻ nhân viên", async () => {
    // Navigate to employee cards
    await page.getByRole("button", { name: /Quản lý thẻ|Thẻ nhân viên/ }).click();
    // Click "Cấp thẻ mới" button
    await page.getByRole("button", { name: /Cấp thẻ mới/ }).click();
    // Fill card issuance form - find the dialog
    const dialog = page.getByRole("dialog");
    // Select the demo driver
    await dialog.locator('[name="driver_id"]').selectOption(identity.driverId);
    // Fill card_uid using page.evaluate to avoid exposing in trace
    await page.evaluate((uid) => {
      const input = document.querySelector<HTMLInputElement>('[role="dialog"] [name="card_uid"]');
      if (!input) throw new Error("card_uid field not found");
      input.value = uid;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, identity.oldCardUid);
    // Submit
    await dialog.getByRole("button", { name: /Cấp thẻ|Lưu/ }).click();
    // Assert masked suffix and ACTIVE status visible for the demo driver
    const driverArticle = page.locator("article.card").filter({ hasText: identity.driverName });
    await expect(driverArticle.locator('.card-active .card-uid')).toContainText("OLDC");
    await expect(driverArticle.locator('.card-active').getByText("Đang hoạt động")).toBeVisible();
  });

  // 5. card-replacement — Replace card and keep old card history
  await demoStep("card-replacement", "Thay thẻ và lưu lịch sử thẻ cũ", async () => {
    // Click "Thay thẻ" button on the demo driver's card
    const driverArticle = page.locator("article.card").filter({ hasText: identity.driverName });
    await driverArticle.getByRole("button", { name: /Thay thẻ/ }).click();
    const replaceDialog = page.getByRole("dialog");
    // Fill new card UID securely
    await page.evaluate((uid) => {
      const input = document.querySelector<HTMLInputElement>('[role="dialog"] [name="card_uid"]');
      if (!input) throw new Error("card_uid field not found in replace dialog");
      input.value = uid;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, identity.newCardUid);
    // Fill reason
    await replaceDialog.locator('[name="status_reason"]').fill("Thẻ cũ bị mờ chip");
    // Submit
    await replaceDialog.getByRole("button", { name: /Thay thẻ|Xác nhận/ }).click();
    // New card is active with distinct suffix
    await expect(driverArticle.locator('.card-active .card-uid')).toContainText("NEWC");
    await expect(driverArticle.locator('.card-active').getByText("Đang hoạt động")).toBeVisible();
    // Old card in history shows "Đã thay thế"
    await expect(driverArticle.locator('.card-history').getByText("Đã thay thế")).toBeVisible();
  });

  // 6. gate-entry — Three-factor verification at Gate In
  await demoStep("gate-entry", "Xác thực thẻ, khuôn mặt và biển số tại Gate In", async () => {
    await page.getByRole("button", { name: /Kiểm soát cổng/ }).click();
    // Fill card_uid securely (password field)
    await page.evaluate((uid) => {
      const input = document.querySelector<HTMLInputElement>('input[name="card_uid"]');
      if (!input) throw new Error("card_uid gate field not found");
      input.value = uid;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, identity.newCardUid);
    await setImage(page, "Ảnh khuôn mặt", "mvp-demo-face.jpg", identity.faceImage);
    await setImage(page, "Ảnh biển số", "mvp-demo-plate.jpg", identity.plateImage);
    await page.getByRole("button", { name: /Xác minh và mở Gate In/ }).click();
    await expect(page.getByRole("heading", { name: "Đã mở cổng" })).toBeVisible();
    await expect(page.getByText(identity.driverName, { exact: true })).toBeVisible();
    await expect(page.getByText(identity.plateNumber, { exact: true })).toBeVisible();
    await expect(page.getByText(identity.vehicleType, { exact: false })).toBeVisible();
    // Verify factor badges all pass
    await expect(page.locator(".factor-pass")).toHaveCount(4);
  });

  // 7. safe-rejection — Reject old (replaced) card safely
  await demoStep("safe-rejection", "Từ chối an toàn thẻ đã được thay thế", async () => {
    // Reload gate form (may need to navigate back or use a new event_id)
    // Fill OLD card_uid
    await page.evaluate((uid) => {
      const input = document.querySelector<HTMLInputElement>('input[name="card_uid"]');
      if (!input) throw new Error("card_uid gate field not found");
      input.value = uid;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      // Also update event_id for new attempt
      const eventInput = document.querySelector<HTMLInputElement>('input[name="event_id"]');
      if (eventInput) {
        eventInput.value = `reject-${Date.now()}`;
        eventInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, identity.oldCardUid);
    await setImage(page, "Ảnh khuôn mặt", "mvp-demo-face.jpg", identity.faceImage);
    await setImage(page, "Ảnh biển số", "mvp-demo-plate.jpg", identity.plateImage);
    await page.getByRole("button", { name: /Xác minh và mở Gate In/ }).click();
    // Should be rejected
    await expect(page.getByRole("heading", { name: "Từ chối" })).toBeVisible();
    // CARD_NOT_ACTIVE guidance — safe Vietnamese, not revealing blocked/lost/replaced
    await expect(page.getByText("Thẻ không còn hoạt động", { exact: false })).toBeVisible();
    await expect(page.locator(".factor-fail").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Đã mở cổng" })).not.toBeVisible();
    // Assert barrier is closed/not-requested
    await expect(page.getByText("Barrier đóng", { exact: false })).toBeVisible();
    await expect(page.getByText("Đã mở barrier", { exact: false })).not.toBeVisible();
  });

  // 8. gate-exit — Three-factor at Gate Out
  await demoStep("gate-exit", "Xác thực cùng ba yếu tố tại Gate Out", async () => {
    // Switch to Gate Out tab
    await page.getByRole("button", { name: /Gate Out/ }).click();
    // Fill new card_uid securely
    await page.evaluate((uid) => {
      const input = document.querySelector<HTMLInputElement>('input[name="card_uid"]');
      if (!input) throw new Error("card_uid gate field not found");
      input.value = uid;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, identity.newCardUid);
    await setImage(page, "Ảnh khuôn mặt", "mvp-demo-face.jpg", identity.faceImage);
    await setImage(page, "Ảnh biển số", "mvp-demo-plate.jpg", identity.plateImage);
    await page.getByRole("button", { name: /Xác minh và mở Gate Out/ }).click();
    await expect(page.getByRole("heading", { name: "Đã mở cổng" })).toBeVisible();
    await expect(page.getByText(identity.driverName, { exact: true })).toBeVisible();
    await expect(page.getByText(identity.plateNumber, { exact: true })).toBeVisible();
    await expect(page.getByText(identity.vehicleType, { exact: false })).toBeVisible();
    await expect(page.locator(".factor-pass")).toHaveCount(4);
    // No order/QR interaction needed
  });

  // 9. history — View entry, rejection, and exit history
  await demoStep("history", "Xem lịch sử vào, từ chối và ra", async () => {
    // Check gate log history shows all three events
    // Scroll to history or click history tab
    await page.getByRole("button", { name: /Nhật ký cổng/ }).click();
    // Demo driver's successful gate rows
    const demoRows = page.locator("tbody tr").filter({ hasText: identity.driverName });
    await expect(demoRows.first()).toBeVisible();
    // Entry and exit by driver name
    await expect(demoRows.filter({ hasText: "Cổng vào" }).first()).toBeVisible();
    await expect(demoRows.filter({ hasText: "Cổng ra" }).first()).toBeVisible();
    // Rejection event: no driver_name (card fails before owner lookup), find by event_id prefix
    const rejectionRow = page.locator("tbody tr").filter({ hasText: /reject-/ });
    await expect(rejectionRow.first()).toBeVisible();
    // Plate and vehicle type in driver's successful rows
    await expect(demoRows.filter({ hasText: identity.plateNumber }).first()).toBeVisible();
    await expect(demoRows.filter({ hasText: identity.vehicleType }).first()).toBeVisible();
    // No raw card_uid visible anywhere in the page
    const hasNoRawCardUids = await page.evaluate(
      ({ oldUid, newUid }) => {
        const text = document.body.textContent || "";
        return !text.includes(oldUid) && !text.includes(newUid);
      },
      { oldUid: identity.oldCardUid, newUid: identity.newCardUid },
    );
    expect(hasNoRawCardUids, "Raw card UIDs must not appear in page text").toBeTruthy();
  });

  // 10. success — Complete parking control flow
  await demoStep("success", "Hoàn tất luồng kiểm soát bãi xe", async () => {
    // Go back to dashboard
    await page.getByRole("button", { name: /Tổng quan|Dashboard/ }).click();
    // Verify parking KPIs visible
    await expect(page.getByText("Vào bãi thành công", { exact: false })).toBeVisible();
    // Assert no warehouse navigation or copy visible
    const finalBodyText = await page.locator("body").textContent();
    expect(finalBodyText).not.toMatch(/Xuất kho|lệnh kho|dock|Exit Slip|QR phiếu xuất/i);
  }, Number(process.env.DEMO_OUTRO_MS || 1_800) + 4_500);

  expect(pageErrors, `Unexpected page errors: ${pageErrors.join(" | ")}`).toEqual([]);
  await mkdir(outputDirectory, { recursive: true });
  const timelinePath = path.join(outputDirectory, "timeline.json");
  await writeFile(timelinePath, `${JSON.stringify(timeline, null, 2)}\n`, "utf8");
  await testInfo.attach("timeline", {
    path: timelinePath,
    contentType: "application/json",
  });
  // Verify exactly 10 timeline entries
  expect(timeline).toHaveLength(10);
});
