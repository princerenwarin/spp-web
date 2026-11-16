@echo off
setlocal

set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined CHROME (
  for /f "delims=" %%I in ('where chrome.exe 2^>nul') do if not defined CHROME set "CHROME=%%I"
)

if not defined CHROME (
  echo Google Chrome tidak ditemukan.
  pause
  exit /b 1
)

set "PRINT_ARGS=--kiosk-printing"
if /I "%~1"=="setup" set "PRINT_ARGS="

start "" "%CHROME%" --user-data-dir="%LocalAppData%\SPP-Card-Print-Chrome" %PRINT_ARGS% "%~dp0index.html"
