import fs from 'node:fs';
import assert from 'node:assert/strict';
const pub='data-sources/facility-hagi-nagato-20260925';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const inputs=read(pub+'/review-inputs.json'),index=new Map(inputs.article_inventory.map(a=>[a.key,a])),rows=read(pub+'/adoptions.json').additions;
const url=k=>index.get(k).url, source=id=>rows.find(r=>r.id===id).properties.freshness_review.sources.map(s=>s.url);
const ids={seria:'official-seria-nagato-2953',chiyo:'official-chiyomaru-abu',jun:'official-juntendo-hagi-274',iphone:'official-iphone-sokusyuri-hagitamagawa',hacchi:'official-hacchi-hagi',komeri:'official-komeri-power-nagato-1054',soil:'official-soil-nagatoyumoto',suki:'official-sukiya-nagato-6605'};
const reviews=[];
function e(k,s,type,disposition,facility_ids,date,reason,source_urls){return{event_id:k+':'+s,event_type:type,facility_ids,disposition,effective_at:date,reason,source_urls:[...new Set(source_urls)]};}
function review(k,reason,events){reviews.push({article_key:k,source_body_hash:index.get(k).body_hash,inventory_complete:true,reviewed_at:'2026-09-25',inventory_reason:reason,events});}
function current(k,id,reason){return e(k,'current','other','reflected_addition',[id],null,reason,source(id));}
function dateHold(k,id,reported,extra='',type='opening'){return e(k,'date',type,'hold',[id],null,reported+'は記事・事前告知の記載。現行公式掲載と代表点は別イベントで反映したが、実施日の一次確認は未了。'+extra,[url(k),...source(id)]);}
const absent='基準7,764件と既存追加157件を旧名・別表記・住所周辺で照合し該当IDなし。別名称の近隣施設を閉店対象にしない。';
review('kaiten-506694','ユーズボウル萩店の閉店1件。閉店日と変更対象なしの判定を区別。',[e('kaiten-506694','closure','closure','verified_no_change',[],null,absent+'2024年7月15日という報道はあるが旧公式告知を取得できず、実閉店日を確認済みとして記録しない。閉店報道の施設を新たな営業候補にも追加しない。',[url('kaiten-506694'),'https://www.us-bowl.co.jp/hagi/event/3820/'])]);
review('kaiten-511755','Seria長門店の開店報道と、今回確認した現行公式掲載を分離。',[dateHold('kaiten-511755',ids.seria,'2024年7月12日'),current('kaiten-511755',ids.seria,'公式検索の現行ID000002953、長門店名・東深川821-1・店舗別地図リンクを画面照合。記事の位置を転用せず追加。')]);
const abu=source(ids.chiyo).find(u=>u.startsWith('https://www.abucreation.com/topics/'));
review('kaiten-513641','旧かしま閉店・後継千代丸開店予定・千代丸の現行掲載をすべて列挙。',[
 e('kaiten-513641','kashima-closure','closure','verified_no_change',[],'2024-08-17',absent+'道の駅運営者が2024/8/17閉店を明記。萩市のかしまリハビリステーションは別施設。',[url('kaiten-513641'),abu]),
 dateHold('kaiten-513641',ids.chiyo,'2024年9月6日'),
 current('kaiten-513641',ids.chiyo,'自店現行メニュー・奈古2249・自店埋込地図の千代丸食堂名付き点を照合。旧かしまのIDや地図点を流用しない。')]);
const pdf='https://www.juntendo.co.jp/article_source/data/news/files/hagi20241120.pdf';
review('kaiten-519046','東萩店の閉店1件。移転先は萩店の記事で別に処理。',[e('kaiten-519046','closure','closure','verified_no_change',[],'2024-10-14',absent+'後継萩店の開店後公式PDFが旧東萩店の閉店日・旧住所を明記。近傍の飲食・学校・福祉施設は別施設。',[url('kaiten-519046'),pdf])]);
review('kaiten-520473','修理店の開店報道と現在の修理窓口掲載を分離。',[dateHold('kaiten-520473',ids.iphone,'2024年10月7日'),current('kaiten-520473',ids.iphone,'公式の萩田万川店ページ・下田万2909-1・店名と住所付き地図マーカーを照合。須佐自動車内の修理店として追加。')]);
review('kaiten-523722','酒ト定食はっち開店1件。',[e('kaiten-523722','opening','opening','reflected_addition',[ids.hacchi],'2024-10-29','萩市運営の食ポータルが2024年10月29日に開店したと事後掲載。住所・名称とその施設の埋込地図点を照合。',source(ids.hacchi))]);
review('kaiten-526943','萩店の開店と、公式照合で判明した東萩店からの移転を区別。',[
 e('kaiten-526943','opening','opening','reflected_addition',[ids.jun],'2024-11-20','実際の開店を発表した公式PDF原本を視認。現行公式店舗一覧の当該萩店に結び付く座標を採用し、アトラス萩とは別施設として追加。',source(ids.jun)),
 e('kaiten-526943','relocation','relocation','verified_no_change',[ids.jun],'2024-11-20','公式PDFが旧東萩店からの移転・増床を明記。旧店に対応する既存IDはなく、移転先1件の追加で表現。移転として同じ施設を二重追加しない。',[pdf,...source(ids.jun)])]);
review('kaiten-540611','記事の開店は旧H&G店からパワーへの改装。実施日と現行掲載を分離。',[
 dateHold('kaiten-540611',ids.komeri,'2025年2月23日','2012年からの旧店を改装したもので、当該日を初出店日にはしない。','temporary_change'),
 current('kaiten-540611',ids.komeri,'運営会社の改装告知と現行パワー長門店住所、公式地図リンクの同住所旧H&G長門店点を照合。近隣コスモス・セブンイレブンを統合せず追加。')]);
review('kaiten-543665','SOIL長門湯本の開業報道と現行複合施設掲載を分離。',[dateHold('kaiten-543665',ids.soil,'2025年3月15日'),current('kaiten-543665',ids.soil,'自店・長門湯本公式観光・県観光連盟で名と深川湯本2257を照合。地域公式の名付き点と県掲載の座標が一致。自店から遷移するSOIL Setodaは別県の施設として不採用。')]);
review('kaiten-547780','萩マイカーセンターつばき店の開店1件。現行住所確認と位置未確認を明記。',[e('kaiten-547780','opening','opening','hold',[],null,'販売会社とメーカーの現行掲載で川島369-1・電話を確認。メーカーの度分秒値は測地系が不明で、販売会社の案内図からも座標を確定できず地図追加を保留。報道の2025年4月12日という実開店日も未確認。福祉施設つばきのIDは転用しない。',[url('kaiten-547780'),'https://www.p-yamaguchi.co.jp/shop/29hagi_mc','https://toyota.jp/ucar/shop/16501/28/'])]);
review('kaiten-558326','テクモピア萩店の開店1件。運営元原本と店舗位置の未確定を残す。',[e('kaiten-558326','opening','opening','hold',[],null,'取引メーカーの掲載は確認したが、運営会社の開店PDFは取得エラーで原本を確認できず、当該店名に結び付く位置も未確定。2025年6月28日の報道のみで営業候補・日付を反映しない。同住所のホームケアサービス山口は福祉施設でありIDを流用しない。',[url('kaiten-558326'),'https://www.wave.koeitecmo.co.jp/img/upload/TOPICS_img/69.pdf','https://bsp-prize.jp/shop/3485/'])]);
review('kaiten-612233','すき家191号長門店の開店報道と現行店舗掲載を分離。毎日の休業時間は閉店ではない。',[dateHold('kaiten-612233',ids.suki,'2026年8月19日'),current('kaiten-612233',ids.suki,'支店公式JSON-LDの店名・仙崎331-1・geoを照合。既存の他市すき家や近傍ウォンツへ統合せず追加。')]);
assert.equal(reviews.length,12);write(pub+'/article-reviews.json',reviews);
const canonical='data-sources/facility-progress-20260925/article-event-reviews.json',previous=read(canonical);
let appended=0;for(const r of reviews){const existing=previous.find(x=>x.article_key===r.article_key);if(existing)assert.deepEqual(existing,r,'Review drift');else{previous.push(r);appended++;}}
write(canonical,previous);
console.log(JSON.stringify({articles:reviews.length,appended,events:reviews.flatMap(r=>r.events).length,held:reviews.flatMap(r=>r.events).filter(e=>e.disposition==='hold').length}));
