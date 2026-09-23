@echo off
setlocal
cd /d "%~dp0"

echo [Elren] Scan workflows subfolders...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare_workflow_templates.ps1"
echo [Done] workflows scan finished.
endlocal
