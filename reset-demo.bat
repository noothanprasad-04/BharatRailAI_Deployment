@echo off
if exist backend\runtime\state.json del /q backend\runtime\state.json
if exist backend\runtime rmdir /s /q backend\runtime
mkdir backend\runtime
 echo RailBlock AI demo state reset. The original synthetic CSV datasets were not changed.
