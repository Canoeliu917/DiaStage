param([switch]$Check)
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction Stop
$npmCommand = Get-Command npm -ErrorAction Stop
$nodeVersion = [version]((& $nodeCommand.Source --version).TrimStart('v'))
if ($nodeVersion -lt [version]'22.13.0') { throw 'Please install Node.js 22.13 or newer (Node 24 recommended).' }

Push-Location $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath 'node_modules/next/dist/bin/next')) {
        if ($Check) { throw 'Dependencies are missing. Run this script without -Check to install them.' }
        & $npmCommand.Source exec --yes --package=bun@1.3.14 -- bun install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    $env:PORT = '4318'
    $env:PASCAL_DATA_DIR = Join-Path $PSScriptRoot 'data'
    $env:PASCAL_DB_PATH = Join-Path $env:PASCAL_DATA_DIR 'pascal.db'
    $env:NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:4318'

    if ($Check) {
        $planText = & $npmCommand.Source exec --yes --package=bun@1.3.14 -- bun x turbo run build '--filter=editor^...' --dry=json
        if ($LASTEXITCODE -ne 0) { throw 'Dependency build plan failed.' }
        $plan = $planText | ConvertFrom-Json
        if ($plan.tasks.taskId -contains 'editor#build') { throw 'Unexpected full application build in dependency plan.' }
        & $nodeCommand.Source node_modules/next/dist/bin/next dev apps/editor --hostname=127.0.0.1 --port=4318 --help | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Next.js startup command is unavailable.' }
        Write-Host "Check passed: Node $nodeVersion; dependency plan ready; Next.js CLI ready. No server started."
        return
    }

    & $npmCommand.Source exec --yes --package=bun@1.3.14 -- bun x turbo run build '--filter=editor^...' --env-mode=loose
    if ($LASTEXITCODE -ne 0) { throw 'Dependency build failed.' }
    Write-Host 'Open http://127.0.0.1:4318/scene/empty-table-camera after Next.js is ready.'
    Write-Host 'First setup: run the seed command in CAMERA_STUDIO.md from another terminal.'
    & $nodeCommand.Source node_modules/dotenv-cli/cli.js -e .env -e .env.local -e .env.defaults -- $nodeCommand.Source node_modules/next/dist/bin/next dev apps/editor --hostname=127.0.0.1 --port=4318
    if ($LASTEXITCODE -ne 0) { throw 'The development server exited with an error. Check the log above.' }
} finally {
    Pop-Location
}
