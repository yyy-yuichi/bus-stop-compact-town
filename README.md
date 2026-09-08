# bus-stop-compact-town

今日の調査・採用事項・残作業は [コーディネーター向け引き継ぎ](docs/HANDOFF.md) に集約。実装前の取得元比較もリポジトリ内に保存する。

## 商業施設レイヤー（2026-09-08・19施設版）

前回の保留4施設を追加して計19施設。内訳は建物形状10件、施設範囲2件、施設代表点7件。橙色の実線・破線・丸で区別する。市名付き一覧から拡大表示でき、バス停とは独立して表示切替が可能。長い詳細はスクロール表示する。

追加済み・保留・未調査範囲と出典は [施設状況一覧](docs/shopping-status-20260908.md) に記録。ゆめタウン南岩国とフジグラン3施設は、公式サイト・Googleマップ・OSMを照合して追加。今回対象の保留は0件。フジグラン岩国はOSM無名建物との位置照合による推定対応で、重心を代表点として採用。県内全件の網羅を意味しない。

名称・住所は公式サイトと照合。位置・形状はOpenStreetMap由来で、入口位置・現地精度・徒歩経路は未確認。source_timestampはOSM要素の更新日時で、wayが参照する座標ノードの更新日時や現在の営業状況を保証しない。ライセンスはODbL 1.0 / © OpenStreetMap contributors。元OSM ID・登録名・公式URL・取得日・照合日はpublic/data/shopping.geojsonに保存する。

検証：node scripts/validate-shopping.mjsで全19施設のID、出典重複、必須項目、座標範囲、ポリゴン閉合を確認。npm run build成功。追加11施設の一覧選択・詳細表示、表示切替、PC幅1248×720とスマホ幅390×844の代表表示を確認。ブラウザー実行エラーなし。スマホ実機・横向き、障害注入は未検証。

ユーザー提供のsource-freshness-result-34167978019.zipと重複照合済み。添付は交通原資料7件の更新検査結果であり、今回の商業施設追加と対象・処理が異なる。詳細と未解決事項は施設状況一覧の末尾に記載。この検査の再実行やGTFSの自動採用は行っていない。

19施設版と公開準備の設定をGitHubで管理。GitHub Pages公開済み：https://yyy-yuichi.github.io/bus-stop-compact-town/ 。公開用一式とソース一式は案件Driveへ保存する。
バス停を中心としたコンパクトタウン。第一弾として、Vite + React + TypeScript + Leafletで全画面の地図SPAを実装。

## 公開準備

[静的サイト公開手順](docs/PUBLISHING.md)を参照。npm run buildはデータ検証を含み、GitHub Actionsもビルドまで実行する。公開用ファイルはdist内の7ファイルのみ。地図から出典説明・GeoJSON配布・ライブラリライセンスを参照できる。ルートとサブフォルダ配置に対応。GitHub Pagesへ配置済み。

## 起動

Node.js 22.12以上（確認環境：24.13.1）。プロジェクト直下で実行する。

```sh
npm ci
npm run dev
```

表示先はターミナルに出るローカルURL。`npm run build`でdistへビルドし、`npm run preview`で確認できる。dist/index.htmlの直接ダブルクリックは対象外。

## 現在地（2026-09-08）

- 全画面地図、ドラッグ・キーボード移動、拡大縮小、初期表示に戻す操作を実装。
- 初期表示は山口県のバス停全体。端末の位置情報は取得しない。
- 画面回転・サイズ変更への追従と、通信エラー案内・再読み込みを実装。
- ビルド成功。PC幅1248×720・スマホ幅390×844のブラウザーで描画、ドラッグ、拡大縮小、初期表示復帰を確認。実行エラーなし。
- スマホ実機のタッチ・ピンチ操作、通信切断からの復旧は未検証。
- 地図画像はOpenStreetMapから取得するためインターネット接続が必要。出典は地図右下に表示。
- 添付のOSMバス停データ1,085地点を導入。到達圏計算・旧コードは未導入。GitHubの公開リポジトリでソースを履歴管理する。GitHub Pages公開済み：https://yyy-yuichi.github.io/bus-stop-compact-town/ 。
- Codex Project登録済み。昨日の作業場所からソース7ファイルをSHA256一致確認のうえ復元し、このProjectで依存関係の復元とビルドを確認済み。

GitHub：https://github.com/yyy-yuichi/bus-stop-compact-town

正式保存先：https://drive.google.com/drive/folders/1C2XkUsjRsiQqKBN69mPbMRKxO8hRa624

ローカル：C:\Users\user\Documents\ChatGPT\バス停コンパクトタウン｜新規開発

DriveのZIPにはソース、package-lock.json、ビルド済みdistを保存。node_modules・.git・秘密情報は含めない。

目的と完了条件を中心に通常作業を進め、重要な不明点だけ確認し、検証は変更リスクに合わせる。
運用根拠：https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices
地図実装：https://leafletjs.com/examples/quick-start/


## バス停データ

`public/data/bus_stop.geojson`はユーザー提供ファイルの無加工コピー。OpenStreetMap contributors / ODbL、overpass-turbo生成。ファイル内timestamp：2026-09-07T12:21:51Z。取り込み日：2026-09-08。データの最新性・網羅性・正確性は未確認。

1,085地点すべてPointで座標形式・範囲を検証、ID重複なし。名称なし37地点は「名称未登録」で表示。同名・上下線などの別IDは統合しない。地図の青い点と一覧から選択でき、名称・運行事業者（登録がある場合）・OSM IDを表示する。属性はHTMLとして解釈せずテキストで表示。

PC/スマホ幅で描画、一覧選択（紅葉橋）、詳細表示、全体表示への復帰を確認。ビルド成功、ブラウザー実行エラーなし。データ読込失敗時の再試行を実装（障害注入による動作検証は未実施）。デジタル庁デザインシステムへの準拠確認は今後の作業。


## TypeScript

アプリはsrc/main.tsx・src/ShoppingLayer.tsx、共通データ型はsrc/types.ts、Vite設定はvite.config.ts。strictを有効にし、npm run typecheckで検査する。npm run buildとGitHub Actionsでも型検査を実行する。Node用のデータ検証スクリプトは既存の.mjsを利用する。


バス停の読み込み・レイヤー・選択UI・全体表示はsrc/BusStopLayer.tsxへ分離。main.tsxは地図本体を初期化し、BusStopLayerとShoppingLayerへ同じmapを渡す。初期表示設定はsrc/mapConfig.tsで共有する。


## Tailwind CSS

Tailwind CSS 4.3.3と公式Viteプラグインを導入。src/style.cssから読み込み、各TSXのユーティリティクラスでパネル・ボタン・フォーム・レスポンシブ配置を指定する。Leafletが生成するコントロールとポップアップの調整はstyle.cssに集約。PC、スマホ縦横の配置を確認する。

公式導入手順：https://tailwindcss.com/docs/installation/using-vite
