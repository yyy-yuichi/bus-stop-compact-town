"""Add reviewed diagram/OSM correspondences, preserving every existing origin.

The explicit manifest is a human-reviewed correspondence, never a proximity join.
"""
import json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'work/western-hubs-20260914'
APP=ROOT/'src/data/boarding-guide-study.json'
def read(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p,d): p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
baseline=WORK/'guide-before-expansion.json'
if not baseline.exists(): baseline.write_bytes(APP.read_bytes())
study=read(baseline)
assert len(study['guides'])==930
walkdir=ROOT/'src/data/boarding-walk-study'
if not (WORK/'walk-before-expansion.json').exists():
    (WORK/'walk-before-expansion.json').write_bytes((walkdir/'index.json').read_bytes())
    write(WORK/'walk-before-hashes.json',{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in walkdir.glob('*.json') if p.name!='index.json'})
nodes={n['id']:n for n in read(WORK/'sources/osm-hubs.json')['elements']}
east='新山口駅・阿知須・宇部中央病院・あすとぴあ・萩原・ときわ公園方面'
airport='丸山公園・山口宇部空港・八王子（フジグラン宇部）方面／市街地循環線・常盤町二丁目止'
north='十文字・木田・琴崎八幡宮・ひらき台・工学部前方面'
west='船木・木田・宇部駅・黒石（ゆめタウン宇部）方面'
cases={
 'ube-shinkawa':{
  'name':'宇部新川駅','city':'宇部市','url':'https://ubebus.jp/pages/54/',
  'notice':'6・7のりばは位置を確認中です。公式案内をご確認ください。',
  'rows':[
   (3640500398,'1',east,'公式図の1→2→3→4→5→降車の並びと、OSMの南東→北西の順序が一致。駅舎と営業所を挟む島の同じ側。'),
   (3640500399,'2',airport+'／めぐりーな','1・3の間。同番号と並びを照合。'),
   (3640500400,'3',north,'2・4の間。同番号と並びを照合。'),
   (3640500401,'4','小羽山経由 宇部駅・交通局／中山観音方面／宇部中央止・市役所前止','3・5の間。同番号と並びを照合。'),
   (3640500402,'5',west.replace('方面','・沖の山方面'),'4の北西側。同番号と並びを照合。6・7の位置は補間しない。'),
   (3640500403,None,'降車専用','OSMの「おりば」記載と、公式図の乗車列端の降車場を照合。6・7とは統合しない。')
  ]},
 'ube-chuo':{'name':'宇部中央','city':'宇部市','url':'https://ubebus.jp/pages/55/',
  'notice':'7・8・9のりばは位置を確認中です。公式案内をご確認ください。',
  'rows':[
   (3640500395,'1',east,'大通りの1→2→3の列のうち、宇部新川駅側。同番号・道路側・順序を照合。'),
   (3640500393,'2',airport,'大通りの1・3の間。同番号・道路側・順序を照合。'),
   (3640475992,'3',north.replace('ひらき台','あすとぴあ・ひらき台'),'大通りの1→2→3の列の市役所前側。同番号・道路側・順序を照合。'),
   (3640475991,'4','小羽山経由 交通局方面','1〜3と道路の反対側、4→5→6の列の市役所前側。同番号と並びを照合。'),
   (3500214597,'5',west,'4・6の間。同番号・道路側・順序を照合。'),
   (3640500394,'6','厚狭・小野田方面','4→5→6の列の宇部新川駅側。同番号・道路側・順序を照合。')
  ]},
 'shin-yamaguchi':{'name':'新山口駅','city':'山口市','url':'https://ubebus.jp/pages/262/',
  'rows':[
   (6282455344,'1','山口宇部空港・宇部新川駅・阿知須方面','北口。OSM原名称「1番乗り場」。線路側の1→2、待合所側の2→3、外周の4→5→6という公式図の配置と6候補点の並びを照合。'),
   (6282455343,'2','秋芳洞・萩方面','北口。OSM原名称「2番乗り場」。線路側、1より待合所寄り。'),
   (6282455342,'3','防府駅・秋穂方面','北口。OSM原名称「3番乗り場」。待合所側、2の線路から離れる側。'),
   (6282455341,'4','維新公園・湯田温泉・県庁・宮野方面','北口。OSM原名称「4番乗り場」。線路と反対側の列、3寄り。'),
   (6282455339,'5','平川・山口大学・県庁・山口駅方面','北口。OSM原名称「5番乗り場」。外周の4・6の間。'),
   (6282455338,'6','長門方面','北口。OSM原名称「6番乗り場」。外周の列の待合所から最も離れた位置。')
  ]}
}
ledger=[]
for case,c in cases.items():
 for nid,number,summary,comparison in c['rows']:
  n=nodes[nid]; sid=f'node/{nid}'; tags=n['tags']; origin=[n['lon'],n['lat']]
  assert sid not in study['guides']
  if tags.get('local_ref'): assert tags['local_ref']==number
  if case=='shin-yamaguchi': assert tags['name']==number+'番乗り場'
  assert tags.get('public_transport')=='platform' and not tags.get('train')
  role='alighting' if number is None else 'boarding'
  guide={'stop_name':c['name'],'group_id':'hub:'+case,'number':number,'role':role,'summary':summary,
    'directions':[{'route':'公式のりば案内','text':summary,'next_stops':[]}],
    'source_url':f'https://www.openstreetmap.org/node/{nid}','guide_url':c['url'],
    'evidence':'official-diagram-and-osm','source_coordinates':origin,'location_description':comparison}
  if c.get('notice'): guide['data_notice']=c['notice']
  study['guides'][sid]=guide
  study['hub_points'].append({'type':'Feature','id':sid,'geometry':{'type':'Point','coordinates':origin},
   'properties':{'name':tags['name'],'operator':tags.get('operator'),'source_kind':'boarding-study',
    'source_date':'2026-09-14','city':c['city'],'source_url':guide['source_url'],'location_kind':'unverified',
    'source_tags':tags,'source_osm_version':n['version'],'source_osm_timestamp':n['timestamp']}})
  ledger.append({'id':sid,'case':case,'source_coordinates':origin,'original_tags':tags,'number':number,
    'number_tag_present':bool(tags.get('local_ref') or case=='shin-yamaguchi'),'comparison':comparison,'guide_url':c['url'],'field_checked':False})
study['unlocated'] += [{'group_id':'hub:ube-shinkawa','stop_name':'宇部新川駅','number':n,'summary':s,'reason':'公式図にあるが、独立したOSM候補座標なし。補間しない。'} for n,s in [('6','厚狭・小野田方面'),('7','高速バス 福岡・山口ライナー')]]
study['unlocated'] += [{'group_id':'hub:ube-chuo','stop_name':'宇部中央','number':n,'summary':s,'reason':'番号のない候補点はあるが、既知6点を基準にした図の配置と差があり、現行番号との対応を保留。'} for n,s in [('7','大学病院・小羽山経由 宇部駅・交通局方面／めぐりーな・市街地循環線'),('8','八王子・宇部新川駅／山口宇部空港（急行）方面'),('9','宇部新川駅方面')]]
APP.write_text(json.dumps(study,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
write(WORK/'locations.json',ledger)
write(WORK/'source-holds.json',{
 'sentetsu':{'repository_url':'https://api.gtfs-data.jp/v2/organizations/sentetsu/feeds/Sentetsubus/files/feed.zip?uid=3089d77c-c4ce-47cc-88aa-72f6324873fa','status':404,'odpt':'https://ckan.odpt.org/dataset/sentetsu_bus_all_lines','reason':'現行GTFSは登録が必要。配布を確認できた古いデータを現行データとして採用しない。'},
 'tokuyama':{'official_url':'https://www.city.shunan.lg.jp/site/kodomosien/31664.html','reason':'OSMは1〜6の古い配置と番号なしの候補点。公式の1〜8との配置対応を確定できず全候補を保留。','candidate_ids':[n['id'] for n in nodes.values() if n['tags'].get('name','').startswith('徳山駅前')]},
 'ube_chuo_extra':{'candidate_ids':[3500214598,3640500397,3640500396,3640475990],'reason':'番号なし。既知6点の座標→公式図の位置合わせ（作図誤差最大9px）に対し7・8候補は約400px、9候補は約75pxの差がある。名前と大まかな位置のみで対応させず保留。'},
 'shin_yamaguchi_extra':{'candidate_ids':[9412086489,9412086490,3821951558,9691439344],'reason':'別の事業者登録点や停止位置。今回のsurveyの6候補点と統合せず、対応を保留。'}
})
write(WORK/'summary.json',{'preserved_guides':930,'added_guides':len(ledger),'total_guides':len(study['guides']),'by_case':{k:len(c['rows']) for k,c in cases.items()},'unlocated_added':5})
print(json.dumps(read(WORK/'summary.json'),ensure_ascii=False))
