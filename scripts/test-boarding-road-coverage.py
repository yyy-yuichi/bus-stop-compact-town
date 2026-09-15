"""Guard missing extraction coverage and changes in OSM pedestrian access."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('boarding', Path(__file__).with_name('bake-boarding-walking.py'))
boarding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boarding)

class RoadCoverageTests(unittest.TestCase):
    def test_kaminoseki_requires_its_walking_area(self):
        targets = [{'id':'upper', 'geometry':{'coordinates':[132.117259,33.834568]}}]
        with self.assertRaisesRegex(ValueError, 'extraction coverage'):
            boarding.require_road_coverage(targets, [[130.8,33.85,132.4,34.55]])
        # Containing just the bus stop must not silently truncate its catchment.
        with self.assertRaises(ValueError):
            boarding.require_road_coverage(targets, [[132.11,33.83,132.12,33.84]])
        boarding.require_road_coverage(targets, [[132.09,33.81,132.15,33.86]])

    def test_current_restriction_replaces_old_walkable_way(self):
        old={'nodes':{'1':[132,34], '2':[132.001,34]},
             'ways':[{'id':'7','refs':['1','2'],'tags':{'highway':'footway'}}]}
        overlay={'bboxes':[[131.9,33.9,132.1,34.1]],'nodes':{'2':[132.002,34],'3':[132.003,34]},
                 'ways':[{'id':'7','refs':['1','2'],'tags':{'highway':'footway','foot':'no'}},
                         {'id':'8','refs':['2','3'],'tags':{'highway':'footway'}}]}
        boarding.apply_road_overlay(old,overlay)
        self.assertEqual([w['id'] for w in old['ways']],['8'])
        self.assertEqual(old['nodes']['2'],[132.002,34])
        self.assertEqual(old['nodes']['1'],[132,34])

    def test_deleted_road_does_not_survive_in_refreshed_area(self):
        old={'nodes':{'1':[132,34],'2':[132.001,34],'3':[131,34],'4':[131.001,34]},
             'ways':[{'id':'deleted','refs':['1','2'],'tags':{'highway':'footway'}},
                     {'id':'outside','refs':['3','4'],'tags':{'highway':'footway'}}]}
        boarding.apply_road_overlay(old,{'bboxes':[[131.99,33.99,132.01,34.01]],'nodes':{},'ways':[]})
        self.assertEqual([w['id'] for w in old['ways']],['outside'])

if __name__=='__main__': unittest.main()
