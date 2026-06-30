@echo off
echo Stopping all Vison workspace processes...

echo Killing MongoDB database (mongod)...
taskkill /F /IM mongod.exe 2>nul

echo Killing backend server (uvicorn)...
taskkill /F /IM uvicorn.exe 2>nul

echo Killing frontend server (node)...
taskkill /F /IM node.exe 2>nul

echo All processes terminated successfully!
pause
