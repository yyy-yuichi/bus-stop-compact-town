import { FACILITY_GROUPS } from './facilityCatalog';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BusFeature, ShoppingFeature } from './types';
import { SHOPPING_CATEGORIES, categoryOf } from './shoppingData';
import type { ShoppingCategory } from './shoppingData';
import MapIcon from './MapIcon';
import FacilityIcon from './FacilityIcon';
import { searchPlaces } from './placeSearch';
import BasemapSettings from './basemapPreferences';
import { boardingTitle } from './boardingGuide';
import { auditLabel } from './facilityAudit';

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
  onReturnSearch: () => void;
  municipalFailed: boolean;
  retryMunicipal: () => void;
}
export default function MapPanel({ stops, facilities, categories, onCategories, onStop, onFacility, mode, onMode, busy, shoppingError, shoppingLoading, retryShopping, selection, onReturnSearch, municipalFailed, retryMunicipal }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [auditFilter, setAuditFilter] = useState<'limited_support' | 'unresolved' | null>(null);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [listLimit, setListLimit] = useState(24);
  const [limits, setLimits] = useState({ facilities: 12, stops: 12 });
  const resultPanel = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ section: string; index: number } | null>(null);
  useEffect(() => { if (resultPanel.current) resultPanel.current.scrollTop = 0; }, [query, auditFilter]);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const { section, index } = pendingFocus.current;
    const row = document.getElementById(section)?.closest('section')?.querySelectorAll<HTMLButtonElement>('.place-row')[index];
    row?.focus({ preventScroll: true });
    pendingFocus.current = null;
  }, [limits, listLimit]);
  useEffect(() => { setListLimit(24); }, [categories]);
  useEffect(() => { if (selection) { setExpanded(false); setResultsOpen(false); } else setResultsOpen(true); }, [selection]);
  const term = query.trim();
  const auditCounts = useMemo(() => ({ supported: facilities.filter(f => f.properties.audit_review?.status === 'limited_support').length, unresolved: facilities.filter(f => f.properties.audit_review?.status === 'unresolved').length }), [facilities]);
  const auditCheckedAt = useMemo(() => facilities.reduce((date, f) => f.properties.audit_review && f.properties.audit_review.checked_at > date ? f.properties.audit_review.checked_at : date, ''), [facilities]);
  const matches = useMemo(() => {
    const scoped = auditFilter ? facilities.filter(f => f.properties.audit_review?.status === auditFilter) : facilities;
    return auditFilter && !query.trim() ? { facilities: scoped, stops: [] } : searchPlaces(query, auditFilter ? [] : stops, scoped);
  }, [query, stops, facilities, auditFilter]);
  const changeQuery = (value: string) => { pendingFocus.current = null; setQuery(value); setResultsOpen(true); setLimits({ facilities: 12, stops: 12 }); };
  const clearQuery = () => { changeQuery(''); document.getElementById('place-search')?.focus(); };
  const visible = facilities.filter(f => categories.includes(categoryOf(f).id));
  const chooseStop = (id: string) => { setExpanded(false); setResultsOpen(false); onStop(id); };
  const chooseFacility = (feature: ShoppingFeature) => { setExpanded(false); setResultsOpen(false); setListOpen(false); onFacility(feature); };
  const facilityRow = (feature: ShoppingFeature) => {
    const category = categoryOf(feature);
    return <button key={String(feature.id)} className="place-row" onClick={() => chooseFacility(feature)}>
      <span className="category-symbol" style={{ background: category.color }}><FacilityIcon category={category.id} /></span>
      <span><strong>{feature.properties.name}</strong><small>{feature.properties.city ? `${feature.properties.city} · ` : ''}{category.name}</small>{feature.properties.audit_review && <small className={`audit-badge audit-${feature.properties.audit_review.status}`}>{auditLabel(feature.properties.audit_review)}</small>}</span><span className="row-arrow" aria-hidden="true">›</span>
    </button>;
  };
  return <aside className={`map-panel${expanded ? ' is-expanded' : ''}${(term || auditFilter) && resultsOpen ? ' is-searching' : ''}`} aria-label="地図の検索と表示設定">
    <div className="search-field"><MapIcon name="search" /><label className="sr-only" htmlFor="place-search">バス停・暮らしの施設を検索</label><input id="place-search" type="search" placeholder="バス停・暮らしの施設を検索" value={query} onChange={e => changeQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && query) { e.stopPropagation(); clearQuery(); } }} autoComplete="off" />{query && <button className="search-clear" aria-label="検索をクリア" onClick={clearQuery}><MapIcon name="close" /></button>}<button className="panel-toggle icon-button" aria-label={expanded ? '表示設定を閉じる' : '表示設定を開く'} aria-expanded={expanded} aria-controls="map-options" onClick={() => { setExpanded(p => !p); if (!expanded) setResultsOpen(false); }}><MapIcon name={expanded ? 'close' : 'layers'} /></button></div>
    {!shoppingLoading && !shoppingError && (auditCounts.supported + auditCounts.unresolved > 0) && <section className="audit-summary" aria-label="最新施設監査">
      <p>{auditCheckedAt} 施設監査 <span>（原ID単位）</span></p>
      <div><button aria-pressed={auditFilter === 'limited_support'} onClick={() => { pendingFocus.current = null; setAuditFilter('limited_support'); setResultsOpen(true); setExpanded(false); setLimits({ facilities: 12, stops: 12 }); onReturnSearch(); }}>限定根拠 {auditCounts.supported.toLocaleString('ja-JP')}件</button><button aria-pressed={auditFilter === 'unresolved'} onClick={() => { pendingFocus.current = null; setAuditFilter('unresolved'); setResultsOpen(true); setExpanded(false); setLimits({ facilities: 12, stops: 12 }); onReturnSearch(); }}>未解決 {auditCounts.unresolved.toLocaleString('ja-JP')}件</button></div>
      {auditFilter && <button className="audit-reset" onClick={() => { pendingFocus.current = null; setAuditFilter(null); setResultsOpen(true); setLimits({ facilities: 12, stops: 12 }); onReturnSearch(); }}>すべての施設・バス停を検索</button>}
    </section>}
    {municipalFailed && <button className="text-button error-text" onClick={retryMunicipal}>岩国市・光市のデータを再読み込み</button>}
    {shoppingError && <button className="text-button error-text" onClick={retryShopping}>施設を再読み込み</button>}
    {(term || auditFilter) && !resultsOpen && <button className="search-return" onClick={() => { onReturnSearch(); setResultsOpen(true); document.getElementById('place-search')?.focus(); }}>← {term ? `「${term}」の検索結果` : '監査結果の一覧'}に戻る</button>}
    {(term || auditFilter) && resultsOpen ? <div className="search-results" ref={resultPanel} aria-label="検索結果"><p className="list-label" role="status">{auditFilter ? auditFilter === 'limited_support' ? '限定範囲の根拠あり' : '未解決' : '検索結果'} {matches.stops.length + matches.facilities.length}件{busy || shoppingLoading ? '（読み込み中）' : ''}</p>
      {matches.facilities.length > 0 && <section aria-labelledby="facility-results-title"><h3 className="result-group-title" id="facility-results-title">{auditFilter ? '監査結果（施設全体の営業判定ではありません）' : '施設（参考記録を含む）'} <span>{matches.facilities.length}件</span></h3>
        {matches.facilities.slice(0, limits.facilities).map(facilityRow)}
        {matches.facilities.length > limits.facilities && <button className="more-results" onClick={() => { pendingFocus.current = { section: 'facility-results-title', index: limits.facilities }; setLimits(p => ({ ...p, facilities: p.facilities + 12 })); }}>施設をさらに表示（残り{matches.facilities.length - limits.facilities}件）</button>}
      </section>}
      {matches.stops.length > 0 && <section aria-labelledby="stop-results-title"><h3 className="result-group-title" id="stop-results-title">バス停 <span>{matches.stops.length}件</span></h3>
        {matches.stops.slice(0, limits.stops).map(stop => <button className="place-row" key={String(stop.id)} onClick={() => chooseStop(String(stop.id || stop.properties['@id']))}><span className={`stop-symbol${stop.properties.source_kind === 'municipal' ? ' municipal-symbol' : ''}`}><MapIcon name="bus" /></span><span><strong>{boardingTitle(stop)}</strong><small>{stop.properties.boarding_guide?.summary || (stop.properties.source_kind === 'municipal' ? `${stop.properties.city}の停留所データ` : stop.properties.operator || 'バス停')}</small></span><span className="row-arrow" aria-hidden="true">›</span></button>)}
        {matches.stops.length > limits.stops && <button className="more-results" onClick={() => { pendingFocus.current = { section: 'stop-results-title', index: limits.stops }; setLimits(p => ({ ...p, stops: p.stops + 12 })); }}>バス停をさらに表示（残り{matches.stops.length - limits.stops}件）</button>}
      </section>}
      {!busy && !shoppingLoading && !shoppingError && !matches.stops.length && !matches.facilities.length && <p className="helper-text">該当する登録データがありません。短い名前でもお試しください。</p>}
    </div> : <>
      <div className="panel-options" id="map-options">
        <BasemapSettings />
        <section className="category-section"><div className="section-label"><h3 id="facility-list-title">暮らしの施設</h3><span>表示する種類</span></div>
          <p className="helper-text facility-map-note">バス停を選ぶと、周辺の施設が地図に表示されます。</p>
          <div className="category-groups">{FACILITY_GROUPS.map(group => <details key={group.id}><summary>{group.name}<span>{SHOPPING_CATEGORIES.filter(c => c.group === group.id && categories.includes(c.id)).length}/{SHOPPING_CATEGORIES.filter(c => c.group === group.id).length}種類</span></summary><div className="category-filters">{SHOPPING_CATEGORIES.filter(c => c.group === group.id).map(category => <button key={category.id} aria-pressed={categories.includes(category.id)} onClick={() => onCategories(categories.includes(category.id) ? categories.filter(c => c !== category.id) : [...categories, category.id])}>
            <span className="category-symbol" style={{ background: category.color }}><FacilityIcon category={category.id} /></span><span>{category.name}<small className="category-count">{facilities.filter(f => categoryOf(f).id === category.id).length}件</small></span><span className="filter-check" aria-hidden="true">{categories.includes(category.id) ? '✓' : '+'}</span>
          </button>)}</div></details>)}</div>
          {shoppingError ? null : shoppingLoading ? <p className="helper-text" role="status">施設を読み込み中…</p> : <button className="list-toggle" aria-expanded={listOpen} onClick={() => setListOpen(p => !p)}>施設一覧 <span>{visible.length}件 <span aria-hidden="true">{listOpen ? '−' : '+'}</span></span></button>}
          {listOpen && <div className="facility-list">{visible.slice(0, listLimit).map(facilityRow)}{visible.length > listLimit && <button className="more-results" onClick={() => { pendingFocus.current = { section: 'facility-list-title', index: listLimit }; setListLimit(n => n + 24); }}>一覧をさらに表示（残り{visible.length - listLimit}件）</button>}{!visible.length && <p className="helper-text">表示する種類を選んでください。</p>}</div>}
        </section>
        <div className="panel-source">{busy ? <p role="status">バス停を読み込み中…</p> : mode === 'national' ? <p><span className="bus-dot" aria-hidden="true" /> 国の代表点 4,418件<br /><span className="bus-dot municipal-dot" aria-hidden="true" /> {municipalFailed ? '市の登録点は読み込み待ち' : `市の登録点 ${stops.filter(s => s.properties.source_kind === 'municipal').length}件`}</p> : <p>徒歩圏の試作 · OSMの7地点</p>}</div>
        <button className="panel-about" onClick={() => { setExpanded(false); changeQuery(''); onMode(); }}>{mode === 'national' ? 'おのだ周辺の徒歩圏試作' : '県全体のバス停に戻る'}<MapIcon name="arrow" /></button>
        <a className="panel-about" href={`${import.meta.env.BASE_URL}route-living.html`}>光市のバスで午前の買い物を試す <span aria-hidden="true">↗</span></a>
        <a className="panel-about" href={`${import.meta.env.BASE_URL}about.html`}>使い方・データの出典 <span aria-hidden="true">↗</span></a>
      </div>
    </>}
  </aside>;
}
