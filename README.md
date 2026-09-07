# bus-stop-compact-town

バス停を中心としたコンパクトタウン。第一弾として、Vite + React + Leafletで全画面の地図SPAを実装。

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
- 添付のOSMバス停データ1,085地点を導入。到達圏計算・旧コードは未導入。GitHubの非公開リポジトリでソースを履歴管理する。サイト公開は未実施。
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
