# バス停を先に選ぶ表示改善

## 目的

地図上で同じ名前の別乗り場や、画面上で重なる登録を見分けてから、1地点の徒歩圏と周辺施設を開けるようにする。国の代表点、市の登録点、公式資料で整理した乗り場を名称や近さだけで統合しない。

## 変更した操作

- 初期表示と検索結果の選択では、該当地点まで地図を移動する。ここでは詳細・徒歩圏・施設を開かない。
- 拡大時は48pxのバスアイコンを表示する。画面上で重なる登録は件数付きのアイコンにまとめ、押すと元位置から線を引いた選択カードへ展開する。安全に展開できない幅では一覧ダイアログを使う。
- 個別のバス停・乗り場を選んだ時だけ、その原IDの詳細・徒歩圏・施設を開く。
- 公式資料で同じ停留所として整理済みの別乗り場は、詳細の「別の乗り場を選ぶ」から切り替える。関連付けは確認済みの `group_id` だけを使い、距離では推測しない。
- 施設詳細を開いている間も、選択した原IDの徒歩圏を地図に残す。
- 方面未確認、番号対応未確認、位置候補、机上照合済み、降車専用を選択肢に表示する。不明な番号・方面は補わない。

## 確認結果

2026-09-19に本番用の乗り場表示設定でビルドし、次を確認した。

- 西河原：検索結果では位置表示だけ、`hikari:4_01` を選ぶと徒歩15分圏43件、`hikari:4_02` へ切り替えると31件になり、方面と原IDも切り替わる。
- 木園：国の代表点と光市の2登録点が重なる3件を展開し、`hikari:6_01` を選ぶと詳細・徒歩圏が開く。
- 西河原緑地：施設詳細を開いても徒歩圏の凡例と線が残る。
- 390×844pxと320×700px：乗り場一覧が横にはみ出さず、本文にも横スクロールが出ない。
- バス停のホバー表示：名称と確認済みの乗り場番号だけを1行で表示し、方面・確認状態・出典・原IDは詳細画面に残す。タッチ端末ではホバー専用表示を出さない。
- 型検査、production build、release検査、`test:stop-selection`、地図・検索・乗り場・徒歩圏・施設・背景の対象テストが成功。

国の徒歩圏R2はGitHub PagesのオリジンだけをCORS許可しているため、本人限定Sites v20からの直接取得は失敗していた。R2の公開範囲とCORSは変えず、本人限定Sitesでは固定した公開R2の徒歩圏JSONだけを同一サイト経由で取得する構成へ戻した。

## 現在の状態

commit `270b054b026856d51b5e2323f7110078765aafd3` をGitHub mainへ反映済み。GitHub Actions [run 35439821881](https://github.com/yyy-yuichi/bus-stop-compact-town/actions/runs/35439821881) は成功した。[実施報告](https://drive.google.com/file/d/1tOPJqLXt2kLup8v6HkeTSCZvQJarhdrd/view?usp=drivesdk) と [ソース・配信候補ZIP](https://drive.google.com/file/d/12U3tlyUkq4k6oZ3rpbFzryr5JlibaZ-a/view?usp=drivesdk) は案件Driveへ保存し、保存先と内容を読み戻した。ZIPは13,898,845 bytes、SHA-256は `815257dc8cc1e415ac647738f541c04f6cf7da9afa5ce4743646494bf6265650`。

[本人限定マップ](https://yamaguchi-bus-stop-compact-town.yyy-yuichi.chatgpt.site/) v21へ配信済み。アクセス設定は所有者1名のみ、外部利用者0名、許可グループ0件を維持。実配信では、城下町長府 `mlit-p11-22-35:3533` の15分徒歩圏と施設候補10件を読み込み、施設詳細を開いても徒歩15分の凡例と範囲が残ることを確認した。v20で確認した西河原・木園の乗り場選択機能も同じソースを引き継ぐ。

[v21配信物](https://drive.google.com/file/d/1mQC4lx-awaaU6ckiZCRobjXop0VljXqf/view?usp=drivesdk) は案件Driveへ保存し、13,000,929 bytesを読み戻した。ソースはGitHub mainのcommit `d74c636af696904d57319b36a40bdae14f442101`、CI [run 35443329237](https://github.com/yyy-yuichi/bus-stop-compact-town/actions/runs/35443329237) 成功。

本人限定マップv22では、縦長になっていたバス停ホバー表示を短縮した。実配信の城下町長府で表示内容が名称だけ、幅74px・高さ32px・1行省略設定であることを確認した。読み上げ用ラベルには方面・確認状態・出典・原IDを維持している。Sitesソースは `820bbaf14b0a8296b9684f620a43e558af0ef171`、deploymentは `appgdep_6aae83ad1ad081918f3c20dde436b00a`。[v22配信物](https://drive.google.com/file/d/1SLhZ7z84gbJwMaW2ipudbJz4oKIUGvW2/view?usp=drivesdk) は案件Driveへ保存し、12,996,180 bytesを読み戻した。修正コミット `4e1f114a7c26769dce1d4b17791f984fe4796a89` はGitHub mainへpushし、Actions [run 35444659494](https://github.com/yyy-yuichi/bus-stop-compact-town/actions/runs/35444659494) が成功した。

一般公開は別工程。Pages公開ワークフローは手動実行のみで、今回実行していない。iPhone・Safari・現地利用者の操作確認は未実施。
