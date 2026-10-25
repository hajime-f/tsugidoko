import assert from 'node:assert/strict';
import {after,test,mock} from 'node:test';
import dns from 'node:dns/promises';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {syncBuiltinESMExports} from 'node:module';
import {adminServices} from '../../src/lib/server/firebase';
import {publicAddress,publicUrl,fetchJobHtml,extractJobs,decodeHtml} from '../../src/lib/server/job-preview';
import {POST as preview} from '../../src/app/api/job-preview/route';
process.env.E2E_AUTH_EMULATOR='1';
const {db,auth}=adminServices();
after(async()=>{await db.terminate();});

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

async function userToken(uid:string) {
  await auth.createUser({uid,email:`${uid}@example.test`,emailVerified:true});
  const token=await auth.createCustomToken(uid);
  const response=await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,returnSecureToken:true})});
  return (await response.json()).idToken as string;
}
test('求人URL API: 未認証と内部ネットワークのURLを拒否',async()=>{
  assert.equal((await preview(new Request('http://localhost/api/job-preview',{method:'POST'}))).status,401);
  const token=await userToken('preview-owner');
  assert.equal((await preview(new Request('http://localhost/api/job-preview',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({url:'http://169.254.169.254'})}))).status,400);
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
