"""Summarize actually recorded judgments and walking results, not assumed coverage."""
from pathlib import Path
import collections,datetime,json,subprocess
R=Path(__file__).resolve().parents[1];D=R/'data-sources/prefecture-directed-20260915'
def read(p):return json.loads(p.read_text())
inv=read(D/'inventory.json');app=read(D/'application-verification.json');check=read(D/'source-verification.json');bake=read(D/'bake-receipt.json')
study=read(R/'src/data/boarding-guide-study.json');byid={p['id']:p for p in inv['points']}
states=collections.Counter(p['status'] for p in inv['points']);assert states['未処理']==0
rows=[]
for c in inv['cities']:
 counts=c['states'];rows.append({'city':c['city'],'source_records':c['source_records'],'confirmed':sum(v for k,v in counts.items() if k in ['机上確認済み','既存公式案内確認']),'held':counts.get('保留',0),'unprocessed':counts.get('未処理',0),'new_walking_files':sum(p['state']!='未計算' and byid[p['id']]['city']==c['city'] for p in app['new_walking_results'])})
before=json.loads(subprocess.check_output(['git','show',check['baseline']+':src/data/boarding-guide-study.json'],cwd=R))
changes={'added_guides':[id for id in study['guides'] if id not in before['guides']],'changed_guides':[id for id in before['guides'] if before['guides'][id]!=study['guides'][id]],'removed_guides':[id for id in before['guides'] if id not in study['guides']]}
assert not changes['removed_guides']
existing=[]
for region in ['iwakuni-batch02','iwakuni-remaining','hikari-remaining']:
 existing.extend(p for p in read(R/f'data-sources/{region}-20260915/walking-correspondence.json')['points'] if p['boarding_position_status']=='机上確認済み')
now=datetime.datetime.now(datetime.timezone.utc);start=datetime.datetime.fromisoformat(read(R/'data-sources/iwakuni-batch02-20260915/timing.json')['started_at'])
summary={'municipalities':19,'source_records':inv['unique_source_ids'],'physical_stop_total':None,'confirmed':sum(r['confirmed'] for r in rows),'held':sum(r['held'] for r in rows),'unprocessed_within_acquired_records':sum(r['unprocessed'] for r in rows),'cities':rows,'existing_walking_checks':dict(collections.Counter(p['status'] for p in existing)),'new_walking_attempted':len(app['new_walking_results']),'new_walking_files':sum(p['state']!='未計算' for p in app['new_walking_results']),'new_calculated_zero_facilities_15min':sum(p['state']=='計算済み・施設0件' for p in app['new_walking_results']),'new_uncomputed':sum(p['state']=='未計算' for p in app['new_walking_results']),'active_walking_files':bake['baked'],'baseline_original_files_preserved':949,'guide_changes':changes,'measured_started_at':start.isoformat(),'implementation_verified_at':now.isoformat(),'measured_elapsed_minutes':round((now-start).total_seconds()/60,1),'walking_bake_seconds':bake['seconds'],'browser_ui_checked':False,'physical_field_checked':False,'coverage_limit':'取得済み・今回取得できた資料の全原IDに初回判定を記録。保留は解決ではなく、全県の実在する全乗り場を網羅・確定した意味ではない。'}
(D/'result-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
lines=['# 山口県全19市町・資料別原点の初回照合と徒歩圏整備','',summary['coverage_limit'],'',f"保有資料{summary['source_records']}原ID：資料上確認{summary['confirmed']}、保留{summary['held']}、取得済み資料内の未判定{summary['unprocessed_within_acquired_records']}。出典をまたぐ重複・代表点を含み、現存乗り場総数ではありません。",'', '|市町|対象原ID|資料上確認|保留|未判定|今回の徒歩圏追加|','|---|---:|---:|---:|---:|---:|']
for r in rows:lines.append('|'+ '|'.join(str(r[k]) for k in ['city','source_records','confirmed','held','unprocessed','new_walking_files'])+'|')
lines+=['',f"今回の新しい乗り場案内は{len(changes['added_guides'])}原ID。既存案内{len(changes['changed_guides'])}原IDを今回の照合結果で更新。v17受入済みの照合・v15訂正・原ID座標番号は保持。",'',f"場所・方面の確認後に新しく徒歩圏を試みた{summary['new_walking_attempted']}原点中、{summary['new_walking_files']}ファイルを追加。{summary['new_uncomputed']}原点は未計算。計算済みで15分施設0件は{summary['new_calculated_zero_facilities_15min']}原点で、未計算とは区別。既存949ファイルはバイト単位で保持、有効indexは{summary['active_walking_files']}件。",'', '既存計算の今回照合：'+json.dumps(summary['existing_walking_checks'],ensure_ascii=False),'','乗車道路と歩行用道路の投影先が異なる計算は、原点が正しくても徒歩接続保留として参考表示。30mを超える道路接続を採用していません。','', '具体例：','']
for id in ['iwakuni:160_01','iwakuni:160_02','iwakuni:665_01','jr-chugoku:60003 1','jr-chugoku:60003 2','jr-chugoku:60017 1','jr-chugoku:60047 1','jr-chugoku:60102 1']:
 if id in study['guides']:
  g=study['guides'][id];lines.append('- '+byid[id]['name']+' / '+id+' / '+g['summary']+'。'+g.get('roadside_review',{}).get('reason',''))
lines+=['','根拠：各地域 ledger.json に原座標、前後停車ID・停車順、使用shapeの該当区間、実際の進行方位、道路ID・投影・左右の余裕、交差点等の保留理由を保存。OSM点は原gtfs:stop_idと対応公式原点を合わせ、同じ区間に対するOSM原座標を別に照合。宇部の15点は公式ページ埋込地図の同一Placemarkの原座標と方面を保持。現地確認とは区別。','','残る資料不足：','- 国土数値情報4418原点は原則として反対方向の停留所を統合した代表点。個別原点に方面を推測割当しない。','- 山陽小野田：船木鉄道GTFSの配布案内はあるが取得認証情報がなく、公開時刻表の方面と各原座標・道路側を対応できていない。','- 和木：公式リンク先BUSitの和木駅原点は得られたが、方面欄・有効な停車順が不足。W1の根拠を別事業者へ置換しない。','- 防長交通の追加全停留所検索は取得403。既存の公式番号・座標資料は維持。その他の複雑な経路・分岐・一方通行・位置精度の保留は各原IDに記録。','- 宇部の沼・高専グランド前は実画像を読んだが、資料図に対応させる原座標が不足。既存の宇部中央等・長府A・由宇の保留は解除していない。','',f"実測：{start.isoformat()}から実装検証記録{now.isoformat()}まで{summary['measured_elapsed_minutes']}分（冒頭の環境確認を除く）。うち今回の徒歩圏計算は{bake['seconds']}秒。先に示した初回反映3〜6時間は、取得可能資料の照合・計算・配信・保存を含む作業幅。最終反映・保存時刻は配信保存レシートに記録し、この見積りと比較する。全保留解消の日時は、必要な方面別原点資料・取得可否が未確定のため未確定。未処理量を6779原IDの外へ勝手に推定しない。",'', '検証：source-verification.json（公式原本との対応、既存原本保持）、application-verification.json（原点・徒歩5/10/15分・施設数・方向選択・共有リンクの関数検証）。今回の実ブラウザー、実機、Safari、現地は未確認。アプリ関数テストを実画面確認とは呼んでいません。','', '保存・配信：既存本人限定Sitesと案件Driveを使用。実際のcommit・版・保存先・読み戻しSHAは別添の配信保存レシートを参照。']
(D/'implementation-report.md').write_text('\n'.join(lines)+'\n');print({k:v for k,v in summary.items() if k not in ['cities','guide_changes']})
