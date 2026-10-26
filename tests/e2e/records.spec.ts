import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.skip(process.env.E2E_AUTH_EMULATOR !== "1", "Uses isolated Auth and Firestore emulators.");
async function signIn(page: Page, email: string) {
  await page.goto("/");
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", {name:"ログイン", exact:true}).click();
  const popup = await opened;
  await popup.waitForURL(/127\.0\.0\.1:9199/);
  await popup.waitForLoadState("domcontentloaded");
  await popup.locator("#add-account-button").click();
  await popup.locator("#email-input").fill(email);
  await popup.locator("#display-name-input").fill("応募管理テスト");
  await popup.locator("#sign-in").click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("button", {name:"応募先を登録",exact:true})).toBeEnabled();
}
async function addCompany(page: Page, name: string) {
  await page.getByRole("button",{name:"応募先を登録",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByLabel("会社名（必須）").fill(name);
  await dialog.getByRole("button",{name:"登録する",exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button",{name,exact:true})).toBeVisible();
}

test('履歴の取り消し・面接メモの保存と編集・全件CSV', async ({page}, info) => {
  await signIn(page,`records-${info.project.name}-${Date.now()}@example.test`);
  const company='=テスト,"株式会社"';
  await addCompany(page,company);
  const status=page.getByLabel(`${company}の選考状況`,{exact:true});
  await status.selectOption('一次面接');
  await page.getByRole('button',{name:company,exact:true}).click();
  const details=page.getByRole('dialog').first();
  await expect(details.locator('.status-history')).toContainText('検討中 → 一次面接');
  await details.getByRole('button',{name:'直前の変更を取り消す'}).click();
  await expect(details.locator('.status-history')).toContainText('一次面接 → 検討中（取り消し）');
  await expect(details.getByRole('button',{name:'直前の変更を取り消す'})).toHaveCount(0);
  const add=details.getByRole('button',{name:'面接メモを追加',exact:true});
  await add.click();
  const editor=page.getByRole('dialog',{name:'面接メモを追加',exact:true});
  await editor.getByLabel('聞かれたこと・話したこと').fill('業務内容,"質問"\n次の行');
  await editor.getByRole('button',{name:'メモを保存'}).click();
  await expect(editor).toHaveCount(0);
  await expect(add).toBeFocused();
  await details.getByRole('button',{name:'メモを編集 ：面接メモ'}).click();
  const editing=page.getByRole('dialog',{name:'面接メモを編集',exact:true});
  await editing.getByLabel('面接名',{exact:true}).fill('一次面接');
  await editing.getByLabel('面接日（任意）').fill('2026-10-26');
  await editing.getByLabel('次回確認したいこと').fill('=1+1');
  await editing.getByRole('button',{name:'メモを保存'}).click();
  await expect(editing).toHaveCount(0);
  await details.getByRole('button',{name:'キャンセル',exact:true}).click();
  await page.reload();
  await expect(status).toHaveValue('検討中');
  await status.selectOption('辞退');
  await expect(page.getByRole('button',{name:company,exact:true})).toHaveCount(0);
  for (const kind of ['応募先','面接メモ']) {
    const waiting=page.waitForEvent('download');
    await page.getByRole('button',{name:`${kind}CSVを出力`,exact:true}).click();
    const download=await waiting;
    expect(download.suggestedFilename()).toContain(`tsugidoko-${kind}-`);
    const csv=await readFile((await download.path())!,'utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"\'=テスト,""株式会社"""');
    if(kind==='面接メモ') {expect(csv).toContain('"業務内容,""質問""\n次の行"');expect(csv).toContain('"\'=1+1"');}
    else expect(csv).toContain('"辞退"');
  }
  await page.getByRole('group',{name:'応募先の表示'}).getByRole('button',{name:/終了/}).click();
  await page.getByRole('button',{name:company,exact:true}).click();
  await expect(details.locator('.interview-list')).toContainText('一次面接');
  await expect(details.locator('.interview-list')).toContainText('2026-10-26');
  await details.locator('.application-records').scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('records.png')});
});

test('職務経歴書: 途中保存・職歴・応募先別複製・提出版・PDF', async ({page},info)=>{
  await signIn(page,`resume-${info.project.name}-${Date.now()}@example.test`);
  await addCompany(page,'応募先A社');
  const board=page.locator('#resumes');
  await board.getByRole('button',{name:'職務経歴書を作成',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'職務経歴書を作成',exact:true});
  await editor.getByLabel('書類名（必須）').fill('共通の経歴');
  await editor.getByRole('button',{name:'下書きを保存',exact:true}).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  await board.getByRole('button',{name:'編集 ：共通の経歴',exact:true}).click();
  await editor.getByLabel('氏名',{exact:true}).fill('山田 太郎');
  await editor.getByLabel('職務要約',{exact:true}).fill('法人営業を5年間担当しました。');
  await editor.getByRole('button',{name:'職歴を追加'}).click();
  const career=editor.getByRole('group',{name:'職歴 1',exact:true});
  await career.getByLabel('会社名',{exact:true}).fill('経歴の会社');
  await career.getByLabel('入社年月').fill('2020-04');
  await career.getByLabel('在職中').check();
  await career.getByLabel('担当業務',{exact:true}).fill('営業活動とチームの業務改善。');
  await career.getByLabel('実績・取り組み').fill('チームで見直し、対応時間を短縮。');
  await editor.getByLabel('活かせる経験・スキル').fill('顧客対応、プロジェクト管理');
  await editor.getByLabel('自己PR',{exact:true}).fill('相手の課題を整理して提案します。');
  await editor.evaluate(element=>{element.scrollTop=0;});
  await page.screenshot({path:info.outputPath('resume-editor.png')});
  await editor.getByRole('button',{name:'下書きを保存',exact:true}).click();
  await expect(editor).toHaveCount(0);
  await board.getByRole('button',{name:'編集 ：共通の経歴',exact:true}).click();
  await expect(editor.getByLabel('在職中')).toBeChecked();
  await expect(editor.locator('.resume-preview')).toContainText('2020-04 〜 現在');
  await editor.getByLabel('応募先（任意）').selectOption({label:'応募先A社'});
  await editor.getByRole('button',{name:'複製して保存',exact:true}).click();
  await expect(editor).toHaveCount(0);
  await board.getByRole('button',{name:'編集 ：共通の経歴の複製',exact:true}).click();
  await expect(editor.getByLabel('応募先（任意）').locator('option:checked')).toHaveText('応募先A社');
  await editor.getByLabel('書類名（必須）').fill('応募先A社へ提出');
  await editor.getByRole('button',{name:'提出した版を記録',exact:true}).click();
  await expect(editor).toHaveCount(0);
  await board.getByRole('button',{name:'編集 ：共通の経歴',exact:true}).click();
  await editor.getByLabel('職務要約',{exact:true}).fill('元の書類だけを更新');
  await editor.getByRole('button',{name:'下書きを保存',exact:true}).click();
  await expect(editor).toHaveCount(0);
  await board.getByRole('button',{name:'確認・複製 ：応募先A社へ提出',exact:true}).click();
  const submitted=page.getByRole('dialog',{name:'提出した職務経歴書',exact:true});
  await expect(submitted).toContainText('法人営業を5年間担当しました。');
  await expect(submitted.getByRole('textbox')).toHaveCount(0);
  await expect(submitted.getByRole('button',{name:'下書きを保存'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('resume-preview.png')});
  if(info.project.name==='mobile') {
    await page.setViewportSize({width:320,height:760});
    expect(await submitted.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('resume-320.png')});
  }
  if(info.project.name==='desktop') {
    await page.emulateMedia({media:'print'});
    await expect(page.locator('.resume-print-root')).toBeVisible();
    await expect(submitted).toBeHidden();
    const pdf=await page.pdf({path:info.outputPath('resume.pdf'),preferCSSPageSize:true,printBackground:true});
    expect(pdf.subarray(0,4).toString()).toBe('%PDF');
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length).toBe(1);
    await page.emulateMedia({media:'screen'});
    const title=await page.title();
    await page.evaluate(()=>{window.print=()=>{window.dispatchEvent(new Event('afterprint'));};});
    await submitted.getByRole('button',{name:'印刷・PDF保存'}).click();
    await expect(page).toHaveTitle(title);
  }
  await submitted.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.emulateMedia({media:'print'});
  await expect(page.locator('.member-layout')).toBeVisible();
  await page.emulateMedia({media:'screen'});
  if(info.project.name==='desktop') {
    await board.getByRole('button',{name:'編集 ：共通の経歴',exact:true}).click();
    await editor.getByLabel('職務要約',{exact:true}).fill('取り組みと成果を具体的に記述します。'.repeat(250));
    await editor.getByLabel('担当業務',{exact:true}).fill('担当業務と改善の実績を記述します。'.repeat(250));
    await page.emulateMedia({media:'print'});
    const pdf=await page.pdf({path:info.outputPath('resume-long.pdf'),preferCSSPageSize:true,printBackground:true});
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(2);
    await page.emulateMedia({media:'screen'});
  }
});

test('職務経歴書: 別タブの更新を上書きせず複製できる',async({page,context},info)=>{
  await signIn(page,`conflict-${info.project.name}-${Date.now()}@example.test`);
  await page.locator('#resumes').getByRole('button',{name:'職務経歴書を作成',exact:true}).click();
  await page.getByRole('button',{name:'下書きを保存',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const other=await context.newPage();
  await other.goto('/home');
  for(const tab of [page,other])await tab.locator('#resumes').getByRole('button',{name:'編集 ：職務経歴書',exact:true}).click();
  await other.getByLabel('職務要約',{exact:true}).fill('別タブで確定');
  await other.getByRole('button',{name:'下書きを保存',exact:true}).click();
  await expect(other.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('職務要約',{exact:true}).fill('保存前の入力を残す');
  await page.getByRole('button',{name:'下書きを保存',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('別の画面で更新');
  await page.getByRole('button',{name:'複製して保存',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('#resumes').getByRole('button',{name:'編集 ：職務経歴書',exact:true}).click();
  await expect(page.getByLabel('職務要約',{exact:true})).toHaveValue('別タブで確定');
  await page.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.locator('#resumes').getByRole('button',{name:'編集 ：職務経歴書の複製',exact:true}).click();
  await expect(page.getByLabel('職務要約',{exact:true})).toHaveValue('保存前の入力を残す');
  await other.close();
});
