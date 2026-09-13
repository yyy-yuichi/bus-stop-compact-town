/** Keep complex OSM expressions intact; this is a display formatter, not an opening-status engine. */
const days: Record<string, string> = { Mo: '月', Tu: '火', We: '水', Th: '木', Fr: '金', Sa: '土', Su: '日' };
export function openingHours(value: string): { text: string; raw: boolean } {
  if (value === '24/7') return { text: '24時間・年中無休', raw: false };
  const rules = value.split(';').map(v => v.trim());
  const day = '(?:Mo|Tu|We|Th|Fr|Sa|Su)';
  const time = '(?:[01]\\d|2[0-3]):[0-5]\\d';
  const end = '(?:(?:[01]\\d|2[0-3]):[0-5]\\d|24:00)';
  const pattern = new RegExp(`^(${day}(?:-${day})?(?:,${day}(?:-${day})?)*) (${time}-${end}(?:,${time}-${end})*|off)$`);
  if (!rules.length || rules.some(rule => !pattern.test(rule))) return { text: value, raw: true };
  const text = rules.map(rule => {
    const [, weekdays, hours] = rule.match(pattern)!;
    const label = weekdays.replace(/Mo|Tu|We|Th|Fr|Sa|Su/g, d => days[d]).replaceAll('-', '〜').replaceAll(',', '・');
    return label + ' ' + (hours === 'off' ? '休み' : hours.split(',').map(span => {
      const [start, finish] = span.split('-');
      return `${start}〜${finish < start ? '翌日' : ''}${finish}`;
    }).join(' / '));
  }).join(' ／ ');
  return { text, raw: false };
}

/** Never turn service codes, extensions or arbitrary source strings into dial actions. */
export function phoneHref(value: string): string | null {
  const normalized = value.normalize('NFKC').trim();
  if (!/^\+?[\d\s()\-‐‑–—−]+$/.test(normalized)) return null;
  const digits = normalized.replace(/[\s()\-‐‑–—−]/g, '');
  return /^\+?\d{7,15}$/.test(digits) ? `tel:${digits}` : null;
}

const vocabulary: Record<string, Record<string, string>> = {
  cuisine: { japanese: '和食', chinese: '中華', italian: 'イタリア料理', french: 'フランス料理', indian: 'インド料理', korean: '韓国料理', sushi: '寿司', ramen: 'ラーメン', udon: 'うどん', soba: 'そば', noodle: '麺類', curry: 'カレー', burger: 'ハンバーガー', pizza: 'ピザ', chicken: '鶏料理', barbecue: 'バーベキュー', yakiniku: '焼肉', seafood: '魚介料理', steak_house: 'ステーキ', coffee_shop: 'コーヒー', sandwich: 'サンドイッチ', ice_cream: 'アイスクリーム', regional: '郷土料理', cake: 'ケーキ', donut: 'ドーナツ', okonomiyaki: 'お好み焼き', teishoku: '定食' },
  service: { group_home: 'グループホーム', nursing_home: '介護施設', assisted_living: '生活支援付き住居', day_care: '日中のケア', ambulatory_care: '訪問ケア', workshop: '作業所', social_centre: '福祉交流施設', outreach: '訪問支援', shelter: '一時滞在支援', food_bank: 'フードバンク' },
  wheelchair: { yes: '利用可能の登録', limited: '一部利用可能の登録', no: '利用不可の登録', designated: '車いす向け設計の登録' },
  access: { yes: '利用可能の登録', customers: '利用客向け', permissive: '許可に基づく利用', private: '私有・関係者向け', no: '利用不可の登録' },
};
export function detailText(field: string, value: string): string {
  return value.split(';').map(v => vocabulary[field]?.[v.trim()] ?? v.trim()).join('・');
}
