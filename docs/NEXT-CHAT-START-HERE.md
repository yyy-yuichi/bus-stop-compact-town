# 次のChatはここから：店舗単位の施設鮮度更新

最終確認日：2026-09-25。正本：C:/Users/user/.codex/worktrees/420a/バス停コンパクトタウン｜新規開発。45e4を正本にしない。
ブランチ：codex/facility-freshness-news-20260924。[PR #14](https://github.com/yyy-yuichi/bus-stop-compact-town/pull/14)。

**Chat移行後の開始前必読：** 移行先で[保存エラー時の切り替え・復元手順の本文](https://drive.google.com/file/d/1Ey3KzJhvUipMse-YNNhRzcBxaUSQ45sj/view)を必ず読む。[検証済み同文コピー](DRIVE-SAVE-PLAYBOOK.md)。前Chatの既読・リンクだけで代用しない。引き継ぎ文にも必読指示とURLを残す。

## 現在地

主台帳は[店舗単位の手順・集計](FACILITY-WORKBOARD-20260925.md)と data-sources/facility-workboard-20260925/。記事台帳は履歴として保持し、未完了記事数から作業時間を見積もらない。

- [厚南の現店舗追加と閉店疑いの照合](FACILITY-KONANKAITEN-20260925.md)：オートバックス宇部厚南を公式店別地図・現住所・1周年告知で追加。地図課題22→21、補足18→19。予定日2025-09-04は実開店日にしない。
- 旧マクドナルド厚南・海都大内御堀・肉肉うどん新下関の閉店疑いは再照合したが一次告知未取得。同日の同じ旧URL・公式一覧・一般検索は繰り返さない。新しい店別告知・掲示原文が得られた場合に再開する。元ID・位置・通常候補状態は維持。
- 前段の[ウォンツ7案件](FACILITY-WANTS-CORRECTIONS-20260925.md)は4対応・3継続。宇部亀浦の重複整理、旧レデイ宇部の2018-05-16閉店、山口大内の閉店補完、柳井新庄の旧IDなし確認は完了。
- 既知58案件：地図課題21／補足19／旧店履歴2／待ち3／固定店舗対象外9／対応済み4。
- 未照合1,105記事を1,003暫定候補へ集約。既知案件と重複があるため合算しない。全体の実店舗数・所要時間は未確定。
- 地図：元7,764／更新30／追加173／履歴込み7,937／通常候補7,873／閉店9／重複履歴1。記事：完了43／一部38／未照合1,105、158イベント＝107判断済み・51保留。
- 旧ID・元位置・取得時点情報を保持。閉店と重複履歴を区別。記事全体の変更対象を列挙する前に完了にしない。追加Jev送信0。

## 次の操作

次は next-batches.json のハローズ5候補・12記事など、保存済みの公式情報を利用できるまとまりを進める。記事数は店舗数・作業回数ではない。保存済み資料で現行店と旧店、入居先を照合し、地図への影響を先に確定する。

P0の3件は今回の採否・再開条件を data-sources/facility-konankaiten-20260925/adoption-evidence.json と case-reviews.json の review_attempts に保存。オートバックスは地図解決・日付補足の2課題へ分離済みで、再追加しない。

ウォンツの残る3件：西岐波10049の公式点が入居先から約3.3km離れる相違、下松山田と旧セガミの関係、宇部沼と同位置の百菜屋の承継。宇部沼1丁目店は別店舗。data-sources/facility-wants-corrections-20260925/adoption-evidence.json を参照し、新しい一次根拠がない限り同じ調査を繰り返さない。

確定した運営元・地域のまとまりで検証・PR・Drive読み戻しまで進める。case-reviews.json 更新後は node scripts/build-facility-workboard.mjs。初期化・過去試行スクリプトの再実行は不要。

## 検証・正式保存

実装2fc3907867561b017f63f5fbacb0331602620559の[CI](https://github.com/yyy-yuichi/bus-stop-compact-town/actions/runs/36133761691)成功。90テスト・203施設の詳細画面SSR・型検査・build・release確認。[今回の原本ZIP](https://drive.google.com/file/d/1iDDnq8avi-B2f8uZbzOGlaRMRRzt7VSB/view)は640,678 bytes、SHA256 ca069180266210307e2cbc868574692a4345497eb6eb3d559a0ef0ca585ddce8。Driveから読み戻し、全体と内部52ファイルのサイズ・SHA256一致。[今回の正式保存証明](https://drive.google.com/file/d/1_o2p34WmvBseuuail1u5gNmTuyTfTQuG/view)。

増分保存のため既存checkout・前段原本と合わせて復元する。入口は原本凍結後の文書更新で、実装コミットとは別。前段ウォンツの[原本](https://drive.google.com/file/d/1BnzOLhJpabUPMP6o1WpKiZWxPI5a0T1T/view)・[保存証明](https://drive.google.com/file/d/1kPnlWa3aUWxUqchBlJwXwwjqVtH_75vh/view)も検証済みで再送不要。

入口の既存ファイルIDは1Zgtm8f-k2lb9zsQBdCi68Uk1BaGyuT3O。前回のupdate_fileは内部エラーで未更新だったため、同条件を再試行せず、既存Drive画面の「ファイル情報→版を管理→新版をアップロード」で同IDへ更新して読み戻す。

## 制約

Jev残975対象／保守的残額$0.39444736。既存分類の再送・購入・自動チャージ、マージ・一般公開は禁止。モデルを継承し、追加エージェント・重い並列処理を増やさない。
docs/facility-update-handoff-20260925.html はユーザーファイル。変更・削除・一括ステージ禁止。ローカル削除には別途承認が必要。

## 次Chatへそのまま貼る引継ぎ文

```text
バス停コンパクトタウンの施設鮮度更新を継続する。
正本は C:/Users/user/.codex/worktrees/420a/バス停コンパクトタウン｜新規開発。45e4を正本にしない。
作業開始前に移行先で保存エラー時の切り替え・復元手順の本文を必ず読む：
https://drive.google.com/file/d/1Ey3KzJhvUipMse-YNNhRzcBxaUSQ45sj/view
前Chatの既読・リンクだけで代用しない。検証済み同文コピーは docs/DRIVE-SAVE-PLAYBOOK.md。次の引き継ぎにも必読指示とURLを残す。

docs/NEXT-CHAT-START-HERE.md、FACILITY-WORKBOARD-20260925.md、FACILITY-KONANKAITEN-20260925.mdを読む。
地図課題21／補足19／旧店履歴2／待ち3／対象外9／対応済み4。更新30・追加173・通常候補7873・閉店9・重複履歴1。
オートバックス宇部厚南の現行掲載を追加し、実開店日だけ別保留。旧マクドナルド厚南・海都大内御堀・肉肉うどん新下関は新しい一次告知が得られるまで同じ検索を繰り返さない。ウォンツ残3件も前段の記録を使う。
次はハローズ等、next-batches.jsonの候補を保存資料から照合する。記事は43完了・38一部・1105未照合。1003暫定候補を実店舗数と呼ばない。
今回保存証明：https://drive.google.com/file/d/1_o2p34WmvBseuuail1u5gNmTuyTfTQuG/view
原本：https://drive.google.com/file/d/1iDDnq8avi-B2f8uZbzOGlaRMRRzt7VSB/view
実装2fc3907・CI成功。640,678 bytes、内部52ファイルをDrive読戻し照合済み。原本凍結後の入口更新を区別する。
PR #14継続。マージ・一般公開禁止。Jev残975対象／$0.39444736、再送・購入禁止。
ユーザーHTMLの変更・削除・一括ステージ禁止。モデルを継承しPC負荷を抑える。
```
