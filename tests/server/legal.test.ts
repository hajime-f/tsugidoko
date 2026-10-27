import assert from 'node:assert/strict';
import { after, test, mock } from 'node:test';
import { adminServices } from '../../src/lib/server/firebase';
import { POST as remove, GET as status } from '../../src/app/api/account/delete/route';
import { POST as consent } from '../../src/app/api/legal-consent/route';
import { POST as contact } from '../../src/app/api/contact/route';
import { POST as preview } from '../../src/app/api/job-preview/route';
import { LEGAL_VERSION } from '../../src/lib/legal';
process.env.E2E_AUTH_EMULATOR = '1';
const {db, auth} = adminServices();
after(async () => { await db.terminate(); });
async function token(uid: string) {
  await auth.createUser({uid, email: `${uid}@example.test`, emailVerified:true});
  const custom = await auth.createCustomToken(uid);
  const res = await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:custom,returnSecureToken:true})});
  return (await res.json()).idToken as string;
}
function request(token: string, body?: unknown) {
  return new Request('http://localhost/api', {method:body ? 'POST':'GET', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {})});
}
const deletion = (mode='data') => ({mode,confirmation:'削除'});
test('削除は認証・確認入力・最近の本人確認が必要で、UID指定も受け付けない', async () => {
  assert.equal((await remove(request('',deletion()))).status,401);
  assert.equal((await status(request('invalid'))).status,401);
  const t = await token('legal-invalid');
  for (const value of [{...deletion(),uid:'victim'},{...deletion(),confirmation:''},{mode:'other',confirmation:'削除'}]) assert.equal((await remove(request(t,value))).status,400);
  const verify = auth.verifyIdToken.bind(auth);
  const stub = mock.method(auth,'verifyIdToken', async (...args: Parameters<typeof verify>) => ({...await verify(...args),auth_time:Math.floor(Date.now()/1000)-600}));
  try { assert.equal((await remove(request(t,deletion()))).status,401); }
  finally { stub.mock.restore(); }
  assert.equal((await db.doc('accountLifecycle/legal-invalid').get()).exists,false);
});
test('200件単位の削除は中断から再開し、親のない子も消し、他人のデータは残す', async () => {
  const uid='legal-batch', t=await token(uid);
  const signedIdentity=await auth.verifyIdToken(t); const verify=auth.verifyIdToken.bind(auth);
  const batch=db.batch();
  for(let i=0;i<220;i++) batch.set(db.doc(`users/${uid}/applications/a/interviews/${i}`),{notes:'private'});
  batch.set(db.doc(`users/${uid}/resumes/r`),{submitted:true});
  batch.set(db.doc(`users/${uid}/settings/notifications`),{enabled:true});
  batch.set(db.doc('users/legal-other/applications/keep'),{company:'keep'});
  await batch.commit();
  assert.equal((await db.doc(`users/${uid}`).get()).exists,false);
  let res=await remove(request(t,deletion())); assert.equal(res.status,200); assert.equal((await res.json()).done,false);
  assert.equal((await status(request(t))).status,200);
  assert.equal((await consent(request(t,{version:LEGAL_VERSION,accepted:true}))).status,409);
  assert.equal((await preview(request(t,{url:'https://example.com'}))).status,409);
  assert.equal((await remove(request(t,deletion('account')))).status,409);
  // An active lease causes a bounded retry, never a second worker's deletion.
  const marker=db.doc(`accountLifecycle/${uid}`);
  const {Timestamp}=await import('firebase-admin/firestore');
  await marker.update({leaseUntil:Timestamp.fromMillis(Date.now()+60000)});
  assert.equal((await (await remove(request(t,deletion()))).json()).busy,true);
  await marker.update({leaseUntil:Timestamp.fromMillis(0)});
  for(let i=0;i<5;i++) { res=await remove(request(t,deletion())); assert.equal(res.status,200); if((await res.json()).done)break; }
  assert.equal((await marker.get()).get('state'),'complete');
  assert.deepEqual(await db.doc(`users/${uid}`).listCollections(),[]);
  assert.equal((await db.doc('users/legal-other/applications/keep').get()).get('company'),'keep');
  assert.equal((await auth.getUser(uid)).uid,uid);
  const signatureOnly=mock.method(auth,'verifyIdToken',async (value:string,checkRevoked?:boolean)=>value===t&&!checkRevoked?signedIdentity:verify(value,checkRevoked));
  try {
  assert.equal((await status(request(t))).status,200);
  assert.equal((await (await status(request(t))).json()).sessionCompleted,true);
  assert.equal((await (await remove(request(t,deletion()))).json()).done,true);
  assert.ok((await marker.get()).get('expiresAt').toMillis()>Date.now());
  assert.ok([401,409].includes((await consent(request(t,{version:LEGAL_VERSION,accepted:true}))).status));
  } finally { signatureOnly.mock.restore(); }
});
test('退会でAuth削除後に応答を失っても、署名付き旧トークンで完了を確認できる', async () => {
  const uid='legal-lost',t=await token(uid);
  const signedIdentity=await auth.verifyIdToken(t);
  const verify=auth.verifyIdToken.bind(auth);
  await db.doc(`users/${uid}/resumes/r`).set({title:'private'});
  const original=auth.deleteUser.bind(auth);
  const stub=mock.method(auth,'deleteUser',async (id:string)=>{await original(id);throw new Error('simulated connection loss');});
  try { assert.equal((await remove(request(t,deletion('account')))).status,500); }
  finally {stub.mock.restore();}
  assert.deepEqual(await db.doc(`users/${uid}`).listCollections(),[]);
  // Admin SDK always checks revocation in Emulator mode, even with false.
  // Model production's still-valid signature using the identity verified before deletion.
  const signatureOnly=mock.method(auth,'verifyIdToken',async (value:string,checkRevoked?:boolean)=>value===t&&!checkRevoked?signedIdentity:verify(value,checkRevoked));
  try {
  assert.equal((await (await status(request(t))).json()).state,'complete');
  assert.equal((await (await remove(request(t,deletion('account')))).json()).done,true);
  assert.equal((await db.doc(`accountLifecycle/${uid}`).get()).get('state'),'complete');
  await assert.rejects(auth.getUser(uid),{code:'auth/user-not-found'});
  assert.equal((await remove(request(t,deletion('data')))).status,401);
  } finally {signatureOnly.mock.restore();}
});
test('Auth削除前の障害は未完了のまま保持し、本人が安全に再開できる',async()=>{
  const uid='legal-retry',t=await token(uid);
  await db.doc(`users/${uid}/tasks/a`).set({title:'private'});
  const stub=mock.method(auth,'deleteUser',async()=>{throw new Error('temporary failure');});
  try {assert.equal((await remove(request(t,deletion('account')))).status,500);}
  finally {stub.mock.restore();}
  assert.equal((await (await status(request(t))).json()).state,'deleting');
  assert.equal((await db.doc(`accountLifecycle/${uid}`).get()).get('expiresAt'),undefined);
  const retryFailure=mock.method(auth,'deleteUser',async()=>{throw new Error('another temporary failure');});
  try {assert.equal((await remove(request(t,deletion('account')))).status,500);}
  finally {retryFailure.mock.restore();}
  assert.equal((await db.doc(`accountLifecycle/${uid}`).get()).get('expiresAt'),undefined);
  assert.equal((await auth.getUser(uid)).uid,uid);
  assert.equal((await (await remove(request(t,deletion('account')))).json()).done,true);
  await assert.rejects(auth.getUser(uid),{code:'auth/user-not-found'});
});
test('同意は最新の版と本人のUIDだけを保存する',async()=>{
  assert.equal((await consent(request('',{version:LEGAL_VERSION,accepted:true}))).status,401);
  const t=await token('legal-consent');
  for(const body of [{version:'old',accepted:true},{version:LEGAL_VERSION,accepted:false},{version:LEGAL_VERSION,accepted:true,uid:'victim'}])assert.equal((await consent(request(t,body))).status,400);
  assert.equal((await consent(request(t,{version:LEGAL_VERSION,accepted:true}))).status,200);
  const doc=await db.doc('users/legal-consent/legal/consent').get();
  assert.equal(doc.get('version'),LEGAL_VERSION);assert.ok(doc.get('acceptedAt').toMillis()>0);
});
test('問い合わせは入力上限と非公開保存・有効期限・回数制限を守る',async()=>{
  const body={email:'legal-contact@example.test',topic:'privacy',message:'個人情報について問い合わせます。',website:''};
  for(const change of [{email:'invalid'},{website:'spam'},{message:'short'},{message:'a'.repeat(3001)},{uid:'other'}])assert.equal((await contact(request('',{...body,...change}))).status,400);
  assert.equal((await contact(request('',{...body,message:'あ'.repeat(6000)}))).status,413);
  for(let i=0;i<3;i++) {
    const res=await contact(request('',{...body,message:'あ'.repeat(3000)})); assert.equal(res.status,201);
    const data=await db.doc(`supportRequests/${(await res.json()).id}`).get();
    assert.equal(data.get('email'),body.email);assert.equal(data.get('status'),'new');assert.ok(data.get('expiresAt').toMillis()>Date.now()+89*86400000);
  }
  assert.equal((await contact(request('',body))).status,429);
});

test('認証の設定・接続障害は503とし、無効なセッションだけ401にする',async()=>{
  const logs:unknown[][]=[];
  const logging=mock.method(console,'error',(...args:unknown[])=>{logs.push(args);});
  try {
    for(const [code,expected] of [
      ['auth/id-token-expired',401],['auth/id-token-revoked',401],['auth/invalid-argument',401],
      ['auth/user-disabled',401],['auth/user-not-found',401],
      ['auth/internal-error',503],['auth/invalid-credential',503],['auth/insufficient-permission',503],['app/network-error',503],
    ] as const) {
      const stub=mock.method(auth,'verifyIdToken',async()=>{throw Object.assign(new Error('private token and user details must not escape'),{code});});
      try {
        for(const response of [await consent(request('sensitive-token',{version:LEGAL_VERSION,accepted:true})),await status(request('sensitive-token')),await remove(request('sensitive-token',deletion()))]) {
          assert.equal(response.status,expected,code);
          const body=await response.text();assert.equal(body.includes('private token'),false);
          assert.equal(body.includes('ログインし直して'),expected===401);
        }
      } finally {stub.mock.restore();}
    }
    assert.ok(logs.length>0);
    assert.equal(JSON.stringify(logs).includes('private token'),false);
    assert.equal(JSON.stringify(logs).includes('sensitive-token'),false);
  } finally {logging.mock.restore();}
});

test('公開鍵の取得障害がSDKでinvalid-argumentに包まれても503にする',async()=>{
  const logging=mock.method(console,'error',()=>{});
  try {
    for(const message of ['Error fetching public keys for Google certs: private response','Error while making request: private host. Error code: ENOTFOUND']) {
      const stub=mock.method(auth,'verifyIdToken',async()=>{throw Object.assign(new Error(message),{code:'auth/invalid-argument'});});
      try {
        const response=await consent(request('sensitive-token',{version:LEGAL_VERSION,accepted:true}));
        assert.equal(response.status,503);assert.equal((await response.text()).includes('private'),false);
      } finally {stub.mock.restore();}
    }
  } finally {logging.mock.restore();}
});
