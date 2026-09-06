# Builds the FITWORK Windows installer end to end.
#
# Run this on a WINDOWS machine (PowerShell 5.1+ or PowerShell 7+) with:
#   - Node.js + npm on PATH (any recent version - only used to build; the
#     portable runtime this script downloads is what actually ships)
#   - Inno Setup 6 installed (https://jrsoftware.org/isinfo.php), with
#     ISCC.exe on PATH or at the default install location
#
# Not verified by an actual run - written and reviewed, but there is no
# Windows machine available in the sandbox this was developed in. See
# installer/README.md for the full manual build + test walkthrough and
# what to check if a step here fails.
#
# What this does, in order:
#   1. npm ci + build (client, then server) from the repo's own working
#      tree - needs the full dev toolchain (tsc, vite, tsx) to build at all
#   2. Copy just enough of the repo (root package.json/lockfile, server's
#      package.json + built dist + prisma/, client's package.json + built
#      dist) into a throwaway scratch tree, then run a *production-only*
#      `npm ci --omit=dev --workspace=server` THERE - never touches the
#      real repo's own node_modules, which the developer still needs
#      tsx/typescript in for `npm run dev` to keep working. This is an npm
#      workspaces monorepo with a single root-level lockfile (no
#      server/package-lock.json of its own), so `--workspace=server`
#      against the root lockfile is the correct scoping - verified
#      directly: it installs prisma (needed for migrate-deploy below,
#      hence moving it to a real dependency in server/package.json),
#      excludes tsx/typescript, and never touches client's own deps at all.
#   3. Download a portable Node.js Windows x64 runtime (pinned version,
#      checksum-verified against Node's own published SHASUMS256.txt)
#   4. Download mkcert (pinned version) - lets FITWORK.iss's
#      SetupHttpsForServerMode generate a trusted HTTPS certificate
#      automatically during a Server-mode install, instead of requiring the
#      admin to separately install mkcert first
#   5. Download nssm (pinned version)
#   6. Invoke ISCC.exe against FITWORK.iss to produce the final .exe

$ErrorActionPreference = "Stop"

$NodeVersion = "20.18.1"
$MkcertVersion = "1.4.4"
$NssmVersion = "2.24"

$RepoRoot = Resolve-Path "$PSScriptRoot\.."
$InstallerDir = $PSScriptRoot
$BuildRoot = Join-Path $InstallerDir "dist\build-root"
$StageDir = Join-Path $InstallerDir "dist\stage"
$DownloadCache = Join-Path $InstallerDir ".cache"

New-Item -ItemType Directory -Force -Path $StageDir | Out-Null
New-Item -ItemType Directory -Force -Path $DownloadCache | Out-Null

function Assert-Sha256 {
    param([string]$FilePath, [string]$ExpectedHash)
    $actual = (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash
    if ($actual.ToLower() -ne $ExpectedHash.ToLower()) {
        throw "Checksum mismatch for $FilePath`nExpected: $ExpectedHash`nActual:   $actual`n" +
              "Do not proceed with a file that fails checksum verification."
    }
}

Write-Host "==> [1/5] Building client + server from the repo's own working tree"
Push-Location $RepoRoot
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed (exit code $LASTEXITCODE)." }
    # @prisma/client's own postinstall script is what normally generates the
    # Prisma Client types, but npm ci doesn't reliably run install scripts on
    # every machine - some npm configurations/policies block them (seen
    # directly: "npm warn allow-scripts ... not yet covered by
    # allowScripts"). Without it, prisma.<model> calls type as {}/any
    # everywhere instead of erroring, which tsc then reports as a wall of
    # unrelated-looking "implicitly has an 'any' type" errors across every
    # route file that touches the database. Generating explicitly here makes
    # the build correct regardless of whether the postinstall hook fired.
    npm run prisma:generate --workspace server
    if ($LASTEXITCODE -ne 0) { throw "prisma generate failed (exit code $LASTEXITCODE)." }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed (exit code $LASTEXITCODE)." }
} finally {
    Pop-Location
}

Write-Host "==> [2/5] Production-only install in a throwaway scratch tree"
if (Test-Path $BuildRoot) { Remove-Item -Recurse -Force $BuildRoot }
New-Item -ItemType Directory -Force -Path $BuildRoot | Out-Null
New-Item -ItemType Directory -Force -Path "$BuildRoot\server" | Out-Null
New-Item -ItemType Directory -Force -Path "$BuildRoot\client" | Out-Null

# Root-level files govern the workspace install (single lockfile for both
# workspaces - this is why server can't just be npm-ci'd on its own).
Copy-Item "$RepoRoot\package.json" "$BuildRoot\package.json"
Copy-Item "$RepoRoot\package-lock.json" "$BuildRoot\package-lock.json"
# npm needs every declared workspace's package.json to exist even though
# client's own dependencies are never installed here - its already-built
# dist is copied in as-is below instead.
Copy-Item "$RepoRoot\server\package.json" "$BuildRoot\server\package.json"
Copy-Item "$RepoRoot\client\package.json" "$BuildRoot\client\package.json"
Copy-Item "$RepoRoot\server\dist" "$BuildRoot\server\dist" -Recurse
Copy-Item "$RepoRoot\server\prisma" "$BuildRoot\server\prisma" -Recurse
Copy-Item "$RepoRoot\client\dist" "$BuildRoot\client\dist" -Recurse

Push-Location $BuildRoot
try {
    # --omit=dev leaves out tsx/typescript/@types/* - prisma (the CLI, used
    # by the installer's migrate-deploy [Run] step) must stay a real
    # dependency in server/package.json for it to survive this, not a
    # devDependency, since a customer PC has no separate way to fetch it.
    npm ci --omit=dev --workspace=server
    if ($LASTEXITCODE -ne 0) { throw "npm ci --omit=dev --workspace=server failed (exit code $LASTEXITCODE)." }
    # This scratch install's node_modules is what actually ships to the
    # customer - if @prisma/client's postinstall got blocked here too (same
    # reasoning as step [1/5] above), the installed app would have no
    # generated Prisma Client at all and every database call would fail at
    # runtime. Not just a build-time nuisance here - generate explicitly.
    npm run prisma:generate --workspace server
    if ($LASTEXITCODE -ne 0) { throw "prisma generate (scratch tree) failed (exit code $LASTEXITCODE)." }
} finally {
    Pop-Location
}

$ServerStage = Join-Path $StageDir "server"
if (Test-Path $ServerStage) { Remove-Item -Recurse -Force $ServerStage }
New-Item -ItemType Directory -Force -Path $ServerStage | Out-Null
Copy-Item "$BuildRoot\server\dist" "$ServerStage\dist" -Recurse
Copy-Item "$BuildRoot\server\prisma" "$ServerStage\prisma" -Recurse
Copy-Item "$BuildRoot\server\package.json" "$ServerStage\package.json"
Copy-Item "$BuildRoot\node_modules" "$ServerStage\node_modules" -Recurse

$ClientStage = Join-Path $StageDir "client"
if (Test-Path $ClientStage) { Remove-Item -Recurse -Force $ClientStage }
Copy-Item "$BuildRoot\client\dist" $ClientStage -Recurse

Write-Host "==> [3/6] Downloading portable Node.js v$NodeVersion (win-x64)"
$NodeZipName = "node-v$NodeVersion-win-x64.zip"
$NodeZipPath = Join-Path $DownloadCache $NodeZipName
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeZipName"
$NodeShasumsUrl = "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt"

if (-not (Test-Path $NodeZipPath)) {
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZipPath
}
$shasums = (Invoke-WebRequest -Uri $NodeShasumsUrl -UseBasicParsing).Content
$expectedLine = ($shasums -split "`n") | Where-Object { $_ -match [regex]::Escape($NodeZipName) }
if (-not $expectedLine) { throw "Could not find $NodeZipName in Node's published SHASUMS256.txt - aborting rather than installing an unverified binary." }
$expectedHash = ($expectedLine -split "\s+")[0]
Assert-Sha256 -FilePath $NodeZipPath -ExpectedHash $expectedHash

$NodeExtractDir = Join-Path $StageDir "node"
if (Test-Path $NodeExtractDir) { Remove-Item -Recurse -Force $NodeExtractDir }
Expand-Archive -Path $NodeZipPath -DestinationPath $DownloadCache -Force
Move-Item (Join-Path $DownloadCache "node-v$NodeVersion-win-x64") $NodeExtractDir

Write-Host "==> [4/6] Downloading mkcert v$MkcertVersion"
# mkcert publishes a raw per-platform .exe as its release asset (no zip),
# unlike Node/nssm below. Like nssm, it doesn't publish a SHASUMS file - the
# same accepted compromise as nssm's own note just below applies here too:
# fetched over HTTPS from the official GitHub release, not checksum-
# verified. If you have a known-good hash for the version you're pinning,
# verify it here the same way as the Node download above.
$MkcertExeName = "mkcert-v$MkcertVersion-windows-amd64.exe"
$MkcertPath = Join-Path $DownloadCache $MkcertExeName
$MkcertUrl = "https://github.com/FiloSottile/mkcert/releases/download/v$MkcertVersion/$MkcertExeName"

if (-not (Test-Path $MkcertPath)) {
    Invoke-WebRequest -Uri $MkcertUrl -OutFile $MkcertPath
}

$MkcertStage = Join-Path $StageDir "mkcert"
New-Item -ItemType Directory -Force -Path $MkcertStage | Out-Null
Copy-Item $MkcertPath (Join-Path $MkcertStage "mkcert.exe")

Write-Host "==> [5/6] Downloading nssm v$NssmVersion"
# nssm.cc doesn't publish a SHASUMS file the way nodejs.org does - if you
# have a known-good hash for the version you're pinning, verify it here the
# same way as the Node download above. At minimum, download over HTTPS from
# the official site and don't substitute a mirror.
$NssmZipName = "nssm-$NssmVersion.zip"
$NssmZipPath = Join-Path $DownloadCache $NssmZipName
$NssmUrl = "https://nssm.cc/release/$NssmZipName"

if (-not (Test-Path $NssmZipPath)) {
    Invoke-WebRequest -Uri $NssmUrl -OutFile $NssmZipPath
}
$NssmExtractDir = Join-Path $DownloadCache "nssm-extract"
if (Test-Path $NssmExtractDir) { Remove-Item -Recurse -Force $NssmExtractDir }
Expand-Archive -Path $NssmZipPath -DestinationPath $NssmExtractDir -Force

$NssmStage = Join-Path $StageDir "nssm"
New-Item -ItemType Directory -Force -Path $NssmStage | Out-Null
# The release zip nests win64/win32 builds under nssm-<version>\ - adjust
# this path if a different nssm version changes that layout.
Copy-Item (Join-Path $NssmExtractDir "nssm-$NssmVersion\win64\nssm.exe") (Join-Path $NssmStage "nssm.exe")

Write-Host "==> [6/6] Compiling installer with ISCC"
$IsccCommand = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
if ($IsccCommand) {
    $IsccPath = $IsccCommand.Source
} else {
    $DefaultIscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
    if (Test-Path $DefaultIscc) { $IsccPath = $DefaultIscc } else {
        throw "ISCC.exe not found on PATH or at the default Inno Setup 6 location. Install Inno Setup: https://jrsoftware.org/isinfo.php"
    }
}
& $IsccPath (Join-Path $InstallerDir "FITWORK.iss")
# $ErrorActionPreference = "Stop" only governs PowerShell's own error
# stream - it does not turn a nonzero exit code from a native executable
# into a terminating error, so without this check a failed ISCC compile
# would fall straight through to the success message below.
if ($LASTEXITCODE -ne 0) {
    throw "ISCC compilation failed (exit code $LASTEXITCODE). See the errors above - the installer .exe was not produced."
}

Write-Host "`nDone. Installer should be at installer\dist\FITWORK-Setup-*.exe"
