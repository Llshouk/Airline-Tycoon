param(
  [Parameter(Mandatory = $true)]
  [string]$Bin,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$BinArgs
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$localBin = Join-Path $projectRoot $Bin
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$pathNode = Get-Command node -ErrorAction SilentlyContinue

if (Test-Path $bundledNode) {
  $node = $bundledNode
} elseif ($pathNode) {
  $node = $pathNode.Source
} else {
  throw "Node.js was not found. Install Node.js or run this project from Codex so the bundled runtime is available."
}

if (!(Test-Path $localBin)) {
  throw "Could not find $Bin. Run pnpm install first."
}

& $node $localBin @BinArgs
exit $LASTEXITCODE
