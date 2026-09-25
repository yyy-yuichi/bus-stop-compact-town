# 唐戸はれて横丁卒業店の移転先・地図反映

確認日：2026-09-25。前段の[残件台帳](FACILITY-PROGRESS-LEDGER-20260925.md)から継続。Jevの追加送信は0。

## 結果

運営元の[卒業生一覧](https://www.karatoharete.com/卒業生)に個別掲載された11店を同地域で照合。今回、4店を新しい店舗代表点で地図へ追加した。固定住所がある残り6店は現在の店舗自身の案内と点の対応が不足して保留。Tokidokiは移動販売のため固定点を作らない。旧横丁の共通点は11店の新店舗点に流用しない。

| 地図へ追加 | 新住所の一次根拠 | 地図の代表点 |
| --- | --- | --- |
| 焼き鳥とワイン トリップ | [店自身の現行案内](https://yakitoritowine-trip.com/)に唐戸町2-12、1F-D、電話 | [同名同住所の店舗点](https://map.yahoo.co.jp/v3/place/H4nMTScdRoQ) |
| 唐戸ステーキ山本 | [横丁運営元の移転案内](https://www.karatoharete.com/卒業生)に赤間町7-15、電話 | [同名同住所同電話の店舗点](https://map.yahoo.co.jp/v3/place/mPO1q53lRd6) |
| 串揚げ酒場 縁 | [店自身の現行案内](https://kushiagesakaba-en.com/)に田中町3-11、力石ビル1F | [同名同住所の店舗点](https://map.yahoo.co.jp/v3/place/pE6yVfE4wcI) |
| 寿司 響 | [イベント主催者の店舗表](https://yamaguchi-kujira.jp/store/)に南部町26-3、電話。[下関市発表](https://www.city.shimonoseki.lg.jp/site/kisya/161843.html)に参加店名 | [同名同住所同電話の店舗点](https://map.yahoo.co.jp/v3/place/mdSQ3pwP9sg) |

地図点は地図サービスに掲載された店舗代表点で、建物の入口・階への動線・徒歩到達性を検証した点ではない。現行掲載を実開店日、毎日の営業保証に読み替えない。追加4店の`effective_at`はすべてnull、`event`は`listed`。旧横丁の72追加と混ぜて「新規開業76店」とは数えない。

保留6店：カラオケBAR いいやん、DーDAY、マジックバーWAKADAN、THE ZUBAGHETTI、居酒屋 遊こうぎょう、お米とお肉と咖喱 Curry Full。WAKADANは[店自身の現行案内](https://wakadan.com/about/)で南栄ビル2階まで確認できたが、店舗点の取得が不足。THE ZUBAGHETTI、Curry Fullは旧横丁住所の地図掲載も見つかるため、新住所の点に流用しない。11店すべての行別判断は`data-sources/facility-relocations-20260925/relocation-review.json`。

元IDのある閉店候補2件は継続保留。[肉肉うどん新下関店](https://2929udon.co.jp/shop/)は運営元現行一覧に掲載。[海都大内御堀店](https://www.marinepolis.co.jp/search/yamaguchi)は現行一覧にない一方、支店別の一次閉店告知と確定日を得られていない。どちらも今回閉店扱いへの変更0。

## 件数と再現

- 元施設7,764、既存ID更新24、追加累計141（今回4）、読込後7,905（閉店履歴込み）、通常候補7,844。
- 施設状態台帳7,905行、記事台帳1,186行。Jev分類済み記事と施設の採否・実更新を別々に数える。記事内全イベントの最終採否0は、関連資料だけで完了扱いしないための台帳上の値。
- `data-sources/facility-relocations-20260925/source-plan.json` の6ページを`outputs/facility-relocations-20260925/pages/`へ保存。前段の横丁運営元・主催者・市の原本も併用。
- `node scripts/apply-facility-relocations.mjs`は原文中の住所と地図ページの座標を検証してから4店の提案を組み立てる。`--apply`は同一入力なら重複追加せず一致確認。`node scripts/build-facility-progress-ledger.mjs`で最新台帳を再生成。
- 型検査・validate・build、施設実描画165件、一括39テストを通過。新しい移転4店の重複・日付・代表点条件は追加テストでも検証。
- Jev残枠984対象、保守的予算残額$0.399952384。購入・自動チャージなし。

次は保留6店を住所単位でまとめ、店自身の現行案内と地図上の新店舗点を照合する。難しい行だけ保留し、確証のある他の地域店・閉店候補を並行して進める。マージ・公開はしない。

[今回の正式Drive保存先](https://drive.google.com/drive/folders/1_tiW0ZIxKKG8rbXiraQAr5Eag7JsYkvK)。原本ZIP、施設・記事台帳、保存証明を配置する。
