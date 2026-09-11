from pathlib import Path
from collections import Counter
import csv
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'data-sources/facility-classification-followup-20260912'
research = json.loads((WORK / 'research.json').read_text(encoding='utf-8'))
checks = research['checks']
data = json.loads((ROOT / 'public/data/shopping.geojson').read_text(encoding='utf-8'))
features = {f['id']: f for f in data['features']}
for r in checks:
    f = features[r['id']]
    assert f['geometry']['coordinates'] == r['source_point']
    assert f['properties']['category'] == r['category']
    assert f['properties']['name'] == r.get('name', r['original_name'])
    assert f['properties']['classification_review']['status'] == r['status']
    assert f['properties']['classification_review']['note'] == r['note']

labels = dict(mall='商業施設', supermarket='スーパー', drugstore='ドラッグストア', convenience='コンビニ', hospital='病院', clinic='診療所', pharmacy='薬局', reference='参考表示')
statuses = dict(corrected='修正', out_of_scope='閉店・参考表示', retained='分類維持', pending='保留')
counts = Counter(f['properties']['category'] for f in features.values())
summary = dict(checked_at='2026-09-12', baseline_commit='a5cfb99', reviewed=len(checks), statuses=dict(Counter(r['status'] for r in checks)), categories=dict(counts), normal_records=len(features)-counts['reference'], reference_records=counts['reference'], category_changes=sum(r['before_category'] != r['category'] for r in checks), name_changes=sum(r.get('name',r['original_name']) != r['original_name'] for r in checks), ids_and_positions_preserved=True, merged_or_deleted_records=0, pending_ids=[r['id'] for r in checks if r['status']=='pending'])

fields = ['id', 'original_name', 'current_name', 'before_category', 'after_category', 'status', 'reason', 'evidence_url', 'point_distance_m', 'next_check']
rows = [dict(id=r['id'], original_name=r['original_name'], current_name=r.get('name',r['original_name']), before_category=r['before_category'], after_category=r['category'], status=r['status'], reason=r['note'], evidence_url=r['evidence_url'], point_distance_m=r.get('representative_point_distance_m',''), next_check=r.get('next_check','')) for r in checks]
with (WORK / 'checked-candidates.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=fields,lineterminator='\n'); writer.writeheader(); writer.writerows(rows)
with (WORK / 'checked-candidates.csv').open(encoding='utf-8-sig',newline='') as f:
    assert list(csv.DictReader(f)) == [{k:str(v) for k,v in row.items()} for row in rows]

lines = ['# 分類・名称の保留35件の個別追跡（2026-09-12）','',
    'ローカルcommit `a5cfb99` の候補一覧で保留だった35レコードを1件ずつ点検した。分類・名称の修正19件、公式閉店案内による参考表示2件、薬局分類の維持1件、保留13件。今回の対象35件にはすべて判断理由と参照資料を記録した。保留13件は確定済み件数に含めない。','',
    '分類変更は19レコード（うち参考表示への変更2件）、名称変更は2レコード。通常7分類1,130件＋参考5件＝1,135レコード。重複候補195組は未統合で、国バス停4,418件と既存徒歩圏は変更していない。新しい徒歩圏データは未受領。','',
    '|分類|件数|','|---|---:|']
lines += [f'|{label}|{counts[key]}|' for key,label in labels.items()]
lines += ['', '## 判断の範囲','',
    '原本の店舗名・支店タグ・住所・電話と、運営者や自治体の公開資料を照合した。支店名がない候補は公式地図の代表点も照合し、距離をresearch.jsonへ記録した。代表点の近さは照合の補助であり、入口・建物包含・徒歩距離の証拠ではない。地図座標、ID、既存22件の公式照合記録、OSM未確認という出典区分は維持した。','',
    '調剤併設を確認した上田中町薬局は薬局分類を維持。イオン長府店は原本の調剤ありと公式の受付欄空欄を解消できず保留。宇部厚南店・山口大内店は公式の閉店案内に対応する旧位置を参考表示にし、移転先へ座標を置き換えていない。','',
    '橘病院は町の再編計画に基づき「周防大島町立橘医院」へ名称を修正し、診療所分類を維持。「イオンモール」は原本の住所・電話・公式URLと一致する「イオン防府店」へ修正した。旧名称は既存検索用別名に残る。','',
    'Ryu接骨院の前回理由にあった「柳井付近」は訂正した。原本は光市付近で、公式の浅江1723-1と同住所を示す補助地図の代表点とは約210m離れるため、位置の同一性は保留。補助資料だけのBest・ドラッグセガミ等を確定扱いにしていない。','',
    '## 35件の判断','', '|原本施設・ID|変更前 → 今回|判断と参照資料|', '|---|---|---|']
for r in checks:
    change = labels[r['before_category']] + ' → ' + labels[r['category']]
    if r.get('name'): change += '／名称：' + r['name']
    gap = f" 公式代表点との差{r['representative_point_distance_m']}m。" if 'representative_point_distance_m' in r else ''
    lines.append(f"|{r['original_name']}<br>`{r['id']}`|{change}|**{statuses[r['status']]}**。{r['note']}{gap} [参照資料]({r['evidence_url']})|")
lines += ['', '## 保留13件の次の確認','', '|ID|必要な確認|', '|---|---|']
lines += [f"|`{r['id']}`|{r['next_check']}|" for r in checks if r['status']=='pending']
lines += ['', '## 検証・再現','',
    '施設取込8テスト、全5,560場所の検索・共有リンク、型チェック、施設データ検証、Viteビルド、公開用16ファイルの内容整合を確認。全1,135件のID・形状、既存22件、保存原本SHA-256を維持し、今回35件以外の施設データは変更していない。個別点検表は全セルを読み戻した。新たなブラウザー・実機確認、現地確認は実施していない。','',
    '新しい作業場所のcheckout原本に改行差が残っていたため、指定commitのバイト列と比較し、CRLF差だけであることを確認して取得時の原本へ復元した。原本自体の意味内容・Git blobは変更していない。','',
    '```sh', 'python scripts/apply-classification-followup.py', 'python scripts/import-osm-facilities.py', 'python scripts/audit-facilities.py', 'python scripts/report-classification-followup.py', 'python scripts/test-osm-facilities.py', 'npm run test:places', 'npm run typecheck', 'npm run validate', 'node node_modules/vite/bin/vite.js build --configLoader runner --emptyOutDir false', 'node scripts/verify-release.mjs', '```','',
    '依存関係は既存ローカル環境を再利用し、ビルドは設定の一時ファイルを書かないrunnerを使用した。今回のresearch.json・checked-candidates.csv・summary.json、既存reviews.jsonと生成データが継続作業の入口。Web取得キャッシュは一時作業用であり、正式成果ZIPには含めない。','',
    '## 保存・公開','',
    '成果は同じ案件Driveフォルダへ保存する。保存ID・ローカルcommitはdocs/HANDOFF.mdの「002の施設点検結果」の最新追記を参照。以前の原本一式は[前回source ZIP](https://drive.google.com/file/d/1r8sT0_3U-mmdz-YduTe1LcMzFV1qBZvm/view)にも保存されている。','',
    '公開は保留。mainへの更新・push・Pages操作は行っておらず、引継ぎで示された公開版be5e421から変更していない。以前の自動承認レビュー拒否を迂回していない。','']
(ROOT / 'docs/facility-classification-followup-20260912.md').write_text('\n'.join(lines),encoding='utf-8',newline='\n')
summary['sha256'] = {name:hashlib.sha256((WORK/name).read_bytes()).hexdigest() for name in ['baseline-candidates.json','research.json','checked-candidates.csv']}
(WORK / 'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ('pending_ids','sha256')},ensure_ascii=True))
