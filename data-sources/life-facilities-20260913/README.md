# 生活施設の追加原本（2026-09-13）

山口県の行政界内で、OpenStreetMapの `amenity=post_office|bank|library|townhall|community_centre` を取得。生レスポンス `osm-life-facilities.json`、実行クエリ、取得日時・SHA-256を保存している。取得結果の基準日時は2026-07-28 02:16:18 UTC。営業状況を個別に確認した調査ではない。

`scripts/fetch-life-facilities.py` は原本が存在すると再取得・上書きを止める。`scripts/import-osm-facilities.py` は従来原本・分類点検記録から1,135施設を再現し、この原本から792レコードを追加する。公開先は `public/data/shopping.geojson`。既存1,135件のID・座標・形状・属性・分類点検は変更しない。

- 通常候補は郵便局417、銀行118、図書館56、役所・支所60、公民館・交流施設132の計783件。新規の参考記録は9件。
- `reviews.json` は原本ハッシュ・ID・名称・元分類を照合する11件の点検記録。閉鎖等8郵便局と仮庁舎1件は参考へ変更し、将来の閉鎖・移転2局は予定を記録して現在の分類を維持。公式告知は `evidence/` に取得日時とSHA-256を保存。再開・移転の予定日以降は再点検が必要。
- 元のOSM要素IDを保持。名称なし・使用停止・非公開・既存出典ID重複を除外する。実際の除外理由は `import-report.json`。
- Way/Relationは外接矩形の中心、Nodeは元の座標。入口とは扱わない。
- OSM登録の住所・安全なHTTP(S)ウェブサイトだけを取り込む。`verified_at`・`official_address`・`official_url` は空で、`verification_status=osm_unverified`。
- 近接する同名の別要素は自動統合しない。件数は収録レコード数。
- 全施設は1,927件。参考14件を除く1,913件が徒歩圏候補の対象。既存の道路計算・25m判定をそのまま使い、追加分類は「暮らし」にまとめる。

© OpenStreetMap contributors / ODbL 1.0。取得元は `retrieval.json`。原本ハッシュを検査し、従来原本との完全一致・追加IDの一意性・再取り込み時の非重複を `scripts/test-osm-facilities.py` で確認する。
