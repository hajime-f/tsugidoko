# ツギドコ

転職活動の応募先と選考状況をまとめて管理するサービスの試作です。企画と技術構成は [CONTEXT.md](CONTEXT.md) を参照してください。

## ローカル開発

Node.js 22.23.4 を使用します（`.node-version`）。2026年10月のセキュリティ修正を含むバージョンです。fnm を使う場合は、最初に次を実行してください。

```sh
fnm install
fnm use
node --version
```

```sh
npm ci
npm run dev -- --port 3100
```

開発URL: http://127.0.0.1:3100

```sh
npm run build
npm run typecheck
npm run test:e2e
```

E2Eテストは端末にインストールした Google Chrome を使用します。開発サーバーが起動していなければテストから起動します。

## 現在の試作範囲

- PC を主対象としたログイン前のトップページ、FAQ。スマートフォンにも対応。
- トップの会社名・選考状況の入力から応募管理サンプルを開始。
- サンプル応募先の追加、選考状況の変更・絞り込み・取り消し・リセット。
- サンプルはブラウザ上の一時的な状態だけを使い、再読み込みで初期化されます。
- トップページの「Googleで登録」「ログイン」から直接認証・新規登録。認証状態を保持し、`/home` に専用ホームを表示。アカウント情報の確認とログアウトに対応。
- 専用ホームで応募先を登録・保存・編集し、一覧から選考状況を更新。終了案件の確認・復帰に対応。
- 次の行動と任意の期限を記録し、今日・今週などに分類。完了・編集・削除に対応。
- 最大4件の応募先を横並びで比較。年収・勤務地・働き方・魅力・懸念・面接メモを保存できます。

画像の出典は [public/images/CREDITS.md](public/images/CREDITS.md) に記載しています。

## 本番環境

Firebase App Hosting（Blaze）で、2026年10月21日に初回デプロイを実施しました。

本番URL: https://tsugidoko--tsugidoko-prod-hajime-f.asia-east1.hosted.app

Firebase Console: https://console.firebase.google.com/project/tsugidoko-prod-hajime-f/apphosting

- Firebase の表示名: `tsugidoko`
- プロジェクト ID: `tsugidoko-prod-hajime-f`（`tsugidoko` は取得済みのため使用不可）
- App Hosting バックエンド: `tsugidoko`
- リージョン: `asia-east1`（台湾）
- ランタイム: Node.js 22
- ベースイメージの自動更新: 有効
- 設定: `apphosting.yaml`、`firebase.json`、`.firebaserc`
- 最小インスタンス数 0、最大 2。最大数は料金の上限ではありません。

現在はローカルソースからデプロイします。GitHubへのpushだけでは自動デプロイされません。

ローカルのソースから公開する手順:

```sh
npm ci
npm run build
firebase deploy --only apphosting:tsugidoko --project tsugidoko-prod-hajime-f
```

本番に公開中の画面はログイン未実装の試作版です。ログイン・応募管理・行動管理・比較は開発環境で実装済みですが、App Hostingへは未デプロイです。検索エンジン向けには `noindex` を維持しています。

### Node.js セキュリティ更新の状況（2026年10月21日）

- 開発環境は 22.23.4 へ更新済み。ビルド、画面テスト12件、agent-bridge テスト9件が成功。
- 本番は更新未完了。`build-2026-10-21-002` で再デプロイしたものの、Google 側の `GOOGLE_RUNTIME_VERSION` が 22.23.3 を指定し、`engines.node` の要求より古い版でビルドされた。
- 確認時点で Google 配布の `https://dl.google.com/runtimes/ubuntu2204/nodejs/nodejs-22.23.4.tar.gz` は 404。管理されたベースイメージの自動更新は有効のまま維持している。
- 再発を防ぐため、`apphosting.yaml` にビルド専用の `NPM_CONFIG_ENGINE_STRICT=true` を追加した。この追加設定は未デプロイ。次回から要求バージョンに満たないランタイムでのビルドは失敗する。
- Google 側で修正版が利用可能になったら再デプロイし、Cloud Build の Node.js インストールログと本番ランタイムへの反映を確認する。再デプロイ成功だけで更新済みと判断しない。

修正内容: [Node.js 公式セキュリティ告知](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)。

## 認証と専用ホーム（2026年10月25日）

- 開発ログインURL: http://127.0.0.1:3100/
- 専用ホーム: http://127.0.0.1:3100/home （未ログイン時はトップページ `/` に移動）
- Google アカウントで初回ログインすると Firebase Authentication にユーザーを作成します。Google のパスワードをこのアプリが受け取ることはありません。
- SDK 標準のブラウザ永続化を利用し、再読み込みや別タブでも認証を共有します。アカウント画面からログアウトすると、ほかのタブの専用ホームもトップページに戻ります。
- Firebase Web 接続先は `src/lib/firebase/client.ts` の `tsugidoko-prod-hajime-f`。公開識別情報のみで、Admin SDK・OAuth の秘密鍵は含めません。ツギココの Firebase 設定とは分離しています。
- Google プロバイダーは有効化済みです。認証設定は Firebase Console の Authentication > Sign-in method で管理します。サポート用メールアドレスを公開Git履歴に残さないため、`firebase.json` に `auth` セクションは含めません。許可ドメインには `localhost`、`127.0.0.1`、本番 App Hosting のホスト名を追加済み（Firebase Console の Authentication > Settings > Authorized domains で管理）。
- `/home` の応募先・行動・比較用の条件はFirestoreに保存。Security RulesがUIDによる本人限定のアクセスと入力検証を行います。端末ディスクへのFirestore永続キャッシュは有効にしていません。
- 最新 Firebase SDK の Node.js 24 要件を避け、Node.js 22 対応の `firebase@12.19.0` を採用。`overrides` は互換性のある `@firebase/app` / `@firebase/app-compat` の統一と、gRPC の修正済みバージョンを適用するためです。

### 認証の自動検証

```sh
npm run test:auth
```

Firebase CLI（検証時 15.34.0）を端末へ導入しておく必要があります。Java 21も必要です（macOSでは `brew install openjdk@21`）。起動スクリプトがHomebrewのJava 21を検出します。他の環境では `JAVA_HOME` を設定してください。専用の `demo-tsugidoko` Auth Emulator（127.0.0.1:9199）、Firestore Emulator（127.0.0.1:8180）とテスト用開発サーバー（127.0.0.1:3101）を起動します。通常の開発サーバー（3100）とは出力先を分けています。本番アカウントは作りません。

`NEXT_PUBLIC_AUTH_EMULATOR_URL` は開発モードかつ loopback のホスト名でだけ有効です。本番ビルドでは無効になります。テストはエミュレーターの Google ポップアップを使用するため、実 Google アカウントでの同意・認証そのものは別途手動確認が必要です。

検証結果（2026年10月25日）: 本番ビルド成功、Auth Emulator を使った PC・ノートPC・スマートフォンの E2E 計27件成功。実 Google のログイン入力画面への遷移も確認した。実アカウントでの認証完了は未実施。Claude Code のレビューと再レビューを受け、公開ファイルの個人メール除去、見出し・読み上げ・フォーカス・キャンセル表示を修正済み。

ログイン導線の修正: 独立したログイン紹介画面は廃止しました。トップの「Googleで登録」「ログイン」から認証ポップアップを開き、成功したら `/home` に移動します。通信失敗等のエラーだけトップで案内し、キャンセルは通知しません。認証中も押し直せます。旧 `/login` はトップへ転送します。


## 応募データの保存

Firestore Standard `(default)`、ロケーション `asia-east1`（既存App Hostingと同じ）、データベースの削除保護あり。ロケーションは作成後に変更できません。通常の開発画面3100はこの実プロジェクトを使用します。

- 応募先: `users/{uid}/applications/{id}`
- 行動: `users/{uid}/tasks/{id}`（applicationIdで紐付け）
- アプリからの読み書きはログインした本人だけに許可し、ほかの利用者によるアクセスをRulesで拒否します。許可フィールド、文字数、選考情報、日時、行動の親応募先、期限の日付も検証します。
- 終了した応募先と行動は削除せず保管します。応募先の永久削除・退会は未提供です。求人URL取り込みに対応し、メール通知はSMTP・定期ジョブ設定後に配信できます。
- 期限は日付文字列で保存し、画面では端末のローカル日付・月曜始まりで分類します。
- 比較表の選択状態は画面内のみ、比較に使う条件とメモは保存します。

```sh
npm run test:rules
npm run test:unit
npm run test:auth -- tests/e2e/workspace.spec.ts
firebase deploy --only firestore:rules,firestore:indexes --project tsugidoko-prod-hajime-f
```

2026年10月25日に本人限定Rulesとindexesを実プロジェクトへ適用済みです。Firestoreのルール更新はApp Hostingの画面公開とは別です。

検証完了（2026年10月25日）:
- 本番ビルド成功（型検証を含む）。Firestore Rules 5件、日付・入力検証のunit 3件成功。
- E2EはPC・ノートPC・スマートフォンの計54ケースを確認。全体実行で51件成功、旧説明文を期待していたダイアログ3件は期待文言を更新し、FAQと合わせた6件の再実行で全成功。
- 3機能の保存・再読み込み・別タブ反映・ユーザー切替での分離・終了と復帰・行動の完了と削除・比較を検証。PC/mobileの比較画面も目視確認。
- Claude Codeの最終レビュー指摘（FAQの保存対象の主語、ほかの利用者に対するアクセス制限の表現）を反映済み。
- 開発URL: http://127.0.0.1:3100/home 。未ログイン時はトップへ案内する。実Googleアカウントでの認証完了と本番画面の反映は別途。コミット・pushはしていない。

## 選考状況・求人URL・期限メール（2026年10月25日）

- 入力は「選考状況」一つ。検討中・応募済み・カジュアル面談・書類選考・一次面接・二次面接・最終面接・内定・入社決定・辞退・不採用・募集終了から直接選びます。
- 内定は緑、入社決定はピンクで行を強調し、進行中の一覧に残します。辞退・不採用・募集終了だけ終了へ移動し、予定・比較・通知から通常は除外します。状況を選び直して復帰できます。
- 保存形式は既存の stage/endReason と互換にしています。画面は endReason があればそれを優先し、なければ stage を一つの状況として表示します。状況変更時は両フィールドを原子的に更新し、選考中へ戻すと endReason を空にします。別項目だけの編集では過去の段階を書き換えません。
- アーカイブ操作は廃止済み。旧 archived の値は無視します。応募先の記録は削除しません。

- 登録画面の「求人URLから入力」で、公開ページの JSON-LD JobPosting を候補として表示します。確認・修正して登録します。ログイン必須・自動取得を拒否するページ・構造化データのないページは手入力できます。取得は認証必須、1ユーザーあたり毎分5回です。
- 期限メールは既定OFF。日本時間の朝9時に、今日・明日が期限で未完了、かつ終了していない応募先の予定（内定・入社決定も含む）の件数だけを、認証済みアカウントの確認済みメールへ送ります。社名・職種・行動名は送りません。ホームの「メール通知」で停止します。
- SMTPと定期ジョブの設定がない環境では、画面に「メール配信の設定中」と表示し、有効化を拒否します。送信先は利用者が任意に指定できず、サーバーがFirebase Authenticationから読み取ります。

### 開発用サーバー認証

本番のAdmin SDKはApp HostingのApplication Default Credentialsを使います。ローカルでは通常のADC、または開発モード限定の `FIREBASE_USE_GCLOUD_CREDENTIALS=1` と `GCLOUD_BIN` で、ログイン済みgcloudの短命アクセストークンを利用できます。現在の `.env.local` は後者で、秘密値は格納していません。このモードはオーナー権限でRulesを経由せず実プロジェクトに接続するため、他ユーザーの情報を対象に試験しないでください。自動テストは必ず `demo-tsugidoko` のエミュレーターを使います。リポジトリへ資格情報や `.env.local` を追加しないでください。

### メール配信を有効にする手順

1. 送信サービスで送信元を用意し、SMTPホスト・ポート・認証情報を取得します。SMTP_USER/SMTP_PASSWORDはSecret Managerへ保存し、App Hostingバックエンドにアクセス権を付与します。`apphosting.yaml` のコメントに沿ってsecret参照を設定します。
2. 実行時環境変数 `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`, `APP_BASE_URL`, `REMINDER_AUDIENCE`, `REMINDER_SERVICE_ACCOUNT` を設定します。APP_BASE_URLは公開HTTPSオリジン、REMINDER_AUDIENCEはその `/api/internal/reminders` の完全URLです。専用サービスアカウントは `tsugidoko-reminders@tsugidoko-prod-hajime-f.iam.gserviceaccount.com` です。TLSを必須とし、465またはSTARTTLSの587を使います。
3. Firestore Rules/indexesと画面・APIをデプロイした後、`node scripts/configure-reminders.mjs https://公開ホスト` を実行します。日本時間9時、OIDC認証、専用サービスアカウント、再試行3回、attemptDeadline 300秒のCloud Schedulerジョブを作成または更新します。このコマンドはクラウド設定を変更するため、ビルドから自動実行しません。
4. Cloud Runのリクエスト上限が通知の処理予算150秒より長いことをデプロイ後に確認します。2026年10月25日時点のtsugidokoは300秒でした。通知設定をオンにし、確認済みの本人メールで配送を検証します。

SMTPはFirestoreと原子的に確定できません。送信直前に状態を記録し、成功は `sent`、明確なSMTP拒否は `failed`（再試行可）、結果不明は `uncertain` として自動再送しません。送信開始前の `claimed` は15分後に再取得できます。処理停止で `sending` のまま残った場合も重複防止を優先し、配信サービスの履歴と照合して手動判断します。全体処理が時間切れになったときはSchedulerが再試行し、その日の送信済み利用者をスキップします。SMTPの成功はサーバー受領であり、受信箱への到達保証ではありません。

```sh
npm run test:server   # Auth/Firestore Emulator + 127.0.0.1:2526 のテストSMTP。外部送信なし
npm run test:rules
npm run test:auth -- tests/e2e/workspace.spec.ts
```

E2E用のNext.jsとビルドは型生成ファイルを共有するため、`npm run build` はE2Eが終了してから実行してください。

実装で参照した公式資料: [JobPostingの構造化データ](https://developers.google.com/search/docs/appearance/structured-data/job-posting)、[Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)、[SchedulerのOIDC認証](https://docs.cloud.google.com/scheduler/docs/http-target-auth)、[App Hostingの環境変数とシークレット](https://firebase.google.com/docs/app-hosting/configure)。

今回の検証結果: E2E21ケース（通知設定の3件は非同期保存を待つ形に直して再実行）、Rules7件、サーバー9件が成功。本番ビルド成功、npm auditは0件。旧データ互換のRulesと通知用の索引は実プロジェクトへ適用済み。開発用の実Firestore読み取りと公開ページ取得も確認しました。SMTPサービスと送信元は未設定のため、実メール配信とSchedulerの作成は未実施です。
