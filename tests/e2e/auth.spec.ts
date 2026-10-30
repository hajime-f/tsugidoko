import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.E2E_AUTH_EMULATOR !== "1", "Run npm run test:auth with the isolated Auth Emulator.");

async function login(page: Page, email: string, name = "テストユーザー", buttonName = "Googleで登録", photo = "") {
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForURL(/127\.0\.0\.1:9199/);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Googleで登録", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeEnabled();
  await expect(page.locator(".auth-feedback")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await popup.locator("#add-account-button").click();
  await popup.locator("#email-input").fill(email);
  await popup.locator("#display-name-input").fill(name);
  if (photo) await popup.locator("#profile-photo-input").fill(photo);
  const closed = popup.waitForEvent("close");
  await popup.locator("#sign-in").click();
  await closed;
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("checkbox", {name:"利用規約に同意し、プライバシーポリシーを確認しました"}).check();
  await page.getByRole("button", {name:"同意して利用を始める"}).click();
}

test("未ログインでは専用ホームを表示せず、ログインに案内する", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /転職活動を、\s*ひとまとめ。/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Googleで登録" })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "あなたの転職活動" })).toHaveCount(0);
});

test("Googleログイン、再読込、別タブ、ログアウトと再アクセス", async ({ page, context, baseURL }, info) => {
  const email = `flow-${info.project.name}-${Date.now()}@example.test`;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Googleで登録" })).toBeEnabled();
  await page.screenshot({ path: info.outputPath("login.png"), fullPage: true });
  await login(page, email);
  await expect(page.getByText("テストユーザーさん、ようこそ。", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "あなたの転職活動" })).toBeVisible();
  await expect(page.getByRole("button", { name: "応募先を登録", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("home.png"), fullPage: true });
  await page.reload();
  await expect(page.getByText("テストユーザーさん、ようこそ。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /さんのアカウントを開く/ }).click();
  await expect(page.getByRole("dialog")).toContainText(email);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /さんのアカウントを開く/ })).toBeFocused();
  // Reproduce activation without moving focus first (e.g. Safari mouse clicks).
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    document.querySelector<HTMLButtonElement>(".member-account")!.click();
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /さんのアカウントを開く/ })).toBeFocused();
  const other = await context.newPage();
  await other.goto(`${baseURL}/login`);
  await expect(other).toHaveURL(`${baseURL}/`);
  await other.getByRole("link", { name: "ホームへ", exact: true }).click();
  await expect(other).toHaveURL(/\/home$/);
  await other.getByRole("button", { name: /さんのアカウントを開く/ }).click();
  await other.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(other).toHaveURL(`${baseURL}/`);
  await expect(page).toHaveURL(/\/$/);
  await other.goto(`${baseURL}/home`);
  await expect(other).toHaveURL(/\/$/);
  await login(other, `second-${email}`, "別のユーザー");
  await other.getByRole("button", { name: /さんのアカウントを開く/ }).click();
  await expect(other.getByRole("dialog")).toContainText(`second-${email}`);
  await expect(other.getByText("テストユーザーさん、ようこそ。", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("ポップアップをブロックされた場合は案内し、再試行できる", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Googleで登録" })).toBeEnabled();
  await page.evaluate(() => {
    const original = window.open;
    window.open = () => { window.open = original; return null; };
  });
  await page.getByRole("button", { name: "Googleで登録" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /ポップアップを許可|通信できませんでした/ })).toContainText("ポップアップを許可");
  await expect(page.getByRole("button", { name: "Googleで登録" })).toBeEnabled();
  await page.screenshot({ path: info.outputPath("login-error.png") });
  await page.getByRole("button", { name: "ログインの案内を閉じる" }).click();
  await expect(page.locator(".auth-feedback")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Googleで登録" })).toBeFocused();
  await login(page, `retry-${info.project.name}-${Date.now()}@example.test`);
});

test("認証通信の失敗ではログインせず、エラーを表示する", async ({ page, context }, info) => {
  await context.route("**/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp*", route => route.abort("failed"));
  await page.goto("/");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Googleで登録" }).click();
  const popup = await popupPromise;
  await popup.waitForURL(/127\.0\.0\.1:9199/);
  await popup.locator("#add-account-button").click();
  await popup.locator("#email-input").fill(`network-${info.project.name}-${Date.now()}@example.test`);
  await popup.locator("#sign-in").click();
  await expect(page.getByRole("alert").filter({ hasText: /ポップアップを許可|通信できませんでした/ })).toContainText("通信できませんでした");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Googleで登録" })).toBeEnabled();
});

test("ログインをキャンセルしても通知を出さず再試行できる", async ({ page }, info) => {
  await page.goto("/");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Googleで登録" }).click();
  const popup = await popupPromise;
  await popup.waitForURL(/127\.0\.0\.1:9199/);
  await popup.close();
  // Wait past the SDK's close detection and 8-second cancellation grace period.
  await page.waitForTimeout(11000);
  await expect(page.locator(".auth-feedback")).toHaveCount(0);
  await expect(page.locator(".auth-error")).toHaveCount(0);
  await login(page, `cancel-${info.project.name}-${Date.now()}@example.test`);
});

test("認証中の押し直しと閉じた直後の再試行でログインできる", async ({ page }, info) => {
  await page.goto("/");
  const firstPopupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  const first = await firstPopupPromise;
  await first.waitForURL(/127\.0\.0\.1:9199/);
  const secondPopupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Googleで登録", exact: true }).click();
  const second = await secondPopupPromise;
  await second.waitForURL(/127\.0\.0\.1:9199/);
  await expect.poll(() => first.isClosed()).toBe(true);
  await expect(page.locator(".auth-feedback")).toHaveCount(0);
  await second.close();
  await login(page, `immediate-${info.project.name}-${Date.now()}@example.test`, "再試行ユーザー", "ログイン");
  await expect(page.getByText("再試行ユーザーさん、ようこそ。", { exact: true })).toBeVisible();
});


test("古いログインURLからトップのGoogleログインを使える", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Googleで登録", exact: true })).toBeEnabled();
});


test("ログインボタンからも同じGoogle認証でホームへ進める", async ({ page }, info) => {
  await page.goto("/");
  await login(page, `login-button-${info.project.name}-${Date.now()}@example.test`, "ログインユーザー", "ログイン");
  await expect(page.getByText("ログインユーザーさん、ようこそ。", { exact: true })).toBeVisible();
});

for (const photo of ["available", "missing", "broken"] as const) {
  test(`アカウントのプロフィール画像と代替表示: ${photo}`, async ({ page, baseURL }, info) => {
    const photoURL = photo === "missing" ? "" : `${baseURL}/images/${photo === "available" ? "career-desk.jpg" : "missing-avatar.png"}`;
    await page.goto("/");
    await login(page, `avatar-${photo}-${info.project.name}-${Date.now()}@example.test`, "画像テスト", "Googleで登録", photoURL);
    await page.getByRole("button", { name: /さんのアカウントを開く/ }).click();
    const dialog = page.getByRole("dialog");
    const avatar = dialog.locator(".member-avatar");
    if (photo === "available") {
      const image = dialog.getByRole("img", { name: "プロフィール写真" });
      await expect(image).toHaveAttribute("src", photoURL);
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    } else {
      await expect(avatar).toHaveText("画");
      await expect(avatar.locator("img")).toHaveCount(0);
    }
    expect(await avatar.evaluate(el => el.getBoundingClientRect().width)).toBe(64);
    await page.screenshot({ path: info.outputPath(`account-${photo}.png`) });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /さんのアカウントを開く/ })).toBeFocused();
  });
}
