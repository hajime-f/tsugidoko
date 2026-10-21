import { expect, test } from "@playwright/test";

test("トップページの画像、レスポンシブ表示、FAQ", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("転職活動を、ひとまとめ。");
  await expect(page.getByAltText("ノートパソコンと手帳、コーヒーが置かれたデスク")).toBeVisible();
  await expect.poll(() => page.locator(".hero-photo").evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator("summary").filter({ hasText: "今すぐ登録して使えますか？" }).click();
  await expect(page.locator("details[open]")).toContainText("現在は試作版です");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: `/private/tmp/tsugidoko-${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("サンプルの登録・段階変更・取り消し・リセット", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ツギドコを体験する" }).first().click();
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByLabel("会社名", { exact: true }).fill("テスト株式会社");
  await page.getByRole("button", { name: "登録", exact: true }).click();
  await expect(page.getByRole("heading", { name: "テスト株式会社" })).toBeVisible();
  await page.getByLabel("テスト株式会社の選考状況").selectOption("内定");
  await expect(page.getByRole("status")).toContainText("内定");
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  await expect(page.getByLabel("テスト株式会社の選考状況")).toHaveValue("検討中");
  await page.getByLabel("テスト株式会社の選考状況").selectOption("終了");
  await expect(page.getByRole("heading", { name: "テスト株式会社" })).toHaveCount(0);
  await page.getByRole("button", { name: /^終了/ }).click();
  await expect(page.getByRole("heading", { name: "テスト株式会社" })).toBeVisible();
  await page.getByRole("button", { name: "サンプルをリセット" }).click();
  await expect(page.getByRole("heading", { name: "テスト株式会社" })).toHaveCount(0);
  await expect(page.locator(".application-row")).toHaveCount(3);
});

test("試作案内のダイアログとキーボード操作", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "試作版について", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("サーバーには保存しません");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "試作版について", exact: true })).toBeFocused();
});


test("トップの入力欄から選考段階を指定してサンプルを始める", async ({ page }) => {
  await page.goto("/");
  const form = page.getByRole("form", { name: "応募管理を体験する" });
  await form.getByRole("button", { name: "この会社で試す" }).click();
  await expect(page.locator(".application-row")).toHaveCount(3);
  await form.getByLabel("試す会社名").fill("体験株式会社");
  await form.getByLabel("現在の選考段階").selectOption("最終面接");
  await form.getByRole("button", { name: "この会社で試す" }).click();
  await expect(page.getByLabel("体験株式会社の選考状況")).toHaveValue("最終面接");
  await expect(page.getByRole("region", { name: "応募管理サンプル" })).toBeFocused();
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  await expect(page.getByRole("heading", { name: "体験株式会社" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".application-row")).toHaveCount(3);
});
