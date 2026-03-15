@echo off
echo ==============================================
echo  Starting AI Blood Pressure Dashboard
echo ==============================================

:: Start Backend FastAPI Server
echo Starting Backend Server on port 8000...
start cmd /k "cd backend && py -m uvicorn main:app --reload --port 8000"

:: Start Frontend HTTP Server
echo Starting Frontend Server on port 8080...
start cmd /k "cd frontend && py -m http.server 8080"

echo.
echo ==============================================
echo  Servers are running!
echo  Backend API: http://127.0.0.1:8000
echo  Frontend UI: http://localhost:8080
echo ==============================================
echo Press any key to stop all servers...
pause
taskkill /IM python.exe /F
taskkill /IM py.exe /F
echo Servers stopped.
