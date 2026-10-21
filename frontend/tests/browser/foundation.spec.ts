import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
// QA giao diện thật, không intercept/mock response API. Dịch vụ chưa chạy hiển thị lỗi kết nối.
const widths = [320, 360, 768, 1024, 1440, 1920];
const pages = [
  { path: '/console/', title: 'Không gian điều hành', name: 'overview' },
  { path: '/console/login', title: 'Đăng nhập hệ thống', name: 'login' },
  { path: '/console/system', title: 'Trạng thái hệ thống', name: 'system' },
  { path: '/console/settings', title: 'Cấu hình thiết bị', name: 'settings' },
];
for (const width of widths)
  for (const route of pages)
    test(`${route.name} không tràn tại ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route.path);
      await expect(page.getByRole('heading', { name: route.title, exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await mkdir('../.tmp/frontend-qa/screenshots', { recursive: true });
      await page.screenshot({
        path: `../.tmp/frontend-qa/screenshots/${route.name}-${width}.png`,
        fullPage: true,
      });
    });
test('drawer mobile trap/restore focus và shell giữ preference khi điều hướng', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/console/');
  const trigger = page.getByRole('button', { name: 'Mở điều hướng' });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Điều hướng', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole('navigation', { name: 'Điều hướng di động' })
    .getByRole('link', { name: 'Hệ thống', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Trạng thái hệ thống', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('rail desktop giữ sau navigation và reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/console/');
  await page.getByRole('button', { name: 'Thu gọn thanh điều hướng' }).click();
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page
    .getByRole('navigation', { name: 'Điều hướng chính' })
    .getByRole('link', { name: 'Hệ thống', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng' })).toBeVisible();
});
test('route chưa có API không gọi endpoint dự kiến, reduced motion giữ chức năng', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requested: string[] = [];
  page.on('request', (request) => requested.push(new URL(request.url()).pathname));
  await page.goto('/console/admin/users');
  await expect(
    page.getByRole('heading', { name: 'Tài khoản người dùng', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chức năng đang được hoàn thiện' })).toBeVisible();
  expect(requested.some((path) => path.startsWith('/api/v1/admin/'))).toBe(false);
});
test('deep link và unknown route giữ shell, lỗi không lộ exception', async ({ page }) => {
  await page.goto('/console/not-a-real-page');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
  await expect(page.getByRole('banner')).toBeVisible();
});

test('một theme qua lazy route và reduced motion tắt transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/console/');
  const readAccent = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
    );
  const initial = await readAccent();
  await page
    .getByRole('navigation', { name: 'Điều hướng chính' })
    .getByRole('link', { name: 'Hệ thống', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Trạng thái hệ thống', exact: true }),
  ).toBeVisible();
  expect(await readAccent()).toBe(initial);
  expect(
    await page
      .getByRole('button', { name: 'Kiểm tra lại' })
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe('0s');
});
test('landscape và viewport hiệu dụng tương đương zoom 200%', async ({ page }) => {
  for (const size of [
    { width: 844, height: 390 },
    { width: 720, height: 450 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/console/system');
    await expect(
      page.getByRole('heading', { name: 'Trạng thái hệ thống', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
test('API 404/500 qua proxy không bị SPA trả HTML thành công', async ({ request }) => {
  const response = await request.get('/api/v1/frontend-not-a-real-endpoint');
  expect(response.status()).not.toBe(200);
  expect(await response.text()).not.toContain('<div id="root">');
});

test('cấu hình sáu nhóm: keyboard, modal dùng chung và không gọi API dự kiến', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.goto('/console/settings?section=models');
  await expect(page.getByRole('tab', { name: 'Mô hình nhận diện' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Mô hình nhận diện' }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Lịch sử cấu hình' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Chưa có nguồn lịch sử cấu hình')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu cấu hình' })).toHaveCount(0);
  await page.keyboard.press('Home');
  const trigger = page.getByRole('button', { name: 'Xem trường cấu hình' });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('button', { name: 'Chuẩn bị bản nháp' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Lưu cấu hình' })).toBeDisabled();
  expect(
    requests.some((path) => /\/api\/.*(settings|cameras|barriers|readers|models)/.test(path)),
  ).toBe(false);
});
test('cấu hình responsive mọi nhóm tại mobile, nội dung không tràn ngang', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/console/settings');
  for (const name of [
    'Camera',
    'Mô hình nhận diện',
    'Barrier',
    'Đầu đọc thẻ',
    'Cổng & làn',
    'Lịch sử cấu hình',
  ]) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
