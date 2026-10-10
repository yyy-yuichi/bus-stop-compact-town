import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { applyFacilityCurrent } from '../src/facilityFreshness.ts';
import { applyFacilityAudit } from '../src/facilityAudit.ts';
import { applyFacilityContacts, dispensingContactReview } from '../src/facilityContact.ts';

const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const raw = [...read('shopping.geojson').features, ...read('civic-facilities.geojson').features];
const current = read('facility-current.json'), audit = read('facility-audit.json'), contacts = read('facility-contacts.json');
const base = applyFacilityAudit(applyFacilityCurrent(raw, current), audit);
const approved = new Map([
  ['official-mcc-20001805', ['0834-22-9206', 'mhlw-iryou:5:355827']],
  ['official-mcc-20001806', ['0834-62-7000', 'mhlw-iryou:5:3551135']],
  ['official-mcc-20001807', ['0834-36-1115', 'mhlw-iryou:5:3551094']],
  ['official-mcc-20001808', ['0833-72-8881', 'mhlw-iryou:5:355831']],
]);
function invalid(change, pattern) {
  const value = structuredClone(contacts), saved = JSON.stringify(base);
  change(value);
  assert.throws(() => applyFacilityContacts(base, value), pattern);
  assert.equal(JSON.stringify(base), saved, 'Rejected overlay must not partially mutate facilities');
}

test('actual four supplements retain all 8369 original records and all earlier reviews/sources', () => {
  const snapshot = JSON.stringify(base), overlaySnapshot = JSON.stringify(contacts);
  const actual = applyFacilityContacts(base, contacts);
  assert.equal(actual.length, 8369);
  assert.equal(new Set(actual.map(f => f.id)).size, 8369);
  assert.deepEqual(actual.map(f => f.id), base.map(f => f.id));
  let changed = 0;
  for (let i = 0; i < base.length; i++) {
    const before = base[i], after = actual[i];
    if (!approved.has(before.id)) { assert.strictEqual(after, before); continue; }
    changed++;
    assert(!Object.hasOwn(before.properties, 'dispensing_contact'));
    assert(!Object.hasOwn(before.properties, 'phone'));
    assert(!Object.hasOwn(before.properties.registered_details ?? {}, 'phone'));
    assert.strictEqual(after.geometry, before.geometry);
    const restored = { ...after, properties: { ...after.properties } };
    delete restored.properties.dispensing_contact;
    assert.deepEqual(restored, before, `${before.id}: every original property must be preserved`);
    const [phone, registry] = approved.get(before.id);
    assert.equal(after.properties.dispensing_contact.phone, phone);
    assert.equal(after.properties.dispensing_contact.identity.registry_id, registry);
    assert.equal(after.properties.dispensing_contact.source.retrieved_at, '2026-10-08');
    assert.equal(after.properties.dispensing_contact.source.updated_at, null);
    const originalAddition = current.additions.find(f => f.id === before.id);
    assert.deepEqual(before, originalAddition, 'No raw telephone field or original property is filled in');
  }
  assert.equal(changed, 4);
  assert.equal(actual.filter(f => f.properties.audit_review?.map_location?.status === 'unverified').length, 26);
  assert.equal(actual.filter(f => f.properties.audit_review?.map_location?.status === 'different_from_current').length, 1);
  assert.equal(JSON.stringify(base), snapshot);
  assert.equal(JSON.stringify(contacts), overlaySnapshot);
});

test('unknown/duplicate IDs, missing target and duplicate base IDs reject', () => {
  invalid(v => { v.contacts[0].id = 'missing'; }, /Unknown or duplicate/);
  invalid(v => { v.contacts[0].id = 'official-mcc-20001999'; }, /Unknown or duplicate/);
  invalid(v => { v.contacts[3] = structuredClone(v.contacts[0]); }, /Unknown or duplicate/);
  invalid(v => { v.contacts.pop(); }, /Invalid contact overlay/);
  const subset = base.filter(f => f.id !== contacts.contacts[0].id);
  assert.throws(() => applyFacilityContacts(subset, contacts), /Unknown or duplicate/);
  assert.throws(() => applyFacilityContacts([...base, base[0]], contacts), /Duplicate base/);
});

test('identity or geometry drift and unapproved extra changes reject', () => {
  for (const key of ['name', 'city', 'address', 'official_address', 'category']) {
    invalid(v => { v.contacts[0].expected[key] += 'wrong'; }, /source drift/);
  }
  invalid(v => { v.contacts[0].expected.geometry.coordinates[0] += 0.001; }, /source drift/);
  invalid(v => { v.contacts[0].expected.source_ids = ['wrong']; }, /source drift/);
  invalid(v => { v.contacts[0].changes = { name: 'wrong' }; }, /Unknown or duplicate/);
  invalid(v => { v.contacts[0].contact.identity.registry_id = 'mhlw-iryou:5:355831'; }, /Invalid dispensing/);
  invalid(v => { v.contacts[0].contact.identity.source_as_of = '2026-10-08'; }, /Invalid dispensing/);
});

test('existing raw general/dispensing phones and previous supplements are never overwritten', () => {
  const id = contacts.contacts[0].id;
  for (const fields of [
    { phone: '0834-00-0000' }, { 'contact:phone': '0834-00-0000' },
    { registered_details: { phone: ['0834-00-0000'] } },
    { purpose_review: { facts: [{ label: '一般店舗電話', value: '0834-00-0000' }] } },
    { dispensing_contact: null },
  ]) {
    const conflicting = base.map(f => f.id === id ? { ...f, properties: { ...f.properties, ...fields } } : f);
    const saved = JSON.stringify(conflicting);
    assert.throws(() => applyFacilityContacts(conflicting, contacts), /phone conflicts/);
    assert.equal(JSON.stringify(conflicting), saved);
  }
  assert.throws(() => applyFacilityContacts(applyFacilityContacts(base, contacts), contacts), /phone conflicts/);
});

test('unsafe, wrong-facility and unapproved URLs reject', () => {
  for (const url of ['http://example.org/', 'javascript:alert(1)', 'https://user:secret@example.org/',
    'https://example.org/', contacts.contacts[1].contact.source.url, contacts.contacts[0].contact.source.url + '#fragment']) {
    invalid(v => { v.contacts[0].contact.source.url = url; }, /Invalid dispensing/);
  }
  invalid(v => { v.contacts[0].contact.identity.source_url = 'https://example.org/'; }, /Invalid dispensing/);
});

test('malformed telephone values and evidence dates reject without inferred update dates', () => {
  for (const phone of ['', '110', '0834-22-9206 内線1', '0834-22-9206;0834-00-0000', 'tel:0834229206',
    '0834229206', '0000-00-0000', '+81-834-22-9206', '0834-222-9206', '<script>1</script>']) {
    invalid(v => { v.contacts[0].contact.phone = phone; }, /Invalid dispensing/);
  }
  for (const day of ['invalid', '2026-02-30', '2026-10-09']) invalid(v => { v.contacts[0].contact.source.retrieved_at = day; }, /Invalid dispensing/);
  invalid(v => { v.contacts[0].contact.source.updated_at = '2026-10-08'; }, /Invalid dispensing/);
  invalid(v => { v.contacts[0].contact.source.title = ''; }, /Invalid dispensing/);
  invalid(v => { v.checked_at = '2026-09-01'; }, /Invalid dispensing/);
  for (const value of [null, {}, [], { ...contacts, arbitrary: true }]) assert.throws(() => applyFacilityContacts(base, value), /Invalid contact overlay/);
});

test('existing display review keeps dispensing scope, retrieval date and older national identity distinct', () => {
  assert.equal(dispensingContactReview(undefined), undefined);
  for (const item of contacts.contacts) {
    const r = dispensingContactReview(item.contact);
    assert.equal(r.facts[0].label, '調剤電話（運営者掲載）');
    assert.equal(r.facts[0].value, item.contact.phone);
    assert.equal(r.checked_at, '2026-10-08');
    assert(r.facts[1].label.includes('2026-06-01基準'));
    assert(r.gaps.some(text => text.includes('元資料に更新日の表示がありません')));
    assert(r.gaps.some(text => text.includes('一般店舗電話とは区別')));
    assert(r.gaps.some(text => text.includes('新しい時点の確認には数えていません')));
  }
});
