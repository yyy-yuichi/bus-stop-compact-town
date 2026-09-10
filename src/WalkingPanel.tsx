import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import type { ShoppingCollection, ShoppingFeature } from './types';
import { catchmentFile, distance, interpolate, parseCatchment, walkDataBaseUrl } from './walking';
import type { Catchment, Coordinate, Segment } from './walking';

interface SteepPiece { a: Coordinate; b: Coordinate; grade: number }

/**
 * 「谷る」と読める最小の連続長。焼き込み済みの急坂区間を接続長の分布で見ると、
 * 10m未満が全体長の2.0%、10-25mが10.3%、25-50mが27.7%、50-100mが31.6%、
 * 100m以上が28.3%（連結区間ごとの合計長で集計）。25m（10-25mバケットの上限）
 * で切ると、捨てるのは<25mの合計12.3%だけで、信号待ち程度で終わる単発の
 * フラグメントはほぼ消える一方、実際に体感する坂はほぼ全部残る。
 */
const MIN_STEEP_RUN_M = 25;

/**
 * 指定範囲（budget。通常は焼き込み全体、1000m）に切り詰めた上で、|grade|>=5%のセグメントを
 * 端点の座標一致（焼き込み時に5桁精度で丸め済み）でつないで連続区間（run）を作る。
 * run の合計長が MIN_STEEP_RUN_M 未満の断片は間引く。色分けは9%→7%→9%のような
 * 一続きの坂をしきい値で切り刻んで見せないよう、run 単位ではなくセグメント単位の
 * 勾配で行う（呼び出し側で処理）。
 */
function steepRuns(segments: Segment[], budget: number): { pieces: SteepPiece[] } {
  const trimmed: (SteepPiece & { length: number })[] = [];
  for (const { a, b, d1, d2, grade } of segments) {
    if (Math.abs(grade) < 5) continue;
    if (d1 > budget && d2 > budget) continue;
    let pa = a, pb = b;
    if (!(d1 <= budget && d2 <= budget)) {
      const t = (budget - d1) / (d2 - d1);
      if (d1 <= budget) pb = interpolate(a, b, t); else pa = interpolate(a, b, t);
    }
    trimmed.push({ a: pa, b: pb, grade, length: distance(pa, pb) });
  }
  if (!trimmed.length) return { pieces: [] };

  // Union-Find: 端点のキー（丸め済み座標の文字列）が一致するセグメント同士を同じrunにまとめる。
  const parent = trimmed.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) i = parent[i]; return i; };
  const key = (p: Coordinate) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const byEndpoint = new Map<string, number[]>();
  trimmed.forEach((seg, i) => {
    for (const p of [seg.a, seg.b]) {
      const k = key(p);
      const at = byEndpoint.get(k);
      if (at) { for (const j of at) { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; } at.push(i); }
      else byEndpoint.set(k, [i]);
    }
  });
  const runLength = new Map<number, number>();
  trimmed.forEach((seg, i) => { const r = find(i); runLength.set(r, (runLength.get(r) ?? 0) + seg.length); });

  const qualifies = (i: number) => (runLength.get(find(i)) ?? 0) >= MIN_STEEP_RUN_M;
  const pieces = trimmed.filter((_, i) => qualifies(i)).map(({ a, b, grade }) => ({ a, b, grade }));
  return { pieces };
}

/**
 * 停留所からの距離（坂道込みの平地換算）を色に変える連続レンジ。緑→黄→赤は
 * 「近い＝良い／遠い＝悪い」に読めてしまうため避け、単一ハイの連続階調にした。
 *
 * 最初は寒色（インディゴ→ブルー→ティール）で検討したが、OSM標準スタイルは
 * 水域を淡い灰青で塗るため、遠端の水色〜シアンが川・池・海岸線と competing
 * してしまう（青系は読みにくいというフィードバックも受けた）。山口県は
 * 森林・河川・海岸のいずれも多いため、緑系に変更した。
 *
 * ただし緑には別の罠がある。OSM標準は公園（明度88%・#c8facc付近）も森林
 * （明度72%・#add19e付近）も緑で塗るため、山口県の大部分では地図の下地が
 * すでに緑になる。そこを生き残る条件は「明るい緑」ではなく「彩度が高く沈んだ
 * 緑」であること。そこでdeep forest green（近端）→emerald→bright
 * yellow-green（遠端）というviridisの緑側半分に近い配色にし、彩度を65%→80%
 * まで上げる一方で明度は22%→52%に抑えた。OSM側の公園・森林は明度72〜88%・
 * 彩度は場所により36〜83%とまちまちだが明るく霞んだ配色なので、明度を終始
 * 50%台以下に沈めておけば、色相が多少近づいても「地図の下地」ではなく
 * 「上に乗った線」として見えるはずだという判断。遠端をyellow-green
 * （色相75°、彩度80%、明度52%）というOSMが使わない鮮やかさで止め、
 * 純粋な黄色までは寄せずに「遠いほど色が薄れて消える」のではなく
 * 「遠いほど色相が変わって主張が強くなる」ことで連続性と遠端の存在感を
 * 両立させた。実機の地図では未確認（このタスクではブラウザ検証を行っていない）。
 * 特に遠端の黄緑が森林ポリゴンの上でどう見えるかはユーザーの目視確認が要る。
 */
const RAMP_STOPS: [number, string][] = [
  [0, '#145d38'],
  [1 / 3, '#188b22'],
  [2 / 3, '#50bb1b'],
  [1, '#b6e723'],
];

/**
 * 急坂オーバーレイは元々#dc2626の破線＋#7f1d1d の太い実線だった。破線は薄い
 * 地図の上でも最も見落とされやすいマークなのでやめ、実線に統一。色相は距離
 * ランプ（緑〜黄緑）とは別系統の暖色（赤）のまま残す：色そのものが「急坂である」
 * の一次サインで、8%以上はより暗く彩度の高い赤にする「濃さ」だけで階層を
 * 区別する。距離との対応は無い（同じ8%の坂なら、停留所の近くでも遠くでも
 * 同じ赤）——急坂がどこにあるかは色相そのもので即座にわかる方を優先した。
 * 太さの設計についてはBASE_WEIGHT/STEEP_WEIGHTのコメントを参照。実機の地図
 * では未確認（本タスクではブラウザ検証を行っていない）。
 */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function rampColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP_STOPS.length; i++) {
    const [t0, c0] = RAMP_STOPS[i - 1];
    const [t1, c1] = RAMP_STOPS[i];
    if (clamped <= t1) {
      const local = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
      const rgb0 = hexToRgb(c0), rgb1 = hexToRgb(c1);
      return rgbToHex([0, 1, 2].map(k => rgb0[k] + (rgb1[k] - rgb0[k]) * local) as [number, number, number]);
    }
  }
  return RAMP_STOPS[RAMP_STOPS.length - 1][1];
}

/**
 * 651〜3,355本ものセグメントを1本ずつ描くと重い。距離を12段のバケツに
 * まとめて、バケツごとに1本のポリライン（複数の線分をまとめた1レイヤー）
 * として描く。地図上の縮尺では連続したグラデーションに見えつつ、レイヤー数は
 * 停留所あたり十数枚に収まる。セグメント長は中央値約10m・最大約49mで
 * バケツ幅（1000m/12≒83m）よりずっと短いため、セグメント単位（中点の距離で
 * バケツ分け）で十分連続に見える。
 */
const DISTANCE_BUCKETS = 12;
/** 距離ランプの太さ。急坂の縞を乗せる「地」として、STEEP_WEIGHTのコメントの
 *  通り太さを持たせている（単独なら3pxでも読めるが、それでは縞の置き場がない）。
 */
const BASE_WEIGHT = 5;

function bucketByMid(items: { a: Coordinate; b: Coordinate; mid: number }[], budget: number): Coordinate[][][] {
  const buckets: Coordinate[][][] = Array.from({ length: DISTANCE_BUCKETS }, () => []);
  for (const { a, b, mid } of items) {
    const idx = Math.min(DISTANCE_BUCKETS - 1, Math.max(0, Math.floor((mid / budget) * DISTANCE_BUCKETS)));
    buckets[idx].push([a, b]);
  }
  return buckets;
}

function bucketSegments(catchment: Catchment): { color: string; lines: Coordinate[][] }[] {
  const items = catchment.segments.map(({ a, b, d1, d2 }) => ({ a, b, mid: (d1 + d2) / 2 }));
  return bucketByMid(items, catchment.budget)
    .map((lines, i) => ({ color: rampColor((i + 0.5) / DISTANCE_BUCKETS), lines }))
    .filter(bucket => bucket.lines.length > 0);
}

/**
 * 急坂の2階層（5-8%・8%以上）。色相の違い（赤→より暗い赤）だけで区別できるので、
 * 太さは両階層とも同じにする（8%以上をさらに太くする必要はないというユーザー
 * 判断）。距離とは無関係な独立ハイライトなので距離バケツには分けない：階層ごとに
 * 1レイヤーで足りる（最大2枚）。
 *
 * 太さは当初weight5で、距離ランプ（weight3）より太かった。急坂は同じ座標に
 * ランプの上から重ねて描く（描画順は変えていない）ため、太い方が上に乗ると
 * 下のランプ色を完全に覆い隠してしまい、「急坂であること」はわかっても
 * 「そこまでの距離」が読めなくなっていた——向きが逆だった。
 *
 * そこで関係を反転：ランプ側をBASE_WEIGHT（5）まで太くして「地」にし、急坂側は
 * STEEP_WEIGHT（2）まで細くして「地の上に乗る縞」にする。Leafletのポリラインは
 * 中心線に対して太さを均等に描くため、同じ座標に細い線を重ねれば自然に中央
 * 揃えの縞になり、ランプ色は縞の両側に帯として残る——両方が同時に読める。
 * 太さの絶対値ではなく比（5:2）が肝心：縞が「明らかに細い」と言えることを基準に
 * 選んだ。線をこれ以上太くする理由はない（薄い線を求められた経緯があるため）ので、
 * 両方が読み取れる最小の組み合わせとして5と2にした。実機の地図では未確認
 * （本タスクではブラウザ検証を行っていない）。
 */
const STEEP_WEIGHT = 2;
const STEEP_TIERS = [
  { min: 5, max: 8, color: '#dc2626' },
  { min: 8, max: Infinity, color: '#7f1d1d' },
];

function groupSteepPieces(pieces: SteepPiece[]): { color: string; lines: Coordinate[][] }[] {
  return STEEP_TIERS
    .map(tier => ({
      color: tier.color,
      lines: pieces.filter(p => Math.abs(p.grade) >= tier.min && Math.abs(p.grade) < tier.max).map(p => [p.a, p.b] as Coordinate[]),
    }))
    .filter(tier => tier.lines.length > 0);
}

/**
 * 地図全体を白いスクリムで少し覆い、OSM標準タイル（道路・建物・土地利用の塗り）
 * の主張を弱めて、上に乗る徒歩圏の線を「地図の模様」ではなく「乗った線」として
 * 見えやすくする。tilePane（z-index 200）より上、overlayPane（同400）より下に
 * 置きたいので、その間のz-indexを持つ専用paneを1つ作る。不透明度0.5は
 * 「道路の形や地名は読めるが、地図全体は霧にならない」の中間点として選んだ
 * （もっと薄いと下地の緑・道路網に線が沈み、もっと濃いと地名が読めなくなる）。
 * 実機の地図では未確認。
 *
 * 当初は線の下にさらに中立色のケーシング（縁取り）も敷いていたが、ユーザーが
 * 実機で見た結果「スクリムだけで十分分離できている。ケーシングは効果と呼べる
 * ほどの仕事をしていない」と判断されたため削除した。分離の役目はスクリムが
 * 一手に引き受けている。
 */
const SCRIM_PANE = 'walkScrim';
const SCRIM_Z_INDEX = 250; // tilePane=200 < ここ < overlayPane=400
const SCRIM_OPACITY = 0.5;

function ensureScrimPane(map: L.Map): void {
  if (map.getPane(SCRIM_PANE)) return;
  const pane = map.createPane(SCRIM_PANE);
  pane.style.zIndex = String(SCRIM_Z_INDEX);
  pane.style.pointerEvents = 'none';
}

/**
 * 色の意味（距離のグラデーションと急坂の凡例）は、ドロワーに置くとスクロールで
 * 隠れてしまうため、地図に固定されるLeafletコントロールにした。停留所を切り替
 * えても内容は変わらないので、徒歩圏レイヤーと一緒に付け外しするだけでよい。
 */
function createLegendControl(budget: number): L.Control {
  const control = new L.Control({ position: 'bottomleft' });
  control.onAdd = () => {
    const div = L.DomUtil.create('div', 'walking-legend rounded-xl border border-stone-200 bg-white/95 px-4 py-3 text-[13px] leading-relaxed text-stone-600 shadow-md');
    const gradient = RAMP_STOPS.map(([t, c]) => `${c} ${Math.round(t * 100)}%`).join(', ');
    // 時速4km換算（分→m）をbudgetに対する割合にして、バーの目盛り位置にする。
    const pct = (minutes: number) => Math.min(100, ((minutes * (4000 / 60)) / budget) * 100);
    // 15分の目盛りはpct=100%になり得る（budgetちょうどか、それを超える換算距離）。
    // 目盛りのspanはabsolute+leftのみでwidthを指定していないため、shrink-to-fit幅は
    // 「コンテナ幅－left」で決まる。left=100%だとその値が0になり、幅の下限は
    // 最小単語幅まで縮む——だが日本語はどの文字の間でも折り返せるので「最小単語」＝
    // 1文字になり、「15分」が1文字ずつ縦に積まれる。whitespace-nowrapで折り返し
    // そのものを禁止して直す（幅の計算結果に関わらず1行を強制する）。
    //
    // 目盛りは -translate-x-1/2 でleft位置に中央揃えする。中間の目盛りはこれで
    // 正しく中央に来るが、両端（left:0%/100%）だとラベルの中心が目盛りぴったりに
    // 来て、幅の半分がバーの外にはみ出す。それ自体はバー上の位置としては正しいが、
    // 見た目上「右にずれて」見え、収まる余白がないと凡例カードの端で詰まる。
    // 目盛り行を余白付きラッパーで包み、行自体の幅・left%の基準（w-40）は変えずに
    // ラッパーだけ左右に広げることで、はみ出す半分を空白側に逃がす。
    // （行そのものにpx-*を足しても効果はない——border-box固定幅では
    // padding分だけcontent areaが狭くなるだけで、絶対配置の基準となる
    // padding boxの幅＝要素の外形幅は変わらないため、はみ出す余白は増えない。）
    //
    // スウォッチの高さ（10px/4px、比は5:2＝BASE_WEIGHT/STEEP_WEIGHTと同じ）は、
    // 凡例を読みやすく拡大したときも地図上の実際の太さ比と揃えるためのもの。
    // Tailwindのクラス抽出は文字列補間を追えないため値をリテラルで書いている。
    // 両定数を変えたらここも手で合わせる。
    div.innerHTML = `
      <p class="font-semibold text-stone-800">徒歩の距離(時速4km)</p>
      <div class="mt-3 px-4">
        <div class="h-3 w-40 rounded-full" style="background:linear-gradient(to right, ${gradient})"></div>
        <div class="relative mt-1.5 h-4 w-40 text-[12px] text-stone-500">
          ${[5, 10, 15].map(m => `<span class="absolute -translate-x-1/2 whitespace-nowrap" style="left:${pct(m)}%">${m}分</span>`).join('')}
        </div>
      </div>
      <p class="mt-3 font-semibold text-stone-800">急な坂道</p>
      <div class="mt-2 flex items-center gap-2">
        <i class="relative inline-block h-[10px] w-10 shrink-0 rounded-full" style="background:${rampColor(0.5)}">
          <span class="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full" style="background:${STEEP_TIERS[0].color}"></span>
        </i>
        <span>勾配5%以上</span>
      </div>
      <div class="mt-1.5 flex items-center gap-2">
        <i class="relative inline-block h-[10px] w-10 shrink-0 rounded-full" style="background:${rampColor(0.5)}">
          <span class="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full" style="background:${STEEP_TIERS[1].color}"></span>
        </i>
        <span>勾配8%以上</span>
      </div>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  return control;
}

export function useWalkingData() {
  const [facilities, setFacilities] = useState<ShoppingFeature[] | null>(null);
  const [unreachable, setUnreachable] = useState<Record<string, number | null> | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError(false); setFacilities(null);
    fetch(`${import.meta.env.BASE_URL}data/shopping.geojson`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw Error('unavailable'); return r.json(); })
      .then((shopping: ShoppingCollection) => {
        if (shopping.type !== 'FeatureCollection' || !Array.isArray(shopping.features)) throw Error('Invalid facilities');
        const usable = shopping.features.filter(f => f.geometry && ['Point', 'MultiPolygon'].includes(f.geometry.type));
        if (!abort.signal.aborted) setFacilities(usable);
      }).catch(() => { if (!abort.signal.aborted) setError(true); });
    // Best-effort: this only sharpens the "no catchment" message, so a failure here
    // must not trip the facilities error/retry UI. Leave `unreachable` null on any problem.
    fetch(`${import.meta.env.BASE_URL}data/walk-unreachable.json`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw Error('unavailable'); return r.json(); })
      .then((data: { stops?: Record<string, number | null> }) => {
        if (!abort.signal.aborted && data && typeof data.stops === 'object') setUnreachable(data.stops);
      }).catch(() => {});
    return () => abort.abort();
  }, [attempt]);
  return { facilities, unreachable, error, retry: () => setAttempt(n => n + 1) };
}

/**
 * Stops within this many metres of a walkable road read as "just missed the
 * snap threshold" (position/road-data noise); beyond it, as "nothing nearby".
 * 150m = 5x the 30m snap_limit — roughly a short block, and where the 289
 * unreachable stops' distance distribution stops looking like noise and
 * starts looking like a real gap (30-200m: 232 stops bunched near the
 * threshold; 200m+: 57 stops trailing off toward "not found").
 */
const NEARBY_ROAD_LIMIT_M = 150;
const GENERIC_NO_CATCHMENT_MESSAGE = 'この停留所と歩ける道路の接続を確認できませんでした。別の停留所をお試しください。';

function noCatchmentMessage(distance: number | null | undefined): string {
  if (distance === undefined) return GENERIC_NO_CATCHMENT_MESSAGE;
  if (distance === null || distance > NEARBY_ROAD_LIMIT_M) return 'この停留所の近くに歩ける道路が見つかりませんでした。別の停留所をお試しください。';
  return `この停留所から最も近い歩ける道路まで約${Math.round(distance)}mありました（自動判定の基準は30m）。停留所の位置や道路データのわずかなずれによるものと考えられます。別の停留所をお試しください。`;
}

/**
 * 選択中のバス停の徒歩圏だけを取りに行く。焼いていない停留所（道路まで30m超）は
 * 404になる想定で、それは「未対応」であって「エラー」ではない。
 */
function useCatchment(id: string) {
  const [state, setState] = useState<{ catchment: Catchment | null; loading: boolean; error: boolean }>({ catchment: null, loading: true, error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setState({ catchment: null, loading: true, error: false });
    fetch(`${walkDataBaseUrl()}${catchmentFile(id)}`, { signal: abort.signal })
      .then(r => {
        if (r.status === 404) return null;
        if (!r.ok) throw Error('Walking catchment unavailable');
        return r.json();
      })
      .then(raw => { if (!abort.signal.aborted) setState({ catchment: raw ? parseCatchment(raw) : null, loading: false, error: false }); })
      .catch(() => { if (!abort.signal.aborted) setState({ catchment: null, loading: false, error: true }); });
    return () => abort.abort();
  }, [id, attempt]);
  return { ...state, retry: () => setAttempt(n => n + 1) };
}

export default function WalkingPanel({ map, id, origin, facilities, unreachable, error, retry }: {
  map: L.Map | null; id: string; origin: Coordinate;
  facilities: ShoppingFeature[] | null; unreachable: Record<string, number | null> | null; error: boolean; retry: () => void;
}) {
  const { catchment, loading, error: catchmentError, retry: retryCatchment } = useCatchment(id);
  const steepSummary = useMemo(() => catchment ? steepRuns(catchment.segments, catchment.budget) : null, [catchment]);

  useEffect(() => {
    if (!map || !catchment) return;
    // paneは地図の生存期間ずっと存在してよい静的な入れ物（中身が無ければ何も
    // 描画せず無害）。LeafletにremovePane相当の公開APIが無く、私的フィールドを
    // 触ってまで消す理由がないので、消すのは中身（スクリム矩形）だけにする。
    ensureScrimPane(map);
    const group = L.layerGroup().addTo(map);
    const toLatLng = (line: Coordinate[]) => line.map(([lon, lat]) => L.latLng(lat, lon));

    // スクリムは徒歩圏を見せている間だけ地図を覆う。groupに入れているので、
    // このeffectの後始末（group.remove()）で他のレイヤーと同時に消える。
    L.rectangle(L.latLngBounds([-90, -180], [90, 180]), {
      pane: SCRIM_PANE, stroke: false, fillColor: '#ffffff', fillOpacity: SCRIM_OPACITY, interactive: false,
    }).addTo(group);

    for (const { color, lines } of bucketSegments(catchment)) {
      L.polyline(lines.map(toLatLng), { color, weight: BASE_WEIGHT, opacity: 0.9, interactive: false }).addTo(group);
    }
    if (steepSummary) {
      // 5%はバリアフリー道路の縦断勾配の上限、8%は手動車いすの自走限界の目安。
      // 色相の違いだけで2階層を区別する（太さは共通）。
      for (const { color, lines } of groupSteepPieces(steepSummary.pieces)) {
        L.polyline(lines.map(toLatLng), { color, weight: STEEP_WEIGHT, lineCap: 'round', opacity: 1, interactive: false }).addTo(group);
      }
    }
    L.polyline(toLatLng([origin, catchment.snap]), { color: '#334155', weight: 3, dashArray: '3 5', interactive: false }).addTo(group);
    L.circleMarker([origin[1], origin[0]], { radius: 10, fillColor: '#174f9d', fillOpacity: 1, color: 'white', weight: 3, interactive: false }).addTo(group);
    const legend = createLegendControl(catchment.budget);
    legend.addTo(map);
    return () => { group.remove(); legend.remove(); };
  }, [map, catchment, origin, steepSummary]);

  useEffect(() => {
    if (!map || !catchment) return;
    const points = catchment.segments.flatMap(s => [s.a, s.b]).map(([lon, lat]) => L.latLng(lat, lon));
    if (!points.length) return;
    const mobile = window.matchMedia('(max-width: 600px)').matches;
    const bounds = L.latLngBounds(points).extend([origin[1], origin[0]]);
    map.fitBounds(bounds, { paddingTopLeft: [30, 112], paddingBottomRight: mobile ? [30, Math.min(window.innerHeight * 0.48, 430) + 25] : [420, 65], maxZoom: 17, animate: false });
  }, [map, id, catchment]);

  if (error) return <section className="walking-panel mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
    <p className="text-sm">徒歩圏のデータを読み込めませんでした。</p><button className="mt-3 min-h-11 rounded-lg border bg-white px-4 text-sm" onClick={retry}>再読み込み</button>
  </section>;
  if (!facilities) return <p className="mb-6 text-sm" role="status">徒歩圏を準備しています…</p>;

  return <section className="walking-panel mb-7" aria-labelledby="walk-title">
    <h3 id="walk-title" className="text-lg font-bold">ここから歩いて行ける範囲</h3>
    <p className="mt-2 text-xs leading-relaxed text-stone-600">道路に沿った徒歩距離の目安です。色の説明は地図の凡例をご覧ください。</p>
    {catchmentError ? <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
      <p className="text-sm">徒歩圏のデータを読み込めませんでした。</p><button className="mt-3 min-h-11 rounded-lg border bg-white px-4 text-sm" onClick={retryCatchment}>再読み込み</button>
    </section> : loading ? <p className="mt-4 text-sm" role="status">徒歩圏を準備しています…</p> : <>
      {!catchment ? <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm" role="status">{noCatchmentMessage(unreachable?.[id])}</p> : (
        // ponytail: 買い物候補（reachFacility・坂/階段の警告・候補カード）は
        // facility judgement を実装する後続タスクで戻す。ここはその置き場所。
        null
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-stone-500">信号待ち、工事や現地の横断可否、車いす対応は反映していません。坂は地形データからの概算です。現地の通行状況を確認してください。</p>
      <a className="mt-2 inline-block text-[11px] text-sky-800 underline" href={`${import.meta.env.BASE_URL}about.html#walking`}>計算方法とデータについて</a>
    </>}
  </section>;
}
