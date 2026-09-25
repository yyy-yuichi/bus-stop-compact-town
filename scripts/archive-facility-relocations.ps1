$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$taskRoot = (Get-Location).Path
$taskStage = 'outputs/facility-relocations-20260925'
$taskArchive = Join-Path $taskRoot "$taskStage/facility-relocations-evidence-20260925.zip"
if (Test-Path -LiteralPath $taskArchive) { throw 'Archive already exists; do not overwrite.' }
$taskFiles = @(
  'scripts/apply-facility-relocations.mjs',
  'scripts/test-facility-relocations.mjs',
  'scripts/build-facility-progress-ledger.mjs',
  'scripts/archive-facility-relocations.ps1',
  'data-sources/facility-relocations-20260925/source-plan.json',
  'data-sources/facility-relocations-20260925/adoptions.json',
  'data-sources/facility-relocations-20260925/relocation-review.json',
  'data-sources/facility-relocations-20260925/adoption-summary.json',
  'data-sources/facility-progress-20260925/focus-review.json',
  'data-sources/facility-progress-20260925/progress-summary.json',
  'docs/FACILITY-RELOCATIONS-20260925.md',
  'docs/NEXT-CHAT-START-HERE.md',
  'public/data/facility-current.json',
  'outputs/facility-progress-20260925/facility-status.csv',
  'outputs/facility-progress-20260925/article-status.csv'
)
$taskFiles += Get-ChildItem -LiteralPath (Join-Path $taskRoot "$taskStage/pages") -File | ForEach-Object {
  if (-not $_.FullName.StartsWith($taskRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Unexpected new page target' }
  $_.FullName.Substring($taskRoot.Length + 1)
}
foreach ($taskName in @('95b9970dedbab6d4bb7b266d.json', '0bb35517490ff41f23dd522d.json', '864c4bb83bb0ccde0cb16a0c.json')) {
  $taskFiles += "outputs/facility-progress-20260925/pages/$taskName"
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
