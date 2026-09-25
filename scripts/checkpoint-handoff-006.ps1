$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$taskRoot = (Get-Location).Path
$taskStage = Join-Path $taskRoot 'outputs/handoff-006-20260925'
New-Item -ItemType Directory -Path $taskStage -Force | Out-Null
$taskArchive = Join-Path $taskStage 'handoff-006-20260925.zip'
if (Test-Path -LiteralPath $taskArchive) { throw 'Immutable archive already exists' }
$taskFiles = @(& git diff --name-only)
if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate tracked changes' }
$taskFiles += @(
  'docs/HANDOFF-006-20260925.md',
  'scripts/checkpoint-handoff-006.ps1',
  'scripts/apply-facility-successors.mjs',
  'scripts/check-successor-closure-absence.mjs',
  'scripts/facility-successors-lib.mjs',
  'scripts/prepare-facility-successors.mjs',
  'scripts/test-facility-successors.mjs',
  'scripts/triage-facility-successors.mjs',
  'outputs/facility-progress-20260925/facility-status.csv',
  'outputs/facility-progress-20260925/article-status.csv',
  'outputs/facility-progress-20260925/event-status.csv'
)
foreach ($taskDir in @('data-sources/facility-successors-20260925','outputs/facility-successors-20260925')) {
  $taskFiles += Get-ChildItem -LiteralPath (Join-Path $taskRoot $taskDir) -File -Recurse | ForEach-Object {
    if (-not $_.FullName.StartsWith($taskRoot + '\')) { throw 'Unexpected file path' }
    $_.FullName.Substring($taskRoot.Length + 1)
  }
}
$taskFiles = $taskFiles | ForEach-Object { $_.Replace('\','/') } | Sort-Object -Unique
$taskManifest = foreach ($taskRelative in $taskFiles) {
  $taskItem = Get-Item -LiteralPath (Join-Path $taskRoot $taskRelative)
  if (-not $taskItem.FullName.StartsWith($taskRoot + '\')) { throw 'File escaped workspace' }
  if ($taskRelative -match '(?i)(credential|secret|\.env|\.git/)' -or $taskRelative -eq 'docs/facility-update-handoff-20260925.html') { throw 'Excluded file' }
  [pscustomobject]@{ path = $taskRelative; bytes = $taskItem.Length; sha256 = (Get-FileHash -LiteralPath $taskItem.FullName -Algorithm SHA256).Hash.ToLower() }
}
$taskZip = [IO.Compression.ZipFile]::Open($taskArchive, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($taskRow in $taskManifest) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip, (Join-Path $taskRoot $taskRow.path), $taskRow.path, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  $taskWriter = [IO.StreamWriter]::new($taskZip.CreateEntry('evidence-files.json').Open(), [Text.UTF8Encoding]::new($false))
  try { $taskWriter.Write(($taskManifest | ConvertTo-Json -Depth 3)) } finally { $taskWriter.Dispose() }
} finally { $taskZip.Dispose() }
$taskCheck = [IO.Compression.ZipFile]::OpenRead($taskArchive)
try {
  if ($taskCheck.Entries.Count -ne $taskManifest.Count + 1) { throw 'Member count mismatch' }
  foreach ($taskRow in $taskManifest) {
    $taskEntry = $taskCheck.GetEntry($taskRow.path)
    $taskHasher = [Security.Cryptography.SHA256]::Create()
    $taskStream = $taskEntry.Open()
    try { $taskHash = [BitConverter]::ToString($taskHasher.ComputeHash($taskStream)).Replace('-','').ToLower() }
    finally { $taskStream.Dispose(); $taskHasher.Dispose() }
    if ($taskHash -ne $taskRow.sha256) { throw "Member mismatch: $($taskRow.path)" }
  }
} finally { $taskCheck.Dispose() }
[pscustomobject]@{ path = $taskArchive; files = $taskManifest.Count; bytes = (Get-Item -LiteralPath $taskArchive).Length; sha256 = (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLower() } | ConvertTo-Json
