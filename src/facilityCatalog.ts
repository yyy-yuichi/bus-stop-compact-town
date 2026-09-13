import type { ShoppingFeature } from './types';

export const FACILITY_GROUPS = [
  { id: 'shopping', name: '買い物' },
  { id: 'eating', name: '食事・カフェ' },
  { id: 'medical', name: '医療' },
  { id: 'education', name: '子育て・教育' },
  { id: 'leisure', name: '公園・運動' },
  { id: 'services', name: '暮らし・公共施設' },
  { id: 'welfare', name: '福祉' },
] as const;
export type FacilityGroup = typeof FACILITY_GROUPS[number]['id'];
export const SHOPPING_CATEGORIES = [
  { id: 'supermarket', name: 'スーパー', color: '#ae5419', group: 'shopping' },
  { id: 'drugstore', name: 'ドラッグストア', color: '#7959a3', group: 'shopping' },
  { id: 'convenience', name: 'コンビニ', color: '#667d2d', group: 'shopping' },
  { id: 'mall', name: '商業施設', color: '#276b73', group: 'shopping' },
  { id: 'bakery', name: 'パン屋', color: '#a56b36', group: 'shopping' },
  { id: 'restaurant', name: '飲食店', color: '#b56332', group: 'eating' },
  { id: 'cafe', name: 'カフェ・喫茶店', color: '#896440', group: 'eating' },
  { id: 'fast_food', name: 'ファストフード', color: '#a97226', group: 'eating' },
  { id: 'bar', name: '居酒屋・バー', color: '#886078', group: 'eating' },
  { id: 'hospital', name: '病院', color: '#b34a65', group: 'medical' },
  { id: 'clinic', name: '診療所', color: '#9b527e', group: 'medical' },
  { id: 'pharmacy', name: '薬局', color: '#546cb4', group: 'medical' },
  { id: 'dentist', name: '歯科', color: '#427f90', group: 'medical' },
  { id: 'childcare', name: '保育・幼稚園', color: '#9d6b4a', group: 'education' },
  { id: 'school', name: '学校', color: '#5d7997', group: 'education' },
  { id: 'college', name: '大学・高等教育', color: '#58618d', group: 'education' },
  { id: 'park', name: '公園', color: '#558153', group: 'leisure' },
  { id: 'playground', name: '遊び場', color: '#738333', group: 'leisure' },
  { id: 'sports_centre', name: '運動・フィットネス', color: '#397c77', group: 'leisure' },
  { id: 'post_office', name: '郵便局', color: '#ac4f40', group: 'services' },
  { id: 'bank', name: '銀行', color: '#4a6a84', group: 'services' },
  { id: 'library', name: '図書館', color: '#95732a', group: 'services' },
  { id: 'townhall', name: '役所・支所', color: '#477461', group: 'services' },
  { id: 'community_centre', name: '公民館・交流施設', color: '#8b6550', group: 'services' },
  { id: 'laundry', name: '洗濯・クリーニング', color: '#4b7f9a', group: 'services' },
  { id: 'hairdresser', name: '理美容', color: '#9a6186', group: 'services' },
  { id: 'social_facility', name: '福祉施設', color: '#a16069', group: 'welfare' },
] as const;
export type ShoppingCategory = typeof SHOPPING_CATEGORIES[number]['id'] | 'reference';
const REFERENCE_CATEGORY = { id: 'reference', name: '参考施設（対象外・分類保留）', color: '#68716c', group: null } as const;
export const categoryOf = (feature: ShoppingFeature) => SHOPPING_CATEGORIES.find(c => c.id === (feature.properties.category ?? 'mall')) ?? REFERENCE_CATEGORY;
