# kazashiteGO

iPhoneのNFC読み取りで広告ページを表示し、読み取り回数と付与ポイントをCloudflare D1に記録するMVPです。

## 構成

- Next.js: 管理画面を静的出力
- Cloudflare Pages Functions / Workers: NFC広告ページ、管理API、認証
- Cloudflare D1: NFCタグ、広告キャンペーン、日次集計、ポイント履歴
- 広告画像: `public/ads/onion-curry.png`

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
- サンプルNFC: [http://127.0.0.1:8788/n/onion-shelf](http://127.0.0.1:8788/n/onion-shelf)

## 現在の公開URL

- 管理画面: [https://kazashitego.kazashitego-go.workers.dev/admin](https://kazashitego.kazashitego-go.workers.dev/admin)
- ユーザー画面 / NFC読み取り先: [https://kazashitego.kazashitego-go.workers.dev/n/onion-shelf](https://kazashitego.kazashitego-go.workers.dev/n/onion-shelf)

NFCタグには、次のURLをNDEFのURIレコードとして書き込みます。

```text
https://kazashitego.kazashitego-go.workers.dev/n/onion-shelf
```

## 主なコマンド

```bash
npm run lint
npm run build
npm run db:migrate:local
npm run pages:dev
```

## Cloudflareへ置くとき

```bash
wrangler d1 create kazashitego-db
wrangler d1 execute kazashitego-db --remote --file=./migrations/0001_initial.sql
wrangler secret put ADMIN_PASSWORD
npm run deploy
```
