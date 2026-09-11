import importlib.util, json, unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('importer', Path(__file__).with_name('import-osm-facilities.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ImportTests(unittest.TestCase):
    def test_category_distinctions(self):
        self.assertEqual(module.category({'shop':'chemist','amenity':'pharmacy'}), 'drugstore')
        self.assertEqual(module.category({'amenity':'pharmacy'}), 'pharmacy')
        self.assertEqual(module.category({'healthcare':'doctor'}), 'clinic')
        self.assertEqual(module.category({'amenity':'hospital'}), 'hospital')
        self.assertIsNone(module.category({'amenity':'restaurant'}))

    def test_only_safe_websites(self):
        for url in ('javascript:alert(1)', 'data:text/html,test', 'https://user:secret@example.com/', '//example.com', 'https://[bad'):
            self.assertEqual(module.safe_website(url), '')
        self.assertEqual(module.safe_website('https://example.com/shop/'), 'https://example.com/shop/')

    def test_import_is_reproducible_and_curated_unchanged(self):
        raw = json.loads((module.WORK/'osm-facilities.json').read_text(encoding='utf-8'))
        curated = json.loads((module.WORK/'curated-facilities.geojson').read_text(encoding='utf-8'))
        date = json.loads((module.WORK/'retrieval.json').read_text(encoding='utf-8'))['retrieved_at']
        data, skipped = module.build(raw, curated, date)
        rebuilt, skipped_again = module.build(raw, data, date)
        self.assertEqual(data, rebuilt)
        self.assertEqual(skipped, skipped_again)
        self.assertEqual(data['features'][:22], curated['features'])
        self.assertEqual(data, json.loads((module.ROOT/'public/data/shopping.geojson').read_text(encoding='utf-8')))
        self.assertEqual(len(data['features']), len({f['id'] for f in data['features']}))
        self.assertEqual({s['kept_id'] for s in skipped if s['reason']=='same_name_node_inside_curated_geometry'}, {'chohu','fuji-yamaguchi'})
        for f in data['features'][22:]:
            self.assertEqual(f['properties']['verified_at'], '')
            self.assertEqual(f['properties']['official_url'], '')
            self.assertEqual(f['properties']['verification_status'], 'osm_unverified')

    def test_unnamed_inactive_and_private_are_excluded(self):
        raw = {'osm3s':{'timestamp_osm_base':'2026-01-01T00:00:00Z'}, 'elements':[
            {'type':'node','id':i,'lat':34,'lon':131,'tags':tags}
            for i,tags in enumerate([{'shop':'supermarket'}, {'shop':'supermarket','name':'閉店','disused':'yes'}, {'amenity':'clinic','name':'内部専用','access':'private'}])]}
        data, skipped = module.build(raw, {'features':[]}, '2026-01-01')
        self.assertEqual(data['features'], [])
        self.assertEqual(len(skipped), 3)

    def test_duplicate_requires_same_name_and_actual_containment(self):
        geometry = {'type':'MultiPolygon','coordinates':[[[[130,33],[132,33],[132,35],[130,35],[130,33]],[[130.8,33.8],[131.2,33.8],[131.2,34.2],[130.8,34.2],[130.8,33.8]]]]}
        f = {'geometry':geometry}
        self.assertTrue(module.inside_curated([130.5,33.5], f))
        self.assertFalse(module.inside_curated([131,34], f))
        self.assertFalse(module.inside_curated([132.1,34], f))

if __name__ == '__main__': unittest.main()
