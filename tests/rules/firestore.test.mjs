import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
let env, alice, bob, anon;
const application = () => ({ company:'テスト株式会社',role:'',source:'',url:'',stage:'検討中',endReason:'',salary:'',location:'',workStyle:'',positives:'',concerns:'',notes:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp() });
const task = () => ({applicationId:'a',title:'日程を返信する',dueDate:'2028-02-29',done:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
const appRef = (db, id='a', uid='alice') => doc(db, 'users', uid, 'applications', id);
const taskRef = (db, id='task', uid='alice') => doc(db, 'users', uid, 'tasks', id);
before(async()=>{
  env=await initializeTestEnvironment({ projectId:'demo-tsugidoko', firestore:{host:'127.0.0.1',port:8180,rules:await readFile('firestore.rules','utf8')} });
  alice=env.authenticatedContext('alice').firestore(); bob=env.authenticatedContext('bob').firestore(); anon=env.unauthenticatedContext().firestore();
});
after(async()=>{await env?.cleanup()});
test('本人のみ応募先を登録・取得・更新できる',async()=>{
  await assertSucceeds(setDoc(appRef(alice),application()));
  await assertSucceeds(getDoc(appRef(alice)));
  await assertSucceeds(updateDoc(appRef(alice),{stage:'カジュアル面談',updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(appRef(alice),{stage:'内定',updatedAt:serverTimestamp()}));
  for (const endReason of ['内定','入社決定']) await assertSucceeds(updateDoc(appRef(alice),{endReason,updatedAt:serverTimestamp()}));
  for(const db of [bob,anon]) {
    await assertFails(getDoc(appRef(db))); await assertFails(getDocs(collection(db,'users','alice','applications')));
    await assertFails(setDoc(appRef(db,'attack'),application()));
    await assertFails(updateDoc(appRef(db),{company:'変更',updatedAt:serverTimestamp()}));
    await assertFails(deleteDoc(appRef(db)));
  }
});
test('不正な型・文字数・段階・URL・追加フィールド・時刻を拒否',async()=>{
  for(const change of [{company:''},{company:'   '},{company:123},{company:'a'.repeat(121)},{stage:'不明'},{endReason:'謎'}, {url:'javascript:alert(1)'},{positives:'a'.repeat(5001)},{ownerId:'bob'},{createdAt:Timestamp.fromMillis(1)},{updatedAt:Timestamp.fromMillis(1)}]) await assertFails(setDoc(appRef(alice,'invalid'),{...application(),...change}));
  await assertFails(updateDoc(appRef(alice),{createdAt:Timestamp.fromMillis(1),updatedAt:serverTimestamp()}));
});
test('自分の応募先に行動を追加し、完了・編集・削除できる',async()=>{
  await assertSucceeds(setDoc(taskRef(alice),task()));
  await assertSucceeds(updateDoc(taskRef(alice),{done:true,updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(taskRef(alice),{dueDate:'',updatedAt:serverTimestamp()}));
  for(const db of [bob,anon]) {
    await assertFails(getDoc(taskRef(db))); await assertFails(getDocs(collection(db,'users','alice','tasks')));
    await assertFails(setDoc(taskRef(db,'attack'),task()));
    await assertFails(updateDoc(taskRef(db),{done:false,updatedAt:serverTimestamp()})); await assertFails(deleteDoc(taskRef(db)));
  }
  await assertSucceeds(deleteDoc(taskRef(alice)));
});
test('存在しない応募先・別ユーザーの応募先・不正な期限を拒否',async()=>{
  await assertSucceeds(setDoc(appRef(bob,'bob-app','bob'),application()));
  for(const change of [{applicationId:'missing'}, {applicationId:'bob-app'}, {applicationId:'../a'}, {title:''}, {title:' '}, {done:'yes'}, {dueDate:'2026-02-30'}, {dueDate:'2100-02-29'}, {dueDate:'2026-04-31'}, {dueDate:'2026-13-10'}, {unexpected:true}]) await assertFails(setDoc(taskRef(alice,'invalid'),{...task(),...change}));
});
test('終了と復帰は記録を維持し、応募先の永久削除は禁止',async()=>{
  await assertSucceeds(updateDoc(appRef(alice),{endReason:'辞退',updatedAt:serverTimestamp()}));
  await assertSucceeds(getDoc(appRef(alice)));
  await assertSucceeds(updateDoc(appRef(alice),{endReason:'',updatedAt:serverTimestamp()}));
  await assertFails(deleteDoc(appRef(alice)));
});
test('旧archivedフィールドが残った文書も状態を更新できる',async()=>{
  await assertSucceeds(setDoc(appRef(alice,'legacy'),application()));
  await assertSucceeds(updateDoc(appRef(alice,'legacy'),{stage:'最終面接',updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(appRef(alice,'legacy'),{archived:true,updatedAt:serverTimestamp()}));
  const saved=await getDoc(appRef(alice,'legacy'));
  if(saved.get('stage')!=='最終面接') throw new Error('Stage lost');
  await assertSucceeds(updateDoc(appRef(alice,'legacy'),{endReason:'辞退',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(appRef(alice,'legacy'),{archived:'yes',updatedAt:serverTimestamp()}));
});
test('廃止した通知データとサーバー用の取得制限はクライアントから読み書きできない',async()=>{
  for(const path of ['settings/notifications','notificationLog/2026-10-25','serverLimits/jobPreview']) {
    const ref=db=>doc(db,`users/alice/${path}`);
    await assertFails(setDoc(ref(alice),{enabled:true}));
    await assertFails(getDoc(ref(bob)));await assertFails(getDoc(ref(anon)));
    await assertFails(getDoc(ref(alice)));
  }
});
