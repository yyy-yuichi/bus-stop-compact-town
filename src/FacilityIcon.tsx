import type { ShoppingCategory } from './shoppingData';
import { FACILITY_ICON_PATHS } from './facilityIcons';

export default function FacilityIcon({ category }: { category: ShoppingCategory }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{FACILITY_ICON_PATHS[category].map(d => <path key={d} d={d} />)}</svg>;
}
