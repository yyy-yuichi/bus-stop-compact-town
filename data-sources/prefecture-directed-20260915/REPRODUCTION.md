# 再開・再生成

この成果は既存Sitesのソースに追加したものです。原本は上書きしていません。

- アプリ・全ソースは source-and-distribution ZIP の site-source、配信物は distribution。
- 既存道路・標高根拠は Drive file 1sOoYewdq_rP6NrSNJpfFlLmSRIZ_e2Hj を再利用。
- 今回の根拠ZIPには新規公式GTFS・公式地図・道路取得原本、各地域の ledger.json、全市町の municipal-origin-ledger.json、今回の道路overlay、標高追加キャッシュ、計算時のグラフとレシートを収録。
- 原座標・番号・判定を変更せず、再開時は現在の index と計算済み原本をそのまま使う。
- 同じ230原点を再現計算する場合だけ、別の一時コピー内で現在の index から new-walking-targets.json に列挙した230項目を除き、既存ファイルを保管した上で下記を実行。現用ソースや原本では行わない。

```sh
python scripts/bake-boarding-walking.py --extend --target-ids data-sources/prefecture-directed-20260915/new-walking-targets.json --road-overlay data-sources/prefecture-directed-20260915/walking-road-overlay.json --work-dir work/prefecture-walking-20260915
```

計算後に各地域の apply-hikari-directed.py、finalize-prefecture-walking.py で実際の計算状態を表示へ反映。adopt系は初期の未計算説明も生成するため、単独で実行して完了状態としない。new-walking-targets.json は今回の230原点の記録なので、既存indexを使ってprepare-prefecture-walking.pyを再実行して空リストへ置換しない。

計算時のgraph-inputsにあるguideハッシュは徒歩結果を反映する前の案内文のハッシュ。計算後に説明を更新しており最終ソースのJSONバイト列とは異なる。原点・対象ID・道路・標高は別途検証済み。再計算では最終案内文によってキャッシュを作り直す場合があるが、座標を動かさない。

検証は python scripts/test-prefecture-directed.py と node scripts/test-prefecture-app.mjs。v17受入済み箇所の画面確認は繰り返していない。今回の関数検証はブラウザー操作ではない。
