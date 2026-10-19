@echo off
cd /d "%~dp0"
title AgroGyan Launcher

echo ===============================
echo     AgroGyan Smart Launcher
echo ===============================
echo.

REM ==================================
REM 1. Check Python
REM ==================================
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed.
    pause
    exit
)

REM ==================================
REM 2. Create virtual environment
REM ==================================
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate

REM ==================================
REM 3. Install requirements IF missing
REM ==================================
if not exist venv\Lib\site-packages\fastapi (
    echo Installing required packages...
    pip install -r requirements.txt
) else (
    echo Requirements already installed.
)

REM ==================================
REM 4. Check Tesseract
REM ==================================
tesseract --version >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Tesseract not found in PATH.
    echo Please install Tesseract and add to PATH.
    pause
)

REM ==================================
REM 5. Check Ollama
REM ==================================
ollama --version >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Ollama not installed.
    echo Please install Ollama.
    pause
)

REM ==================================
REM 6. Check Mistral Model
REM ==================================
ollama list | findstr mistral >nul
if %errorlevel% neq 0 (
    echo Downloading mistral model...
    ollama pull mistral
) else (
    echo Mistral model already available.
)

REM ==================================
REM 7. Start Ollama
REM ==================================
start cmd /k "ollama serve"

REM ==================================
REM 8. Start Backend
REM ==================================
start cmd /k "call venv\Scripts\activate && python -m uvicorn backend.main:app --reload"

REM ==================================
REM 9. Start Frontend
REM ==================================
start cmd /k "cd frontend && python -m http.server 5500"

echo.
echo ===============================
echo   AgroGyan is Running
echo Backend:  http://127.0.0.1:8000/docs
echo Frontend: http://127.0.0.1:5500/index.html
echo ===============================

pause
