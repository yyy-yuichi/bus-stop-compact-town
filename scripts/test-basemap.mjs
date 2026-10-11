import fs from 'node:fs';
import assert from 'node:assert/strict';
import { STANDARD_BASEMAP, MAP_OPTIONS } from '../src/mapConfig.ts';

// Preserve the previously published standard background and its source credit.
assert.equal(STANDARD_BASEMAP.url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
assert.equal(STANDARD_BASEMAP.maxZoom, 19);
assert.equal(STANDARD_BASEMAP.maxZoom, MAP_OPTIONS.maxZoom);
assert.equal(STANDARD_BASEMAP.attribution, '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors');
assert(fs.readFileSync('public/about.html', 'utf8').includes('https://www.openstreetmap.org/copyright'));
console.log('Published standard OpenStreetMap background, zoom range and attribution preserved.');
