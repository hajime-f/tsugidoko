import assert from 'node:assert/strict';
import {after,before,test,mock} from 'node:test';
import dns from 'node:dns/promises';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {syncBuiltinESMExports} from 'node:module';
import {SMTPServer} from 'smtp-server';
import {adminServices} from '../../src/lib/server/firebase';
import {publicAddress,publicUrl,fetchJobHtml,extractJobs,decodeHtml} from '../../src/lib/server/job-preview';
import {deliverReminders,reminderDates,reminderMessage,smtpSend} from '../../src/lib/server/reminders';
import {GET,PUT} from '../../src/app/api/notifications/route';
import {POST as preview} from '../../src/app/api/job-preview/route';
import {POST as cron} from '../../src/app/api/internal/reminders/route';
process.env.E2E_AUTH_EMULATOR='1';
const {db,auth}=adminServices();
const received:string[]=[];
const smtp=new SMTPServer({authOptional:true,disabledCommands:['STARTTLS'],onData(stream,_session,callback){let mail='';stream.on('data',chunk=>mail+=chunk);stream.on('end',()=>{received.push(mail);callback();});}});
before(async()=>{await new Promise<void>(resolve=>smtp.listen(2526,'127.0.0.1',resolve));});
after(async()=>{await new Promise<void>(resolve=>smtp.close(resolve));await db.terminate();});

test('SSRF: private/metadata/IPv6/特殊IP/資格情報/非標準ポートを拒否',async()=>{
  for(const ip of ['127.0.0.1','10.2.3.4','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('8.8.8.8'),true);
  for(const url of ['http://2130706433','http://0x7f000001','http://[::ffff:127.0.0.1]','http://user:pass@example.com','http://example.com:8080','file:///etc/passwd','http://localhost']) assert.throws(()=>publicUrl(url),url);
  await assert.rejects(fetchJobHtml('http://127.0.0.1:8180'));
});
test('JSON-LD: graph/複数求人/HTML除去/文字数制限/不正JSON',()=>{
  const html=`<script type="application/ld+json">{broken}</script><script type="application/ld+json">${JSON.stringify({'@graph':[{'@type':'JobPosting',title:'<b>開発</b>',hiringOrganization:{name:'A'.repeat(200)},jobLocation:{address:{addressRegion:'東京',addressLocality:'千代田区'}},baseSalary:{currency:'JPY',value:{minValue:6000000,maxValue:8000000,unitText:'YEAR'}},jobLocationType:'TELECOMMUTE'},{'@type':['Thing','JobPosting'],title:'デザイナー',hiringOrganization:{name:'第二社'}}]})}</script>`;
  const jobs=extractJobs(html,'https://example.test/jobs');assert.equal(jobs.length,2);assert.equal(jobs[0].company.length,120);assert.equal(jobs[0].role,'開発');assert.equal(jobs[0].location,'東京 千代田区');assert.equal(jobs[0].salary,'6000000〜8000000 JPY YEAR');assert.equal(jobs[0].workStyle,'リモート勤務');assert.equal(extractJobs('<html>ログイン必須</html>','https://example.test').length,0);
});
test('文字コード: Shift_JIS/EUC-JP/UTF-8と非対応charset',()=>{
  assert.equal(decodeHtml(Buffer.from([0x93,0xfa,0x96,0x7b]),'text/html; charset=Shift_JIS'),'日本');
  assert.equal(decodeHtml(Buffer.from([0xc6,0xfc,0xcb,0xdc]),'text/html; charset=euc-jp'),'日本');
  assert.equal(decodeHtml(Buffer.from('<meta charset=Shift_JIS>\x93\xfa\x96\x7b','latin1'),'text/html'),'<meta charset=Shift_JIS>日本');
  assert.throws(()=>decodeHtml(Buffer.from('x'),'text/html; charset=not-real'));
});

test('JST日付の月末/年末境界と個人情報を含まないメール',()=>{
  assert.deepEqual(reminderDates(new Date('2026-12-31T15:01:00Z')),{today:'2027-01-01',tomorrow:'2027-01-02'});
  const mail=reminderMessage(2,'https://example.test');assert.match(mail.text,/2件/);assert.match(mail.text,/notification-settings/);assert.equal(mail.subject,'ツギドコからのお知らせ');
});
async function userToken(uid:string, verified=true) {
  await auth.createUser({uid,email:`${uid}@example.test`,emailVerified:verified});
  const token=await auth.createCustomToken(uid);
  const response=await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,returnSecureToken:true})});
  return (await response.json()).idToken as string;
}
const request=(path:string,token?:string,data?:unknown)=>new Request(`http://localhost${path}`,{method:data===undefined?'GET':'PUT',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
test('API: 未認証拒否、確認済みメール限定、本人設定、OFF、SSRF、OIDC拒否',async()=>{
  assert.equal((await GET(request('/api/notifications'))).status,401);
  assert.equal((await preview(new Request('http://localhost/api/job-preview',{method:'POST'}))).status,401);
  const token=await userToken('settings-owner');const other=await userToken('settings-other');const unverified=await userToken('settings-unverified',false);
  assert.equal((await PUT(request('/api/notifications',unverified,{enabled:true}))).status,400);
  assert.equal((await PUT(request('/api/notifications',token,{enabled:true,email:'attacker@example.test'}))).status,400);
  assert.equal((await PUT(request('/api/notifications',token,{enabled:true}))).status,200);
  assert.equal((await (await GET(request('/api/notifications',token))).json()).enabled,true);
  assert.equal((await (await GET(request('/api/notifications',other))).json()).enabled,false);
  assert.equal((await PUT(request('/api/notifications',token,{enabled:false}))).status,200);
  assert.equal((await preview(new Request('http://localhost/api/job-preview',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({url:'http://169.254.169.254'})}))).status,400);
  assert.equal((await cron(new Request('http://localhost/api/internal/reminders',{method:'POST',headers:{Authorization:`Bearer ${token}`}}))).status,401);
});
test('実SMTP配送: 完了/終了除外・旧アーカイブを含む、翌日期限、同時実行の重複防止、OFF',async()=>{
  const uid='delivery-owner';await userToken(uid);
  await db.doc(`users/${uid}/settings/notifications`).set({enabled:true});
  for(const [id,flags] of Object.entries({active:{},archived:{archived:true},offer:{endReason:'内定'},accepted:{endReason:'入社決定'},ended:{endReason:'辞退'}})) await db.doc(`users/${uid}/applications/${id}`).set({company:'秘密の会社名',...flags});
  for(const [id,value] of Object.entries({today:{applicationId:'active',done:false,dueDate:'2026-10-25'},tomorrow:{applicationId:'active',done:false,dueDate:'2026-10-26'},complete:{applicationId:'active',done:true,dueDate:'2026-10-25'},archived:{applicationId:'archived',done:false,dueDate:'2026-10-25'},offer:{applicationId:'offer',done:false,dueDate:'2026-10-25'},accepted:{applicationId:'accepted',done:false,dueDate:'2026-10-25'},ended:{applicationId:'ended',done:false,dueDate:'2026-10-25'},future:{applicationId:'active',done:false,dueDate:'2026-10-27'}}))await db.doc(`users/${uid}/tasks/${id}`).set({title:'秘密の行動名',...value});
  const now=new Date('2026-10-25T00:00:00Z');const results=await Promise.all([deliverReminders(db,auth,smtpSend,now),deliverReminders(db,auth,smtpSend,now)]);
  assert.equal(results.reduce((n,result)=>n+result.sent,0),1);assert.equal(received.length,1);
  assert.equal((await db.doc(`users/${uid}/notificationLog/2026-10-25`).get()).get('count'),5);
  assert.ok(!received[0].includes('秘密'));assert.match(received[0],/delivery-owner@example.test/);
  await db.doc(`users/${uid}/settings/notifications`).set({enabled:false});
  assert.equal((await deliverReminders(db,auth,smtpSend,new Date('2026-10-26T00:00:00Z'))).sent,0);
});
test('SMTP結果不明は再送せず、明確な拒否は再試行可能',async()=>{
  for(const [uid,uncertain] of [['delivery-uncertain',true],['delivery-failed',false]] as const) {
    await userToken(uid);await db.doc(`users/${uid}/settings/notifications`).set({enabled:true});await db.doc(`users/${uid}/applications/a`).set({});await db.doc(`users/${uid}/tasks/t`).set({applicationId:'a',done:false,dueDate:'2026-10-25'});
    let attempts=0;const fail=async()=>{attempts++;throw Object.assign(new Error('SMTP error'),uncertain?{}:{responseCode:450});};
    const now=new Date('2026-10-25T00:00:00Z');await deliverReminders(db,auth,fail,now);await deliverReminders(db,auth,fail,now);
    assert.equal(attempts,uncertain?1:2);
    await db.doc(`users/${uid}/settings/notifications`).set({enabled:false});
  }
});

test('URL取得: DNS固定、転送先の再検証、サイズ・圧縮制限',async()=>{
  let resolveCount=0;let requests=0;let mode='redirect';
  const dnsMock=mock.method(dns,'lookup',async()=>{resolveCount++;return [{address:resolveCount===1?'8.8.8.8':'127.0.0.1',family:4}];});
  const requestMock=mock.method(https,'get',(_url:URL,options:{lookup:(host:string,options:object,callback:(error:unknown,address:string)=>void)=>void},callback:(response:Readable)=>void)=>{
    requests++;
    options.lookup('example.test',{},(_error:unknown,address:unknown)=>assert.equal(address,'8.8.8.8'));
    const response=Object.assign(Readable.from([mode==='large'?Buffer.alloc(2*1024*1024+1):Buffer.from('<html>OK</html>')]),{statusCode:mode==='redirect'?302:200,headers:{'content-type':'text/html',...(mode==='redirect'?{location:'https://redirect.test'}:{}),...(mode==='compressed'?{'content-encoding':'gzip'}:{})}});
    queueMicrotask(()=>callback(response));return new EventEmitter();
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(fetchJobHtml('https://example.test'),/アクセス/);assert.equal(requests,1);assert.equal(resolveCount,2);
    mode='large';resolveCount=0;await assert.rejects(fetchJobHtml('https://example.test'),/大きすぎ/);
    mode='compressed';resolveCount=0;await assert.rejects(fetchJobHtml('https://example.test'),/取得できません/);
    mode='success';resolveCount=0;assert.equal((await fetchJobHtml('https://example.test')).html,'<html>OK</html>');
  } finally {dnsMock.mock.restore();requestMock.mock.restore();syncBuiltinESMExports();}
});

test('URL取得APIの回数制限はユーザーごとにFirestoreで保持',async()=>{
  const token=await userToken('rate-limit-owner');
  const resolver=mock.method(dns,'lookup',async()=>[{address:'127.0.0.1',family:4}]);syncBuiltinESMExports();
  try {
    for(let i=0;i<6;i++) {
      const response=await preview(new Request('http://localhost/api/job-preview',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.test/jobs'})}));
      assert.equal(response.status,i<5?422:429);
    }
  } finally {resolver.mock.restore();syncBuiltinESMExports();}
});
