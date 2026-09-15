# v19差分の再開・再生成

この差分は、受入済みv18（e61eca41b530dcf24766a4aa4801bcf4f603225e）に適用します。既存原本を再梱包していません。

- v18ソース原本: https://drive.google.com/file/d/1B6Dj0c4dt4b9Ee5ySRFucvTBpBfVOTap/view
- v18台帳・再生成資料: https://drive.google.com/file/d/10e55uITP4K9LtICYeGiV-ehrVLZKaZio/view
- 既存道路・標高原本: https://drive.google.com/file/d/1sOoYewdq_rP6NrSNJpfFlLmSRIZ_e2Hj/view

1. v18のsite-sourceへ今回ZIPのsite-sourceを重ねます。DELTA-MANIFEST.jsonに変更ファイルのSHA256があります。原本ZIP自体を編集しないでください。
2. 今回ZIPのreproduction/workをアプリのworkへ復元します。既存raw_dataとv18のDEMは再利用します。新規DEMだけを今回追加しています。
3. `python scripts/test-residual-v19.py --baseline-zip <v18ソースZIPの実パス>` と `node scripts/test-residual-v19-app.mjs` が今回の対象テストです。前者は1143既存原本の全バイト、1270既存index項目、原ID・座標・番号・5件以外の既存案内不変を検証します。
4. `python scripts/replay-sentetsu-walking.py` は保存した2回分のグラフから新規7原点だけを再生成し、アプリの計算原本とバイト一致を検証します。原本へは上書きしません。
5. 船木鉄道の公開原資料はsentetsu-v19-20260915内。fetch-sentetsu-residual.pyは既存リクエストキャッシュを再利用し、audit-sentetsu-sections.pyは原座標・前後停車順・分岐のない公式経路線・道路側を照合します。公式経路線は便別GTFS shapeではありません。局所的に折れた図を個別確認した3原IDは、通常判定と40/60/80m区間の照合を両方残しています。
6. 再計算対象はconfirmed-walking-targets.jsonの原点だけです。既存計算がある原点は通常の追加処理で再計算しません。位置保留点の近さだけを理由に計算しないでください。

## 終わった部分と残った部分

- 山陽小野田市の7原点を資料上確認し、その原点からの徒歩圏・施設を新規整備。
- 既存参考計算5原点の歩道接続を確認して再利用。
- 元の未計算128地点は128地点のまま。位置・道路側が保留の原点や、徒歩対象道路が30m外の原点を推測で埋めていません。
- 船木鉄道の乗車観測74原点中67原点は道路側対応保留。別の7原点は座標のみで乗車資料不足。全便・全曜日・全路線の確認ではありません。
- 追加取得したいわくにバスの238原点（岩国市229・県外等9）は未処理。和木駅が収録されずshapes.txtもないことを確認した段階です。未処理を保留解消として数えていません。
- 実ブラウザー、スマホ実機、Safari、現地の確認は未実施。関数テストを実画面検証とは呼びません。
- 本人限定の既存Sitesと案件Driveを維持。配信結果・ソースcommit・保存先・読み戻しはDELIVERY-RECEIPTを参照。
