# 自治体の公園・子育て・学校・介護施設

2026-09-14に山口県オープンデータカタログから取得した6 CSVの原本、取得URL・SHA-256付き受領記録、5データセットのCKANメタデータを保持する。CSVの文字コードは原本のまま（県の介護2ファイルはUTF-8 BOM、市の4ファイルはCP932）。電話・名称・座標を補間、推測、ジオコーディングしていない。

| 公開者・データ | 原本行数 | 原資料の時点 |
|---|---:|---|
| 下松市・子育て施設 | 49 | 2025年11月版 |
| 下松市・教育機関 | 20 | 2025年11月版 |
| 下松市・都市公園 | 118 | 2025年1月版 |
| 下松市・介護サービス事業所 | 90 | 2025年1月版 |
| 山口県・県指定介護サービス事業所 | 1,378 | 2024-02-01 |
| 山口県・市町指定介護サービス事業所 | 1,575 | 2024-02-01 |

市はCKANのversion、県はnotesに明記された「令和6年2月1日現在」を使用。取得日・メタデータ更新日を営業確認日として扱わない。

`python scripts/import-civic-facilities.py` がこの原本だけから `public/data/civic-facilities.geojson` と `import-report.json` を再生成する。`python scripts/test-civic-facilities.py` は出力の再現、全3,230行の処理、採用全行の原座標・サービス・出典、境界距離・ポリゴンの穴、空欄の扱いを検査する。

処理結果は新規2,699レコード（公園115、保育・子育て47、学校8、福祉2,529）、サービス行の集約404、既存との重複126、座標欠落1。市の新しい資料を先に扱う。介護の事業所番号・空白正規化した住所・原座標が完全一致する行は、最初の名称と位置を維持してサービス・電話・出典行IDを集合化する。近いだけの別事業所はまとめない。

重複除外は同分類・NFKCと空白を正規化した同名・点間25m以内、または同名の既存OSM範囲内（穴を除く）。学校・子育てでは名称先頭の「下松市立」「市立」だけを除去して照合する。あいまいな名称一致や遠い点は自動統合しない。別名・誤差のある重複、複数事業所が同じ建物にある場合は残り得る。件数は物理的施設数ではない。

出典行IDは `civic:<CSV resource UUID>:row:<ヘッダーを除く1始まり行>`。市は原本ID、県は事業所番号と原住所・座標のハッシュから施設IDを作る。各処理結果と保持先IDはimport-reportに記録する。元のOSM由来5,065レコードは別ファイルのまま一切変更しない。公共データの出典をOpenStreetMapとして表示しない。

空欄は無・不可として扱わない。学校CSVの市外局番省略の電話は補完せず原文のまま、番号として扱えないものは発信リンクにしない。緯度経度は公開一覧の代表位置で入口や道路接続を保証しない。原本の施設の開設・利用・営業状況、利用資格や空きは現況未確認。

このアプリは以下の著作物を改変して利用している。提供者：下松市・山口県。CC BY 4.0。加工者：バス停と暮らしマップ。加工：分類、行集約、重複除外、GeoJSON変換。

- [下松市・都市公園一覧](https://yamaguchi-opendata.jp/ckan/dataset/352071_park)
- [下松市・子育て施設一覧](https://yamaguchi-opendata.jp/ckan/dataset/352071_preschool)
- [下松市・教育機関一覧](https://yamaguchi-opendata.jp/ckan/dataset/352071_educational_institution)
- [下松市・介護サービス事業所一覧](https://yamaguchi-opendata.jp/ckan/dataset/352071_care_service)
- [山口県・介護サービス事業所一覧](https://yamaguchi-opendata.jp/ckan/dataset/care_service)
- [下松市の利用条件](https://www.city.kudamatsu.lg.jp/jyouhou/opendata.html)
- [県の利用規約（CC BY 4.0での利用を許諾）](https://yamaguchi-opendata.jp/www/terms.html)
- [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
