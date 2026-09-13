import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validateStyleMin} from '@maplibre/maplibre-gl-style-spec';
const style=JSON.parse(fs.readFileSync('public/maps/soft.json','utf8'));
assert.deepEqual(validateStyleMin(style).map(e=>e.message),[]);
console.log(`Basemap style valid: ${style.layers.length} layers.`);
