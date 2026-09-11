import type { ShoppingCategory } from './shoppingData';

export const FACILITY_ICON_PATHS: Record<ShoppingCategory, string[]> = {
  supermarket: ['m8 3-4 6m12-6 4 6M2 9h20l-2 11H4L2 9Z', 'M8 12v5m4-5v5m4-5v5'],
  drugstore: ['m9 5-4 4a6 6 0 0 0 8 8l4-4a6 6 0 0 0-8-8Z', 'm7 7 10 10'],
  convenience: ['M4 10v10h16V10M3 10l2-6h14l2 6H3Z', 'M9 20v-6h6v6M7 4l-1 6m5-6v6m4-6v6m2-6 1 6'],
  mall: ['M4 8h16l1 13H3L4 8Z', 'M8 8V6a4 4 0 0 1 8 0v2'],
  hospital: ['M5 21V3h14v18M9 21v-5h6v5', 'M12 6v6M9 9h6'],
  clinic: ['M7 3v6a5 5 0 0 0 10 0V3M5 3h4m6 0h4', 'M12 14v2a4 4 0 0 0 8 0v-2', 'M18 11h4v3h-4Z'],
  pharmacy: ['M4 8h16v13H4V8ZM7 3h10v5H7V3Z', 'M12 11v7m-3-3.5h6'],
};

// Only constant paths and attributes enter the Leaflet icon markup.
export function facilityIconMarkup(category: ShoppingCategory): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FACILITY_ICON_PATHS[category].map(d => `<path d="${d}"/>`).join('')}</svg>`;
}
