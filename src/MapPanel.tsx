import { useEffect, useMemo, useState } from 'react';
import type { BusFeature, ShoppingFeature } from './types';
import { SHOPPING_CATEGORIES, categoryOf } from './shoppingData';
import type { ShoppingCategory } from './shoppingData';
import MapIcon from './MapIcon';

interface Props {
  stops: BusFeature[];
  facilities: ShoppingFeature[];
  categories: ShoppingCategory[];
  onCategories: (categories: ShoppingCategory[]) => void;
  onStop: (id: string) => void;
  onFacility: (feature: ShoppingFeature) => void;
  mode: 'national' | 'pilot';
  onMode: () => void;
  busy: boolean;
  shoppingError: boolean;
  retryShopping: () => void;
  selection: string;
}
const normalized = (text: string) => text.normalize('NFKC').replace(/\s/g, '').toLowerCase();
export default function MapPanel({ stops, facilities, categories, onCategories, onStop, onFacility, mode, onMode, busy, shoppingError, retryShopping, selection }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);
  useEffect(() => { if (selection) setExpanded(false); }, [selection]);
  const term = normalized(query);
  const matches = useMemo(() => {
    if (!term) return { stops: [], facilities: [] };
    return {
      stops: stops.filter(f => normalized(f.properties['name:ja'] || f.properties.name || '').includes(term)).slice(0, 12),
      facilities: facilities.filter(f => normalized(f.properties.name + f.properties.city).includes(term)).slice(0, 12),
    };
  }, [term, stops, facilities]);
  const visible = facilities.filter(f => categories.includes(categoryOf(f).id));
  const chooseStop = (id: string) => { setExpanded(false); setQuery(''); onStop(id); };
  const chooseFacility = (feature: ShoppingFeature) => { setExpanded(false); setQuery(''); setListOpen(false); onFacility(feature); };
  const facilityRow = (feature: ShoppingFeature) => {
    const category = categoryOf(feature);
    return <button key={String(feature.id)} className="place-row" onClick={() => chooseFacility(feature)}>
      <span className="category-symbol" style={{ background: category.color }}>{category.short}</span>
      <span><strong>{feature.properties.name}</strong><small>{feature.properties.city} · {category.name}</small></span><span className="row-arrow" aria-hidden="true">›</span>
    </button>;
  };
  return <aside className={`map-panel${expanded ? ' is-expanded' : ''}`} aria-label="地図の検索と表示設定">
    <div className="panel-intro"><div><p className="panel-kicker">MAP GUIDE</p><h2>バス停の先の、暮らしを探す</h2></div>
      <button className="panel-toggle icon-button" aria-label={expanded ? '表示設定を閉じる' : '表示設定を開く'} aria-expanded={expanded} aria-controls="map-options" onClick={() => setExpanded(p => !p)}><MapIcon name={expanded ? 'close' : 'layers'} /></button>
    </div>
    <div className="search-field"><MapIcon name="search" /><label className="sr-only" htmlFor="place-search">バス停・買い物先を検索</label><input id="place-search" type="search" placeholder="バス停・買い物先を検索" value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" /></div>
    {term ? <div className="search-results" aria-label="検索結果"><p className="list-label" role="status">検索結果{matches.stops.length === 12 || matches.facilities.length === 12 ? '（一部を表示）' : ` ${matches.stops.length + matches.facilities.length}件`}</p>
      {matches.facilities.map(facilityRow)}
      {matches.stops.map(stop => <button className="place-row" key={String(stop.id)} onClick={() => chooseStop(String(stop.id || stop.properties['@id']))}><span className="stop-symbol"><MapIcon name="bus" /></span><span><strong>{stop.properties['name:ja'] || stop.properties.name}</strong><small>{stop.properties.operator || 'バス停'}</small></span><span className="row-arrow" aria-hidden="true">›</span></button>)}
      {!matches.stops.length && !matches.facilities.length && <p className="helper-text">該当する登録データがありません。短い名前でもお試しください。</p>}
    </div> : <>
      <div className="panel-options" id="map-options">
        <section className="category-section"><div className="section-label"><h3>買い物先</h3><span>表示する種類</span></div>
          <div className="category-filters">{SHOPPING_CATEGORIES.map(category => <button key={category.id} aria-pressed={categories.includes(category.id)} onClick={() => onCategories(categories.includes(category.id) ? categories.filter(c => c !== category.id) : [...categories, category.id])}>
            <span className="category-symbol" style={{ background: category.color }}>{category.short}</span><span>{category.name}</span><span className="filter-check" aria-hidden="true">{categories.includes(category.id) ? '✓' : '+'}</span>
          </button>)}</div>
          {shoppingError ? <button className="text-button error-text" onClick={retryShopping}>買い物先を再読み込み</button> : <button className="list-toggle" aria-expanded={listOpen} onClick={() => setListOpen(p => !p)}>登録済みの買い物先 <span>{visible.length}件 <span aria-hidden="true">{listOpen ? '−' : '+'}</span></span></button>}
          {listOpen && <div className="facility-list">{visible.map(facilityRow)}{!visible.length && <p className="helper-text">表示する種類を選んでください。</p>}</div>}
          <p className="helper-text">登録済みの施設を表示します。周辺のすべてのお店を網羅するものではありません。</p>
        </section>
        <section className="walking-teaser"><div className="teaser-icon" aria-hidden="true">5<span>min</span></div><div><h3>歩ける範囲を見てみる</h3><p>おのだ周辺で、徒歩5分・10分を試せます。</p></div><button className="primary-link" onClick={() => { setExpanded(false); onMode(); }}>{mode === 'national' ? '徒歩圏の試作を開く' : '県全体のバス停に戻る'}<MapIcon name="arrow" /></button></section>
        <div className="panel-source"><span className="bus-dot" aria-hidden="true" /><p>{busy ? 'バス停を読み込み中…' : mode === 'national' ? 'バス停 4,418件 · 国土数値情報 2022年度版' : '徒歩圏の試作 · OSMの7地点'}</p></div>
        <a className="panel-about" href={`${import.meta.env.BASE_URL}about.html`}>使い方・データの出典 <span aria-hidden="true">↗</span></a>
      </div>
      <p className="panel-mobile-hint">{mode === 'national' ? '地図のバス停・お店をタップして詳しく' : 'おのだ周辺の徒歩圏を試作中'}</p>
    </>}
  </aside>;
}
