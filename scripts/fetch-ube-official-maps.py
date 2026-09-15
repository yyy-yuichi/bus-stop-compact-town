"""Read public maps linked by the operator, preserving every original placemark."""
from pathlib import Path
import datetime,hashlib,json,re,urllib.request,xml.etree.ElementTree as ET
R=Path(__file__).resolve().parents[1];D=R/'data-sources/ube-official-maps-20260915';D.mkdir(exist_ok=True)
points=[];receipts=[];ns={'k':'http://www.opengis.net/kml/2.2'}
for page in ['263','54','55','262','56','57','58','59','415','417']:
 url='https://ubebus.jp/pages/'+page+'/';html=D/(page+'.html')
 try:
  if not html.exists():
   with urllib.request.urlopen(url,timeout=30) as r:html.write_bytes(r.read())
  text=html.read_text();maps=re.findall(r'<iframe[^>]+src="([^"]*google.com/maps/d/[^\"]+)"',text)
  receipt={'page_url':url,'html_sha256':hashlib.sha256(html.read_bytes()).hexdigest(),'maps':[]}
  for embedded in maps:
   mid=re.search(r'mid=([^&]+)',embedded).group(1);kml=D/(mid+'.kml');export='https://www.google.com/maps/d/kml?mid='+mid+'&forcekml=1'
   if not kml.exists():
    with urllib.request.urlopen(export,timeout=30) as r:kml.write_bytes(r.read())
   tree=ET.fromstring(kml.read_bytes());receipt['maps'].append({'embed_url':embedded,'export_url':export,'file':kml.name,'sha256':hashlib.sha256(kml.read_bytes()).hexdigest()})
   for i,p in enumerate(tree.findall('.//k:Placemark',ns)):
    coords=p.find('.//k:Point/k:coordinates',ns)
    if coords is None:continue
    name=p.findtext('k:name','',ns);direction=p.findtext('k:description','',ns);coord=[float(v) for v in coords.text.strip().split(',')[:2]]
    points.append({'id':'ube-official-map:'+mid+':'+str(i+1),'source_record_index':i+1,'official_id':p.get('id'),'name':name,'original_coordinates':coord,'direction':direction,'page_url':url,'map_url':embedded,'source_file':kml.name,'number':None,'id_note':'原資料にIDがない場合のローカル資料行ID。公式番号ではない。'})
  if not maps:receipt['limitation']='埋込地図なし。別形式の案内を個別に読む必要がある。'
  receipts.append(receipt);print(page,len(maps),flush=True)
 except Exception as e:receipts.append({'page_url':url,'error':str(e)})
 (D/'inventory.json').write_text(json.dumps({'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'points':points,'receipts':receipts},ensure_ascii=False,indent=2)+'\n')
