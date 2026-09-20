{
"checked_at": "2026-09-20",
"decisions": [
{
"pair_id": "osm-node-10275726015__osm-way-560984476",
"decision": "hold",
"official_evidence_urls": [
"[https://location.sevenbank.co.jp/sevenbank/spot/detail?code=0000016162](https://location.sevenbank.co.jp/sevenbank/spot/detail?code=0000016162)"
],
"confirmed_facts": [
"セブン銀行の公式ATM検索には「セブン-イレブン 宇部下条２丁目店 共同出張所」が掲載されている。",
"確認した公式ページは、現在参照可能なセブン-イレブン店舗名として「宇部下条２丁目店」を直接示している。"
],
"unresolved": [
"公式資料にはosm-node-10275726015またはosm-way-560984476のID、提示座標、形状との対応が記載されていない。",
"2レコードの名称がともに「セブン-イレブン」で近接していることだけでは、両方が宇部下条２丁目店を表すと確定できない。",
"nodeとwayのどちらが店舗の正しい通常表示対象であるかを判断できる公式配置図・建物範囲・公式座標を確認できていない。"
],
"reason": "公式資料から現行の候補店舗は確認できるが、2レコード双方を同一店舗へ直接対応させる根拠と、node・wayのどちらを通常表示に残すか選ぶ公式根拠が不足しているためhold。"
},
{
"pair_id": "osm-node-4098795892__osm-way-407846298",
"decision": "hold",
"official_evidence_urls": [
"[https://staff.family.co.jp/dsaiyo/cofm/pc_job/show/35987](https://staff.family.co.jp/dsaiyo/cofm/pc_job/show/35987)"
],
"confirmed_facts": [
"株式会社ファミリーマートの公式採用ページで「ファミリーマート 山口泉都町店」を確認した。",
"公式ページの勤務地は「山口県山口市泉都町9番2号」で、コンビニスタッフの募集ページとして掲載されている。",
"osm-way-407846298の名称「ファミリーマート山口泉都町店」は公式店舗名と一致する。"
],
"unresolved": [
"公式資料にはosm-node-4098795892の提示座標が山口泉都町店の店舗位置を表すとの記載がない。",
"公式資料にはosm-way-407846298の建物形状・範囲が店舗建物と一致するとの記載がない。",
"generic名称のnodeと店舗名付きwayが同一施設を表すことを公式資料だけで直接確認できない。",
"nodeとwayのどちらを通常表示に残すべきか判断できる公式配置図・店舗区画図・公式座標を確認できていない。"
],
"reason": "山口泉都町店そのものは公式確認できるが、近接するgeneric nodeを同店と直接結び付ける公式根拠と、node・wayの優先を決める公式根拠がないためhold。"
},
{
"pair_id": "osm-node-2253197417__osm-way-215910952",
"decision": "hold",
"official_evidence_urls": [
"[https://location.sevenbank.co.jp/sevenbank/spot/detail?code=0000007961](https://location.sevenbank.co.jp/sevenbank/spot/detail?code=0000007961)"
],
"confirmed_facts": [
"セブン銀行の公式ATM検索に「セブン-イレブン 山口今井町店 共同出張所」が掲載されている。",
"osm-way-215910952の名称「セブンイレブン山口今井町店」は、公式資料に掲載された店舗名と対応する名称である。"
],
"unresolved": [
"公式資料にはosm-node-2253197417の提示座標を山口今井町店の店舗位置として特定する情報がない。",
"公式資料にはosm-way-215910952の形状が山口今井町店の建物範囲であるとの記載がない。",
"1.3mという近接距離と同一チェーン名だけでは、nodeとwayが同じ施設を表すと確定できない。",
"nodeとwayのどちらを通常表示に残すべきか判断できる公式座標・建物配置図を確認できていない。"
],
"reason": "山口今井町店は公式確認できる一方、2レコード双方を同店に直接対応させ、さらに点と建物形状のどちらを残すか決める公式根拠がないためhold。"
},
{
"pair_id": "osm-node-4107556704__osm-node-5456594526",
"decision": "hold",
"official_evidence_urls": [
"[https://ptj.sej.co.jp/arbeit/recruitment/jobfind-pc/job/All/83808/](https://ptj.sej.co.jp/arbeit/recruitment/jobfind-pc/job/All/83808/)",
"[https://location.sevenbank.co.jp/sevenbank/spot/detail?code=0000003551](https://location.sevenbank.co.jp/sevenbank/spot/detail?code=0000003551)"
],
"confirmed_facts": [
"セブン-イレブン公式採用ページに「セブン-イレブン 周南平和通店」が掲載されている。",
"セブン銀行公式ATM検索にも「セブン-イレブン 周南平和通店 共同出張所」が掲載されている。",
"公式採用ページでは周南平和通店について、当該職種は現在募集していない旨が表示されている。"
],
"unresolved": [
"2つのOSMレコードはいずれもgeneric名称「セブン-イレブン」であり、公式資料から各nodeを周南平和通店へ直接対応させることができない。",
"公式資料に両nodeの提示座標と照合可能な公式緯度経度を確認できていない。",
"2つのnodeのどちらが店舗を表す正規の位置なのか、また一方を参照扱いにできるのかを決める公式根拠がない。",
"32.9mの近接だけでは同一施設とも別施設とも判定できない。"
],
"reason": "周南平和通店という現行の公式施設は確認できるが、2つのgeneric nodeをその1店舗へ個別に対応させる公式位置情報がなく、残すrecordも選べないためhold。"
},
{
"pair_id": "osm-node-13651735831__osm-way-1489391560",
"decision": "hold",
"official_evidence_urls": [
"[https://www.ja-ymg.or.jp/2022-03-14-suo-oshima/](https://www.ja-ymg.or.jp/2022-03-14-suo-oshima/)",
"[https://www.ja-ymg.or.jp/category/area/suo_oshima/](https://www.ja-ymg.or.jp/category/area/suo_oshima/)",
"[https://www.ja-ymg.or.jp/2026-04-21_suo-oshima_01/](https://www.ja-ymg.or.jp/2026-04-21_suo-oshima_01/)"
],
"confirmed_facts": [
"JA山口県の公式ページは2022年に「Ａコープ安下庄店」を周防大島統括本部管内の「生活店舗」として明記している。",
"JA山口県の周防大島統括本部公式ページでは、2026年にも「生活店舗」の特売チラシ情報が継続して掲載されている。",
"2026年4月21日付のJA山口県公式ページには「周防大島 生活店舗4/22～4/25の特売チラシ」が掲載されている。"
],
"unresolved": [
"確認した2026年の公式ページ本文では、特売対象となる各生活店舗名がテキストで列挙されておらず、Aコープ安下庄店の2026年現在の営業状況をそのページだけで直接確定できない。",
"公式資料にはosm-node-13651735831とosm-way-1489391560のID・提示座標・形状との対応がない。",
"両レコードは同じ「Aコープ安下庄店」という名称だが、名称一致と2.2mの近接だけでは同一施設を表すと確定できない。",
"nodeとwayのどちらを通常表示に残すべきか判断できる公式店舗配置図・建物範囲・公式座標を確認できていない。"
],
"reason": "Aコープ安下庄店という施設の公式記録は確認できるが、現在の当該店舗を2レコード双方へ直接対応させる根拠と、点・建物形状のどちらを残すか決める根拠が不足しているためhold。"
},
{
"pair_id": "osm-node-9472329366__osm-way-477971690",
"decision": "hold",
"official_evidence_urls": [
"[http://marukijapan.co.jp/shop/213/](http://marukijapan.co.jp/shop/213/)",
"[https://www.city.ube.yamaguchi.jp/kurashi/gomi/genryou_recycle/1002031/1002044/1002045/1002068.html](https://www.city.ube.yamaguchi.jp/kurashi/gomi/genryou_recycle/1002031/1002044/1002045/1002068.html)",
"[https://www.city.ube.yamaguchi.jp/kurashi/gomi/genryou_recycle/1002031/1002107.html](https://www.city.ube.yamaguchi.jp/kurashi/gomi/genryou_recycle/1002031/1002107.html)"
],
"confirmed_facts": [
"まるき公式店舗ページに「ウェスタまるき西割店」が掲載されている。",
"公式店舗ページの住所は「〒759-0204 山口県宇部市大字妻崎開作西割971−1」、電話番号は0836-44-3006、営業時間は8:00～20:00。",
"宇部市公式ページでも「株式会社丸喜 ウェスタまるき西割店」、所在地「宇部市大字妻崎開作971番地1」、電話0836-44-3006を確認できる。",
"osm-node-9472329366の名称「ウェスタまるき 西割店」は公式店舗名に対応する。"
],
"unresolved": [
"osm-way-477971690のgeneric名称「まるき」が公式の西割店建物を表すことを直接示す公式資料はない。",
"公式資料にはosm-way-477971690の建物形状・範囲との対応が記載されていない。",
"提示座標同士が9.6mと近いことだけでは、nodeとwayが同じ施設を表すと確定できない。",
"nodeとwayのどちらを通常表示に残すべきか判断できる公式平面図・建物範囲・公式座標を確認できていない。"
],
"reason": "ウェスタまるき西割店自体は運営会社と宇部市の公式資料で確認できるが、generic wayを同店の建物と直接結び付ける公式根拠と、node・wayの優先根拠がないためhold。"
},
{
"pair_id": "osm-node-2253691125__osm-way-202793094",
"decision": "hold",
"official_evidence_urls": [
"[https://www.yamaguti-coop.or.jp/cocoto/izumi/](https://www.yamaguti-coop.or.jp/cocoto/izumi/)"
],
"confirmed_facts": [
"コープやまぐち公式店舗ページで現在の店舗「コープ ここと いずみ店」を確認した。",
"公式住所は「〒753-0066 山口市泉町9-1」、営業時間は9:00～21:00、電話番号は083-923-2371。",
"公式ページ自身が同店を「山口県山口市にあるスーパーマーケット」と記載している。"
],
"unresolved": [
"2レコードはいずれも名称がgenericな「コープやまぐち」で、公式店舗名「コープ ここと いずみ店」と一致していない。",
"公式資料にはosm-node-2253691125またはosm-way-202793094のID、提示座標、形状との対応情報がない。",
"6.8mの近接とチェーン名称だけでは、両レコードがここといずみ店を表すと確定できない。",
"nodeとwayのどちらを通常表示に残すべきか判断できる公式店舗配置図・建物範囲・公式座標を確認できていない。"
],
"reason": "近接地点には公式確認できる「コープ ここと いずみ店」があるが、genericな2レコード双方をその店舗へ直接対応させ、さらに点・建物形状のどちらを残すか決める公式根拠がないためhold。"
}
]
}
