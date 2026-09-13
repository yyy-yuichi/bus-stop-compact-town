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
        reviews = module.load_reviews()['reviews']
        data, skipped = module.build(raw, curated, date, reviews)
        rebuilt, skipped_again = module.build(raw, data, date, reviews)
        self.assertEqual(data, rebuilt)
        self.assertEqual(skipped, skipped_again)
        self.assertEqual(data['features'][:22], curated['features'])
        complete, life_report = module.append_life_facilities(data)
        expanded, report = module.neighborhood_facilities.append_neighborhood(complete, module.build)
        enriched, details = module.neighborhood_facilities.enrich_registered_details(expanded)
        self.assertEqual(enriched, json.loads((module.ROOT/'public/data/shopping.geojson').read_text(encoding='utf-8')))
        self.assertEqual(report['added'], 3138)
        self.assertEqual(expanded['features'][:1927], complete['features'])
        self.assertEqual(details['phone'],477)
        self.assertEqual(details['opening_hours'],526)
        for before, after in zip(expanded['features'],enriched['features']):
            self.assertEqual(before, {**after,'properties':{k:v for k,v in after['properties'].items() if k!='registered_details'}})
        expanded_again, again_report = module.neighborhood_facilities.append_neighborhood(expanded,module.build)
        self.assertEqual(expanded_again,expanded)
        self.assertEqual(again_report['added'],0)
        self.assertEqual(module.neighborhood_facilities.enrich_registered_details(enriched)[0],enriched)
        for feature in enriched['features']:
            p=feature['properties']
            if p['category']=='reference': self.assertNotIn('registered_details',p)
            for source in p.get('registered_details',{}).get('sources',[]):
                self.assertIn(source['source_id'],p['source_ids'])
                self.assertGreaterEqual(source['source_timestamp'],p['source_timestamp'])
        self.assertEqual(report['categories']['reference'],40)
        self.assertEqual(sum(f['properties']['category']=='reference' for f in enriched['features']),54)
        for f in enriched['features']:
            if f['id']=='osm-node-1631268797': self.assertEqual(f['properties']['category'],'reference')
        self.assertEqual(complete['features'][:1135], data['features'])
        self.assertEqual(life_report['added'], 792)
        self.assertEqual(len(complete['features']), len({f['id'] for f in complete['features']}))
        self.assertEqual({f['properties']['category'] for f in complete['features'][1135:]}, {*module.LIFE_CATEGORIES, 'reference'})
        self.assertEqual(life_report['categories']['reference'], 9)
        again, report_again = module.append_life_facilities(complete)
        self.assertEqual(again, complete, 'Reimport must not duplicate existing source IDs')
        self.assertEqual(report_again['added'], 0)
        self.assertEqual(len(data['features']), len({f['id'] for f in data['features']}))
        self.assertEqual({s['kept_id'] for s in skipped if s['reason']=='same_name_node_inside_curated_geometry'}, {'chohu','fuji-yamaguchi'})
        for f in data['features'][22:]:
            self.assertEqual(f['properties']['verified_at'], '')
            self.assertEqual(f['properties']['official_url'], '')
            self.assertEqual(f['properties']['verification_status'], 'osm_unverified')

    def test_life_reviews_preserve_provenance_and_future_notices(self):
        raw = json.loads((module.LIFE_WORK/'osm-life-facilities.json').read_text(encoding='utf-8'))
        retrieval = json.loads((module.LIFE_WORK/'retrieval.json').read_text(encoding='utf-8'))
        original, _ = module.build(raw, {'features':[]}, retrieval['retrieved_at'])
        reviewed, _ = module.append_life_facilities({'features':[]})
        self.assertEqual([f['id'] for f in original['features']], [f['id'] for f in reviewed['features']])
        for before, after in zip(original['features'], reviewed['features']):
            self.assertEqual(before['geometry'], after['geometry'])
            self.assertEqual({k:v for k,v in before['properties'].items() if k not in ('category','classification_review')},
                             {k:v for k,v in after['properties'].items() if k not in ('category','classification_review')})
        records = {f['id']:f['properties'] for f in reviewed['features']}
        for identifier in ('osm-node-3167525162', 'osm-node-1423655705', 'osm-node-13062819745', 'osm-node-3987366363'):
            self.assertEqual(records[identifier]['category'], 'reference')
        for identifier in ('osm-node-1423658620', 'osm-node-1423656068'):
            self.assertEqual(records[identifier]['category'], 'post_office', 'Future changes must not alter current candidates')
            self.assertEqual(records[identifier]['classification_review']['status'], 'retained')

    def test_reviews_preserve_every_id_geometry_and_original_provenance(self):
        raw = json.loads((module.WORK/'osm-facilities.json').read_text(encoding='utf-8'))
        curated = json.loads((module.WORK/'curated-facilities.geojson').read_text(encoding='utf-8'))
        date = json.loads((module.WORK/'retrieval.json').read_text(encoding='utf-8'))['retrieved_at']
        baseline, _ = module.build(raw, curated, date)
        reviewed, _ = module.build(raw, curated, date, module.load_reviews()['reviews'])
        self.assertEqual([f['id'] for f in baseline['features']], [f['id'] for f in reviewed['features']])
        for before, after in zip(baseline['features'], reviewed['features']):
            self.assertEqual(before['geometry'], after['geometry'])
            self.assertEqual({k:v for k,v in before['properties'].items() if k not in ('name','category','classification_review')},
                             {k:v for k,v in after['properties'].items() if k not in ('name','category','classification_review')})
        records = {f['id']:f['properties'] for f in reviewed['features']}
        self.assertEqual(records['osm-node-7037775362']['category'], 'reference')
        self.assertEqual(records['osm-way-579745077']['classification_review']['status'], 'pending')
        self.assertEqual(records['osm-node-12383832808']['category'], 'clinic')
        self.assertEqual(records['osm-way-1228233757']['category'], 'drugstore')
        self.assertEqual(records['osm-way-1228233757']['name'], 'ドラッグストアモリ 防府新田店')
        self.assertIn('2023年12月23日OPEN', records['osm-way-1228233757']['search_names'])

    def test_reviews_fail_closed_on_changed_or_missing_records(self):
        feature = {'id':'osm-node-1', 'properties':{'name':'original','category':'hospital'}}
        review = {'id':'osm-node-1','expected_name':'other','expected_category':'hospital','category':'clinic'}
        with self.assertRaisesRegex(ValueError, 'no longer matches'):
            module.apply_reviews([feature], [review])
        with self.assertRaisesRegex(ValueError, 'absent reviewed ID'):
            module.apply_reviews([], [review])

    def test_source_bytes_match_the_acquired_response(self):
        import hashlib
        digest = hashlib.sha256((module.WORK/'osm-facilities.json').read_bytes()).hexdigest()
        self.assertEqual(digest, module.load_reviews()['source_sha256'])
        self.assertEqual(digest, json.loads((module.WORK/'retrieval.json').read_text(encoding='utf-8'))['sha256'])

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

class NeighborhoodTests(unittest.TestCase):
    def test_closed_area_validation(self):
        helper=module.neighborhood_facilities
        shape={'type':'way','geometry':[{'lon':x,'lat':y} for x,y in [(131,34),(131.01,34),(131,34.01),(131,34)]]}
        self.assertEqual(helper.closed_area(shape)['type'],'MultiPolygon')
        self.assertIsNone(helper.closed_area({**shape,'type':'relation'}))
        self.assertIsNone(helper.closed_area({**shape,'geometry':shape['geometry'][:-1]}))
        self.assertIsNone(helper.closed_area({'type':'way','geometry':[{'lon':131,'lat':34}]*4}))
        self.assertIsNone(helper.closed_area({'type':'way','geometry':[{}, {}, {}, {}]}))

    def test_dedup_retains_sources_and_area_and_old_records(self):
        from unittest.mock import patch
        import copy
        helper=module.neighborhood_facilities
        elements=[{'type':'node','id':1,'lon':131.005,'lat':34.005,'tags':{'name':'テスト公園','leisure':'park'}},
                  {'type':'way','id':2,'bounds':{'minlon':131,'minlat':34,'maxlon':131.01,'maxlat':34.01},'tags':{'name':'テスト公園','leisure':'park'},'geometry':[{'lon':x,'lat':y} for x,y in [(131,34),(131.01,34),(131.01,34.01),(131,34.01),(131,34)]]},
                  {'type':'node','id':3,'lon':131.1,'lat':34.1,'tags':{'name':'テスト公園','leisure':'park'}},
                  {'type':'node','id':4,'lon':131.2,'lat':34.2,'tags':{'name':'旧テスト学校','amenity':'school'}}]
        raw={'elements':elements,'osm3s':{'timestamp_osm_base':'2026-07-24T00:00:00Z'}}
        before=copy.deepcopy(raw)
        with patch.object(helper,'load_source',return_value=(raw,{'retrieved_at':'2026-09-14','sha256':'fixture'})):
            result,report=helper.append_neighborhood({'type':'FeatureCollection','features':[]},module.build)
        self.assertEqual(raw,before)
        records={f['id']:f for f in result['features']}
        self.assertEqual(len(records),3)
        self.assertEqual(records['osm-way-2']['properties']['source_ids'],['way/2','node/1'])
        self.assertEqual(records['osm-way-2']['geometry']['type'],'MultiPolygon')
        self.assertEqual(records['osm-node-4']['properties']['category'],'reference')
        self.assertEqual(report['skipped'][0]['kept_id'],'osm-way-2')

if __name__ == '__main__': unittest.main()
