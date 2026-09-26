$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$taskRoot = (Get-Location).Path
$taskStage = 'outputs/facility-progress-20260925'
$taskArchive = Join-Path $taskRoot "$taskStage/facility-progress-evidence-20260925-v2.zip"
if (Test-Path -LiteralPath $taskArchive) { throw 'Archive already exists; do not overwrite.' }
$taskFiles = @(
  'scripts/build-facility-progress-ledger.mjs',
  'scripts/archive-facility-progress.ps1',
  'data-sources/facility-progress-20260925/source-plan.json',
  'data-sources/facility-progress-20260925/focus-review.json',
  'data-sources/facility-progress-20260925/progress-summary.json',
  'docs/FACILITY-PROGRESS-LEDGER-20260925.md',
  'docs/NEXT-CHAT-START-HERE.md',
  "$taskStage/facility-status.csv",
  "$taskStage/article-status.csv"
)
$taskFiles += Get-ChildItem -LiteralPath (Join-Path $taskRoot "$taskStage/pages") -File | ForEach-Object {
  if (-not $_.FullName.StartsWith($taskRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Unexpected page target' }
  $_.FullName.Substring($taskRoot.Length + 1)
}
$taskFiles = $taskFiles | ForEach-Object { $_.Replace('\','/') } | Sort-Object -Unique
$taskManifest = foreach ($taskRelative in $taskFiles) {
  $taskItem = Get-Item -LiteralPath (Join-Path $taskRoot $taskRelative)
  if (-not $taskItem.FullName.StartsWith($taskRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Unexpected archive target' }
  [pscustomobject]@{ path = $taskRelative; bytes = $taskItem.Length; sha256 = (Get-FileHash -LiteralPath $taskItem.FullName -Algorithm SHA256).Hash.ToLower() }
}
$taskZip = [IO.Compression.ZipFile]::Open($taskArchive, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($taskRow in $taskManifest) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip, (Join-Path $taskRoot $taskRow.path), $taskRow.path, [IO.Compression.CompressionLevel]::Optimal) | Out-Null }
  $taskEntry = $taskZip.CreateEntry('evidence-files.json')
  $taskWriter = [IO.StreamWriter]::new($taskEntry.Open(), [Text.UTF8Encoding]::new($false))
  try { $taskWriter.Write(($taskManifest | ConvertTo-Json -Depth 3)) } finally { $taskWriter.Dispose() }
} finally { $taskZip.Dispose() }
$taskCheck = [IO.Compression.ZipFile]::OpenRead($taskArchive)
try {
  if ($taskCheck.Entries.Count -ne $taskManifest.Count + 1) { throw 'Entry count mismatch' }
  if (($taskCheck.Entries.FullName | Sort-Object -Unique).Count -ne $taskCheck.Entries.Count) { throw 'Duplicate archive paths' }
  foreach ($taskRow in $taskManifest) {
    $taskMember = $taskCheck.GetEntry($taskRow.path)
    if ($taskMember.Length -ne $taskRow.bytes) { throw "Entry size mismatch: $($taskRow.path)" }
    $taskStream = $taskMember.Open()
    $taskHasher = [Security.Cryptography.SHA256]::Create()
    try { $taskHash = [BitConverter]::ToString($taskHasher.ComputeHash($taskStream)).Replace('-', '').ToLower() } finally { $taskHasher.Dispose(); $taskStream.Dispose() }
    if ($taskHash -ne $taskRow.sha256) { throw "Entry hash mismatch: $($taskRow.path)" }
  }
} finally { $taskCheck.Dispose() }
[pscustomobject]@{ path = $taskArchive; files = $taskManifest.Count; bytes = (Get-Item -LiteralPath $taskArchive).Length; sha256 = (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLower() } | ConvertTo-Json
