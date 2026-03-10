param(
  [switch]$ApkOnly,
  [switch]$BundleOnly
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$jdkPath = Join-Path $repoRoot '.local-tools\jdk-21'
$sdkPath = Join-Path $repoRoot '.local-tools\android-sdk'
$androidDir = Join-Path $repoRoot 'android'
$capSyncScript = 'npm run cap:sync:android'

if (-not (Test-Path $jdkPath)) {
  throw "JDK 21 not found at $jdkPath"
}

if (-not (Test-Path $sdkPath)) {
  throw "Android SDK not found at $sdkPath"
}

if (-not (Test-Path (Join-Path $androidDir 'key.properties'))) {
  throw "android\\key.properties is missing. Create signing config before building release."
}

Push-Location $repoRoot
try {
  Invoke-Expression $capSyncScript
} finally {
  Pop-Location
}

$tasks = @()
if (-not $BundleOnly) {
  $tasks += 'assembleRelease'
}
if (-not $ApkOnly) {
  $tasks += 'bundleRelease'
}

$candidateLetters = @('S', 'R', 'Q', 'P')
$chosenDrive = $null
foreach ($letter in $candidateLetters) {
  if (-not (Get-PSDrive -Name $letter -ErrorAction SilentlyContinue)) {
    $chosenDrive = "${letter}:"
    break
  }
}

if (-not $chosenDrive) {
  throw 'Could not find a free drive letter for temporary SUBST mapping.'
}

cmd /c "subst $chosenDrive `"$repoRoot`"" | Out-Null

try {
  $env:JAVA_HOME = "${chosenDrive}\.local-tools\jdk-21"
  $env:ANDROID_SDK_ROOT = "${chosenDrive}\.local-tools\android-sdk"
  $env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_SDK_ROOT\platform-tools;$env:PATH"

  Push-Location "${chosenDrive}\android"
  try {
    & .\gradlew.bat @tasks --stacktrace
  } finally {
    Pop-Location
  }
} finally {
  cmd /c "subst $chosenDrive /d" | Out-Null
}

if (-not $BundleOnly) {
  Write-Host "APK: $repoRoot\android\app\build\outputs\apk\release\app-release.apk"
}
if (-not $ApkOnly) {
  Write-Host "AAB: $repoRoot\android\app\build\outputs\bundle\release\app-release.aab"
}
