# kazashiteGO

iPhoneのNFC読み取りで広告ページを表示し、読み取り回数、匿名ユーザー、ポイント残高、日付変更リセットのポイント制限をCloudflare D1に記録するMVPです。

## 構成

- Next.js: 管理画面を静的出力
- Cloudflare Pages Functions / Workers: NFC広告ページ、管理API、認証
- Cloudflare D1: NFCタグ、広告キャンペーン、匿名ユーザー、ポイント台帳、日次集計、秒単位履歴
- 広告画像: `public/ads/onion-curry.png`, `public/ads/onion-soup.png`, `public/ads/onion-steak.png`

## 認証

管理画面と管理APIはBasic認証で保護します。

- ユーザー名: `admin`
- パスワード: `ADMIN_PASSWORD`

ローカルでは `.dev.vars` に本物の値を置きます。このファイルはGitに含めません。

```bash
cp .dev.vars.example .dev.vars
```

本番ではCloudflareのsecretまたは環境変数として `ADMIN_PASSWORD` を設定してください。`ADMIN_PASSWORD` が未設定の場合、管理画面と管理APIは利用できないように閉じます。

## ローカル起動

```bash
npm install
npm run build
npm run db:migrate:local
npm run pages:dev
```

起動後に開くURLです。

- 管理画面: [http://127.0.0.1:8788/admin](http://127.0.0.1:8788/admin)
- サンプルNFC 01: [http://127.0.0.1:8788/t/kg-0001](http://127.0.0.1:8788/t/kg-0001)
- サンプルNFC 02: [http://127.0.0.1:8788/t/kg-0002](http://127.0.0.1:8788/t/kg-0002)
- サンプルNFC 03: [http://127.0.0.1:8788/t/kg-0003](http://127.0.0.1:8788/t/kg-0003)
- ユーザーポイント画面: [http://127.0.0.1:8788/app](http://127.0.0.1:8788/app)

## 現在の公開URL

- 管理画面: [https://kazashitego.kazashitego-go.workers.dev/admin](https://kazashitego.kazashitego-go.workers.dev/admin)
- NFC読み取り先 01: [https://kazashitego.kazashitego-go.workers.dev/t/kg-0001](https://kazashitego.kazashitego-go.workers.dev/t/kg-0001)
- NFC読み取り先 02: [https://kazashitego.kazashitego-go.workers.dev/t/kg-0002](https://kazashitego.kazashitego-go.workers.dev/t/kg-0002)
- NFC読み取り先 03: [https://kazashitego.kazashitego-go.workers.dev/t/kg-0003](https://kazashitego.kazashitego-go.workers.dev/t/kg-0003)
- ユーザーポイント画面: [https://kazashitego.kazashitego-go.workers.dev/app](https://kazashitego.kazashitego-go.workers.dev/app)

NFCタグには、次のURLをNDEFのURIレコードとして書き込みます。

```text
https://kazashitego.kazashitego-go.workers.dev/t/kg-0001
https://kazashitego.kazashitego-go.workers.dev/t/kg-0002
https://kazashitego.kazashitego-go.workers.dev/t/kg-0003
```

## 主なコマンド

```bash
npm run lint
npm run build
npm run db:migrate:local
npm run pages:dev
```

## ポイントの考え方

- ログイン前でも、Cookie由来の匿名ユーザーをD1の `users` に保存します。
- ポイント残高は `user_point_balances`、付与履歴は `point_transactions` に保存します。
- 同じ広告キャンペーンは、ユーザーごとに `reward_locks` で日本時間の日付が変わるまで再付与されません。
- 将来ログイン機能を追加すると、匿名ユーザーのポイントを会員ユーザーへ引き継ぐ前提の構成です。
- ユーザーポイント画面 `/app` には、NFC読み取り先や管理画面へのリンクを出しません。
- ユーザーポイント画面 `/app` の履歴では、`NFC 01` のようなNFC番号を表示せず、売り場名だけを表示します。
- iPhone Safariの自動電話番号検出を避けるため、ユーザー向けページでは `telephone=no` を指定し、履歴日時は日本語表記にしています。

## Cloudflareへ置くとき

```bash
wrangler d1 create kazashitego-db
wrangler d1 execute kazashitego-db --remote --file=./migrations/0001_initial.sql
wrangler d1 execute kazashitego-db --remote --file=./migrations/0003_add_users_points_and_campaigns.sql
wrangler d1 execute kazashitego-db --remote --file=./migrations/0004_add_three_sample_nfc_tags.sql
wrangler d1 execute kazashitego-db --remote --file=./migrations/0005_reset_rewards_on_japan_day.sql
wrangler secret put ADMIN_PASSWORD
npm run build
wrangler deploy worker.ts --config wrangler.worker.jsonc --assets out --keep-vars
```
