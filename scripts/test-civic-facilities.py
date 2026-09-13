"""Verify official-source joins, attribution and retained-data reproducibility."""
import importlib.util
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('civic', Path(__file__).with_name('import-civic-facilities.py'))
civic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(civic)


class CivicFacilitiesTest(unittest.TestCase):
    def test_distance_and_area_holes(self):
        a = [131.5, 34]
        inside = [131.5, 34 + 24 / 111195]
        outside = [131.5, 34 + 26 / 111195]
        self.assertTrue(civic.same_location(inside, {'type': 'Point', 'coordinates': a}))
        self.assertFalse(civic.same_location(outside, {'type': 'Point', 'coordinates': a}))
        box = [[131, 33], [132, 33], [132, 35], [131, 35], [131, 33]]
        hole = [[131.4, 33.9], [131.6, 33.9], [131.6, 34.1], [131.4, 34.1], [131.4, 33.9]]
        shape = {'type': 'MultiPolygon', 'coordinates': [[box, hole]]}
        self.assertFalse(civic.same_location(a, shape))
        self.assertTrue(civic.same_location([131.8, 34], shape))

    def test_every_row_and_reproducible_output(self):
        generated, report = civic.build()
        saved = json.loads((civic.ROOT / 'public/data/civic-facilities.geojson').read_text(encoding='utf-8'))
        self.assertEqual(generated, saved)
        self.assertEqual(report['counts'], {'added': 2699, 'duplicate': 126, 'excluded': 1, 'merged': 404})
        by_id = {f['id']: f for f in generated['features']}
        self.assertEqual(len(by_id), 2699)
        seen = set()
        cache = {}
        for decision in report['rows']:
            filename, number = decision['file'], decision['row']
            self.assertNotIn((filename, number), seen); seen.add((filename, number))
            if filename not in cache:
                cache[filename] = civic.read_source(filename)[0]
            row = cache[filename][number-1]
            if decision['status'] not in ('added', 'merged'):
                continue
            feature = by_id[decision['target']]
            p = feature['properties']
            self.assertEqual(feature['geometry']['coordinates'], [float(row['経度']), float(row['緯度'])])
            self.assertIn(decision['source_id'], p['source_ids'])
            self.assertEqual(p['verification_status'], 'civic_unverified')
            self.assertFalse(p['verified_at'])
            service = row.get('実施サービス')
            if service:
                self.assertIn(service, p['registered_details']['service'])
        self.assertEqual(len(seen), sum(report['raw_counts'].values()))
        self.assertEqual(len(seen), 3230)
        park = next(f['properties'] for f in generated['features'] if f['properties']['name'] == '金輪街区公園')
        self.assertTrue(any(d['label'] == '遊具' and d['value'] == 'すべり台' for d in park['civic_details']))
        self.assertFalse(any(d['label'] == 'トイレ' for d in park['civic_details']), 'Blank source cells do not mean no toilets')
        school = next(f['properties'] for f in generated['features'] if f['properties']['category'] == 'school')
        self.assertEqual(school['source_timestamp'], '2025-11')
        care = next(f['properties'] for f in generated['features'] if f['properties']['source_timestamp'] == '2024-02-01')
        self.assertEqual(care['civic_sources'][0]['publisher'], '山口県')

    def test_safe_urls_and_local_name_identity(self):
        self.assertEqual(civic.safe_url('javascript:alert(1)'), '')
        self.assertEqual(civic.safe_url('https://user:pass@example.org/'), '')
        self.assertEqual(civic.name_key('下松市立豊井小学校', 'school'), civic.name_key('市立豊井小学校', 'school'))
        self.assertNotEqual(civic.name_key('豊井小学校', 'school'), civic.name_key('豊井中学校', 'school'))


if __name__ == '__main__':
    unittest.main()
