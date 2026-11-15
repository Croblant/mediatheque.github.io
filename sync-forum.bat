@echo off
cd /d "%~dp0"
echo Surveillance de forum.json (Ctrl+C pour arreter)...
node ".agents\skills\realsheet-tunebooks-sync\scripts\sync-sidecars.mjs" --watch
pause
