# 次のChatはここから：店舗単位の施設鮮度更新

最終確認日：2026-09-25。正本：C:/Users/user/.codex/worktrees/420a/バス停コンパクトタウン｜新規開発。45e4を正本にしない。
ブランチ：codex/facility-freshness-news-20260924。[PR #14](https://github.com/yyy-yuichi/bus-stop-compact-town/pull/14)。

**Chat移行後の開始前必読：** 移行先で[保存エラー時の切り替え・復元手順の本文](https://drive.google.com/file/d/1Ey3KzJhvUipMse-YNNhRzcBxaUSQ45sj/view)を必ず読む。[検証済み同文コピー](DRIVE-SAVE-PLAYBOOK.md)。前Chatの既読・リンクだけで代用しない。引き継ぎ文にも必読指示とURLを残す。

## 現在地

ユーザーが記事単位の逐次処理の見直しを承認。現在の主台帳は[店舗単位の手順・集計](FACILITY-WORKBOARD-20260925.md)と data-sources/facility-workboard-20260925/。記事台帳は履歴として保持し、未完了記事数から作業時間を見積もらない。

- 既知の地図課題26案件／補足だけ18／旧店履歴2／具体化・再開待ち3／固定店舗対象外9。未照合を含めた全店舗数ではない。
- 未照合1,105記事を1,003の暫定候補へ集約。同名だけで同一店舗や確認完了にしない。既知案件との重複があるため合算しない。
- ウォンツ7記事を試行。公式資料の再取得0・Jev送信0で掲載済み2店を照合。西岐波の位置相違を維持し、併設Watts・旧TSUTAYA・クリニック募集も拾った。地図の追加・変更0。
- 地図：元7,764／更新26／追加172／履歴込み7,936／通常候補7,874／閉店7。記事履歴：完了43／一部38／未照合1,105、157イベント＝106判断済み・51保留。

## 次の操作

ウォンツの地図課題を既存公式取得資料からまとめて照合する。西岐波の座標相違、下松山田の後継関係、宇部亀浦の重複、閉店4支店の旧IDを優先。Wattsは市別一覧で併設売場を確認する。旧マクドナルド厚南等、通常候補に残る閉店疑いもP0として維持。

最新の case-reviews.json と store-cases.json を読む。確定した運営元・地域のまとまりで検証・PR・Drive読み戻しまで進め、数店舗ごとに納品一式を繰り返さない。次候補は next-batches.json。再集計は node scripts/build-facility-workboard.mjs。

## 検証・正式保存

実装628d0a5の[CI #106](https://github.com/yyy-yuichi/bus-stop-compact-town/actions/runs/36124998510)成功。81テスト・198施設SSR・型検査・build・release確認。[今回の原本ZIP](https://drive.google.com/file/d/1RruySPDsY2_GVcQP62X_VZBMXqQTaJAQ/view)は556,722 bytes。Driveから読み戻し、全体SHA256と内部36ファイルのサイズ・SHA256一致。[正式保存証明](https://drive.google.com/file/d/1GOcTZ5dBE7QdlcFP9Mpvc18-LQ5HQYT-/view)。この入口は原本凍結後の文書更新で、実装コミットと別。
[前段・宇部8記事の原本](https://drive.google.com/file/d/1BYRnQO-V3OKKvdUNfbZlVsEvewSZ6qNY/view)・[前段保存証明](https://drive.google.com/file/d/1iLBxzUuV8c-tuK36E4c5OuZg44yTsjuJ/view)は検証済み。再作成・再送不要。
旧詳細履歴は[Gitの旧入口](https://github.com/yyy-yuichi/bus-stop-compact-town/blob/969dc417c8d76b58d13d9c71eab1e13e828b3eae/docs/NEXT-CHAT-START-HERE.md)に保持。現在の方針・数値は本書を優先する。

## 制約

Jev残975対象／保守的残額$0.39444736。今回追加送信0。既存分類の再送・購入・自動チャージ、マージ・一般公開は禁止。モデルはユーザーの選択を継承。追加エージェント・重い並列処理は増やさない。
docs/facility-update-handoff-20260925.html はユーザーファイル。変更・削除・一括ステージ禁止。ローカル削除には別途承認が必要。

## 次Chatへそのまま貼る引継ぎ文

```text
バス停コンパクトタウンの施設鮮度更新を継続する。
正本は C:/Users/user/.codex/worktrees/420a/バス停コンパクトタウン｜新規開発。45e4を正本にしない。
作業開始前に、移行先で保存エラー時の切り替え・復元手順の本文を必ず開いて読むこと：
https://drive.google.com/file/d/1Ey3KzJhvUipMse-YNNhRzcBxaUSQ45sj/view
前Chatの既読・リンクだけで代用しない。検証済み同文コピーは docs/DRIVE-SAVE-PLAYBOOK.md。次の引き継ぎにも必読指示とURLを残す。

docs/NEXT-CHAT-START-HERE.md と docs/FACILITY-WORKBOARD-20260925.md を読み、店舗単位で進める。
既知の地図課題26／補足18／旧店履歴2／待ち3／固定店舗対象外9。未照合1,105記事は1,003暫定候補。全体の店舗数や所要時間は未確定。
主台帳 data-sources/facility-workboard-20260925/case-reviews.json。生成台帳 store-cases.json、次候補 next-batches.json。記事台帳の保留を消さない。
ウォンツ7記事の試行済み。公式資料の再取得・Jev送信0、地図変更0。掲載済み店舗と日付を分離し、西岐波の位置相違・後継店や併設売場の確認を継続。
次はウォンツの位置・後継・重複・閉店4支店を既存公式資料からまとめる。確定したまとまりで検証・PR・Drive読み戻しまで進める。
今回の正式保存証明：https://drive.google.com/file/d/1GOcTZ5dBE7QdlcFP9Mpvc18-LQ5HQYT-/view
原本：https://drive.google.com/file/d/1RruySPDsY2_GVcQP62X_VZBMXqQTaJAQ/view
実装628d0a5・CI #106成功。556,722 bytes、内部36ファイルをDrive読み戻しで照合済み。入口文書更新コミットと凍結原本の実装コミットを混同しない。
過去の原本・分類をやり直さない。
PR #14を継続し、マージ・一般公開は禁止。Jev残975対象／$0.39444736、購入・再送禁止。
ユーザーHTMLの変更・削除・一括ステージ禁止。モデルを継承し、PC負荷を抑える。
```
