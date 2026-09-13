# 案内図と生活施設の公開（2026-09-14）

ユーザーの「新しいマップを公開して」を受け、案内図のデザインと生活施設追加を公開した。

- [公開マップ・光駅15分](https://yyy-yuichi.github.io/bus-stop-compact-town/#kind=national&id=mlit-p11-22-35%3A3791&minutes=15)
- [県全体から探す](https://yyy-yuichi.github.io/bus-stop-compact-town/)

## 公開結果

[PR #6](https://github.com/yyy-yuichi/bus-stop-compact-town/pull/6) は最新head `fea431171d7c64bd7bf887cfc1b6d84e19245e3d` のCI成功を確認し、2026-09-14 06:08:39 JSTに通常マージ。mainは `c2f3095e5320d2d1cf4f018512a5057ea300d0c4`。マージ後の内容が検証済みのPRと一致することを確認した。

[Pages 34782932696](https://github.com/yyy-yuichi/bus-stop-compact-town/actions/runs/34782932696) が成功し、実公開24ファイルをPages成果物と全バイト照合。元データ・地図・ライセンス・出典もマージ済み原本と一致した。公開版は施設1,927件（通常1,913件、参考14件）、国4,418件と市907件のバス停を保持している。

## 公開画面での確認

実際のPagesページをスマホ390×844で操作。応答の差替えは行わず、光駅・徳山駅前のR2取得がHTTP 200になることを確認した。

- 光駅の徒歩5/10/15分は2/3/8件。「暮らし」は2件で、光浅江郵便局と西京銀行の名称を表示。
- 地図上の名称から施設詳細を開き、時間と分類を保って戻れる。ドラッグ、拡大、標準と案内図の切替が動く。
- 徳山駅前15分は全42件・暮らし14件。施設が多い表示では名称を省略し、記号や一覧から選べる。
- 県全体、320px幅、1280×900でも確認。検査した施設名同士の重なり・画面外は0。

アプリの例外・警告は0。ブラウザーが任意に取得するルートの `https://yyy-yuichi.github.io/favicon.ico` のみ404で、地図の配信ファイル・徒歩データは正常。検証用ブラウザーは終了した。R2設定・道路計算は変更していない。施設の現地入口・営業状況・通行可否は未確認のまま扱う。

## 保存と継続

[案件Drive](https://drive.google.com/drive/folders/1C2XkUsjRsiQqKBN69mPbMRKxO8hRa624) へ次を保存し、各ファイルの名前・容量・案件フォルダへの所属を読み戻して確認した。

- [公開後の原本・ソースZIP](https://drive.google.com/file/d/1s1cQriaNWweQBHnmtFb4AMxd4BMMnW4T/view)：214ファイル、29,186,244 bytes。ソースの記録は `1dfa1850f5e46dcacc810b856b959fe1f6f514b1`、アプリ本体は公開mainと同一。
- [実際の公開サイトZIP](https://drive.google.com/file/d/1hrrAWL0PlpDutXzioFA586mJUB14XsLo/view)：24ファイル、1,170,750 bytes。SHA-256 `d45fb710ca913ca3066696ef057a2200031ce0f0b00319114ad2ed031f50679c`。
- [公開照合・実画面検証](https://drive.google.com/file/d/14FOgoonVPVEXpajpdimJZLQE5feoVzOC/view)：7,383 bytes。

両ZIPのCRC・全ファイルのSHA-256を検証済み。最終報告とHANDOFFは同フォルダに別保存し、ZIP作成時の保存待ち表記に優先する。従来の未公開ZIPも履歴として保持している。

本書と最新HANDOFFは、以前の「未公開」「公開承認待ち」という記録に優先する。今回の公開承認を再確認せず、未公開の試案へ戻らない。
