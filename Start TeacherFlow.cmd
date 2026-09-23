@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1" %*
set "teacherflow_exit=%errorlevel%"
if not "%teacherflow_exit%"=="0" pause
exit /b %teacherflow_exit%
