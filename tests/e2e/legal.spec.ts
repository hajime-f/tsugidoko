import { expect, test, type Page } from '@playwright/test';
test.skip(process.env.E2E_AUTH_EMULATOR!=='1','Uses isolated emulators.');
async function signIn(page:Page,email:string,existing=false) {
  await page.goto('/');
  const opened=page.waitForEvent('popup');await page.getByRole('button',{name:'Googleで登録',exact:true}).click();
  const popup=await opened;await popup.waitForURL(/127\.0\.0\.1:9199/);
  if(existing)await popup.getByText(email,{exact:true}).click();
  else {
    await popup.locator('#add-account-button').click();await popup.locator('#email-input').fill(email);await popup.locator('#display-name-input').fill('削除テスト');await popup.locator('#sign-in').click();
  }
  await expect(page).toHaveURL(/\/home$/);
}
async function agree(page:Page) {
  await page.getByRole('checkbox',{name:'利用規約に同意し、プライバシーポリシーを確認しました'}).check();
  await page.getByRole('button',{name:'同意して利用を始める'}).click();
  await expect(page.getByRole('button',{name:'応募先を登録',exact:true})).toBeEnabled();
}
async function reauthenticate(page:Page,email:string,button='本人確認して削除する') {
  const opened=page.waitForEvent('popup');await page.getByRole('button',{name:button,exact:true}).click();
  const popup=await opened;await popup.waitForURL(/127\.0\.0\.1:9199/);
  await popup.getByText(email,{exact:true}).click();
}
test('公開文書をログイン前に読め、問い合わせの失敗後も入力を保持する',async({page},info)=>{
  await page.goto('/');await expect(page.getByRole('link',{name:'利用規約',exact:true})).toBeVisible();
  for(const [path,title] of [['terms','利用規約'],['privacy','プライバシーポリシー'],['data-deletion','データの削除・退会'],['contact','お問い合わせ']]) {
    await page.goto(`/${path}`);await expect(page.getByRole('heading',{name:title,exact:true,level:1})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(path==='privacy')await page.screenshot({path:info.outputPath('privacy.png'),fullPage:true});
  }
  await page.getByLabel('返信先メールアドレス（必須）').fill(`contact-${info.project.name}-${Date.now()}@example.test`);
  await page.getByLabel('お問い合わせ内容（必須・10〜3,000文字）').fill('運営者情報と個人情報の取り扱いについて確認したいです。');
  await page.route('**/api/contact',route=>route.fulfill({status:502,contentType:'text/html',body:'Bad gateway'}),{times:1});
  await page.getByRole('button',{name:'送信する',exact:true}).click();await expect(page.locator('.contact-form').getByRole('alert')).toContainText('送信できませんでした');
  await expect(page.getByLabel('お問い合わせ内容（必須・10〜3,000文字）')).not.toBeEmpty();
  await page.getByRole('button',{name:'送信する',exact:true}).click();await expect(page.getByRole('heading',{name:'お問い合わせを受け付けました'})).toBeVisible();
});
test('初回同意を保存し、削除だけは同意せずに利用できる',async({page},info)=>{
  await signIn(page,`consent-${info.project.name}-${Date.now()}@example.test`);
  await expect(page.getByRole('heading',{name:'ご利用前にご確認ください'})).toBeVisible();
  await expect(page.getByRole('button',{name:'応募先を登録',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'同意して利用を始める'})).toBeDisabled();
  await page.getByRole('link',{name:'同意せずにデータの削除・退会へ進む'}).click();
  await expect(page.getByRole('heading',{name:'自分のデータを削除する'})).toBeVisible();
  await page.goto('/home');
  await page.route('**/api/legal-consent',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'サーバーで認証を確認できませんでした。時間をおいてお試しください。'})}),{times:1});
  await page.getByRole('checkbox',{name:'利用規約に同意し、プライバシーポリシーを確認しました'}).check();
  await page.getByRole('button',{name:'同意して利用を始める'}).click();
  await expect(page.locator('.consent-panel').getByRole('alert')).toContainText('サーバーで認証を確認できませんでした');
  await expect(page).toHaveURL(/\/home$/);
  await agree(page);await page.reload();
  await expect(page.getByRole('button',{name:'応募先を登録',exact:true})).toBeEnabled();
  await expect(page.getByRole('heading',{name:'ご利用前にご確認ください'})).toHaveCount(0);
});
test('本人確認のキャンセルは消さず、全削除後は再同意して空の記録から始める',async({page,context},info)=>{
  const email=`erase-${info.project.name}-${Date.now()}@example.test`;
  await signIn(page,email);await agree(page);
  await page.getByRole('button',{name:'応募先を登録',exact:true}).click();
  await page.getByRole('dialog').getByLabel('会社名（必須）').fill('削除対象の会社');
  await page.getByRole('dialog').getByRole('button',{name:'登録する',exact:true}).click();
  await expect(page.getByRole('button',{name:'削除対象の会社',exact:true})).toBeVisible();
  const other=await context.newPage();await other.goto('/home');
  await expect(other.getByRole('button',{name:'削除対象の会社',exact:true})).toBeVisible();
  await page.goto('/data-deletion');await expect(page.getByRole('button',{name:'本人確認して削除する'})).toBeDisabled();
  await page.getByLabel('確認のため「削除」と入力してください').fill('削除');
  const opened=page.waitForEvent('popup');await page.getByRole('button',{name:'本人確認して削除する',exact:true}).click();
  const cancelled=await opened;await cancelled.close();
  await expect(page.getByRole('button',{name:'本人確認して削除する',exact:true})).toBeEnabled({timeout:15000});
  await expect(other.getByRole('button',{name:'削除対象の会社',exact:true})).toBeVisible();
  await reauthenticate(page,email);
  await expect(page.getByRole('heading',{name:'保存データを削除しました'})).toBeVisible({timeout:20000});
  await expect(other.getByRole('button',{name:'削除対象の会社',exact:true})).toHaveCount(0);
  await other.close();
  await signIn(page,email,true);await agree(page);
  await expect(page.getByRole('button',{name:'削除対象の会社',exact:true})).toHaveCount(0);
});
test('退会すると認証アカウントも削除される',async({page,request},info)=>{
  const email=`retire-${info.project.name}-${Date.now()}@example.test`;
  await signIn(page,email);await page.goto('/data-deletion');
  const users=await (await request.get('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/projects/demo-tsugidoko/accounts:batchGet',{headers:{Authorization:'Bearer owner'}})).json();
  const original=users.users.find((u:{email:string})=>u.email===email);expect(original).toBeTruthy();
  await page.getByRole('radio',{name:/退会してアカウントも削除/}).check();
  await page.getByLabel('確認のため「削除」と入力してください').fill('削除');
  await reauthenticate(page,email);
  await expect(page.getByRole('heading',{name:'退会が完了しました'})).toBeVisible({timeout:20000});
  const after=await (await request.get('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/projects/demo-tsugidoko/accounts:batchGet',{headers:{Authorization:'Bearer owner'}})).json();
  expect(after.users.some((u:{localId:string})=>u.localId===original.localId)).toBe(false);
});
