import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, encodeCsv } from '../../src/lib/csv.ts';
test('CSVは日本語BOM、引用符、カンマ、改行、空欄を保持する',()=>{
 assert.equal(encodeCsv([['会社','メモ'],['A,B','"引用"\n改行'],[null,'']]),'\uFEFF"会社","メモ"\r\n"A,B","""引用""\n改行"\r\n"",""\r\n');
});
test('CSVは空白や制御文字を含む数式の開始を無害化する',()=>{
 for(const value of ['=1+1','+SUM(1,2)','-1','@SUM(1)',' =1','\t=1','\r=1','\n=1','\uFEFF=1'])assert.equal(csvCell(value).startsWith('"\''),true,value);
 assert.equal(csvCell('普通の文章'),'"普通の文章"');
});
