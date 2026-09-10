# 徒歩圏データの配布（Cloudflare R2）

`work/walk/`（3,657件のベイク済み徒歩圏カタログ、150MB弱）はgitに置かない。再ベイクのたびに全ファイルが書き換わり、gitは差分を持てないため。配布はCloudflare R2に置き、`VITE_WALK_DATA_URL`を設定してビルドすると、ブラウザーは各徒歩圏ファイルをR2から直接fetchする。ビルド成果物（dist）は徒歩圏データを一切含まなくなり、約182MBから約2.8MBに縮む。CIがデータをダウンロードしてからビルドする工程も不要になる。

`VITE_WALK_DATA_URL`を設定しない場合はこれまで通り`public/data/walk`（ローカルでは`work/walk`へのシンボリックリンク）から配信される。**これがローカル開発の既定動作**：クローンしてベイクしてdevサーバーを起動するだけで動き、R2のバケットや資格情報、ネットワークアクセスは一切不要。

無料枠（10GBストレージ、エグレス課金なし）で余裕をもって収まる。R2をS3ではなく選んだ理由の一つがこのエグレス無料。

## 1. バケットを作る

1. Cloudflareダッシュボード → R2 → Create bucket。リージョンは自動（Automatic）でよい。
2. バケット設定 → Settings → Public access → **Allow Access** を有効化（R2.devサブドメインでの公開、または独自ドメインを紐付け）。
3. 有効化すると公開URLが表示される（`https://<hash>.r2.dev` 形式、または紐付けた独自ドメイン）。この値を後述の`VITE_WALK_DATA_URL`に使う。

## 2. CORSを設定する（ここでハマる）

設定を忘れるとブラウザーがすべての徒歩圏リクエストをブロックする。エラーはネットワーク障害のように見えるが、原因はCORS未設定であることが多い。

バケット設定 → Settings → CORS policy に以下を追加する。`AllowedOrigins`には配信するサイトの実際のオリジンを入れる（GitHub Pagesなら`https://yyy-yuichi.github.io`、独自ドメインならそれ、ローカルでR2越しに確認したい場合は`http://localhost:4173`や`http://127.0.0.1:4173`も足す）。

```json
[
  {
    "AllowedOrigins": ["https://yyy-yuichi.github.io"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

## 3. アップロードする

R2はS3互換API。エンドポイントは `https://<アカウントID>.r2.cloudflarestorage.com`（Cloudflareダッシュボード → R2 → バケット → Settings → S3 API に表示される）。APIトークンはR2 → Manage R2 API Tokens で発行する（Object Read & Write権限）。

`aws` CLIで例（`~/.aws/credentials`にR2用プロファイルを作るか、環境変数で認証情報を渡す）：

```sh
AWS_ACCESS_KEY_ID=<R2アクセスキー> \
AWS_SECRET_ACCESS_KEY=<R2シークレットキー> \
aws s3 sync work/walk/ s3://<バケット名>/data/walk/ \
  --endpoint-url https://<アカウントID>.r2.cloudflarestorage.com \
  --delete
```

`rclone`でも同じことができる（`rclone config`でR2用リモートをS3互換として設定し、`endpoint`に上記URLを指定）：

```sh
rclone sync work/walk/ r2:<バケット名>/data/walk/
```

アップロード後、件数がベイクした数（`work/walk/index.json`の要素数）と一致しているか確認する：

```sh
node -e "console.log(JSON.parse(require('fs').readFileSync('work/walk/index.json')).length)"
aws s3 ls s3://<バケット名>/data/walk/ --endpoint-url https://<アカウントID>.r2.cloudflarestorage.com --recursive | wc -l
```

後者は`index.json`自身も数えるので、前者+1件になっているのが正しい。差があれば`--delete`付きの`sync`をやり直す。件数確認だけのためにラッパースクリプトは書いていない——`aws s3 sync`と`ls | wc -l`をそのまま叩けば済む話に、シェルするだけの層を足す意味がない。

## 4. 本番ビルド

```sh
VITE_WALK_DATA_URL=https://<公開URL>/data/walk npm run build
```

末尾に`/`があってもなくても動く（クライアント側で吸収する）。ビルド後、`dist/data/walk`が存在しないこと、`node scripts/verify-release.mjs`が通ることを確認する（このスクリプトは`VITE_WALK_DATA_URL`が立っていると同じことを自動でチェックし、`dist/data/walk`が残っていたら失敗する）。

```sh
VITE_WALK_DATA_URL=https://<公開URL>/data/walk node scripts/verify-release.mjs
```

`VITE_WALK_DATA_URL`を設定せずに`npm run build`すれば、これまで通り`dist/data/walk`に全カタッチメントが入る。ローカル確認や、R2をまだ用意していない環境ではこちらでよい。

`.github/workflows/pages.yml`はrepository variable `WALK_DATA_URL`をこの用途に読む（`vars.WALK_DATA_URL`）。実際に公開する前に、GitHubのSettings → Secrets and variables → Actions → Variablesで公開URLを設定すること。未設定のまま実行すると到達不能なプレースホルダーURLでビルドされ、公開後にクライアントが徒歩圏を取得できない。

## 5. 再ベイク後にやること

1. `python3 scripts/bake-walking.py` でベイクし直す（`work/walk/`が更新される）。
2. 上記「3. アップロードする」を`--delete`付きでやり直す（削除された停留所のファイルも消える）。
3. バケットの中身が変わるだけで、URLもコードも変わらない。gitにコミットするものは無い。
