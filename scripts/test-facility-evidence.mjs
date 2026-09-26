import test from 'node:test';
import assert from 'node:assert/strict';
import {placePosition, evidenceCsv} from './facility-evidence-lib.mjs';

test('short maps URL uses place data, not viewport', () => {
  const p = placePosition('https://maps.app.goo.gl/test', {final_url:'https://www.google.com/maps/place/Test+Shop/@35.111,132.222,16z/data=!3d34.0123!4d131.4567'});
  assert.deepEqual(p, {name:'Test Shop', coordinates:[131.4567,34.0123], method:'place_url_data_not_viewport'});
  assert.equal(placePosition('https://maps.app.goo.gl/test', {final_url:'https://www.google.com/maps/@35.111,132.222,16z'}), null);
});

test('embed lookup binds the explicit place identifier', () => {
  const url = 'https://www.google.com/maps/embed?pb=!1s0xaa:0xbb';
  const p = placePosition(url, {html:'["0xcc:0xdd","Wrong place",[32.1,130.1]],["0xaa:0xbb","Shop",[34.0123,131.4567]]'});
  assert.deepEqual(p?.coordinates,[131.4567,34.0123]);
  assert.equal(placePosition(url, {html:'["0xcc:0xdd","Wrong place",[32.1,130.1]]'}),null);
  assert.equal(placePosition(url, {error:'failed'}),null);
});

test('CSV preserves nested identities, commas, quotes and newlines', () => {
  const csv = evidenceCsv([{id:'a', candidates:[{id:'store-1',name:'x,"y"\nz'}]}],['id','candidates']);
  assert(csv.includes('store-1'));
  assert(csv.includes('""name""'));
  assert(!csv.includes('[object Object]'));
  assert(csv.startsWith('\ufeff'));
  assert(evidenceCsv([{title:' =1+1'}],['title']).includes("' =1+1"));
});
