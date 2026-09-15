"""Archive the committed source, built distribution, evidence and exact baseline diff."""
from pathlib import Path
import argparse,subprocess,hashlib,json,zipfile
R=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('output',type=Path);p.add_argument('--receipt',type=Path);a=p.parse_args()
commit=subprocess.check_output(['git','rev-parse','--verify','HEAD'],cwd=R,text=True).strip()
assert not subprocess.check_output(['git','diff','--name-only','HEAD'],cwd=R).strip(),'Committed source must be clean'
source=subprocess.check_output(['git','ls-files','-z'],cwd=R).decode().split('\0')
entries={f'site-source/{name}':(R/name).read_bytes() for name in source if name}
entries.update({f'distribution/{f.relative_to(R/"dist")}':f.read_bytes() for f in (R/'dist').rglob('*') if f.is_file()})
entries['changes-from-v16.patch']=subprocess.check_output(['git','diff','ddbca496227ae6b40af0ed921b422c0b42056bba',commit],cwd=R)
if a.receipt:entries['delivery-receipt.json']=a.receipt.read_bytes()
manifest={'commit':commit,'baseline':'ddbca496227ae6b40af0ed921b422c0b42056bba','entries':[{'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()} for name,raw in sorted(entries.items())]}
entries['archive-manifest.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
a.output.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(a.output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for name,raw in entries.items():z.writestr(name,raw)
with zipfile.ZipFile(a.output) as z:
 assert z.testzip() is None
 assert set(z.namelist())==set(entries)
 for name,raw in entries.items():assert z.read(name)==raw,name
result={'file':str(a.output),'bytes':a.output.stat().st_size,'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'entries':len(entries),'all_entries_read_back_and_compared':True,'commit':commit}
a.output.with_suffix('.verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
