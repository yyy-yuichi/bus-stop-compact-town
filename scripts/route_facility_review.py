"""Apply official-source corrections after OSM enrichment, without changing geometry."""
from pathlib import Path
import json,copy
ROOT=Path(__file__).resolve().parents[1]
REVIEW=ROOT/'data-sources/route-living-pilot-20260914/facility-review.json'

def load_review():
    return json.loads(REVIEW.read_bytes())

def apply_reviewed_facilities(data, review=None):
    review=review or load_review()
    changes={r['id']:r for r in review['reviews']}
    result={**data,'features':[copy.deepcopy(f) if f['id'] in changes else f for f in data['features']]}
    by_id={f['id']:f for f in result['features']}
    for id,r in changes.items():
        f=by_id[id];p=f['properties']
        assert p['name'] in [r['originalName'],r['name']],id
        original=p.get('classification_review',{}).get('original_category',p['category'])
        p.update({'name':r['name'],'osm_name':r['originalName'],'city':r['city'],'category':r['category'],'official_address':r['address'],'official_url':r['url'],
            'search_names':f"{r['name']} {r['originalName']} {r['city']}",
            'classification_review':{'checked_at':review['checkedAt'],'status':r['status'],'original_category':original,'note':r['note'],'evidence_url':r['url']},
            'purpose_review':{'checked_at':review['checkedAt'],'source_url':r['url'],'source_title':r['title'],'facts':r['facts'],'gaps':r['gaps'],**({'additional_sources':r['additionalSources']} if r.get('additionalSources') else {})}})
    return result
