import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './review.css';
import type { BusCollection } from './types';
import type { FeatureCollection, Point } from 'geojson';

interface OfficialProperties {
  name:string; source_namespace:'hikari'|'iwakuni'; source_stop_id:string;
  route_ids:string[]; source_url:string; source_date:string; license:string;
  publication_status:string; stale_route_warning:boolean;
}
interface Route {id:string;name:string}
interface NationalProperties {name:string;operator:string;routes:string[];source_row:number;source_url:string;note:string|null}
type Official = FeatureCollection<Point,OfficialProperties>;
const el = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const map=L.map('review-map',{zoomControl:false,preferCanvas:true,zoomSnap:0.25,minZoom:6,maxZoom:19}).setView([33.99,131.95],12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
map.attributionControl.addAttribution('公式点：<a href="https://www.city.hikari.lg.jp/soshiki/1/johosuishin/site/2281.html">光市</a>・<a href="https://www.city.iwakuni.lg.jp/soshiki/8/36369.html">岩国市</a>を加工 / <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>');
map.attributionControl.addAttribution('<a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P11-2022.html">国土数値情報・バス停留所2022</a>を加工 / CC BY 4.0');
L.control.zoom({position:'bottomright',zoomInTitle:'地図を拡大',zoomOutTitle:'地図を縮小'}).addTo(map);
L.control.scale({imperial:false}).addTo(map);
const status=el('review-status');
const options=el<HTMLButtonElement>('options');
options.onclick=()=>{const open=options.getAttribute('aria-expanded')!=='true';options.setAttribute('aria-expanded',String(open));el('review-options').hidden=!open;};
const para=(parent:HTMLElement,text:string,className='')=>{const p=document.createElement('p');p.textContent=text;p.className=className;parent.append(p);};
function popup(name:string,tag:string){const box=document.createElement('section');box.className='stop-popup';const h=document.createElement('h2');h.textContent=name;box.append(h);para(box,tag,'source-tag');return box;}
function link(box:HTMLElement,url:string,label:string){const a=document.createElement('a');a.href=url;a.textContent=label;a.target='_blank';a.rel='noreferrer';box.append(a);}
async function get(name:string){const r=await fetch(`${import.meta.env.BASE_URL}data/${name}`);if(!r.ok)throw Error(name);return r.json();}
async function start(){
  const [osm,official,routes,national]:[BusCollection,Official,Route[],FeatureCollection<Point,NationalProperties>]=await Promise.all([get('bus_stop.geojson'),get('review-stops.geojson'),get('review-routes.json'),get('review-national.geojson')]);
  if(osm.features.length!==1085||official.features.length!==907||national.features.length!==4418||!Array.isArray(routes))throw Error('Unexpected data');
  const routeNames=new Map(routes.map(r=>[r.id,r.name]));
  if(official.features.some(f=>f.geometry.type!=='Point'||f.properties.publication_status!=='ready-as-separate-source-layer'||f.properties.stale_route_warning||f.properties.route_ids.some(id=>!routeNames.has(id))))throw Error('Unreviewed data');
  const existing=L.geoJSON(osm,{pointToLayer:(_,ll)=>L.circleMarker(ll,{radius:6,color:'#fff',weight:1.5,fillColor:'#174f9d',fillOpacity:.8}),onEachFeature:(f,layer)=>{
    const name=f.properties?.['name:ja']||f.properties?.name||'名称未登録';
    const box=popup(name,'既存OSM');para(box,`ID：${f.id||f.properties?.['@id']}`);
    para(box,`運行事業者：${f.properties?.operator||'登録情報なし'}`);
    para(box,'位置・名称はOSM登録情報。公式候補との同一乗り場判定は未確定です。','note');
    const id=String(f.id||f.properties?.['@id']);if(/^(node|way|relation)\/\d+$/.test(id))link(box,`https://www.openstreetmap.org/${id}`,'OSMの原情報');
    layer.bindPopup(box,{maxWidth:280,autoPanPaddingTopLeft:L.point(15,165),autoPanPaddingBottomRight:L.point(15,50)});
  }}).addTo(map);
  const added=L.geoJSON(official,{pointToLayer:(_,ll)=>L.circleMarker(ll,{radius:5,color:'#fff',weight:1.5,fillColor:'#d65312',fillOpacity:1}),onEachFeature:(f,layer)=>{
    const p=f.properties;const box=popup(p.name,`${p.source_namespace==='hikari'?'光市':'岩国市'}の公式データ・追加候補`);
    para(box,`原本ID：${p.source_stop_id}`);
    const list=document.createElement('ul');for(const id of p.route_ids){const item=document.createElement('li');item.textContent=routeNames.get(id)!;list.append(item);}box.append(list);
    para(box,`データ時点：${p.source_date} ／ ${p.license}`,'note');
    para(box,'現在の運行・予約要否を示すものではありません。既存点との重複は未統合です。','note');link(box,p.source_url,'公式データの出典');
    layer.bindPopup(box,{maxWidth:280,autoPanPaddingTopLeft:L.point(15,165),autoPanPaddingBottomRight:L.point(15,50)});
  }}).addTo(map);
  const nationalLayer=L.geoJSON(national,{pointToLayer:(_,ll)=>L.circleMarker(ll,{radius:7,color:'#07845e',weight:2,fillColor:'#07845e',fillOpacity:.12}),onEachFeature:(f,layer)=>{
    layer.bindPopup(()=>{const p=f.properties;const box=popup(p.name,'国土数値情報・2022年度版');
      para(box,`事業者：${p.operator||'記載なし'}`);
      const list=document.createElement('ul');for(const route of p.routes){const li=document.createElement('li');li.textContent=route;list.append(li);}box.append(list);
      para(box,'概ね2022年8月時点（元資料によって異なります）。原則として上下の乗り場を集約。現在の運行や乗り場の確認済みを意味しません。','note');
      if(p.note)para(box,p.note,'note');para(box,`山口県ファイルの行番号：${p.source_row} ／ CC BY 4.0`,'note');link(box,p.source_url,'国のデータ仕様・出典');return box;
    },{maxWidth:280,autoPanPaddingTopLeft:L.point(15,165),autoPanPaddingBottomRight:L.point(15,50)});
  }}).addTo(map);nationalLayer.bringToBack();
  const fit=(area:string)=>{map.closePopup();const points=(area==='all'?national.features:official.features.filter(f=>f.properties.source_namespace===area)).map(f=>L.latLng(f.geometry.coordinates[1],f.geometry.coordinates[0]));map.fitBounds(L.latLngBounds(points),{paddingTopLeft:[25,165],paddingBottomRight:[55,65],maxZoom:14,animate:false});document.querySelectorAll<HTMLButtonElement>('[data-area]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.area===area)));};
  document.querySelectorAll<HTMLButtonElement>('[data-area]').forEach(b=>b.onclick=()=>fit(b.dataset.area!));
  for(const [id,layer] of [['show-osm',existing],['show-official',added],['show-national',nationalLayer]] as const)el<HTMLInputElement>(id).onchange=()=>{map.closePopup();if(el<HTMLInputElement>(id).checked)layer.addTo(map);else layer.remove();if(map.hasLayer(nationalLayer))nationalLayer.bringToBack();if(map.hasLayer(added))added.bringToFront();};
  status.hidden=true;fit('all');
}
start().catch(()=>{status.hidden=false;status.textContent='データを読み込めませんでした。';const retry=document.createElement('button');retry.textContent='ページを再読み込み';retry.onclick=()=>location.reload();status.append(retry);});

