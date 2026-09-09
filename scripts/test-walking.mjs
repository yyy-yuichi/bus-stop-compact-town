import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCatchment, reachableLines, catchmentFile, distance } from '../src/walking.ts';

const x = 180 / (Math.PI * 6371000);
const seg = (x1, y1, x2, y2, d1, d2, grade = 0, steps = false) => [x1, y1, x2, y2, d1, d2, grade, steps ? 1 : 0];
const collection = (...segments) => ({
  v: 1, id: 'node/1', budget: 1000,
  origin: [0, 0], snap: [0, 0], gap: 0,
  seg: segments,
});

assert.equal(catchmentFile('131.17228_33.98546'), '131.17228_33.98546.json');
// URLを組み立てるので、想定外の形のIDは通さない。
assert.throws(() => catchmentFile('../../etc/passwd'));
assert.throws(() => catchmentFile('131.1/33.9'));

// 全体がバジェット内なら丸ごと残る。
let c = parseCatchment(collection(seg(0, 0, 200 * x, 0, 0, 200)));
assert.equal(reachableLines(c, 200).length, 1);
assert(Math.abs(distance(...reachableLines(c, 200)[0]) - 200) < 0.01);

// 距離場が線形なので、途中で正確に切れる。
let line = reachableLines(c, 100)[0];
assert(Math.abs(distance(...line) - 100) < 0.01, distance(...line));
assert(Math.abs(line[1][0] / x - 100) < 0.01);

// 両端ともバジェット超なら消える。
assert.equal(reachableLines(parseCatchment(collection(seg(0, 0, 10 * x, 0, 500, 510))), 400).length, 0);

// 逆向き（d1 > d2）でも正しく切れる。
line = reachableLines(parseCatchment(collection(seg(0, 0, 200 * x, 0, 200, 0))), 100)[0];
assert(Math.abs(distance(...line) - 100) < 0.01);

// 壊れた入力は受け付けない。
assert.throws(() => parseCatchment({ type: 'X' }));
assert.throws(() => parseCatchment(collection([0, 0, 1, 1, 'a', 1, 0, 0])));
console.log('parseCatchment and reachableLines checks passed.');

// 焼いた結果が満たすべき不変条件を確かめる。
// 事前に `python3 scripts/bake-walking.py --pilot` を実行しておく。
const bakeDir = 'work/pilot-bake';
if (fs.existsSync(bakeDir)) {
  const pilot = JSON.parse(fs.readFileSync('public/data/walking-onoda.json', 'utf8'));
  for (const stop of pilot.pilot_stops) {
    const file = `${bakeDir}/${stop.id.replaceAll('/', '-')}.json`;
    const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const banded = budget => fc.seg.reduce((sum, [x1, y1, x2, y2, d1, d2]) => {
      if (d1 > budget && d2 > budget) return sum;
      const len = distance([x1, y1], [x2, y2]);
      if (d1 <= budget && d2 <= budget) return sum + len;
      return sum + len * Math.min(1, (budget - Math.min(d1, d2)) / Math.abs(d2 - d1));
    }, 0);

    // 帯は広げるほど伸びる。焼いたデータだけで閉じた検査で、現行実装に依存しない。
    const bands = [250, 500, 750, 1000].map(banded);
    for (let i = 1; i < bands.length; i++) {
      assert(bands[i] >= bands[i - 1] - 1e-6, `${stop.name}: 帯が縮んだ ${bands}`);
    }
    assert(bands[0] > 0 && bands[3] > bands[0], `${stop.name}: 帯が広がらない ${bands}`);
    assert(fc.seg.every(([, , , , d1, d2]) => d1 <= fc.budget && d2 <= fc.budget),
      `${stop.name}: バジェットを超える距離が残っている`);
  }
  console.log(`Baked catchment invariants held for ${pilot.pilot_stops.length} stops.`);
} else {
  throw Error('Run `python3 scripts/bake-walking.py --pilot` before the walking tests');
}
