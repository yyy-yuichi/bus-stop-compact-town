// Rebuild evidence and the human-readable report from saved receipts; NO live API calls.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { summarize, hash } from './jev-batch.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'outputs/jev-api-pilot-20260925');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const manifest=read(path.join(root,'data-sources/jev-api-pilot-20260925/manifest.json'));
const summary=summarize(manifest,dir);
const events=fs.readFileSync(path.join(dir,'journal.ndjson'),'utf8').trim().split('\n').map(JSON.parse);
const invocations=events.filter(e=>e.event==='invocation_completed');
const receipts=manifest.jobs.map(j=>read(path.join(dir,`${j.id}.json`)));
const tests=spawnSync(process.execPath,['--test','--test-reporter=tap','scripts/test-jev-batch.mjs'],{cwd:root,encoding:'utf8',windowsHide:true});
if(tests.status!==0) throw new Error('Offline tests failed; report generation stopped');
fs.writeFileSync(path.join(dir,'tests.tap'),tests.stdout);
const csvRows=[['pair_id','left_name','right_name','relationship_candidate','confidence','primary_source_evidence_noul','adoption']];
const counts={},evidence=[];let low=0;
for(const job of manifest.jobs.filter(j=>j.kind==='historical_candidate_pairs')) {
  const receipt=receipts.find(r=>r.job_id===job.id);
  job.request.state.pairs.forEach((pair,i)=>{
    const a=receipt.response.answers[`relation_${i}`],e=receipt.response.answers[`evidence_${i}`].noul;
    counts[a.choice]=(counts[a.choice]??0)+1;if(a.confidence<.8)low++;evidence.push(e);
    csvRows.push([pair.pair_id,pair.left.name,pair.right.name,a.choice,a.confidence,e,'NOT_ADOPTED_HISTORICAL_TRIAGE_ONLY']);
  });
}
fs.writeFileSync(path.join(dir,'pair-triage.csv'),'\uFEFF'+csvRows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n');
const findings={...summary,relationship_counts:counts,confidence_below_08:low,evidence_noul_min:Math.min(...evidence),evidence_noul_max:Math.max(...evidence),provider_request_id_present:receipts.filter(r=>r.provider_request_id).length,invocations:invocations.map(i=>({id:i.invocation,at:i.at,processed_jobs:i.invocation_processed_jobs,skipped_jobs:i.invocation_skipped_jobs,completed_records:i.completed_records,attempts:i.attempts,wall_ms:i.invocation_wall_ms}))};
if(summary.completed_records!==90||summary.completed_questions!==156||summary.attempts!==10||summary.missing_jobs.length||invocations.length!==3||invocations[2].invocation_processed_jobs!==0) throw new Error('Pilot proof does not match the expected completed run');
fs.writeFileSync(path.join(dir,'findings.json'),JSON.stringify(findings,null,2)+'\n');
const sec=n=>(n/1000).toFixed(3);
const report=`# Jev API自動化試験 — 005 / 2026-09-25

この文書は当初の90対象試験の履歴。続く実例要約10件と4施設の変更は [今回の反映記録](FACILITY-EVENTS-20260925.md)、現在の指示は [最新入口](NEXT-CHAT-START-HERE.md) を参照。GPTChat移送は現在の必須手順ではない。

## 結論

ブラウザーの手入力を介さず、保存済みデータをJevへ分割送信し、結果を保存・検査して中断後に再開できた。90対象・156判定を10回のAPI呼出しで処理し、再実行時の追加送信は0回。**今回完成したのは判定処理の自動化基盤であり、7,764施設の現況更新ではない。**

## 実測値

|項目|確認結果|
|---|---|
|対象|過去に保存された重複候補66組＋架空の日本語テスト24件＝90対象（90店舗ではない）|
|実モデル|${summary.model}（全10応答で確認）|
|回答|156 / 156。欠落0、同一ジョブの重複送信0|
|API通信・応答読込の累計|${sec(summary.sum_successful_request_wall_ms)}秒|
|処理・保存・検査を含む実行時間の累計|${sec(invocations.reduce((n,i)=>n+i.invocation_wall_ms,0))}秒（下記3実行の合計）|
|Jev入力 / 出力|${summary.successful_input_tokens.toLocaleString('en-US')} / ${summary.successful_output_tokens.toLocaleString('en-US')} tokens|
|成功応答の使用量から計算した費用|$${summary.successful_usage_cost_usd.toFixed(9)}（請求確定額ではない）|
|全試行の保守的な費用上限|$${summary.conservative_cost_bound_usd.toFixed(9)}。承認上限$0.05以内|
|追加購入・自動チャージ設定変更|なし。既存クレジットを使用|
|単純な日本語判定テスト|${summary.control_correct} / ${summary.control_count}一致。実店舗の正確性とは別|
|異常系を含む自動テスト|12 / 12成功（tests.tap）|
|新たな施設データ変更 / GitHub更新|0 / 0。この試験では対象外|

実行時刻は2026-09-25 06:59:39〜07:00:04 JST。意図的な停止と再開の間隔を含む経過は約25秒。上表の秒数にはキー設定、実装、試験設計、Drive保存、モデル調査、認証読込・プロセス起動の時間を含めない。総作業が5秒で終了したという意味ではない。

## 停止・再開の実証

|実行|新規API呼出し|再利用ジョブ|累計処理対象|
|---|---:|---:|---:|
${invocations.map((i,n)=>`|${n+1}|${i.invocation_processed_jobs}|${i.invocation_skipped_jobs}|${i.completed_records}|`).join('\n')}

1回目は3ジョブ・30組で停止。別プロセスの2回目で残り60対象を処理。3回目は保存済み10ジョブを読み戻すだけで終了。入力・回答IDと型、件数、モデル、使用量、ハッシュを検証している。

異常系は模擬通信で検証：保存直後のクラッシュからの回復、応答不明時の自動再送禁止、429/529の待機再試行と予算消費、予算上限、回答欠落・余分なID・不正確率の拒否、入力変更・保存結果改変の検出、同時起動の禁止、認証情報の応答への混入時の保存拒否。実サービスで障害を発生させたわけではない。

## 判定結果と限界

過去66組の仮分類は「同じ施設の可能性」${counts.same_candidate??0}組、「別施設の可能性」${counts.distinct_candidate??0}組、「不明」${counts.unresolved??0}組。confidenceが0.8未満は${low}組。これらの確率は正確性を保証せず、0.8は説明用の集計境界であって採用基準ではない。

入力には同一営業主体を裏付ける一次資料の明記がなく、一次資料が含まれるというnoul値は${Math.min(...evidence)}〜${Math.max(...evidence)}。**66組を統合・削除してよいという結果ではない。** 正解ラベル付きの実店舗照合は未実施なので、精度やGPT調査削減率は測定できない。

架空24件は実閉店・新規開店・改称・移転・一時休業・閉店予定・変更なし・不明を各3件含む。単純で明示的な文面であり、現実の曖昧なSNS、同名店、日付の矛盾、悪意ある指示等に対する性能を証明しない。テスト後の再調整・再採点は行っていない。

## どこが効率化したか／残る部分

~~~text
既知候補・最新記事・公式告知の取得          ← 今回の自動化範囲外
             ↓ 出典URL・取得日付きの入力
分割 → Jev API判定 → 保存 → 検査 → 再開    ← 90対象で実証済み
             ↓ 候補と根拠不足を明示
必要候補をGPTChat GPT-6 Proで調査          ← 今回は未実行
             ↓ 元ID・一次資料・変更内容を確認
Codex検証 → GitHub PR → 公開確認           ← 今回は未実行
~~~

今回省けるようになったのは、Jev画面への1件ずつの貼付け・送信・結果転記と、再開時の処理済み確認。複数質問を1リクエストへまとめる公式例を採用した。単発API方式や従来GPT作業との同条件比較はしていないため、「何倍速い」「何千件が何分で更新できる」とは結論しない。長時間・大規模・並列負荷試験も未実施。

次の段階は、既知の開閉店候補から実際の告知本文と出典・日付を揃えた実データ検証。正解が分かる実例を別に確保し、施設ID照合、根拠不足の検出、GPTへ回す条件を評価する。最新情報の取得は既存候補の回収と差分取得を優先し、7,764件を毎回ゼロから検索しない。取得不能な公式LINEやログイン依存SNSは取得不能のまま記録する。大量処理はこの90対象の承認枠を勝手に拡大せず、対象・費用・品質条件を決めてから行う。

## 再現・再開方法

ソースと入力、生応答、台帳、CSV、ハッシュを同梱ZIPに保存する。ZIPを同じ構成で展開し、ルートでNode.js 24を使用する。

~~~powershell
node --test scripts/test-jev-batch.mjs
node scripts/jev-batch.mjs --dry-run
node scripts/jev-batch.mjs --summary
# 次は承認されたWindowsユーザーの実行環境のみ。完了済み出力を保持した場合は追加API送信0。
node scripts/jev-batch.mjs
~~~

manifestとoutputsを同時に保持する。履歴を消した新ディレクトリでの再実行は再課金となるため、この再開試験と混同しない。入力変更・予算変更は別試験として承認範囲を確認する。応答が不明な失敗は自動再送せず、台帳とサービス側の記録を確認する。

認証はWindows CurrentUser DPAPIで暗号化済み。ローカルの実行ユーザーと暗号化ユーザーが一致する必要があり、Codexの隔離ユーザーからは復号できない。今回の実API呼出しは承認済みの通常Windowsユーザー権限で実行した。キー名はbusmap-005-batch-pilot-20260925。組織スコープの永続キーであり、プロジェクトだけに権限限定されたキーではない。ユーザーの追加承認後に作成済み。キー本体はログ・GitHub・Drive・ZIPへ含めない。

応答本文とx-request-idヘッダーでプロバイダー側request IDを取得できた件数は${findings.provider_request_id_present} / 10。取得できていないIDを捏造せずnullで記録し、ローカルattempt UUID・要求ハッシュ・時刻で追跡する。

manifest SHA-256: ${hash(manifest)}

## 参照・保存先

- [正式保存フォルダ](https://drive.google.com/drive/folders/1TX3XbL5pT8qfBBEaGJVA5kRDNX61pEAq)
- [過去66組の入力原本](https://drive.google.com/file/d/15kdVncezb1LCdjAXTwgfDgKUlD6aLoDQ/view)
- [公式API仕様](https://docs.typesafe.ai/api)
- [モデル・料金・上限](https://docs.typesafe.ai/models) — 計算基準は入力100万tokensあたり$0.042、出力無料。2026-09-25確認。
- [複数質問をまとめる公式例](https://docs.typesafe.ai/cookbooks/parallel_questions) — 公表例の速度倍率は今回へ転用しない。

goal-to-doneとverification-before-completionに沿い、「実装済み」だけで完了扱いせず実API・保存結果・異常系・再開の証拠を分けて記録した。Skillはモデルの事実認定や利用範囲を正当化する根拠ではない。
`;
const reportFile=path.join(root,'docs/JEV-API-PILOT-20260925.md');
fs.writeFileSync(reportFile,report);

// Build a strictly allowlisted export; credentials and unrelated working-tree files are excluded.
const files=[
  'scripts/jev-batch.mjs','scripts/jev-credential.mjs','scripts/jev-credential-setup.mjs',
  'scripts/prepare-jev-api-pilot.mjs','scripts/test-jev-batch.mjs','scripts/report-jev-api-pilot.mjs',
  'data-sources/jev-api-pilot-20260925/prior-request.json','data-sources/jev-api-pilot-20260925/manifest.json',
  'docs/JEV-API-PILOT-20260925.md',
  ...['manifest.json','journal.ndjson','summary.json','findings.json','tests.tap','pair-triage.csv',...manifest.jobs.map(j=>`${j.id}.json`)].map(n=>`outputs/jev-api-pilot-20260925/${n}`)
];
const bundle=path.join(root,'outputs/jev-api-pilot-20260925-bundle'),checksums={};
for(const relative of files) {
  const source=path.join(root,relative),destination=path.join(bundle,relative),bytes=fs.readFileSync(source);
  checksums[relative]=createHash('sha256').update(bytes).digest('hex');
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination);
}
fs.writeFileSync(path.join(bundle,'SHA256SUMS.json'),JSON.stringify(checksums,null,2)+'\n');
console.log(JSON.stringify({report:reportFile,bundle,files:files.length,findings}));
