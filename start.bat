@echo off
title LiveVoice AI Server
echo ========================================================
echo   LiveVoice AI - Live Transcribe & Multi-Model Router
echo ========================================================
echo.
echo Menjalankan local server di port 3000...
echo.

where npx >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Menggunakan npx serve...
    start http://localhost:3000
    npx -y serve -l 3000 .
    goto end
)

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Menggunakan Python HTTP server...
    start http://localhost:3000
    python -m http.server 3000
    goto end
)

echo Membuka index.html langsung di browser...
start index.html

:end
pause
