import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, writeBatch, deleteField } from 'firebase/firestore';
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

const historyRef = (db, id) => doc(db, 'users/alice/applications/history/statusHistory', id);
const event = (fromStatus, toStatus, beforeStage=fromStatus, beforeEndReason='', kind='change', revertsId='') => ({fromStatus,toStatus,beforeStage,beforeEndReason,kind,revertsId,createdAt:serverTimestamp()});
test('選考履歴は親と同時に追記し、偽造・改変・削除・過去への巻き戻しを拒否',async()=>{
  const ref=appRef(alice,'history'); await assertSucceeds(setDoc(ref,application()));
  let batch=writeBatch(alice);batch.update(ref,{stage:'一次面接',statusEventId:'first',updatedAt:serverTimestamp()});batch.set(historyRef(alice,'first'),event('検討中','一次面接'));await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(historyRef(alice,'first')));
  for(const db of [bob,anon]) {await assertFails(getDoc(historyRef(db,'first')));await assertFails(setDoc(historyRef(db,'other'),event('一次面接','最終面接')));}
  await assertFails(updateDoc(historyRef(alice,'first'),{toStatus:'内定'}));await assertFails(deleteDoc(historyRef(alice,'first')));
  await assertFails(setDoc(historyRef(alice,'fake'),event('一次面接','最終面接')));
  await assertFails(updateDoc(ref,{stage:'最終面接',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref,{statusEventId:deleteField(),updatedAt:serverTimestamp()}));
  batch=writeBatch(alice);batch.update(ref,{stage:'最終面接',statusEventId:'second',updatedAt:serverTimestamp()});batch.set(historyRef(alice,'second'),event('一次面接','最終面接'));await assertSucceeds(batch.commit());
  await assertFails(updateDoc(ref,{stage:'一次面接',statusEventId:'first',updatedAt:serverTimestamp()}));
  batch=writeBatch(alice);batch.update(ref,{stage:'検討中',statusEventId:'bad-undo',updatedAt:serverTimestamp()});batch.set(historyRef(alice,'bad-undo'),event('最終面接','検討中','最終面接','','undo','first'));await assertFails(batch.commit());
  batch=writeBatch(alice);batch.update(ref,{stage:'一次面接',statusEventId:'undo',updatedAt:serverTimestamp()});batch.set(historyRef(alice,'undo'),event('最終面接','一次面接','最終面接','','undo','second'));await assertSucceeds(batch.commit());
});
const interview = () => ({title:'一次面接',date:'2028-02-29',interviewer:'担当者',notes:'話したこと',concerns:'',nextQuestions:'質問',revision:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
test('面接メモの本人限定・親存在・日付・長さ・リビジョンを検証',async()=>{
  const ref=db=>doc(db,'users/alice/applications/a/interviews/i');
  await assertSucceeds(setDoc(ref(alice),interview()));await assertSucceeds(getDoc(ref(alice)));
  await assertSucceeds(updateDoc(ref(alice),{notes:'更新',revision:2,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref(alice),{notes:'競合',revision:2,updatedAt:serverTimestamp()}));
  for(const db of [bob,anon]) {await assertFails(getDoc(ref(db)));await assertFails(setDoc(ref(db),interview()));}
  for(const change of [{date:'2026-02-29'},{notes:'x'.repeat(5001)},{revision:0},{unexpected:true}])await assertFails(setDoc(doc(alice,'users/alice/applications/a/interviews/invalid'),{...interview(),...change}));
  await assertFails(setDoc(doc(alice,'users/alice/applications/missing/interviews/i'),interview()));
});
test('職務経歴書は本人だけが読め、クライアントからの作成・更新・削除を拒否',async()=>{
  const path='users/alice/resumes/draft';
  await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),path),{title:'書類',submitted:false});});
  await assertSucceeds(getDoc(doc(alice,path)));
  await assertSucceeds(getDocs(collection(alice,'users/alice/resumes')));
  for(const db of [alice,bob,anon]) {
    if(db!==alice)await assertFails(getDoc(doc(db,path)));
    await assertFails(setDoc(doc(db,'users/alice/resumes/new'),{title:'書類'}));
    await assertFails(updateDoc(doc(db,path),{title:'更新'}));
    await assertFails(deleteDoc(doc(db,path)));
  }
});

test('削除中・旧セッションの読書を拒否し、再ログイン後だけ再開できる',async()=>{
  const uid='lifecycle', old=env.authenticatedContext(uid,{auth_time:100}).firestore(), fresh=env.authenticatedContext(uid,{auth_time:201}).firestore();
  const path=`users/${uid}/applications/a`, marker=`accountLifecycle/${uid}`;
  await assertSucceeds(setDoc(doc(old,path),application()));
  await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),marker),{state:'deleting',mode:'data',cutoff:200});});
  for(const db of [old,fresh]) {
    await assertFails(getDoc(doc(db,path)));await assertFails(getDocs(collection(db,`users/${uid}/applications`)));
    await assertFails(updateDoc(doc(db,path),{stage:'一次面接',updatedAt:serverTimestamp()}));
    await assertFails(setDoc(doc(db,`users/${uid}/tasks/new`),task()));
  }
  await env.withSecurityRulesDisabled(async context=>{await updateDoc(doc(context.firestore(),marker),{state:'complete'});});
  await assertFails(getDoc(doc(old,path)));await assertFails(setDoc(doc(old,`users/${uid}/applications/old`),application()));
  await assertSucceeds(getDoc(doc(fresh,path)));await assertSucceeds(updateDoc(doc(fresh,path),{stage:'一次面接',updatedAt:serverTimestamp()}));
  await env.withSecurityRulesDisabled(async context=>{await updateDoc(doc(context.firestore(),marker),{mode:'account'});});
  await assertFails(getDoc(doc(fresh,path)));
});
test('オフラインで保留された古い書き込みも削除完了後には復活しない',async()=>{
  const {disableNetwork,enableNetwork}=await import('firebase/firestore');
  const uid='offline-delete', db=env.authenticatedContext(uid,{auth_time:100}).firestore();
  await disableNetwork(db);
  const pending=assertFails(setDoc(doc(db,`users/${uid}/applications/queued`),application()));
  await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),`accountLifecycle/${uid}`),{state:'complete',mode:'data',cutoff:200});});
  await enableNetwork(db);await pending;
});
test('問い合わせ・削除管理・制限値は非公開、同意は本人の読み取りだけ',async()=>{
  for(const db of [alice,bob,anon])for(const path of ['accountLifecycle/alice','supportRequests/one','contactLimits/global']) {
    await assertFails(getDoc(doc(db,path)));await assertFails(setDoc(doc(db,path),{state:'complete'}));await assertFails(deleteDoc(doc(db,path)));
  }
  await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'users/alice/legal/consent'),{version:'2026-10-27'});});
  await assertSucceeds(getDoc(doc(alice,'users/alice/legal/consent')));
  for(const db of [alice,bob,anon]) {
    if(db!==alice)await assertFails(getDoc(doc(db,'users/alice/legal/consent')));
    await assertFails(setDoc(doc(db,'users/alice/legal/consent'),{version:'fake'}));
  }
});
