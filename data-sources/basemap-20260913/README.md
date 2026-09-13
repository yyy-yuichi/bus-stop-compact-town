# 背景地図の比較と採用原本（2026-09-13）

OpenFreeMap Positronの取得時点のスタイルJSONを `positron.json` に保存し、取得元・取得日時・SHA-256を `retrieval.json` に記録した。

`scripts/build-basemap-style.py` が原本ハッシュを確認して `public/maps/soft.json` を再現する。2026-09-14に案内図の試案を統合し、生成りの陸地・青緑の水面、日本語優先の名称を使う。細かな建物や道・地名は拡大時に表示し、主要な道と鉄道を残す。元スタイルの道路番号未登録時の比較式も修正している。元データの道路・海岸などの地理形状は変更していない。

同じ県域・光駅周辺で、OSM、地理院淡色、OpenFreeMap Positron/Libertyを1タブで切り替えて比較した。配色と文字を調整でき、施設マーカーとの区別を付けやすいPositronを採用。地理院淡色は詳細な地形情報が多く、今回は通常表示に採用しない。従来のOSMを「標準（軽い表示）」として残す。

原デザイン・コードのライセンス全文は `public/maps/openfreemap-LICENSE.md` と `public/maps/positron-LICENSE.md`。原デザインはMapTiler.com & OpenMapTiles contributors、CartoDB Inc.、Stamen・Paul Normanに由来する。加工した旨とライセンス・出典へのリンクを公開アプリの `about.html#basemap` に掲載し、地図隅からリンクする。

資料：

- [OpenFreeMap導入とカスタマイズ](https://openfreemap.org/quick_start/)
- [OpenFreeMapのスタイル](https://github.com/hyperknot/openfreemap-styles)
- [地理院タイル一覧・リアルタイム利用](https://maps.gsi.go.jp/development/ichiran.html)
- [MapLibreのVite用workerの設定](https://maplibre.org/maplibre-gl-js/docs/)

MapLibre GL JS 6.9.0 / Leafletアダプター0.1.4を固定し、Viteでworkerを単独の配信ファイルへまとめる。描画workerは1つ、タイルキャッシュは32枚、pixelRatioは最大1.5。地図本体は必要時に読み込み、「標準」選択中はベクトル地図を起動しない。スタイル取得失敗・WebGL非対応・起動タイムアウト時は標準地図に切り替える。
