# 暮らしの施設と登録詳細の拡充（2026-09-14）

OpenStreetMapの山口県行政界内を、保存したquery.overpassqlの条件で取得。原応答3,753要素、3,000,806 bytes。取得は2026-09-14 06:43:45 JST、データ基準日時は2026-07-24 11:04:51 UTC。最近の営業・利用状況の確認を意味しない。

原本SHA-256: `63233897d3314a4c12b3d1b22ae833fec51e75516281dede4c780cd2e035a3f7`。取得先・UTC日時・サイズはretrieval.json。raw JSONは改変せず、取込時に照合する。

`python scripts/import-osm-facilities.py` で、保存済みの22施設、先行買い物・医療、生活施設を再生成した後、今回の候補を追加し詳細を結合する。計5,065レコード（通常5,011、参考54）。新規3,138件のうち、名称に旧校・休校等の記載がある31件と、医療機関名で福祉として登録された9件は現況・分類未確認として参考へ（計40件）。旧1,927レコードのID・形状・既存属性を保持し、登録詳細だけを追加する。バス停・道路・距離の計算は変更しない。

公園・学校等の閉じたwayは実際の頂点で敷地を構成する（新規737件）。relationの面は組み立てず、その他のway/relationは原応答boundsの中心を代表点として扱う。入口ではない。同名・同分類のnodeが同じarea内にある場合はareaへsource_idsをまとめる。同名でも離れた施設や施設内の別用途は統合しない。細部はimport-report.jsonの採用数・除外理由から追跡できる。

詳細は保存した3つの取得原本からphone/contact:phone、opening_hours、operator、brand、branch、cuisine、wheelchair、healthcare:speciality、social_facility、accessを抽出。出典IDごとに最も新しいデータ基準日時を選び、複数の値を勝手に1つへ置換しない。参考レコードに現在利用を示唆する連絡先を追加しない。結果はregistered_detailsのsourcesに日時を添付。住所・サイトがないレコードに情報を推測して補わない。

詳細付き1,710件、電話477、時間526、料理213、福祉サービス573、車いす54。日時は営業確認日ではない。既存診療所などと新規分類間の未解消の重複可能性、OSMの地域差、名称未登録による収録漏れが残る。

利用条件：© OpenStreetMap contributors / ODbL 1.0。公開GeoJSONから出典ID・日時・保留理由を再利用可能。

参照した仕様：
- [営業時間の記法](https://wiki.openstreetmap.org/wiki/Key:opening_hours)
- [電話](https://wiki.openstreetmap.org/wiki/Key:phone)
- [福祉施設](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dsocial_facility)
- [車いす情報](https://wiki.openstreetmap.org/wiki/Key:wheelchair)

複雑な営業時間の原文を残し、営業中の推定は行わない。車いすの登録は経路・施設全体の利用可否を独自確認したものではない。
