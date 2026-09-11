import { useEffect, useMemo, useRef, useState } from 'react';
import type { BusFeature, ShoppingFeature } from './types';
import { SHOPPING_CATEGORIES, categoryOf } from './shoppingData';
import type { ShoppingCategory } from './shoppingData';
import MapIcon from './MapIcon';
import FacilityIcon from './FacilityIcon';
import { searchPlaces } from './placeSearch';

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
  shoppingLoading: boolean;
  retryShopping: () => void;
  selection: string;
}
export default function MapPanel({ stops, facilities, categories, onCategories, onStop, onFacility, mode, onMode, busy, shoppingError, shoppingLoading, retryShopping, selection }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [listLimit, setListLimit] = useState(24);
  const [limits, setLimits] = useState({ facilities: 12, stops: 12 });
  const resultPanel = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ section: string; index: number } | null>(null);
  useEffect(() => { if (resultPanel.current) resultPanel.current.scrollTop = 0; }, [query]);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const { section, index } = pendingFocus.current;
    const row = document.getElementById(section)?.closest('section')?.querySelectorAll<HTMLButtonElement>('.place-row')[index];
    row?.focus({ preventScroll: true });
    pendingFocus.current = null;
  }, [limits, listLimit]);
  useEffect(() => { setListLimit(24); }, [categories]);
  useEffect(() => { if (selection) setExpanded(false); }, [selection]);
  const term = query.trim();
  const matches = useMemo(() => searchPlaces(query, stops, facilities), [query, stops, facilities]);
  const changeQuery = (value: string) => { pendingFocus.current = null; setQuery(value); setLimits({ facilities: 12, stops: 12 }); };
  const clearQuery = () => { changeQuery(''); document.getElementById('place-search')?.focus(); };
  const visible = facilities.filter(f => categories.includes(categoryOf(f).id));
  const chooseStop = (id: string) => { setExpanded(false); setQuery(''); onStop(id); };
  const chooseFacility = (feature: ShoppingFeature) => { setExpanded(false); setQuery(''); setListOpen(false); onFacility(feature); };
  const facilityRow = (feature: ShoppingFeature) => {
    const category = categoryOf(feature);
    return <button key={String(feature.id)} className="place-row" onClick={() => chooseFacility(feature)}>
      <span className="category-symbol" style={{ background: category.color }}><FacilityIcon category={category.id} /></span>
      <span><strong>{feature.properties.name}</strong><small>{feature.properties.city ? `${feature.properties.city} · ` : ''}{category.name}</small></span><span className="row-arrow" aria-hidden="true">›</span>
    </button>;
  };
  return <aside className={`map-panel${expanded ? ' is-expanded' : ''}`} aria-label="地図の検索と表示設定">
    <div className="panel-intro"><div><p className="panel-kicker">MAP GUIDE</p><h2>バス停の先の、暮らしを探す</h2></div>
      <button className="panel-toggle icon-button" aria-label={expanded ? '表示設定を閉じる' : '表示設定を開く'} aria-expanded={expanded} aria-controls="map-options" onClick={() => setExpanded(p => !p)}><MapIcon name={expanded ? 'close' : 'layers'} /></button>
    </div>
    <div className="search-field"><MapIcon name="search" /><label className="sr-only" htmlFor="place-search">バス停・お店・病院を検索</label><input id="place-search" type="search" placeholder="バス停・お店・病院を検索" value={query} onChange={e => changeQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && query) { e.stopPropagation(); clearQuery(); } }} autoComplete="off" />{query && <button className="search-clear" aria-label="検索をクリア" onClick={clearQuery}><MapIcon name="close" /></button>}</div>
    {term ? <div className="search-results" ref={resultPanel} aria-label="検索結果"><p className="list-label" role="status">検索結果 {matches.stops.length + matches.facilities.length}件{busy || shoppingLoading ? '（読み込み中）' : ''}</p>
      {matches.facilities.length > 0 && <section aria-labelledby="facility-results-title"><h3 className="result-group-title" id="facility-results-title">お店・医療施設 <span>{matches.facilities.length}件</span></h3>
        {matches.facilities.slice(0, limits.facilities).map(facilityRow)}
        {matches.facilities.length > limits.facilities && <button className="more-results" onClick={() => { pendingFocus.current = { section: 'facility-results-title', index: limits.facilities }; setLimits(p => ({ ...p, facilities: p.facilities + 12 })); }}>施設をさらに表示（残り{matches.facilities.length - limits.facilities}件）</button>}
      </section>}
      {matches.stops.length > 0 && <section aria-labelledby="stop-results-title"><h3 className="result-group-title" id="stop-results-title">バス停 <span>{matches.stops.length}件</span></h3>
        {matches.stops.slice(0, limits.stops).map(stop => <button className="place-row" key={String(stop.id)} onClick={() => chooseStop(String(stop.id || stop.properties['@id']))}><span className="stop-symbol"><MapIcon name="bus" /></span><span><strong>{stop.properties['name:ja'] || stop.properties.name}</strong><small>バス停 · {stop.properties.operator || '事業者の登録なし'}</small></span><span className="row-arrow" aria-hidden="true">›</span></button>)}
        {matches.stops.length > limits.stops && <button className="more-results" onClick={() => { pendingFocus.current = { section: 'stop-results-title', index: limits.stops }; setLimits(p => ({ ...p, stops: p.stops + 12 })); }}>バス停をさらに表示（残り{matches.stops.length - limits.stops}件）</button>}
      </section>}
      {shoppingError && <button className="text-button error-text" onClick={retryShopping}>施設を再読み込み</button>}
      {!busy && !shoppingLoading && !shoppingError && !matches.stops.length && !matches.facilities.length && <p className="helper-text">該当する登録データがありません。短い名前でもお試しください。</p>}
      <p className="search-hint">カタカナの名前は、ひらがなでも検索できます。スペースで複数の言葉を指定できます。</p>
    </div> : <>
      <div className="panel-options" id="map-options">
        <section className="category-section"><div className="section-label"><h3 id="facility-list-title">買い物・通院先</h3><span>表示する種類</span></div>
          <div className="category-filters">{SHOPPING_CATEGORIES.map(category => <button key={category.id} aria-pressed={categories.includes(category.id)} onClick={() => onCategories(categories.includes(category.id) ? categories.filter(c => c !== category.id) : [...categories, category.id])}>
            <span className="category-symbol" style={{ background: category.color }}><FacilityIcon category={category.id} /></span><span>{category.name}<small className="category-count">{facilities.filter(f => categoryOf(f).id === category.id).length}件</small></span><span className="filter-check" aria-hidden="true">{categories.includes(category.id) ? '✓' : '+'}</span>
          </button>)}</div>
          {shoppingError ? <button className="text-button error-text" onClick={retryShopping}>施設を再読み込み</button> : shoppingLoading ? <p className="helper-text" role="status">施設を読み込み中…</p> : <button className="list-toggle" aria-expanded={listOpen} onClick={() => setListOpen(p => !p)}>施設一覧 <span>{visible.length}件 <span aria-hidden="true">{listOpen ? '−' : '+'}</span></span></button>}
          {listOpen && <div className="facility-list">{visible.slice(0, listLimit).map(facilityRow)}{visible.length > listLimit && <button className="more-results" onClick={() => { pendingFocus.current = { section: 'facility-list-title', index: listLimit }; setListLimit(n => n + 24); }}>一覧をさらに表示（残り{visible.length - listLimit}件）</button>}{!visible.length && <p className="helper-text">表示する種類を選んでください。</p>}</div>}
          <p className="helper-text">施設の点を選ぶか、地図を拡大するとアイコンが現れます。背景地図の文字・記号は種類の切替で消えません。</p>
        </section>
        <section className="walking-teaser"><div className="teaser-icon" aria-hidden="true">5<span>min</span></div><div><h3>歩ける範囲を見てみる</h3><p>おのだ周辺で、徒歩5分・10分を試せます。</p></div><button className="primary-link" onClick={() => { setExpanded(false); onMode(); }}>{mode === 'national' ? '徒歩圏の試作を開く' : '県全体のバス停に戻る'}<MapIcon name="arrow" /></button></section>
        <div className="panel-source"><span className="bus-dot" aria-hidden="true" /><p>{busy ? 'バス停を読み込み中…' : mode === 'national' ? 'バス停 4,418件 · 国土数値情報 2022年度版' : '徒歩圏の試作 · OSMの7地点'}</p></div>
        <a className="panel-about" href={`${import.meta.env.BASE_URL}about.html`}>使い方・データの出典 <span aria-hidden="true">↗</span></a>
      </div>
      <p className="panel-mobile-hint">{mode === 'national' ? '地図のバス停・施設をタップして詳しく' : 'おのだ周辺の徒歩圏を試作中'}</p>
    </>}
  </aside>;
}
