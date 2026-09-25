# 次のChatはここから：店舗単位の施設鮮度更新

最終確認日：2026-09-25。正本：C:/Users/user/.codex/worktrees/420a/バス停コンパクトタウン｜新規開発。45e4を正本にしない。
ブランチ：codex/facility-freshness-news-20260924。[PR #14](https://github.com/yyy-yuichi/bus-stop-compact-town/pull/14)。

**Chat移行後の開始前必読：** 移行先で[保存エラー時の切り替え・復元手順の本文](https://drive.google.com/file/d/1Ey3KzJhvUipMse-YNNhRzcBxaUSQ45sj/view)を必ず読む。[検証済み同文コピー](DRIVE-SAVE-PLAYBOOK.md)。前Chatの既読・リンクだけで代用しない。引き継ぎ文にも必読指示とURLを残す。

## 現在地

主台帳は[店舗単位の手順・集計](FACILITY-WORKBOARD-20260925.md)と data-sources/facility-workboard-20260925/。記事台帳は履歴として保持し、未完了記事数から作業時間を見積もらない。

- [ウォンツ7案件の照合](FACILITY-WANTS-CORRECTIONS-20260925.md)で4対応・3継続。宇部亀浦の重複を通常表示1件に整理。旧レデイ宇部店を会社の2018-05-16閉店表で除外。山口大内は既にreferenceだった旧IDに閉店状態を補完。柳井新庄は旧店舗IDなしと確認し、同敷地のスーパーを変更しない。
- 既知58案件：地図課題22／補足18／旧店履歴2／待ち3／固定店舗対象外9／対応済み4。
- 未照合1,105記事を1,003暫定候補へ集約。既知案件と重複があるため合算しない。全体の実店舗数・所要時間は未確定。
- 地図：元7,764／更新30／追加172／履歴込み7,936／通常候補7,872／閉店9／重複履歴1。記事：完了43／一部38／未照合1,105、157イベント＝106判断済み・51保留。
- 旧ID・元位置・取得時点の情報を保持。重複履歴は閉店と区別。旧リンクは表示可能で、通常表示先へのリンクがある。併設ワッツは別サービスとして保持。
- 追加Jev送信0。7記事による前段の工程試行も完了・保存済み。繰り返さない。

## 次の操作

今回の残る3件：西岐波10049は公式点が入居先から3.3km離れる相違、下松山田は旧ドラッグセガミとの関係、宇部沼は同位置に残る百菜屋上宇部店の閉店・承継。宇部沼1丁目店は別店舗。取得原文・失敗記録・PDF表の確認画像は outputs/facility-wants-corrections-20260925/。採否と参照先は data-sources/facility-wants-corrections-20260925/adoption-evidence.json。

これらだけで全体を止めず、旧マクドナルド厚南等、通常候補に残るP0の閉店・移転疑いを既存資料から進める。次候補は next-batches.json。対応済み4案件は新しい相反資料がなければ再調査しない。

確定した運営元・地域のまとまりで検証・PR・Drive読み戻しまで進める。最新のcase-reviews.jsonを更新して node scripts/build-facility-workboard.mjs。初期化・過去の試行スクリプトは不用意に再実行しない。

## 検証・正式保存

今回のローカル87テストと検索・地図・徒歩候補の検証は成功。CIと今回の正式保存はこの後の保存証明を参照する。実装と保存の確認が終わるまでは前段の保存証明を今回の証明に流用しない。

[前段の原本ZIP](https://drive.google.com/file/d/1RruySPDsY2_GVcQP62X_VZBMXqQTaJAQ/view)・[前段の保存証明](https://drive.google.com/file/d/1GOcTZ5dBE7QdlcFP9Mpvc18-LQ5HQYT-/view)は検証済み。再作成・再送不要。旧詳細履歴は[Gitの旧入口](https://github.com/yyy-yuichi/bus-stop-compact-town/blob/969dc417c8d76b58d13d9c71eab1e13e828b3eae/docs/NEXT-CHAT-START-HERE.md)に保持。

## 制約

Jev残975対象／保守的残額$0.39444736。既存分類の再送・購入・自動チャージ、マージ・一般公開は禁止。モデルはユーザーの選択を継承。追加エージェント・重い並列処理を増やさない。
docs/facility-update-handoff-20260925.html はユーザーファイル。変更・削除・一括ステージ禁止。ローカル削除には別途承認が必要。

## 次Chatへそのまま貼る引継ぎ文

```text
バス停コンパクトタウンの施設鮮度更新を継続する。
正本は C:/Users/user/.codex/worktrees/420a/バス停コンパクトタウン｜新規開発。45e4を正本にしない。
作業開始前に移行先で保存エラー時の切り替え・復元手順の本文を必ず読む：
https://drive.google.com/file/d/1Ey3KzJhvUipMse-YNNhRzcBxaUSQ45sj/view
前Chatの既読・リンクだけで代用しない。検証済み同文コピーは docs/DRIVE-SAVE-PLAYBOOK.md。次の引き継ぎにも必読指示とURLを残す。

docs/NEXT-CHAT-START-HERE.md、docs/FACILITY-WORKBOARD-20260925.md、今回のFACILITY-WANTS-CORRECTIONS-20260925.mdを読む。
ウォンツ7案件中4対応、3継続。地図課題22／補足18／旧店履歴2／待ち3／対象外9／対応済み4。更新30・追加172・通常候補7872・閉店9・重複履歴1。
記事は43完了・38一部・1105未照合。1003は暫定候補で実店舗数ではない。
次は旧マクドナルド厚南等のP0を既存資料から進める。西岐波の位置、下松山田の旧店、宇部沼の百菜屋は未確定のまま保持。対応済み4案件を再調査しない。
今回の最新保存証明は上の検証・正式保存欄を参照。原本凍結後の入口更新と実装コミットを区別する。
PR #14を継続。マージ・一般公開は禁止。Jev残975対象／$0.39444736、再送・購入禁止。
ユーザーHTMLの変更・削除・一括ステージ禁止。モデルを継承し、PC負荷を抑える。
```
