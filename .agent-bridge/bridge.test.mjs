import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { mkdtemp, writeFile, readFile, unlink, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startCodexTurn } from './bridge.mjs';

const file = fileURLToPath(new URL('./bridge.mjs', import.meta.url));
const project = resolve(file, '../..');
const run = promisify(execFile);
const pause = ms => new Promise(done => setTimeout(done, ms));
async function until(check) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await pause(30);
  }
  throw new Error('Timed out waiting for bridge');
}
async function fixture(t, mode = 'queue') {
  const runtime = await mkdtemp(join(tmpdir(), 'tsugidoko-bridge-'));
  const fake = join(runtime, 'codex.cjs');
  await writeFile(fake, `#!/usr/bin/env node
const fs = require('node:fs');
const p = process.env.CODEX_BRIDGE_RUNTIME_DIR;
if (fs.existsSync(p + '/fail')) { console.error('simulated failure'); process.exit(2); }
fs.appendFileSync(p + '/calls.jsonl', JSON.stringify(process.argv.slice(2)) + '\\n');
`, { mode: 0o700 });
  const env = { ...process.env, CODEX_BRIDGE_RUNTIME_DIR: runtime,
    CODEX_BRIDGE_CODEX_BIN: fake, CODEX_BRIDGE_MODE: mode, CODEX_BRIDGE_SEND_LIMIT: '2',
    CODEX_BRIDGE_APP_SERVER_SOCKET: join(runtime, 'absent.sock') };
  const cli = async (...args) => {
    const result = await run(process.execPath, [file, ...args], { env });
    return result.stdout.trim();
  };
  await cli('configure', '--thread', 'thread-original');
  let child, exited, pending;
  const events = [];
  let stderr = '';
  let sequence = 0;
  const stop = async () => {
    if (child && child.exitCode === null && child.signalCode === null) child.stdin.end();
    if (exited) await exited;
    child = undefined;
  };
  const start = async () => {
    child = spawn(process.execPath, [file, 'server', '--thread', 'thread-original'], {
      env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    exited = new Promise(done => child.once('exit', done));
    child.stderr.on('data', chunk => { stderr += chunk; });
    pending = new Map();
    createInterface({ input: child.stdout }).on('line', line => {
      const value = JSON.parse(line);
      if ('id' in value) pending.get(value.id)?.(value);
      else events.push(value);
    });
    return rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'bridge-test', version: '1' } });
  };
  const rpc = (method, params) => new Promise((accept, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(new Error(`${method}: ${stderr}`)), 5000);
    pending.set(id, value => {
      clearTimeout(timer); pending.delete(id);
      if (value.error) reject(new Error(JSON.stringify(value.error)));
      else accept(value.result);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const ready = async () => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    await rpc('ping', {});
    await until(async () => JSON.parse(await cli('status')).ready);
  };
  const send = async text => {
    const path = join(runtime, 'input.txt');
    await writeFile(path, text);
    return JSON.parse(await cli('send', '--file', path));
  };
  const calls = async () => (await readFile(join(runtime, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  t.after(async () => { await stop(); await rm(runtime, { recursive: true, force: true }); });
  return { runtime, cli, start, stop, ready, rpc, send, events, calls };
}

test('offline messages, MCP channels, replies, live routing and restart deduplication', { timeout: 20000 }, async t => {
  const f = await fixture(t);
  const sent = await f.send('日本語の接続確認');
  assert.equal(sent.status, 'queued_to_file');
  const offline = JSON.parse(await f.cli('status'));
  assert.equal(offline.running, false);
  assert.equal(offline.waitingForClaude, 1);
  const initialized = await f.start();
  assert.deepEqual(initialized.capabilities.experimental['claude/channel'], {});
  await pause(600);
  assert.equal(f.events.length, 0);
  await f.ready();
  const received = await until(() => f.events.find(x => x.method === 'notifications/claude/channel'));
  assert.equal(received.params.content, '日本語の接続確認');
  assert.equal(received.params.meta.message_id, sent.id);
  assert.deepEqual((await f.rpc('tools/list', {})).tools.map(x => x.name), ['reply', 'send']);
  const reply = text => f.rpc('tools/call', { name: 'reply', arguments: { message_id: sent.id, text } });
  await f.cli('configure', '--thread', 'thread-new');
  await writeFile(join(f.runtime, 'fail'), '');
  assert.equal((await reply('再試行前')).isError, true);
  await unlink(join(f.runtime, 'fail'));
  const literal = '返答\n$(echo literal) `literal`';
  assert.notEqual((await reply(literal)).isError, true);
  await reply('二重送信');
  let calls = await f.calls();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 4), ['queue', '--thread', 'thread-original', '--message']);
  assert.ok(calls[0][4].includes(literal));
  assert.ok(calls[0][4].includes('藤田さん本人の発言ではありません'));
  const fresh = await f.rpc('tools/call', { name: 'send', arguments: { text: '新規相談' } });
  assert.notEqual(fresh.isError, true);
  calls = await f.calls();
  assert.equal(calls[1][2], 'thread-new');
  await f.stop();
  assert.equal(JSON.parse(await f.cli('status')).running, false);
  await assert.rejects(access(join(f.runtime, 'server.lock')));
  await f.start();
  await f.ready();
  await reply('再起動後の二重送信');
  assert.equal((await f.calls()).length, 2);
  assert.equal(f.events.filter(x => x.method === 'notifications/claude/channel').length, 1);
});

test('validation, unlimited sends, malformed inbox isolation and exclusive server lock', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  await f.start(); await f.ready();
  await assert.rejects(f.cli('server', '--thread', 'thread-original'), /already running/);
  await assert.rejects(f.send(' '), /Message must/);
  await assert.rejects(f.send('あ'.repeat(11000)), /exceeds/);
  const call = (name, args) => f.rpc('tools/call', { name, arguments: args });
  assert.equal((await call('reply', { message_id: 'missing', text: 'unknown' })).isError, true);
  assert.equal((await call('send', { text: '' })).isError, true);
  await writeFile(join(f.runtime, 'fail'), '');
  assert.equal((await call('send', { text: 'failed' })).isError, true);
  await unlink(join(f.runtime, 'fail'));
  assert.notEqual((await call('send', { text: 'one' })).isError, true);
  assert.notEqual((await call('send', { text: 'two' })).isError, true);
  assert.notEqual((await call('send', { text: 'three' })).isError, true);
  assert.equal((await f.calls()).length, 3);
  await writeFile(join(f.runtime, 'inbox', 'invalid.json'), '{broken');
  const sent = await f.send('正常なメッセージ');
  await until(() => f.events.find(x => x.params?.meta?.message_id === sent.id));
  // 通知は同じポーリング処理の隔離ファイル移動より先に届くことがある。
  await until(async () => {
    try { await access(join(f.runtime, 'rejected', 'invalid.json')); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  });
});

test('automatic delivery failure preserves queued replies across restart', { timeout: 15000 }, async t => {
  const f = await fixture(t, 'auto');
  await f.start(); await f.ready();
  assert.notEqual((await f.rpc('tools/call', { name: 'send', arguments: { text: '保存される相談' } })).isError, true);
  const failed = await until(async () => {
    const s = JSON.parse(await f.cli('status')); return s.deliveryError ? s : false;
  });
  assert.equal(failed.pendingTurns, 1);
  await f.cli('configure', '--thread', 'thread-new');
  await f.stop();
  await f.start(); await f.ready();
  const pending = JSON.parse(await readFile(join(f.runtime, 'pending-turns.json'), 'utf8'));
  assert.equal(pending.length, 1);
  assert.equal(pending[0].thread, 'thread-original');
  assert.ok(pending[0].body.includes('保存される相談'));
});

for (const state of ['active', 'idle', 'notLoaded', 'systemError', 'wrong-project']) {
  test(`App Server routing: ${state}`, async () => {
    const calls = [];
    let closed = false;
    const connect = async () => ({
      call: async (method, params) => {
        calls.push({ method, params });
        return method === 'thread/read' ? { thread: {
          cwd: state === 'wrong-project' ? '/another-project' : project,
          status: { type: state },
        } } : {};
      },
      notify: () => {}, close: () => { closed = true; },
    });
    if (state === 'systemError' || state === 'wrong-project') {
      await assert.rejects(startCodexTurn('destination', '本文', connect));
    } else {
      assert.equal(await startCodexTurn('destination', '本文', connect), state !== 'active');
    }
    assert.equal(closed, true);
    assert.equal(calls.some(x => x.method === 'thread/resume'), state === 'notLoaded');
    const turn = calls.find(x => x.method === 'turn/start');
    assert.equal(Boolean(turn), state === 'idle' || state === 'notLoaded');
    if (turn) assert.deepEqual(turn.params, { threadId: 'destination', input: [{ type: 'text', text: '本文' }] });
  });
}

// Exceed both legacy session caps, including when the old environment setting exists.
test('more than 100 messages in both directions without restarting', { timeout: 45000 }, async t => {
  const f = await fixture(t);
  await f.start(); await f.ready();
  for (let i = 0; i < 105; i++) {
    await f.send(`Codex message ${i}`);
    const sent = await f.rpc('tools/call', { name: 'send', arguments: { text: `Claude message ${i}` } });
    assert.notEqual(sent.isError, true);
  }
  await until(() => f.events.filter(x => x.method === 'notifications/claude/channel').length === 105);
  const s = JSON.parse(await f.cli('status'));
  assert.equal(s.messages, 105);
  assert.equal(s.outbound, 105);
  assert.equal(s.sendLimit, null);
  assert.equal(s.receiveLimit, null);
  assert.equal((await f.calls()).length, 105);
});
