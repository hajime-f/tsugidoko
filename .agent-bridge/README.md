# Codex と Claude Code の通信

このプロジェクト専用のブリッジ。Codex からのメッセージは `runtime/inbox/` に保存し、Claude Code が起動する MCP サーバーが Channels 通知として届ける。Claude の `reply` / `send` は共有 Codex App Server で指定した会話のターンを開始する。

## 起動

依存パッケージと宛先は設定済み。同じディレクトリの端末で実行する。

```sh
sh .agent-bridge/claude.sh
```

既存の Claude 会話を引き継ぐ場合は、Claude Code を通常終了して `sh .agent-bridge/claude.sh --continue` を使う。会話を選ぶ場合は `--resume` を使う。

起動スクリプトは Codex App Server と宛先を確認する。共有 App Server に会話が未接続と表示された場合は、現在の Codex を通常終了し、表示された `codex resume --remote unix:// 会話ID` で再開する。同じ会話を独立した複数の Codex プロセスで開かない。

Claude の起動画面で開発用チャンネル `server:codex_bridge` と MCP サーバーの確認に応じる。開発用チャンネルのフラグはツールの権限確認を無効にしない。通常の `claude` 起動だけでは Channels による自動受信は有効にならない。

## 送受信と状態確認

```sh
node .agent-bridge/bridge.mjs status
node .agent-bridge/bridge.mjs doctor
node .agent-bridge/bridge.mjs send --file メッセージ本文のファイル
```

標準入力からも送信できる。Claude は受信への返答に `codex_bridge.reply`、新規の相談に `codex_bridge.send` を使う。Codex が作業中なら終了を待って配信する。

送信・受信の回数上限はない。旧設定 `CODEX_BRIDGE_SEND_LIMIT` は使わない。重複返信防止・送信中の二重呼び出し防止と、1 通のサイズ制限は維持する。回数の無制限化は自動で無限に応答を繰り返す指示ではない。

- `queued_to_file`: 保存成功。相手の受信確認ではない。
- `running` / `ready`: MCP サーバーの稼働状態。Channels の許可までは検証しない。
- `sendLimit` / `receiveLimit`: `null` は回数無制限。
- `messages` / `outbound`: 読み込んだ受信メッセージ数 / 起動後の新規送信数。
- `waitingForClaude`: Claude への通知待ち件数。
- `pendingTurns`: Codex のターン開始待ち件数。
- `deliveryError` / `inboundError`: 配信 / 受信ファイルのエラー。

起動前の送信も保存される。通知済みのメッセージは再通知しないため、Claude の会話も継続して利用する。通常の再起動では重複返信を抑止するが、異常終了の瞬間の重複配信までは保証しない。

## 宛先・記録

別の Codex 会話に接続するときは、その会話から `node .agent-bridge/bridge.mjs configure` を実行する。明示する場合は `configure --thread 会話ID`。起動済みブリッジにも次のメッセージから反映する。返信と配信待ちメッセージは元の宛先を保持し、別ディレクトリの会話への自動配信は拒否する。

通信記録は `runtime/messages.jsonl`、Codex への配信待ちは `runtime/pending-turns.json`。`runtime/` と `node_modules/` は Git の対象外。公開ポートは開かない。履歴は保存し続けるため、回数上限がなくてもディスクとメモリは消費する。

同時に起動できるブリッジは一つ。異常終了で `runtime/server.lock` が残った場合は中の PID を確認し、そのプロセスが終了している場合だけロックを削除する。配信待ちは削除しない。

## 検証・再インストール

```sh
npm --prefix .agent-bridge test
npm --prefix .agent-bridge ci --ignore-scripts --no-audit --no-fund
```

既存の tsugikoko ブリッジの実装と導入済み依存パッケージを複製し、このプロジェクト専用に変更した。設定・ログ・会話 ID はコピーしていない。

自動テストは模擬 MCP クライアント、模擬 Codex コマンド、模擬 App Server 応答を使う。双方向で 105 通の通信、再起動時の重複返信防止、宛先固定、配信失敗後の保存、不正入力を確認する。実際の Claude との往復確認には上記の起動が必要。

仕様: [Claude Code Channels reference](https://code.claude.com/docs/en/channels-reference)。Codex 側は導入済みの `codex app-server --help` と既存の App Server 接続実装を参照。
