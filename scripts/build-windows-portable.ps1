[CmdletBinding()]
param(
    [Parameter()]
    [string]$OutputRoot = 'D:\LumaTraceTemp'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$version = '1.0.3'
$packageName = "LumaTrace-$version-windows-x64"
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = Join-Path $repositoryRoot 'apps\desktop\src-tauri\target\release'
$binariesRoot = Join-Path $repositoryRoot 'apps\desktop\src-tauri\binaries'
$resolvedOutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$stageRoot = Join-Path $resolvedOutputRoot $packageName
$zipFileName = "$packageName-portable.zip"
$zipPath = Join-Path $resolvedOutputRoot $zipFileName
$checksumPath = "$zipPath.sha256"

function Get-ContainedRelativePath {
    param([string]$Root, [string]$Path)
    $resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $resolvedPath = [IO.Path]::GetFullPath($Path)
    $prefix = $resolvedRoot + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is not contained in the expected directory: $resolvedPath"
    }
    return $resolvedPath.Substring($prefix.Length)
}

function Assert-RegularFile {
    param([string]$Path)
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Expected an ordinary file without redirection: $Path"
    }
    return $item
}

function Get-RegularTreeFiles {
    param([string]$Directory)
    $item = Get-Item -LiteralPath $Directory -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Expected an ordinary directory without redirection: $Directory"
    }
    foreach ($entry in Get-ChildItem -LiteralPath $Directory -Force) {
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Runtime contains a link or redirected entry: $($entry.FullName)"
        }
        if ($entry.PSIsContainer) {
            Get-RegularTreeFiles -Directory $entry.FullName
        } else {
            $entry
        }
    }
}

function Get-Sha256 {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-FileHash {
    param([string]$Path, [string]$Expected)
    [void](Assert-RegularFile -Path $Path)
    if ($Expected -notmatch '^[0-9a-fA-F]{64}$' -or (Get-Sha256 -Path $Path) -ne $Expected.ToLowerInvariant()) {
        throw "Source file does not match its sidecar manifest hash: $Path"
    }
}

function Write-NewUtf8File {
    param([string]$Path, [string]$Content)
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $writer = New-Object IO.StreamWriter($stream, (New-Object Text.UTF8Encoding($false)))
    try {
        $writer.Write($Content)
    } finally {
        $writer.Dispose()
    }
}

foreach ($target in @($stageRoot, $zipPath, $checksumPath)) {
    [void](Get-ContainedRelativePath -Root $resolvedOutputRoot -Path $target)
    if (Test-Path -LiteralPath $target) {
        throw "Output already exists; choose another -OutputRoot. Nothing will be overwritten: $target"
    }
}

$desktopExe = Join-Path $releaseRoot 'lumatrace-desktop.exe'
$desktopItem = Assert-RegularFile -Path $desktopExe
if ($desktopItem.VersionInfo.ProductVersion -notin @($version, "$version.0")) {
    throw "Desktop executable version is '$($desktopItem.VersionInfo.ProductVersion)', expected $version. Rebuild the desktop release first."
}
$manifestPath = Join-Path $binariesRoot 'sidecar-manifest.json'
[void](Assert-RegularFile -Path $manifestPath)
$sidecar = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($sidecar.artifactKind -ne 'self-contained' -or $sidecar.nodeRequired -ne $false -or
    $sidecar.platform -ne 'win32' -or $sidecar.arch -ne 'x64') {
    throw 'A self-contained Windows x64 sidecar is required.'
}
foreach ($name in @($sidecar.fileName, $sidecar.runtimeDirectory, $sidecar.noticesFile, $sidecar.thirdPartyNoticesFile)) {
    if ([string]::IsNullOrWhiteSpace($name) -or [IO.Path]::GetFileName($name) -ne $name -or $name -in @('.', '..')) {
        throw 'Sidecar manifest contains an invalid resource name.'
    }
}
$sidecarExe = Join-Path $binariesRoot $sidecar.fileName
$runtimeRoot = Join-Path $binariesRoot $sidecar.runtimeDirectory
$noticesPath = Join-Path $binariesRoot $sidecar.noticesFile
$thirdPartyNoticesPath = Join-Path $binariesRoot $sidecar.thirdPartyNoticesFile
Assert-FileHash -Path $sidecarExe -Expected $sidecar.sha256
Assert-FileHash -Path $noticesPath -Expected $sidecar.noticesSha256
Assert-FileHash -Path $thirdPartyNoticesPath -Expected $sidecar.thirdPartyNoticesSha256
foreach ($required in @('node.exe', 'NODE-LICENSE.txt', 'app\dist\src\index.js', 'app\package.json')) {
    [void](Assert-RegularFile -Path (Join-Path $runtimeRoot $required))
}
$runtimeFiles = @(Get-RegularTreeFiles -Directory $runtimeRoot)
$runtimeBytes = ($runtimeFiles | Measure-Object -Property Length -Sum).Sum
if ($runtimeFiles.Count -ne $sidecar.runtimeFileCount -or $runtimeBytes -ne $sidecar.runtimeSizeBytes) {
    throw 'The runtime file count or size no longer matches sidecar-manifest.json. Rebuild the sidecar first.'
}

$licensePath = Join-Path $repositoryRoot 'LICENSE'
[void](Assert-RegularFile -Path $licensePath)
$desktopNoticesPath = Join-Path $repositoryRoot 'legal\desktop-third-party-notices.md'
[void](Assert-RegularFile -Path $desktopNoticesPath)
$readmes = @(Get-ChildItem -LiteralPath $repositoryRoot -File -Filter 'README*.md')
$guides = @(Get-ChildItem -LiteralPath (Join-Path $repositoryRoot 'docs') -File -Filter 'user-guide*.md')
if ($readmes.Count -eq 0 -or $guides.Count -eq 0) {
    throw 'README and docs/user-guide Markdown documents must be present before packaging.'
}

$sources = New-Object 'System.Collections.Generic.List[object]'
$sources.Add([pscustomobject]@{ Source = $desktopExe; RelativePath = 'lumatrace-desktop.exe' })
$sources.Add([pscustomobject]@{ Source = $licensePath; RelativePath = 'LICENSE' })
$sources.Add([pscustomobject]@{ Source = $desktopNoticesPath; RelativePath = 'legal\desktop-third-party-notices.md' })
foreach ($item in @($readmes) + @($guides)) {
    [void](Assert-RegularFile -Path $item.FullName)
    $sources.Add([pscustomobject]@{ Source = $item.FullName; RelativePath = (Get-ContainedRelativePath -Root $repositoryRoot -Path $item.FullName) })
}
foreach ($path in @($manifestPath, $sidecarExe, $noticesPath, $thirdPartyNoticesPath) + @($runtimeFiles.FullName)) {
    $sources.Add([pscustomobject]@{ Source = $path; RelativePath = (Join-Path 'binaries' (Get-ContainedRelativePath -Root $binariesRoot -Path $path)) })
}

# Capture hashes before copying so a concurrent build cannot silently create a mixed package.
$inventory = @($sources | ForEach-Object {
    $sourceItem = Assert-RegularFile -Path $_.Source
    [pscustomobject]@{
        source = $_.Source
        path = $_.RelativePath.Replace('\', '/')
        sizeBytes = $sourceItem.Length
        sha256 = Get-Sha256 -Path $_.Source
    }
})
if (Test-Path -LiteralPath $resolvedOutputRoot) {
    $outputItem = Get-Item -LiteralPath $resolvedOutputRoot -Force
    if (-not $outputItem.PSIsContainer -or ($outputItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'OutputRoot must be an ordinary directory without redirection.'
    }
} else {
    [void](New-Item -ItemType Directory -Path $resolvedOutputRoot)
}
[void](New-Item -ItemType Directory -Path $stageRoot)
foreach ($entry in $inventory) {
    $destination = Join-Path $stageRoot $entry.path
    [void](Get-ContainedRelativePath -Root $stageRoot -Path $destination)
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))
    [IO.File]::Copy($entry.source, $destination, $false)
    if ((Get-Sha256 -Path $destination) -ne $entry.sha256 -or (Get-Item -LiteralPath $destination).Length -ne $entry.sizeBytes) {
        throw "Copied file failed verification: $($entry.path). Partial output is retained for inspection."
    }
}
$portableManifest = [ordered]@{
    schemaVersion = 1
    artifactKind = 'windows-x64-portable-preview'
    version = $version
    generatedAt = [DateTime]::UtcNow.ToString('o')
    entrypoint = 'lumatrace-desktop.exe'
    nodeRequired = $false
    codeSigningStatus = (Get-AuthenticodeSignature -LiteralPath $desktopExe).Status.ToString()
    files = @($inventory | Select-Object path, sizeBytes, sha256)
}
Write-NewUtf8File -Path (Join-Path $stageRoot 'portable-manifest.json') -Content (($portableManifest | ConvertTo-Json -Depth 8) + "`n")
$checksumLines = @($inventory | ForEach-Object { "$($_.sha256)  $($_.path)" })
Write-NewUtf8File -Path (Join-Path $stageRoot 'SHA256SUMS.txt') -Content (($checksumLines -join "`n") + "`n")

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
# .NET Framework's CreateFromDirectory may emit backslashes on Windows.
# Write explicit ZIP-standard forward-slash entry names on every PowerShell version.
$zipStream = [IO.File]::Open($zipPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
$zipWriter = New-Object IO.Compression.ZipArchive($zipStream, [IO.Compression.ZipArchiveMode]::Create, $false)
try {
    foreach ($file in @(Get-RegularTreeFiles -Directory $stageRoot)) {
        $entryName = "$packageName/" + (Get-ContainedRelativePath -Root $stageRoot -Path $file.FullName).Replace('\', '/')
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipWriter, $file.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal)
    }
} finally {
    $zipWriter.Dispose()
    $zipStream.Dispose()
}
$expectedEntries = @{}
foreach ($file in @(Get-RegularTreeFiles -Directory $stageRoot)) {
    $relativePath = (Get-ContainedRelativePath -Root $stageRoot -Path $file.FullName).Replace('\', '/')
    $expectedEntries["$packageName/$relativePath"] = [pscustomobject]@{ Length = $file.Length; Hash = Get-Sha256 -Path $file.FullName }
}
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
$verifiedEntries = 0
try {
    $seenEntries = @{}
    foreach ($entry in $archive.Entries) {
        if ($entry.FullName.EndsWith('/')) { continue }
        if ($entry.FullName.Contains('\') -or $entry.FullName -match '(^|/)\.\.(/|$)' -or
            -not $expectedEntries.ContainsKey($entry.FullName) -or $seenEntries.ContainsKey($entry.FullName)) {
            throw "Unexpected or unsafe ZIP entry: $($entry.FullName)"
        }
        $expected = $expectedEntries[$entry.FullName]
        $entryStream = $entry.Open()
        $hasher = [Security.Cryptography.SHA256]::Create()
        try {
            $entryHash = [BitConverter]::ToString($hasher.ComputeHash($entryStream)).Replace('-', '').ToLowerInvariant()
        } finally {
            $hasher.Dispose()
            $entryStream.Dispose()
        }
        if ($entry.Length -ne $expected.Length -or $entryHash -ne $expected.Hash) {
            throw "ZIP content failed verification: $($entry.FullName)"
        }
        $seenEntries[$entry.FullName] = $true
        $verifiedEntries++
    }
    if ($verifiedEntries -ne $expectedEntries.Count) {
        throw 'The ZIP is missing expected package files.'
    }
} finally {
    $archive.Dispose()
}
$zipHash = Get-Sha256 -Path $zipPath
Write-NewUtf8File -Path $checksumPath -Content ("$zipHash  $zipFileName`n")
[pscustomobject]@{
    PackageDirectory = $stageRoot
    ZipPath = $zipPath
    SizeBytes = (Get-Item -LiteralPath $zipPath).Length
    Sha256 = $zipHash
    ChecksumPath = $checksumPath
    VerifiedZipFiles = $verifiedEntries
    Version = $version
} | ConvertTo-Json
