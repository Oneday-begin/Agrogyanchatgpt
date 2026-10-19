@echo off
cd /d "%~dp0"
title AgroGyan Launcher

python --version >nul 2>&1
if errorlevel 1 (
    echo Python is required to run AgroGyan.
    pause
    exit /b 1
)

if not exist venv (
    python -m venv venv
    if errorlevel 1 exit /b 1
)
call venv\Scripts\activate.bat

python -m pip install -r requirements.txt
if errorlevel 1 (
    echo Dependencies could not be installed.
    pause
    exit /b 1
)

echo Open http://127.0.0.1:8000 in your browser.
echo Ensure the Ollama app is running before continuing.
python -m backend.setup_rag
if errorlevel 1 (
    echo Model or OCR setup failed. Check the message above.
    pause
    exit /b 1
)
echo Chat answers use PDF embeddings and the local answer model.
echo Keep this launcher open while using AgroGyan.
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
if errorlevel 1 pause
