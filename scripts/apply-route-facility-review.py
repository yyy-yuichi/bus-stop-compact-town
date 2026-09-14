"""Apply four narrowly scoped official-source reviews, retaining IDs and geometry."""
from pathlib import Path
import json,copy
from route_facility_review import apply_reviewed_facilities, load_review
ROOT=Path(__file__).resolve().parents[1]
review=load_review()
path=ROOT/'public/data/shopping.geojson';data=apply_reviewed_facilities(json.loads(path.read_bytes()),review)
by_id={f['id']:f for f in data['features']}
assert len(by_id)==len(data['features'])==5065
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
# The pilot page carries a small, self-contained set of references, without loading the whole catalog.
profiles={'checkedAt':review['checkedAt'],'store':copy.deepcopy(by_id['osm-node-4354872989']),'school':copy.deepcopy(by_id['osm-way-353969790']),'hospital':review['hospitalProfile']}
(ROOT/'public/data/route-living-facilities.json').write_text(json.dumps(profiles,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('4 source reviews applied; 5065 IDs retained; geometry unchanged')
