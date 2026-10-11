# Deploy Marbee Edge Functions to Supabase
# Prerequisites: Supabase access token from https://supabase.com/dashboard/account/tokens

param(
    [string]$Token = $env:SUPABASE_ACCESS_TOKEN
)

$ProjectRef = "uqffhyaftlwetqigfenp"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not $Token) {
    Write-Host ""
    Write-Host "Supabase login required. Choose ONE option:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Option A - Interactive (opens browser):" -ForegroundColor Cyan
    Write-Host "    supabase login"
    Write-Host ""
    Write-Host "  Option B - Access token:" -ForegroundColor Cyan
    Write-Host "    1. Create token: https://supabase.com/dashboard/account/tokens"
    Write-Host "    2. Run: `$env:SUPABASE_ACCESS_TOKEN='sbp_your_token'; .\scripts\deploy-functions.ps1"
    Write-Host ""
    exit 1
}

$env:SUPABASE_ACCESS_TOKEN = $Token

Write-Host "Linking project $ProjectRef..." -ForegroundColor Green
supabase link --project-ref $ProjectRef

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$functions = @("push-subscribe", "channel-send", "push-engage", "events-ingest", "rtm-ingest", "rtm-worker", "pipeline-run-worker")

foreach ($fn in $functions) {
    Write-Host "Deploying $fn..." -ForegroundColor Green
    # --no-verify-jwt: SDK calls use anon key + X-Tenant-Id headers
    # --use-api: bundle without Docker (works on Windows)
    supabase functions deploy $fn --project-ref $ProjectRef --use-api --no-verify-jwt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to deploy $fn" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host ""
Write-Host "All functions deployed successfully!" -ForegroundColor Green
Write-Host "URLs:" -ForegroundColor Cyan
Write-Host "  https://$ProjectRef.supabase.co/functions/v1/events-ingest"
Write-Host "  https://$ProjectRef.supabase.co/functions/v1/push-subscribe"
Write-Host "  https://$ProjectRef.supabase.co/functions/v1/channel-send"
Write-Host "  https://$ProjectRef.supabase.co/functions/v1/rtm-ingest   (POST /v1/messages)"
Write-Host "  https://$ProjectRef.supabase.co/functions/v1/rtm-worker   (replay / retry)"
