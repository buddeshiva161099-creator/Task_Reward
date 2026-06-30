@echo off
echo Starting MongoDB...
start cmd /k "mongo_extracted\mongodb-win32-x86_64-windows-7.0.12\bin\mongod.exe --dbpath mongo_data"
timeout /t 10 /nobreak >nul
echo Activating virtual environment and starting backend...
start cmd /k "cd backend && call venv\Scripts\activate.bat &&  uvicorn app.main:app --reload --reload-exclude uploads --reload-exclude venv --reload-exclude .pytest_cache --port 8000"

echo Starting frontend...
start cmd /k "cd frontend && npm run dev"

echo MongoDB, backend, and frontend are starting in separate command windows.