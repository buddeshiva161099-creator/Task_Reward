@echo off
echo Activating virtual environment and starting backend...
start cmd /k "cd backend && call venv\Scripts\activate.bat &&  uvicorn app.main:app --reload --reload-exclude uploads --reload-exclude venv --reload-exclude .pytest_cache --port 8000"

echo Starting frontend...
start cmd /k "cd frontend && npm run dev"

echo Backend and frontend are starting in separate command windows.