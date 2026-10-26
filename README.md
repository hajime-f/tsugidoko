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

2026年10月25日、Googleログイン・応募管理・統一した選考状況・行動管理・比較・求人URL取り込みを本番へ公開しました。その後APIキー対策とメール通知の撤去も反映し、現在のリビジョンは `tsugidoko-build-2026-10-25-003` です。検索エンジン向けには `noindex` を維持しています。

### Node.js セキュリティ更新の状況（2026年10月25日）

- 開発・本番ともに22.23.4へ更新済み。10月21日時点のGoogle側ランタイム提供待ちは解消しました。
- Cloud Build `0404b26c-70f4-4cd1-ac3b-0cea68b67d35` のログで `Using exact version 22.23.4 for Node.js` とインストールを確認し、ビルド成功後の新リビジョンへ本番トラフィック100%が切り替わりました。
- `NPM_CONFIG_ENGINE_STRICT=true` を本番ビルドにも適用。要求より古いNode.jsでのビルドを防ぎます。ベースイメージの自動更新も有効です。
- 本番URLでトップ、登録・ログインボタン、サンプルの状況変更、未認証のホームからトップへの遷移、APIの未認証拒否を確認しました。実Googleアカウントでのログイン完了・データ保存は手動確認が必要です。

修正内容: [Node.js 公式セキュリティ告知](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)。

## 認証と専用ホーム（2026年10月25日）

- 開発ログインURL: http://127.0.0.1:3100/
- 専用ホーム: http://127.0.0.1:3100/home （未ログイン時はトップページ `/` に移動）
- Google アカウントで初回ログインすると Firebase Authentication にユーザーを作成します。Google のパスワードをこのアプリが受け取ることはありません。
- SDK 標準のブラウザ永続化を利用し、再読み込みや別タブでも認証を共有します。アカウント画面からログアウトすると、ほかのタブの専用ホームもトップページに戻ります。
- Firebase Web 接続先は `src/lib/firebase/client.ts` の `tsugidoko-prod-hajime-f`。APIキーは `NEXT_PUBLIC_FIREBASE_API_KEY` からビルド時に読み込み、値はGitに書きません。本番は `apphosting.yaml` のSecret Manager参照、通常のローカル開発はGit除外の `.env.local` に開発用キーを設定します。エミュレーターは `demo-key` を使い、実キーは不要です。
- Web用キーはブラウザへ配信される公開識別情報であり、環境変数やSecret Managerに移しても秘密にはなりません。Google Cloudで使用APIとHTTPリファラーを制限し、データの閲覧・編集はFirebase Authenticationと本人限定Firestore Rulesで制御します。Admin SDK・OAuthの秘密鍵は含めません。ツギココのFirebase設定とは分離しています。
- 本番キーはApp Hosting本番URL、同じバックエンドのCloud Run URL、Firebase認証用 `tsugidoko-prod-hajime-f.firebaseapp.com` のみに制限。開発キーは `http://localhost:3100`・`http://127.0.0.1:3100` と同認証ドメインに分離します。両キーのAPI許可はIdentity Toolkit・Token Service・Cloud Firestore・Cloud Datastore・Firebase Rulesのみ。リファラーは偽装できるため、本人認証やRulesの代わりにはなりません。App Checkは未導入です。
- キーを更新するときは、制限付きの新キーを作り、Secret Managerの新バージョンと `apphosting.yaml` の参照を更新して再ビルド・デプロイします。本番の認証開始を確認してから旧キーを失効させます。古い画面を開いたままの場合は再読み込みが必要です。独自ドメインや開発ポートを追加するときはキーのリファラー制限とFirebase Authの許可ドメインも確認してください。
- 2026年10月25日の切り替え時、Firebase Management APIによるWebAppの `apiKeyId` 更新は制限付き新キーを400で拒否しました（同じ旧キーIDへの更新は成功）。制限を緩めず、新キーをアプリへ明示的に設定しています。Consoleや `firebase apps:sdkconfig` のキー値を転記せず、上記Secret Manager参照と開発設定を正としてください。認証ポップアップもアプリから渡したキーを使います。
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
- 終了した応募先と行動は削除せず保管します。応募先の永久削除・退会は未提供です。求人URL取り込みに対応しています。メール通知は取り下げ、期限はホームの行動一覧で確認します。
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

## 選考状況・求人URL（2026年10月25日）

- 入力は「選考状況」一つ。検討中・応募済み・カジュアル面談・書類選考・一次面接・二次面接・最終面接・内定・入社決定・辞退・不採用・募集終了から直接選びます。
- 内定は緑、入社決定はピンクで行を強調し、進行中の一覧に残します。辞退・不採用・募集終了だけ終了へ移動し、予定・比較から通常は除外します。状況を選び直して復帰できます。
- 保存形式は既存の stage/endReason と互換にしています。画面は endReason があればそれを優先し、なければ stage を一つの状況として表示します。状況変更時は両フィールドを原子的に更新し、選考中へ戻すと endReason を空にします。別項目だけの編集では過去の段階を書き換えません。
- アーカイブ操作は廃止済み。旧 archived の値は無視します。応募先の記録は削除しません。

- 登録画面の「求人URLから入力」で、公開ページの JSON-LD JobPosting を候補として表示します。確認・修正して登録します。ログイン必須・自動取得を拒否するページ・構造化データのないページは手入力できます。取得は認証必須、1ユーザーあたり毎分5回です。
- メール通知は2026年10月25日の依頼で取り下げました。通知設定画面・配信API・SMTP処理・Scheduler設定スクリプト・通知用のRules/索引定義を撤去し、送信サービスの設定待ちも解消しました。次の行動と期限の管理は引き続きホームで利用できます。
- 通知の撤去は開発・本番ともに反映済みです。画面/APIとFirestore Rules/indexesを更新しました。SMTPとSchedulerは作成していません。既存の応募先・予定・メモや通知用の過去データは削除していません。
- 本番にあった追加索引が `settings.enabled` のcollection group索引だけであることを確認して削除しました。通知データの本人読み取り許可も撤去済みです。今後、索引を削除するときも対象を確認し、ほかの索引まで一括削除しないでください。

### 開発用サーバー認証

本番のAdmin SDKはApp HostingのApplication Default Credentialsを使います。ローカルでは通常のADC、または開発モード限定の `FIREBASE_USE_GCLOUD_CREDENTIALS=1` と `GCLOUD_BIN` で、ログイン済みgcloudの短命アクセストークンを利用できます。現在の `.env.local` は後者で、秘密値は格納していません。このモードはオーナー権限でRulesを経由せず実プロジェクトに接続するため、他ユーザーの情報を対象に試験しないでください。自動テストは必ず `demo-tsugidoko` のエミュレーターを使います。リポジトリへ資格情報や `.env.local` を追加しないでください。

### サーバー・権限の検証

```sh
npm run test:server   # Auth/Firestore Emulatorで求人URL取得・認証・SSRF・回数制限を検証
npm run test:rules
npm run test:auth -- tests/e2e/workspace.spec.ts
```

E2E用のNext.jsとビルドは型生成ファイルを共有するため、`npm run build` はE2Eが終了してから実行してください。

実装で参照した公式資料: [JobPostingの構造化データ](https://developers.google.com/search/docs/appearance/structured-data/job-posting)、[Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)、[App Hostingの環境変数とシークレット](https://firebase.google.com/docs/app-hosting/configure)。

メール通知の撤去前に実施した検証結果はCONTEXT.mdの履歴に記録しています。撤去後の検証結果も同ファイル末尾を参照してください。

## 選考履歴・面接メモ・CSV・職務経歴書（2026年10月26日）

- 応募先の詳細で選考状況の変更履歴（新しい50件）を確認できます。状況変更と履歴は同じトランザクションで保存し、直前の変更だけを取り消せます。取り消しも履歴に残ります。導入前の変更や初回登録の履歴は作りません。
- 同じ詳細画面に、面接ごとの日付・担当者・話した内容・気になった点・次回の質問を保存できます。会社全体のメモは従来どおり別に残ります。
- 応募先一覧の下から、全応募先と面接メモをそれぞれCSV出力できます。終了した選考も含みます。UTF-8 BOM付きで、数式として実行される可能性のある値は先頭にアポストロフィを付けます。
- ホーム下部の「職務経歴書」で、書類名・氏名・作成日・要約・最大10社の職歴・スキル・自己PRを入力し、途中保存できます。自動保存ではなく「下書きを保存」で保存します。
- 応募先を指定した複製と、編集できない「提出した版」の記録ができます。実際の応募先への送信機能ではありません。元の下書きや複製を編集しても、提出した版は変わりません。面接メモ・職務経歴書の削除操作は未提供です。
- 「印刷・PDF保存」はブラウザの印刷画面を開きます。PDF保存とヘッダー・フッターOFFを選んでください。A4に書類だけを印刷します。未保存のプレビューも印刷でき、印刷そのものは下書きを保存しません。
- 履歴は `users/{uid}/applications/{id}/statusHistory`、面接メモは同じ応募先配下の `interviews`、職務経歴書は `users/{uid}/resumes` に保存します。
- 職務経歴書の保存は `POST /api/resumes` が担当します。IDトークンの失効を含む認証、本人の応募先、Zodによる文字数・年月・10社上限、revisionによる競合、提出版の不変性をサーバーで検証します。Rulesは本人の読み取りのみ許可し、クライアントの直接書き込みを拒否します。職歴配列の検証でRulesの式数上限に当たるため、この経路にしています。
- 面接メモもrevisionで競合を検知します。職務経歴書で競合したときは「複製して保存」で手元の入力を残せます。端末の永続キャッシュには保存しません。

```sh
npm run test:unit
npm run test:rules
npm run test:server
npm run test:auth -- tests/e2e/records.spec.ts
npm run build
```

通常の開発環境では、上記のAdmin SDK用認証も必要です。新機能の公開時は本人限定のFirestore Rulesを先に適用し、その後にApp Hostingをデプロイしてください。コミット・push・画面/APIの本番公開は明示的な依頼時に行います。

本番Rulesを変更せずに4機能を試す場合は、`npm run dev:demo` でAuth/Firestore Emulatorと開発画面 http://127.0.0.1:3101 を起動できます。ログインはエミュレーターの「Add new account」で任意のテスト用メールを入力します。Googleの実アカウントへの接続はなく、通常の3100に保存したデータとは別です。停止するとテストデータは消えます。自動試験と同じポートを使うため、E2EやRules試験の前には停止してください。
求人URLの取得だけは、Emulator環境でも入力した外部サイトへアクセスします。認証情報と保存データはEmulator内で扱います。

2026年10月26日、藤田さんの承認を受けて4機能のFirestore Rulesを適用済みです。通常の開発環境 http://127.0.0.1:3100/home でも新ルールを利用できます。適用前に読み込みエラーが出た場合は再読み込みしてください。画面/APIの本番公開は別途必要です。
