@echo off
rem =============================================
rem  Start the analytics backend + static site
rem  Visit: http://127.0.0.1:8000
rem =============================================
set PY=%~dp0..\..\..\..\.workbuddy\binaries\python\envs\default\Scripts\python.exe
if not exist "%PY%" set PY=python
cd /d %~dp0
echo Starting server at http://127.0.0.1:8000 ...
"%PY%" run.py
pause
