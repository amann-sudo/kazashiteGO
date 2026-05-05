# kazashiteGO

iPhoneのNFCタグに入れたURLから広告を表示し、読取回数とポイント付与履歴をCloudflare D1に保存するMVPです。

## 構成

- Next.js: Cloudflare Pagesへ静的出力する管理画面
- Cloudflare Pages Functions: NFC広告ページと管理API
- Cloudflare D1: NFCタグ、広告、日次集計、ポイント履歴
- 画像広告: `public/ads/onion-curry.png`

## ローカル起動

```bash
npm install
npm run build
npm run db:migrate:local
npm run pages:dev
```

起動後に以下を開きます。

- 管理画面: [http://127.0.0.1:8788](http://127.0.0.1:8788)
- サンプルNFC: [http://127.0.0.1:8788/n/onion-shelf](http://127.0.0.1:8788/n/onion-shelf)

## 現在の公開URL

- 管理画面: [https://kazashitego.kazashitego-go.workers.dev](https://kazashitego.kazashitego-go.workers.dev)
- ユーザー画面 / NFC読取先: [https://kazashitego.kazashitego-go.workers.dev/n/onion-shelf](https://kazashitego.kazashitego-go.workers.dev/n/onion-shelf)

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
npm run deploy
```

NFCタグには、Pagesの公開URLに合わせて次のようなURLを書き込みます。

```text
https://<your-pages-domain>/n/onion-shelf
```

本番では、管理APIの前にCloudflare Accessなどの認証を追加してください。
