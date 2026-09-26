$ErrorActionPreference = 'Stop'
$taskRoot = (Get-Location).Path
$stage = 'outputs/facility-local-stores-20260925'
$archivePath = Join-Path $taskRoot "$stage/facility-local-stores-delta-20260925.zip"
if (Test-Path -LiteralPath $archivePath) { throw 'Archive already exists; do not overwrite.' }
$files = @(
  'public/data/facility-current.json','package.json','package-lock.json',
  'scripts/prepare-facility-local-stores.mjs','scripts/index-facility-local-stores.mjs',
  'scripts/triage-facility-local-stores.mjs','scripts/apply-facility-local-stores.mjs',
  'scripts/facility-local-stores-lib.mjs','scripts/report-facility-local-stores.mjs',
  'scripts/archive-facility-local-stores.ps1','scripts/test-facility-local-stores.mjs',
  'scripts/fetch-facility-followups.mjs','scripts/facility-bulk-lib.mjs','scripts/facility-evidence-lib.mjs',
  'scripts/jev-batch.mjs','scripts/jev-credential.mjs','scripts/test-facility-current.mjs',
  'scripts/test-facility-current-render.mjs','scripts/test-baked-facilities.mjs','scripts/test-facility-reconcile.mjs',
  'src/facilityCatalog.ts','src/facilityIcons.ts','src/FacilityDrawer.tsx',
  'docs/FACILITY-LOCAL-STORES-20260925.md','docs/NEXT-CHAT-START-HERE.md'
)
foreach ($relativeDir in @('data-sources/facility-local-stores-20260925',$stage)) {
  $files += Get-ChildItem -LiteralPath $relativeDir -Recurse -File | Where-Object { $_.Extension -in '.json','.ndjson','.csv','.txt' -and $_.FullName -notmatch '[\\/]readback[\\/]|delivery|archive-manifest' } | ForEach-Object { [IO.Path]::GetRelativePath($taskRoot,$_.FullName) }
}
$files = $files | ForEach-Object { $_.Replace('\','/') } | Sort-Object -Unique
$manifest = foreach ($relative in $files) {
  $item=Get-Item -LiteralPath (Join-Path $taskRoot $relative)
  if (-not $item.FullName.StartsWith($taskRoot+[IO.Path]::DirectorySeparatorChar) -or $relative -match '(?i)\.dpapi$|\.env$|credentials') { throw 'Unexpected archive target' }
  [pscustomobject]@{path=$relative;bytes=$item.Length;sha256=(Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLower()}
}
$zip=[IO.Compression.ZipFile]::Open($archivePath,[IO.Compression.ZipArchiveMode]::Create)
try {
  foreach($row in $manifest){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $taskRoot $row.path),$row.path,[IO.Compression.CompressionLevel]::Optimal)|Out-Null}
  $entry=$zip.CreateEntry('evidence-files.json');$writer=[IO.StreamWriter]::new($entry.Open(),[Text.UTF8Encoding]::new($false))
  try{$writer.Write(($manifest|ConvertTo-Json -Depth 3))}finally{$writer.Dispose()}
}finally{$zip.Dispose()}
$check=[IO.Compression.ZipFile]::OpenRead($archivePath)
try{
  if($check.Entries.Count -ne $manifest.Count+1){throw 'Entry count mismatch'}
  if(($check.Entries.FullName|Sort-Object -Unique).Count -ne $check.Entries.Count){throw 'Duplicate archive paths'}
  foreach($row in $manifest){$stream=$check.GetEntry($row.path).Open();try{$h=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLower()}finally{$stream.Dispose()};if($h -ne $row.sha256){throw "Archive mismatch: $($row.path)"}}
}finally{$check.Dispose()}
[pscustomobject]@{path=$archivePath;files=$manifest.Count;bytes=(Get-Item -LiteralPath $archivePath).Length;sha256=(Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLower()}|ConvertTo-Json
