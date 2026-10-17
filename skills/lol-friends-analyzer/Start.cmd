@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run.ps1" -OpenReport %*
if errorlevel 1 (
  echo.
  echo Failed. See the message above. You can retry with:
  echo Start.cmd -GameRoot "D:\YourLeagueFolder"
)
pause
