> 保存時の注記：これは2026-09-08の実装前調査を保存した記録です。「未実装」等の記述は当時の状態です。現在は19施設を反映済みで、最新状況は [施設状況一覧](shopping-status-20260908.md) と [引き継ぎ](HANDOFF.md) を参照してください。

# 山口県のショッピングモール位置情報 — 取得方法調査

調査日：2026年9月8日　対象：バス停コンパクトタウンの開発判断

## 結論

位置情報の取得元はある。現段階では **OSMで商業施設の試作レイヤーを作り、山口県の届出資料と施設公式サイトで照合する** 方法を推奨する。OSMの不足を調べる次の候補はOverture Places。有料データの購入は、試作で有用性を確認してから判断する。

今回確認したのは取得元・仕様・利用条件。山口県のモール全件リストや位置精度の検証は未完了。アプリの変更・追加pushは行っていない。

## 候補比較

| 取得元 | 入手できる情報・方法 | 本案件での使い方と限界 |
|---|---|---|
| OpenStreetMap / Overpass | `shop=mall`などの点・建物や敷地の面。名称・事業者・Webサイト等は登録がある場合に取得できる | 最初の試作用。バス停と同じ仕組みで扱いやすいが、点のみの抽出では面を取りこぼす。タグ漏れ・閉店・同一施設の重複を要確認。[タグ仕様](https://wiki.openstreetmap.org/wiki/Tag:shop=mall) |
| Overture Places | 名称・分類・住所・位置のPoint。地域を限定してGeoJSONを取得できる | OSMの補完候補。山口県の収録件数・モール分類の具体的な値・品質は未検証。[データ概要](https://docs.overturemaps.org/guides/places/)・[取得方法](https://docs.overturemaps.org/getting-data/) |
| 山口県の大店立地法届出状況 | 2026年8月末版Excelを公式ページで確認。届出では名称・所在地・店舗面積・新設変更日等を扱う | 名称・住所・新設変更の照合用。1,000㎡超の小売店が対象で、モールだけの一覧ではない。Excel本体の列構成・座標列は未確認。届出は現営業の保証ではない。[県公式ページ](https://www.pref.yamaguchi.lg.jp/soshiki/85/335270.html) |
| JCSC「SCポイントデータ」 | SCの位置情報、売場面積、開設年月日、キーテナント、ディベロッパー等 | 有料の精査候補。一般向け新規価格は全国版44万円・地方版17.6万円（税込、調査時点）。購入前にWeb表示・再配布の契約範囲を確認する。[商品説明](https://jcsc.or.jp/sc_magazine/books) |
| 東洋経済「大型小売店データ」 | 緯度経度付きポイント版。モール以外にスーパー・ホームセンター等も含む。年3回更新 | 大型店全般を扱う段階の候補。撤退店・予定店も含むため状態による選別が必要。利用許諾と価格は見積条件を確認する。[商品仕様](https://biz.toyokeizai.net/data/service/detail/id=347) |

県公式ページは2026年9月7日更新。Exaの検索・取得結果には7月末版が残っていたが、公式ページの直接読み取りで8月末版を確認した。検索結果の更新時点をそのまま採用しない。

## 利用条件で区別すること

- OSMはODbL。出典とライセンスを表示し、データ配布時も条件に従う。[OSM公式ライセンス説明](https://www.openstreetmap.org/copyright)
- Overture Placesは出典によりCDLA Permissive 2.0、Apache 2.0等を含む。取得する版・レコードの出典を保存する。分類は`basic_category`・`taxonomy`へ移行中で、古い`categories`列だけを前提にしない。[Places概要](https://docs.overturemaps.org/guides/places/)・[分類仕様](https://docs.overturemaps.org/guides/places/taxonomy/)
- 県の通常サイトにあるExcelを、オープンデータカタログの包括ライセンス対象だと自動判断しない。通常サイトの利用案内は著作権法の範囲内での使用を求めている。一括転用・再配布時の具体的条件は未確認。[県サイト利用案内](https://www.pref.yamaguchi.lg.jp/soshiki/21/26951.html)
- JCSCの会員向け「全国SC一覧」は会員組織内利用に限定されている。一般公開アプリにそのまま組み込める無料データとは扱わない。有料のSCポイントデータとは別に条件を確認する。[全国SC一覧の利用条件](https://jcsc.or.jp/data/basic.html)

## OSM抽出の出発点

次のクエリをOverpass Turboで使う想定。取得後はGeoJSONとして書き出す。今回は直接APIにPOSTとGETを各1回実行したがHTTP 406で失敗したため、成功件数は未確認であり、0件だったという意味ではない。

```overpassql
[out:json][timeout:90];
area["ISO3166-2"="JP-35"]["admin_level"="4"]->.searchArea;
(
  nwr["shop"="mall"](area.searchArea);
  nwr["shop"="shopping_centre"](area.searchArea);
);
out geom;
```

`nwr`はnode・way・relationのすべてを対象にする。[Overpass公式マニュアル](https://dev.overpass-api.de/overpass-doc/en/preface/design.html)

駐車場に面した店舗群などは`landuse=retail`で登録される場合もある。名前付きの商業用地を補助候補として別抽出し、モールと断定せず確認する。建物内テナントをモール本体と二重計上しない。[OSM mall仕様](https://wiki.openstreetmap.org/wiki/Tag:shop=mall)

## 地図への取り込み案

1. モール候補をGeoJSONとして取得し、バス停と別レイヤーで保持する。
2. 元の点・面を保存し、表示用の代表点と、将来の徒歩経路用入口を別項目にする。建物中心を到達地点と決めつけない。
3. `source`、`source_id`、`retrieved_at`、`source_timestamp`、`license`、`verification_status`を保存する。施設名称、住所、公式URL、営業状態、入口位置は判明したものだけ補う。
4. 最初は少数の既知施設で照合する。例えば、おのだサンパークの公式所在地は山陽小野田市中川6丁目4番1号、シーモールは下関市竹崎町4-4-8。これは名称・住所の検証用であり、OSM収録や座標一致はまだ確認していない。[おのだサンパーク](https://sunpark.co.jp/access/index.html)・[シーモール](https://www.seamall.jp/)
5. 試作画面では「バス停から近い商業施設」を表示し、道路経由の到達圏計算は後段で追加する。買い物の利便性を評価するなら、将来はモールとスーパーを別分類で扱う案がある。

## 調査範囲と残る確認

Exaで9クエリ、検索結果45枠（重複含む）を確認し、公式・一次資料を中心に深掘りした。これは45件の独立ソースを精読したという意味ではない。行政資料、OSM、Overture、SC業界データの取得経路と主要な制約が揃ったため、追加の広域検索は打ち切った。

未確認：山口県モールの実取得件数、OSMとOvertureの相互網羅率、県Excel本体の仕様、座標と営業状態の現地一致、有料データのWeb再配布許諾。次に進める具体作業は「OSMの実データ取得と、数施設の公式サイト照合」。デジタル庁デザインシステムへの準拠作業は今回の調査対象外。

