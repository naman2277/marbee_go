@echo off
cd /d "%~dp0.."
echo Marbee Edge Functions Deploy
echo.

set PROJECT=uqffhyaftlwetqigfenp

echo Linking project...
call supabase link --project-ref %PROJECT%
if errorlevel 1 goto :fail

echo.
echo Deploying push-subscribe...
call supabase functions deploy push-subscribe --project-ref %PROJECT% --use-api --no-verify-jwt
if errorlevel 1 goto :fail

echo.
echo Deploying channel-send...
call supabase functions deploy channel-send --project-ref %PROJECT% --use-api --no-verify-jwt
if errorlevel 1 goto :fail

echo.
echo Deploying push-engage...
call supabase functions deploy push-engage --project-ref %PROJECT% --use-api --no-verify-jwt
if errorlevel 1 goto :fail

echo.
echo Deploying events-ingest...
call supabase functions deploy events-ingest --project-ref %PROJECT% --use-api --no-verify-jwt
if errorlevel 1 goto :fail

echo.
echo Deploying rtm-ingest...
call supabase functions deploy rtm-ingest --project-ref %PROJECT% --use-api --no-verify-jwt
if errorlevel 1 goto :fail

echo.
echo Deploying rtm-worker...
call supabase functions deploy rtm-worker --project-ref %PROJECT% --use-api --no-verify-jwt
if errorlevel 1 goto :fail

echo.
echo Deploying pipeline-run-worker...
call supabase functions deploy pipeline-run-worker --project-ref %PROJECT% --use-api --no-verify-jwt
if errorlevel 1 goto :fail

echo.
echo SUCCESS! Functions deployed:
echo   https://%PROJECT%.supabase.co/functions/v1/push-subscribe
echo   https://%PROJECT%.supabase.co/functions/v1/channel-send
echo   https://%PROJECT%.supabase.co/functions/v1/push-engage
echo   https://%PROJECT%.supabase.co/functions/v1/events-ingest
echo   https://%PROJECT%.supabase.co/functions/v1/rtm-ingest
echo   https://%PROJECT%.supabase.co/functions/v1/rtm-worker
echo   https://%PROJECT%.supabase.co/functions/v1/pipeline-run-worker
goto :end

:fail
echo.
echo FAILED. Make sure you ran: supabase login
exit /b 1

:end
