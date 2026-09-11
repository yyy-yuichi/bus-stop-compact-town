# 静的サイト公開手順

通常マップは国土数値情報4,418件、徒歩圏試作はOSM7地点、商業施設は19件です。比較マップにはOSM原本1,085地点と市データ907件も収録しています。リポジトリの公開範囲を変更する必要はありません。

## 再作成

Node.js 24でプロジェクト直下から実行します。

```sh
npm ci
npm run build
node scripts/verify-release.mjs
npm run preview
```

`npm run build`は商業施設データを検証してからdistを生成します。GitHub Actionsも同じ検証とビルドを実施し、static-siteという成果物を14日間保存します。このworkflowにはデプロイ処理がありません。正式保存は案件のGoogle Driveフォルダです。

## 配置するもの

公開用ZIPを展開した中身（index.html、about.html、third-party-notices.txt、assets、data）を静的ホスティングの公開ディレクトリへ配置します。ソース一式ZIPやプロジェクト全体を公開ディレクトリに置かないでください。

- ビルドコマンド：`npm run build`
- 出力ディレクトリ：`dist`
- サーバー側処理・APIキー：不要
- HTTPSで配信し、HTML・JavaScript・CSS・GeoJSONが取得できることを確認
- ルート配置とサブフォルダ配置に対応。サブフォルダURLは末尾に `/` を付ける
- アプリ内の独自ルーティングはないため、SPAリライトルールは不要
- Viteのpreviewは確認用であり、本番サーバーとして運用しない

## 公開後の確認

地図画像・青いバス停・橙色の19施設、一覧選択、表示切替、出典説明ページ、データリンクを確認します。最初はindex.htmlとGeoJSONを長期キャッシュせず、データ更新時に古い版が残らないようにしてください。

地図タイルはOpenStreetMapの外部サービスです。通常表示だけで利用し、一括取得・先読み・オフライン保存は実装していません。利用が増える場合はタイル提供条件と配信基盤を改めて検討してください。

2026-09-08にGitHub Pagesへ公開し、公開URLで表示を確認済みです。URL：https://yyy-yuichi.github.io/bus-stop-compact-town/ 。独自ドメインは設定していません。

参考：[Vite公式の静的配置手順](https://vite.dev/guide/static-deploy.html)

