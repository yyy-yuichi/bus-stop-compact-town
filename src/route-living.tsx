import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './route-living.css';
import useBasemap from './useBasemap';
import BasemapSettings, { BasemapPreferences, type BasemapMode } from './basemapPreferences';
import { activeTrips, clockText, shoppingPlans, studyFreshness, timeMinutes, validStudyDate, type RouteStudy } from './routeLiving';
import type { ShoppingFeature } from './types';

type Facts = {label:string;value:string}[];
interface Facilities {checkedAt:string;store:ShoppingFeature;school:ShoppingFeature;hospital:{name:string;stopId:string;address:string;sourceUrl:string;accessUrl:string;mapUrl:string;facts:Facts;gaps:string[]}}
interface Inventory {checkedAt:string;scope:string;catalogCheck:string;rows:{key:string;name:string;url:string;review:string;status:string;gtfs:string;sourceRecordCount:number}[]}
interface Bundle {study:RouteStudy;facilities:Facilities;inventory:Inventory}
const BASE = import.meta.env.BASE_URL;
function dateText(date:string) { return /^\d{8}$/.test(date) ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}` : date; }
function FactList({facts}:{facts:Facts}) {return <dl className="facts">{facts.map(f=><div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>;}

function CorridorMap({study,facilities,selected}:{study:RouteStudy;facilities:Facilities;selected:string}) {
  const node=useRef<HTMLDivElement>(null);
  const [map,setMap]=useState<L.Map|null>(null);
  const [mode,setMode]=useState<BasemapMode>('soft');
  const [attempt,setAttempt]=useState(0);
  const {error,fallback}=useBasemap(map,mode,attempt);
  const bounds=useMemo(()=>L.latLngBounds(study.groups.flatMap(g=>[g.outboundId,g.returnId]).map(id=>{const s=study.stops.find(s=>s.id===id)!;return L.latLng(s.coordinate[1],s.coordinate[0]);})),[study]);
  useEffect(()=>{
    if(!node.current)return;
    const m=L.map(node.current,{minZoom:14,maxZoom:18,scrollWheelZoom:false,zoomControl:false}).fitBounds(bounds,{padding:[35,35]});
    L.control.zoom({zoomInTitle:'地図を拡大',zoomOutTitle:'地図を縮小'}).addTo(m);
    L.control.scale({imperial:false}).addTo(m);setMap(m);
    return ()=>{setMap(null);m.remove();};
  },[bounds]);
  useEffect(()=>{
    if(!map)return;
    const layer=L.layerGroup().addTo(map);
    L.polyline(study.shape.map(p=>L.latLng(p[1],p[0])),{color:'#186a85',weight:4,opacity:.8}).addTo(layer);
    const ids=[...new Set(study.groups.flatMap(g=>[g.outboundId,g.returnId]))];
    ids.forEach(id=>{
      const stop=study.stops.find(s=>s.id===id)!;
      const group=study.groups.find(g=>[g.outboundId,g.returnId].includes(id))!;
      const direction=group.outboundId===group.returnId?'往復で同じ登録点':id===group.outboundId?'右回り・行き':'左回り・帰り';
      const content=document.createElement('div');content.textContent=`${group.number}. ${stop.name} / ${direction} / GTFS ID ${id}。乗り場の側・入口は現地未確認。`;
      L.marker([stop.coordinate[1],stop.coordinate[0]],{title:`${stop.name} ${direction}`,icon:L.divIcon({className:`study-stop ${group.name===selected?'selected-stop':''}`,html:String(group.number),iconSize:[25,25],iconAnchor:[12,12]})}).bindPopup(content).addTo(layer);
    });
    L.geoJSON(facilities.school,{style:{color:'#78654b',weight:2,fillOpacity:.10}}).bindTooltip('浅江中学校：旧高校の敷地図形。境界・通用門は未確認').addTo(layer);
    const store=facilities.store.geometry;
    if(store.type==='Point') {
      const content=document.createElement('div');content.textContent='イオン光店のOSM登録点。食品売場の入口ではありません。';
      L.marker([store.coordinates[1],store.coordinates[0]],{title:'イオン光店の登録点・入口未確認',icon:L.divIcon({className:'study-store',html:'店',iconSize:[30,30],iconAnchor:[15,15]})}).bindPopup(content).addTo(layer);
    }
    const credit='施設図形 © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · バス停・線：光市GTFSを加工';
    map.attributionControl.addAttribution(credit);
    return ()=>{layer.remove();map.attributionControl.removeAttribution(credit);};
  },[map,study,facilities,selected]);
  function focusStore(){map?.setView([33.9791,131.9279],18);}
  return <section className="map-section" aria-labelledby="map-title"><div className="section-head"><div><p className="eyebrow">同じ場所で比べる</p><h2 id="map-title">10停留所と生活の目的地</h2></div><div className="map-actions"><button onClick={()=>map?.fitBounds(bounds,{padding:[35,35]})}>10停留所の全体</button><button onClick={focusStore}>店舗付近を拡大</button></div></div>
    <BasemapPreferences value={{mode,onMode:m=>{setMode(m);setAttempt(a=>a+1);},fallback}}><BasemapSettings comparison/></BasemapPreferences>
    <div ref={node} className="study-map" role="region" aria-label="光駅からイオン光店までの地図"/>
    {error&&<p role="alert">背景地図の一部を読み込めませんでした。<button onClick={()=>setAttempt(a=>a+1)}>再読み込み</button></p>}
    <p className="map-key"><span>● 数字＝バスの登録点</span><span>青線＝右回りのバス経路</span><span>店＝店舗の登録点</span></p>
    <div className="stop-index" role="group" aria-label="停留所を地図で確認">{study.groups.map(g=><button key={g.name} onClick={()=>{const s=study.stops.find(s=>s.id===g.outboundId)!;map?.setView([s.coordinate[1],s.coordinate[0]],17);}}>{g.number}. {g.name}</button>)}</div>
    <p className="muted">地図を切り替えても位置・縮尺・重ねた点は同じです。徒歩経路は未確認のため表示していません。写真は撮影時期が場所ごとに異なり、現在の入口や横断可否を保証しません。学校は旧高校の敷地図形です。</p>
  </section>;
}

function Study({study,facilities,inventory}:Bundle) {
  const [date,setDate]=useState(study.sampleDate);
  const [origin,setOrigin]=useState('光駅北口');
  const [fields,setFields]=useState({earliest:'09:00',walkingEachWay:'10',shopping:'45',boardingBuffer:'10',homeWalk:'0',returnBy:'12:00'});
  const group=study.groups.find(g=>g.name===origin)!;
  const numeric=(v:string)=>v.trim()===''?NaN:Number(v);
  const conditions={earliest:timeMinutes(fields.earliest),returnBy:timeMinutes(fields.returnBy),walkingEachWay:numeric(fields.walkingEachWay),shopping:numeric(fields.shopping),boardingBuffer:numeric(fields.boardingBuffer),homeWalk:numeric(fields.homeWalk)};
  const valid=validStudyDate(study,date);
  const trips=activeTrips(study,date);
  const outboundTimes=trips.filter(t=>t.direction===0).flatMap(t=>t.stops.filter(s=>s.id===group.outboundId&&s.pickup===0).map(s=>s.departure.slice(0,5)));
  const returnTimes=trips.filter(t=>t.direction===1).flatMap(t=>t.stops.filter(s=>s.id==='10_01'&&s.pickup===0).map(s=>s.departure.slice(0,5)));
  const plans=shoppingPlans(study,date,group,conditions);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
  const freshness=studyFreshness(study,today);
  const numberInput=(key:'walkingEachWay'|'shopping'|'boardingBuffer'|'homeWalk',label:string)=><label>{label}<span className="number-field"><input type="number" min={key==='shopping'?1:0} max="720" step="1" value={fields[key]} onChange={e=>setFields({...fields,[key]:e.target.value})}/><span>分</span></span></label>;
  const storeReview=facilities.store.properties.purpose_review!;
  const schoolReview=facilities.school.properties.purpose_review!;
  return <><header className="study-header"><a href={`${BASE}index.html`}>← バス停と暮らしマップ</a><span>光市 · 1路線の検証</span></header><main>
    <section className="study-intro"><p className="eyebrow">バスで出かける暮らしを確かめる</p><h1>午前に買い物へ。<br/>帰りの便まで、確かめる。</h1><p>ひかりぐるりんバスの光駅〜イオン光店、10停留所を試行対象にしました。公式時刻表の往復便に、歩く時間と買い物時間を組み合わせます。</p><div className="study-tags"><span>公式資料の照合 {study.checkedAt}</span><span>大人片道 {study.adultFare}円</span><span>徒歩接続は未確認</span></div></section>
    <p className="notice">ここで分かるのは、入力した時間を確保できる<strong>時刻表上の候補</strong>です。乗り場の側、歩道・横断、店舗入口、段差は現地未確認です。実際に移動できることを確認した旅程ではありません。</p>
    {freshness!=='current'&&<p className="notice" role="status">{freshness==='expired'?'保存した運行データの有効期間外です。過去の例は確認できますが、現在の便として利用しないでください。':`資料の再確認目安（${study.reviewDue}）を過ぎています。最新の公式案内を確認してください。`}</p>}
    <div className="planner-grid"><section className="conditions" aria-labelledby="conditions-title"><p className="eyebrow">01 · 条件を決める</p><h2 id="conditions-title">イオン光店で食品を買う</h2><p className="muted">入力に合わせて候補が変わります。初期値の徒歩10分は仮置きで、実測値ではありません。</p><div className="input-grid">
      <label className="wide">出発する停留所<select value={origin} onChange={e=>setOrigin(e.target.value)}>{study.groups.filter(g=>g.name!=='イオン光店').map(g=><option key={g.name}>{g.name}</option>)}</select></label>
      <label className="wide">利用日<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label>出発できる時刻<input type="time" value={fields.earliest} onChange={e=>setFields({...fields,earliest:e.target.value})}/></label>
      <label>戻りたい時刻<input type="time" value={fields.returnBy} onChange={e=>setFields({...fields,returnBy:e.target.value})}/></label>
      {numberInput('walkingEachWay','店とバス停の片道徒歩')}{numberInput('shopping','店内の買い物')}{numberInput('boardingBuffer','帰りの乗車前の余裕')}{numberInput('homeWalk','帰着バス停から自宅まで')}
    </div><p className="muted">自宅までが0分の場合は、出発地と同名のバス停への帰着までを判定します。自宅から行きの乗り場までの時間は、出発できる時刻に含めてください。</p><p className="muted">対象期間 {dateText(study.feedStart)}〜{dateText(study.feedEnd)}。臨時の運休・遅れは含みません。</p></section>
    <section className="results" aria-labelledby="results-title"><p className="eyebrow">02 · 往復を確かめる</p><h2 id="results-title">{conditions.homeWalk>0?'自宅まで':'帰りのバス停まで'}の候補</h2><div aria-live="polite" aria-atomic="true"><p className="result-count">{valid?`${plans.length}件の候補`:'対象期間外・日付を確認'}</p><p>{valid?`${date} の全周便は合計${trips.length}便（右回り${trips.filter(t=>t.direction===0).length}・左回り${trips.filter(t=>t.direction===1).length}）。`:'有効な対象期間の日付を選んでください。期間外の便は推定しません。'}</p></div>
      {valid&&<div className="daily-times"><p>行き・{origin}発：{outboundTimes.join(' / ')||'便なし'}</p><p>帰り・イオン光店発：{returnTimes.join(' / ')||'便なし'}</p><small>その日の始発から最終までを時刻順に表示。帰りは左回りです。</small></div>}
      {valid&&plans.length===0&&<p className="no-plan">指定した時間では往復できる候補がありません。買い物・徒歩・帰着時刻の条件を見直してください。入力が空欄・不正な場合も候補を表示しません。</p>}
      {plans.map((p,i)=><article className="journey" key={p.outward.id+p.inward.id}><h3>候補 {i+1} · {clockText(timeMinutes(p.board.departure))} 出発</h3><ol className="timeline">
        <li><time>{p.board.departure.slice(0,5)}</time><div><strong>{origin}から右回り</strong><small>行きのGTFS乗り場ID {p.board.id}{p.board.sourceDeparture?' · 公式PDFの10:08を採用':''}</small></div></li>
        <li><time>{p.arrive.arrival.slice(0,5)}</time><div><strong>イオン光店バス停に到着</strong><small>店舗まで徒歩 {conditions.walkingEachWay}分と仮定</small></div></li>
        <li><time>{clockText(p.shoppingStart)}</time><div><strong>食品の買い物 {conditions.shopping}分</strong><small>{clockText(p.shoppingEnd)}に買い物終了 → 徒歩 {conditions.walkingEachWay}分 → {clockText(p.backAtStop)}に停留所へ</small></div></li>
        <li><time>{p.returnBoard.departure.slice(0,5)}</time><div><strong>イオン光店から左回り</strong><small>停留所で {p.boardingWait}分待ち（指定の余裕 {conditions.boardingBuffer}分＋残り {p.extraMargin}分）</small></div></li>
        <li><time>{p.returnArrive.arrival.slice(0,5)}</time><div><strong>{origin}の帰りのバス停へ</strong><small>帰りのGTFS乗り場ID {p.returnArrive.id}{conditions.homeWalk>0?` · ここから徒歩${conditions.homeWalk}分で${clockText(p.homeArrival)}に自宅へ`:' · 自宅への帰着は未判定'}</small></div></li>
      </ol><p className="journey-note">大人往復 {study.adultFare*2}円。バス停間の乗降順と運行日を照合。徒歩時間と遅延の余裕はご自身の条件で確認してください。</p></article>)}
    </section></div>
    <CorridorMap study={study} facilities={facilities} selected={origin}/>
    <section className="facility-section"><p className="eyebrow">用途で、必要な情報は変わる</p><h2>3つの目的地で確認できたこと</h2><div className="facility-grid"><article><h3>イオン光店</h3><FactList facts={storeReview.facts}/><p>{facilities.store.properties.official_address}</p><a href={storeReview.source_url}>店舗の公式営業時間 ↗</a>{storeReview.additional_sources?.map(s=><p key={s.url}><a href={s.url}>{s.title} ↗</a></p>)}<h4>まだ確認が必要</h4><ul>{storeReview.gaps.map(x=><li key={x}>{x}</li>)}</ul></article>
    <article><h3>{facilities.hospital.name}</h3><FactList facts={facilities.hospital.facts}/><p>{facilities.hospital.address}</p><p><a href={facilities.hospital.sourceUrl}>公式の外来案内 ↗</a> · <a href={facilities.hospital.accessUrl}>交通案内</a> · <a href={facilities.hospital.mapUrl}>院内図</a></p><h4>まだ確認が必要</h4><ul>{facilities.hospital.gaps.map(x=><li key={x}>{x}</li>)}</ul></article>
    <article><h3>光市立浅江中学校</h3><FactList facts={schoolReview.facts}/><a href={schoolReview.source_url}>市の移転・改修案内 ↗</a><h4>まだ確認が必要</h4><ul>{schoolReview.gaps.map(x=><li key={x}>{x}</li>)}</ul><p className="muted">旧所在地の病院・中学校は、通常の候補から外して参考記録として残しました。</p></article></div><p className="muted">上記の用途・基本案内を{facilities.checkedAt}に照合しました。位置、入口、営業・診療の当日の変更を一括して確認済みとは扱いません。</p></section>
    <section className="evidence"><p className="eyebrow">根拠まで、たどれる</p><h2>時刻表・確認範囲・次の確認</h2><details><summary>選んだ日の10停留所の時刻を見る</summary><p>右回りは光駅から出発し、左回りは逆順に停まります。「光駅発」は全周便の始発時刻。イオン光店からの帰り時刻は該当行で確認します。</p><div className="table-scroll" tabIndex={0} role="region" aria-label="10停留所の時刻表"><table><thead><tr><th scope="col">停留所</th>{trips.map(t=><th key={t.id} scope="col">{t.direction===0?'右回り':'左回り'}<br/>光駅 {t.start}発</th>)}</tr></thead><tbody>{study.groups.map(g=><tr key={g.name}><th scope="row">{g.number}. {g.name}</th>{trips.map(t=>{const id=t.direction===0?g.outboundId:g.returnId;const s=(t.direction===0?t.stops:[...t.stops].reverse()).find(s=>s.id===id);return <td key={t.id}>{s?.departure.slice(0,5)??'—'}{s?.sourceDeparture?' *':''}</td>;})}</tr>)}</tbody></table></div><p>* 10:08は公式PDFを採用。原本GTFSは10:07です。乗降制限・年末年始の運休条件も計算に適用しています。</p></details>
    <details><summary>公式資料とデータで見つかった3つの相違</summary><ul>{study.mismatches.map(x=><li key={x}>{x}</li>)}</ul><p>取得したGTFS原本を保持し、試行ページの計算にだけ根拠付きの補正を適用しています。</p></details>
    <details><summary>乗り場と歩く経路の確認台帳</summary><p>同名の10停留所に対してGTFSの乗り場IDは17個あります。往復の便に現れるIDと順序から対応付けました。道のどちら側に立つかは座標だけで確定していません。</p><div className="table-scroll" tabIndex={0} role="region" aria-label="往復の乗り場ID"><table><thead><tr><th>停留所</th><th>右回り</th><th>左回り</th></tr></thead><tbody>{study.groups.map(g=><tr key={g.name}><th scope="row">{g.name}</th><td>{g.outboundId}</td><td>{g.returnId}</td></tr>)}</tbody></table></div><ol><li>出発停留所：右回り・左回りの標柱、行先表示、待つ場所を確認する。</li><li>イオン光店：乗降位置から食品売場入口までの歩道・横断・段差と実測時間を往復別に確認する。</li><li>病院：バス停から正面入口までの段差・案内と、対象診療科の受付条件を確認する。</li><li>学校：移転後の通用門と、訪問者が入れる場所・日時を確認する。</li></ol><ul>{study.limits.map(x=><li key={x}>{x}</li>)}</ul></details>
    <details><summary>各社の公式資料はどこまで確認できたか</summary><p>{inventory.scope}</p><p>{inventory.catalogCheck}</p><div className="inventory-list">{inventory.rows.map(r=><article key={r.name}><h3><a href={r.url}>{r.name} ↗</a></h3><p className="muted">{r.status} · 原本 {r.sourceRecordCount}レコード · GTFS：{r.gtfs}</p><p>{r.review}</p></article>)}</div></details>
    <details><summary>原資料と更新の目安</summary><p>運行：{study.operator}。GTFS発行：{study.publisher}。照合日 {study.checkedAt}。再確認目安 {study.reviewDue} はこの試行の管理上の目安で、公式ダイヤの期限ではありません。</p><ul><li><a href={study.officialUrl}>光市の運行案内・運賃</a></li><li><a href={study.pdfUrl}>2026年4月1日改正・公式時刻表PDF</a></li><li><a href={study.routeMapUrl}>公式路線略図PDF</a></li><li><a href={study.sourceUrl}>光市GTFS原本の公開元（CC BY）</a></li><li><a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイルの仕様・出典</a></li><li><a href={`${BASE}data/route-living-pilot.json`}>試行ページの計算用データ</a></li><li><a href={`${BASE}data/transport-source-review.json`}>各社資料の確認台帳</a></li></ul><p>GTFS版：{study.feedVersion}</p><p className="hash">取得ZIPのSHA-256：{study.sourceSha256}</p><p>自動監視は設定していません。運行会社・市の改正告知、対象期間、店舗や病院の変更を再確認し、再計算・画面確認後に更新する運用です。</p></details></section>
  </main><footer><a href={`${BASE}index.html`}>山口県の地図へ戻る</a><span>資料で確認した1路線から、暮らしの移動を検証する。</span></footer></>;
}

function App(){
  const [data,setData]=useState<Bundle|null>(null);const [error,setError]=useState(false);const [attempt,setAttempt]=useState(0);
  useEffect(()=>{const controller=new AbortController();setError(false);Promise.all(['route-living-pilot','route-living-facilities','transport-source-review'].map(async name=>{const r=await fetch(`${BASE}data/${name}.json`,{signal:controller.signal});if(!r.ok)throw Error(String(r.status));return r.json();})).then(([study,facilities,inventory])=>{if(!controller.signal.aborted)setData({study,facilities,inventory});}).catch(()=>{if(!controller.signal.aborted)setError(true);});return ()=>controller.abort();},[attempt]);
  if(error)return <main><h1>資料を読み込めませんでした</h1><p>通信を確認して再読み込みしてください。</p><button onClick={()=>setAttempt(x=>x+1)}>再読み込み</button> <a href={`${BASE}index.html`}>地図へ戻る</a></main>;
  return data?<Study {...data}/>:<main><p role="status">時刻表と確認資料を読み込んでいます…</p></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
