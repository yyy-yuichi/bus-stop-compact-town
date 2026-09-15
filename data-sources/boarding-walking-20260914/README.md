# 乗り場徒歩圏の比較原本

`national-nishigawara.json` は既存の公開R2から2026-09-14に取得した国の西河原の徒歩圏。94,532 bytes、SHA256 `71022c914f15585f307730f3322cedbe425e3533ae75f28a9e7f3ef346959ac4`。

出典URL：https://pub-64cdb45739c446ef86342de34ccd47a6.r2.dev/data/walk/131.92142_33.97257.json

`scripts/bake-boarding-walking.py` が同じ原座標で再計算した結果は、全JSON内容がこの公開原本と一致した。元の徒歩圏の計算方法を維持していることの回帰確認に使用する。各乗り場の計算結果は `src/data/boarding-walk-study/`。別の点の結果を複製していない。
