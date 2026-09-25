$ErrorActionPreference = 'Stop'
$taskRoot = (Get-Location).Path
$batchRelative = 'outputs/facility-evidence-20260925'
$archivePath = Join-Path $taskRoot "$batchRelative/facility-evidence-20260925.zip"
if (Test-Path -LiteralPath $archivePath) { throw 'Archive exists; do not overwrite an evidence snapshot.' }
$relativeFiles = @(
  'public/data/shopping.geojson', 'public/data/civic-facilities.geojson', 'public/data/facility-current.json',
  'data-sources/prefecture-directed-20260915/municipal-boundaries.geojson',
  'data-sources/facility-bulk-triage-20260925/authorization.json',
  'outputs/facility-bulk-triage-20260925/review-queue.json',
  'outputs/facility-bulk-triage-20260925/jev-manifest.json',
  'scripts/jev-batch.mjs', 'scripts/jev-credential.mjs', 'scripts/test-jev-batch.mjs',
  'scripts/facility-bulk-lib.mjs', 'scripts/facility-evidence-lib.mjs', 'scripts/test-facility-evidence.mjs',
  'scripts/collect-facility-evidence.mjs', 'scripts/triage-facility-evidence.mjs',
  'scripts/prepare-facility-followups.mjs', 'scripts/prepare-facility-map-followups.mjs',
  'scripts/fetch-facility-followups.mjs', 'scripts/index-facility-positions.mjs',
  'scripts/apply-facility-evidence.mjs', 'scripts/report-facility-evidence.mjs',
  'scripts/archive-facility-evidence.ps1', 'package.json', 'package-lock.json',
  'src/facilityFreshness.ts', 'src/facilityCatalog.ts',
  'src/FacilityFreshnessDetails.tsx',
  'docs/FACILITY-EVIDENCE-20260925.md', 'docs/NEXT-CHAT-START-HERE.md'
)
$relativeFiles += Get-ChildItem -LiteralPath 'data-sources/facility-evidence-20260925' -File | ForEach-Object { [IO.Path]::GetRelativePath($taskRoot, $_.FullName) }
foreach ($relativeDir in @($batchRelative, 'outputs/facility-bulk-triage-20260925/jev')) {
  $relativeFiles += Get-ChildItem -LiteralPath $relativeDir -Recurse -File | Where-Object { $_.Extension -in '.json','.ndjson','.csv','.txt' -and $_.Name -notmatch 'readback|delivery' } | ForEach-Object { [IO.Path]::GetRelativePath($taskRoot, $_.FullName) }
}
$relativeFiles = $relativeFiles | Sort-Object -Unique
$manifest = foreach ($relative in $relativeFiles) {
  $item = Get-Item -LiteralPath (Join-Path $taskRoot $relative)
  if (-not $item.FullName.StartsWith($taskRoot + [IO.Path]::DirectorySeparatorChar) -or $relative -match '(?i)\.dpapi$|\.env$') { throw 'Unexpected archive target' }
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
