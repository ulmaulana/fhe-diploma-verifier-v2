$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$taskVideoTools = Join-Path $env:TEMP 'uas-revision-video-20261005'
New-Item -ItemType Directory -Path $taskVideoTools -Force | Out-Null
$taskArchive = Join-Path $taskVideoTools 'ffmpeg-9.0.2-essentials_build.zip'
$taskArchiveUrl = 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip'
$taskExpected = (Invoke-WebRequest -Uri ($taskArchiveUrl + '.sha256') -UseBasicParsing).Content.Trim().Split(' ')[0].ToLower()
if (-not (Test-Path -LiteralPath $taskArchive)) {
    Invoke-WebRequest -Uri $taskArchiveUrl -OutFile $taskArchive -UseBasicParsing
}
$taskActual = (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLower()
if ($taskActual -ne $taskExpected) { throw 'Downloaded archive checksum mismatch' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip = [System.IO.Compression.ZipFile]::OpenRead($taskArchive)
try {
    foreach ($taskTool in @('ffmpeg.exe', 'ffprobe.exe')) {
        $taskEntry = $taskZip.Entries | Where-Object { $_.FullName.EndsWith('/bin/' + $taskTool) } | Select-Object -First 1
        if (-not $taskEntry) { throw 'Required media tool absent in checksum-verified archive' }
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntry, (Join-Path $taskVideoTools $taskTool), $true)
    }
} finally { $taskZip.Dispose() }
$taskOut = Join-Path $PSScriptRoot '../docs/uas/evidence/revisi-laporan/2026-10-04T22-03-10Z/evidence/sepolia/video-tool-provenance.json'
$taskMetadata = [ordered]@{
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    officialRecommendation = 'https://ffmpeg.org/download.html'
    archiveUrl = $taskArchiveUrl
    checksumUrl = ($taskArchiveUrl + '.sha256')
    expectedArchiveSha256 = $taskExpected
    actualArchiveSha256 = $taskActual
    archiveBytes = (Get-Item -LiteralPath $taskArchive).Length
    ffmpegSha256 = (Get-FileHash -LiteralPath (Join-Path $taskVideoTools 'ffmpeg.exe') -Algorithm SHA256).Hash.ToLower()
    ffprobeSha256 = (Get-FileHash -LiteralPath (Join-Path $taskVideoTools 'ffprobe.exe') -Algorithm SHA256).Hash.ToLower()
    version = (& (Join-Path $taskVideoTools 'ffmpeg.exe') -version | Select-Object -First 1)
    method = 'Standalone archive in task TEMP directory; no system installation; official FFmpeg download page links gyan.dev Windows builds; published provider checksum verified.'
}
$taskMetadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $taskOut -Encoding UTF8
$taskMetadata | ConvertTo-Json -Depth 5
