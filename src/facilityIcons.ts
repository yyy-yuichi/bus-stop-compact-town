import type { ShoppingCategory } from './shoppingData';

export const FACILITY_ICON_PATHS: Record<ShoppingCategory, string[]> = {
  supermarket: ['m8 3-4 6m12-6 4 6M2 9h20l-2 11H4L2 9Z', 'M8 12v5m4-5v5m4-5v5'],
  drugstore: ['m9 5-4 4a6 6 0 0 0 8 8l4-4a6 6 0 0 0-8-8Z', 'm7 7 10 10'],
  convenience: ['M4 10v10h16V10M3 10l2-6h14l2 6H3Z', 'M9 20v-6h6v6M7 4l-1 6m5-6v6m4-6v6m2-6 1 6'],
  mall: ['M4 8h16l1 13H3L4 8Z', 'M8 8V6a4 4 0 0 1 8 0v2'],
  hospital: ['M5 21V3h14v18M9 21v-5h6v5', 'M12 6v6M9 9h6'],
  clinic: ['M7 3v6a5 5 0 0 0 10 0V3M5 3h4m6 0h4', 'M12 14v2a4 4 0 0 0 8 0v-2', 'M18 11h4v3h-4Z'],
  pharmacy: ['M4 8h16v13H4V8ZM7 3h10v5H7V3Z', 'M12 11v7m-3-3.5h6'],
  post_office: ['M3 5h18v14H3V5Z', 'm3 5 9 8 9-8'],
  bank: ['m3 7 9-5 9 5H3ZM3 21h18M5 10v8m7-8v8m7-8v8'],
  library: ['M12 5C8 2 5 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-6-2-10 1Z', 'M12 5v15'],
  townhall: ['M4 21V8h16v13M2 21h20M8 8V3h8v5M10 21v-5h4v5', 'M8 11v1m8-1v1M12 5v1'],
  community_centre: ['m2 11 10-8 10 8M5 9v12h14V9M10 21v-6h4v6'],
  restaurant: ['M5 3v6m3-6v6M2 3v6h6M5 9v12M18 21V3c-4 3-4 9 0 9'],
  cafe: ['M3 7h13v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V7ZM16 8h2a3 3 0 0 1 0 6h-2M2 22h17M7 2v2m5-2v2'],
  fast_food: ['M3 10a9 7 0 0 1 18 0H3ZM2 14h20M3 18h18v3H3v-3Z'],
  bar: ['M4 3h16L12 13 4 3ZM12 13v8M7 21h10'],
  bakery: ['M5 20V10C0 4 8 1 12 4c4-3 12 0 7 6v10H5Z', 'M8 10v6m4-6v6m4-6v6'],
  food_shop: ['M4 10h16l-2 11H6L4 10Z', 'M8 10 10 3m6 7-2-7M9 14v3m6-3v3'],
  dentist: ['M12 5C3-2 2 9 6 13c0 10 4 10 6 1 2 9 6 9 6-1 4-4 3-15-6-8Z'],
  childcare: ['M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0ZM8 11h1m6 0h1M8 16c2 2 6 2 8 0M12 4c-3-4 4-4 2 0'],
  school: ['M3 21V9h18v12M8 9V5l4-3 4 3v4M10 21v-6h4v6M6 12v2m12-2v2'],
  college: ['m2 8 10-5 10 5-10 5L2 8ZM6 10v7c4 3 8 3 12 0v-7M22 8v10'],
  park: ['m12 2-7 8h3l-5 7h18l-5-7h3L12 2ZM12 17v5'],
  playground: ['M3 21 8 3h8l5 18M8 3l5 18M13 21h8M9 7h5M8 12h4M7 17h4'],
  sports_centre: ['M5 4v16M2 8v8M19 4v16M22 8v8M5 12h14'],
  social_facility: ['M12 20 3 11C-1 4 8-1 12 6c4-7 13-2 9 5l-9 9Z'],
  laundry: ['M3 2h18v20H3V2ZM3 6h18M7 4h1m3 0h1M12 9a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM7 14c4 3 6-3 10 0'],
  hairdresser: ['M7 14 20 3M7 10l13 11M6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  reference: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 11v6m0-10v1'],
};

// Only constant paths and attributes enter the Leaflet icon markup.
export function facilityIconMarkup(category: ShoppingCategory): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FACILITY_ICON_PATHS[category].map(d => `<path d="${d}"/>`).join('')}</svg>`;
}
