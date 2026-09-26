$ErrorActionPreference = 'Stop'
$taskRoot = (Get-Location).Path
$batchRelative = 'outputs/facility-bulk-triage-20260925'
$archivePath = Join-Path $taskRoot "$batchRelative/facility-bulk-triage-evidence-20260925.zip"
if (Test-Path -LiteralPath $archivePath) { throw 'Archive exists; do not overwrite a saved evidence snapshot.' }
$relativeFiles = @(
  'public/data/shopping.geojson', 'public/data/civic-facilities.geojson', 'public/data/facility-current.json',
  'data-sources/prefecture-directed-20260915/municipal-boundaries.geojson',
  'data-sources/facility-backlog-review-20260920/facility-decision-manifest.json',
  'data-sources/facility-freshness-priority-20260920/facility-freshness-followup-manifest.json',
  'data-sources/facility-events-20260925/decisions.json',
  'scripts/jev-batch.mjs', 'scripts/jev-credential.mjs', 'scripts/test-jev-batch.mjs',
  'scripts/facility-bulk-lib.mjs', 'scripts/collect-facility-bulk.mjs', 'scripts/prepare-facility-bulk.mjs',
  'scripts/run-facility-bulk.mjs', 'scripts/report-facility-bulk.mjs', 'scripts/test-facility-bulk.mjs',
  'scripts/archive-facility-bulk.ps1', 'package.json',
  'docs/NEXT-CHAT-START-HERE.md', 'docs/FACILITY-REVIEW-ORDER.md', 'docs/FACILITY-BULK-TRIAGE-20260925.md'
)
$relativeFiles += Get-ChildItem -LiteralPath 'data-sources/facility-bulk-triage-20260925' -File | ForEach-Object { [IO.Path]::GetRelativePath($taskRoot, $_.FullName) }
$relativeFiles += Get-ChildItem -LiteralPath $batchRelative -Recurse -File | Where-Object { $_.Extension -in '.json','.ndjson','.csv','.txt' } | ForEach-Object { [IO.Path]::GetRelativePath($taskRoot, $_.FullName) }
$relativeFiles = $relativeFiles | Sort-Object -Unique
$manifest = foreach ($relative in $relativeFiles) {
  $item = Get-Item -LiteralPath (Join-Path $taskRoot $relative)
  [pscustomobject]@{path=$relative.Replace('\','/');bytes=$item.Length;sha256=(Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLower()}
}
$zip = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($row in $manifest) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $taskRoot $row.path), $row.path, [IO.Compression.CompressionLevel]::Optimal) | Out-Null }
  $entry = $zip.CreateEntry('evidence-files.json')
  $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
  try { $writer.Write(($manifest | ConvertTo-Json -Depth 3)) } finally { $writer.Dispose() }
} finally { $zip.Dispose() }
$readZip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try { if ($readZip.Entries.Count -ne $manifest.Count + 1) { throw 'Archive entry count mismatch' } } finally { $readZip.Dispose() }
[pscustomobject]@{path=$archivePath;files=$manifest.Count;bytes=(Get-Item -LiteralPath $archivePath).Length;sha256=(Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLower()} | ConvertTo-Json
