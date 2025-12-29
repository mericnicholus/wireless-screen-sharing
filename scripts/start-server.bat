@echo off
title MUST Screen Sharing Server
echo ========================================
echo   Wireless Screen Sharing System
echo   Mbarara University of Science and Technology
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if in server directory
if not exist "package.json" (
    echo ERROR: Please run this script from the server directory
    echo Current directory: %CD%
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Set environment variables
set NODE_ENV=development
set PORT=3000
set HOST=0.0.0.0

echo Starting Server...
echo.
echo Server will be available at:
echo   Lecturer: http://localhost:%PORT%/lecturer
echo   Student:  http://localhost:%PORT%/student
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start the server
node server.js

if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Server failed to start
    echo Check the error messages above
    pause
)