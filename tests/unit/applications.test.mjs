import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskGroup, taskSchema, applicationSchema, emptyApplication, getApplicationStatus, selectionForStorage, applicationStatuses, isEnded } from '../../src/lib/applications.ts';

test('月曜を起点とした期限分類、日曜と翌週の境界、期限未定',()=>{
 const monday=new Date(2026,9,26,12);
 for (const [due,expected] of [['','期限未定'],['2026-10-25','期限を過ぎたもの'],['2026-10-26','今日'],['2026-11-01','今週'],['2026-11-02','来週以降']]) assert.equal(taskGroup(due,monday),expected);
 const sunday=new Date(2026,10,1,12);
 assert.equal(taskGroup('2026-11-02',sunday),'来週以降');
 assert.equal(taskGroup('2026-11-01',sunday),'今日');
});
test('年末・月末・閏年の日付と空欄を扱う',()=>{
 for(const dueDate of ['', '2028-02-29','2026-12-31']) assert.equal(taskSchema.safeParse({applicationId:'a',title:'面接',dueDate}).success,true);
 for(const dueDate of ['2026-02-29','2026-04-31','2100-02-29','1999-12-31','not-a-date']) assert.equal(taskSchema.safeParse({applicationId:'a',title:'面接',dueDate}).success,false);
 assert.equal(taskGroup('2027-01-01',new Date(2026,11,31,12)),'今週');
});
test('会社名をtrimし、空白と危険なURLを拒否する',()=>{
 assert.equal(applicationSchema.parse({...emptyApplication,company:'  A社  '}).company,'A社');
 for(const url of ['javascript:alert(1)','HTTPS://example.test','text']) assert.equal(applicationSchema.safeParse({...emptyApplication,company:'A社',url}).success,false);
 assert.equal(applicationSchema.safeParse({...emptyApplication,company:' '}).success,false);
});

test('一つの選考状況を既存形式へ保存・復元し、終了と内定を区別する',()=>{
 for(const status of applicationStatuses) {
  assert.equal(applicationSchema.safeParse({...emptyApplication,company:'A社',status}).success,true);
  const stored=selectionForStorage(status,'一次面接');
  assert.equal(getApplicationStatus(stored.stage,stored.endReason),status);
  assert.equal(isEnded(status),['辞退','不採用','募集終了'].includes(status));
 }
 assert.equal(applicationSchema.safeParse({...emptyApplication,company:'A社',status:'進行中'}).success,false);
 assert.deepEqual(selectionForStorage('検討中','内定'),{stage:'検討中',endReason:''});
 assert.deepEqual(selectionForStorage('辞退','内定'),{stage:'内定',endReason:'辞退'});
 for(const state of ['内定','入社決定','辞退','不採用','募集終了']) assert.equal(getApplicationStatus('検討中',state),state);
 assert.equal(getApplicationStatus('内定',''),'内定');
 assert.equal(getApplicationStatus('内定','辞退'),'辞退');
});
