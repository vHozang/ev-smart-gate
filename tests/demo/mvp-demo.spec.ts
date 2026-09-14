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
  orderId: string;
  faceImage: Buffer;
  plateImage: Buffer;
  cargoImage: Buffer;
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
  expect(response.ok(), `${label}: HTTP ${response.status()} ${await response.text()}`).toBeTruthy();
}

async function prepareDemoIdentity(page: Page): Promise<DemoIdentity> {
  const runLabel = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const driverName = `Tài xế Demo ${runLabel.slice(-6)}`;
  const employeeCode = `MVP-${runLabel}`;
  const orderId = `MVP-DEMO-${runLabel}`;
  const plateNumber = "30A-12345";

  const [faceResponse, plateResponse, cargoResponse] = await Promise.all([
    page.request.get(`${cameraURL}/face.jpg`),
    page.request.get(`${cameraURL}/plate.jpg`),
    page.request.get(`${cameraURL}/cargo.jpg`),
  ]);
  await expectOk(faceResponse, "Load simulated face image");
  await expectOk(plateResponse, "Load simulated plate image");
  await expectOk(cargoResponse, "Load simulated cargo image");

  // JPEG decoders ignore bytes after EOI, while simulated face embeddings remain unique per run.
  const faceImage = Buffer.concat([await faceResponse.body(), Buffer.from(employeeCode)]);
  const plateImage = await plateResponse.body();
  const cargoImage = await cargoResponse.body();

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
        vehicle_type: "Xe tải điện",
        make: "EV Logistics",
        model: "MVP Demo",
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
    orderId,
    faceImage,
    plateImage,
    cargoImage,
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

  await demoStep("intro", "Mở trung tâm điều hành EV Smart Gate", async () => {
    await page.goto("/");
    await expect(page).toHaveTitle(/EV Smart Gate/);
    await expect(page.getByRole("heading", { name: "Đăng nhập vận hành" })).toBeVisible();
  });

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
    await expect(page.getByText("Hệ thống đang trực tuyến", { exact: true })).toBeVisible();
  });

  identity = await prepareDemoIdentity(page);

  await demoStep("identity", "Hiển thị hồ sơ tin cậy của chuyến xe", async () => {
    await page.getByRole("button", { name: "Làm mới" }).click();
    await page.getByRole("button", { name: "Tài xế", exact: true }).click();
    await expect(page.getByText(identity.driverName, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Ủy quyền/ }).click();
    const authorizationRow = page.getByRole("row").filter({ hasText: identity.driverName });
    await expect(authorizationRow.getByText(identity.driverName, { exact: true })).toBeVisible();
    await expect(
      authorizationRow.getByText(identity.plateNumber, { exact: true }),
    ).toBeVisible();
  });

  await demoStep("gate-entry", "Xác minh tài xế và phương tiện tại Gate In", async () => {
    await page.getByRole("button", { name: /Kiểm soát cổng/ }).click();
    await setImage(page, "Ảnh biển số", "mvp-demo-plate.jpg", identity.plateImage);
    await setImage(page, "Ảnh khuôn mặt", "mvp-demo-face.jpg", identity.faceImage);
    await page
      .getByRole("button", { name: /Xác minh và yêu cầu mở Gate In/ })
      .click();
    await expect(page.getByRole("heading", { name: "Đã mở cổng" })).toBeVisible();
    await expect(page.getByText(identity.driverName, { exact: true })).toBeVisible();
  });

  await demoStep("warehouse-order", "Tạo lệnh xuất kho cho chuyến xe đã xác minh", async () => {
    await page.getByRole("button", { name: /Xuất kho/ }).click();
    await page.getByRole("button", { name: /Tạo lệnh mới/ }).click();
    const dialog = page.getByRole("dialog", { name: "Tạo lệnh xuất kho" });
    await dialog.locator('[name="order_id"]').fill(identity.orderId);
    await dialog.locator('[name="assigned_driver_id"]').selectOption(identity.driverId);
    await dialog.locator('[name="assigned_vehicle_id"]').selectOption(identity.vehicleId);
    await dialog.locator('[name="cargo_sku"]').fill("PIN-EV-MVP");
    await dialog.locator('[name="cargo_quantity"]').fill("12");
    const orderCreated = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname === "/api/v1/warehouse/orders"
      );
    });
    await page.getByRole("button", { name: "Tạo lệnh", exact: true }).click();
    expect((await orderCreated).status()).toBe(201);
    await expect(page.getByRole("heading", { name: identity.orderId })).toBeVisible();
  });

  await demoStep("cargo-inspection", "Kiểm hàng và xác nhận trạng thái tại dock", async () => {
    await page.getByRole("heading", { name: identity.orderId }).click();
    await page.getByRole("button", { name: /Bắt đầu kiểm hàng/ }).click();
    await page.getByRole("button", { name: /Ghi nhận ảnh hàng/ }).click();
    await setImage(page, "Ảnh khoang hàng / pallet", "mvp-demo-cargo.jpg", identity.cargoImage);
    await page.getByRole("button", { name: /Lưu ghi nhận/ }).click();
    await expect(page.getByText("1 lần ghi nhận", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: /Nhân viên kho kết luận/ }).click();
    const conclusion = page.getByRole("dialog", { name: "Nhân viên kho kết luận" });
    await conclusion.locator('[name="final_cargo_state"]').selectOption("LOADED");
    await conclusion
      .locator('[name="operator_note"]')
      .fill("Hàng hóa đã đủ và sẵn sàng rời kho.");
    await page.getByRole("button", { name: /Xác nhận kết luận/ }).click();
    const finalizedDock = page.getByRole("dialog", {
      name: `Phiên dock · ${identity.orderId}`,
    });
    await expect(
      finalizedDock.getByText("Đã duyệt · 1 lần ghi nhận", { exact: true }),
    ).toBeVisible();
  });

  await demoStep("signed-slip", "Phát hành Exit Slip QR ký số", async () => {
    await page
      .getByRole("dialog", { name: `Phiên dock · ${identity.orderId}` })
      .getByRole("contentinfo")
      .getByRole("button", { name: "Đóng", exact: true })
      .click();
    await page.getByRole("heading", { name: identity.orderId }).click();
    await page.getByRole("button", { name: /Phát hành Exit Slip/ }).click();
    await expect(page.getByRole("heading", { name: `Exit Slip · ${identity.orderId}` })).toBeVisible();
    await expect(page.getByRole("img", { name: `QR Exit Slip ${identity.orderId}` })).toBeVisible();
  });

  await demoStep("gate-exit", "Đối chiếu ba chiều và mở Gate Out", async () => {
    await page.getByRole("button", { name: "Đóng" }).click();
    await page.getByRole("button", { name: /Kiểm soát cổng/ }).click();
    await page.getByRole("button", { name: /Gate Out/ }).click();
    await setImage(page, "Ảnh biển số", "mvp-demo-plate.jpg", identity.plateImage);
    await setImage(page, "Ảnh khuôn mặt", "mvp-demo-face.jpg", identity.faceImage);
    await page.getByLabel("Lấy QR từ lệnh đã cấp").selectOption(identity.orderId);
    await page.getByRole("button", { name: /Nạp QR của lệnh/ }).click();
    await expect(page.getByText("QR của lệnh đã được nạp", { exact: false })).toBeVisible();
    await page
      .getByRole("button", { name: /Xác minh ba chiều và yêu cầu mở Gate Out/ })
      .click();
    await expect(page.getByRole("heading", { name: "Đã mở cổng" })).toBeVisible();
    await expect(page.getByText(identity.orderId, { exact: true })).toBeVisible();
  });

  await demoStep("success", "Xác nhận lệnh đã hoàn tất và lưu vết", async () => {
    await page.getByRole("button", { name: /Xuất kho/ }).click();
    await page.getByRole("heading", { name: identity.orderId }).click();
    await expect(page.getByText("Lệnh xuất kho · Hoàn tất", { exact: true })).toBeVisible();
    await expect(page.getByText("Hoàn tất", { exact: true }).last()).toBeVisible();
  }, Number(process.env.DEMO_OUTRO_MS || 1_800) + 4_500);

  expect(pageErrors, `Unexpected page errors: ${pageErrors.join(" | ")}`).toEqual([]);
  await mkdir(outputDirectory, { recursive: true });
  const timelinePath = path.join(outputDirectory, "timeline.json");
  await writeFile(timelinePath, `${JSON.stringify(timeline, null, 2)}\n`, "utf8");
  await testInfo.attach("timeline", {
    path: timelinePath,
    contentType: "application/json",
  });
});
