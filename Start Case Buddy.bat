@echo off
rem Windows: double-click to start Case Practice Buddy with the working microphone button.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install it from https://nodejs.org ^(LTS^), then double-click this file again. & pause & exit /b 1)
if not exist node_modules (echo First run: installing, about a minute... & call npm install --no-fund --no-audit || (pause & exit /b 1))
set HASKEY=0
if defined ANTHROPIC_API_KEY set HASKEY=1
findstr /r "^ANTHROPIC_API_KEY=." .env >nul 2>nul && set HASKEY=1
if "%HASKEY%"=="0" (
  where claude >nul 2>nul || (
    echo Connecting to Claude, one time: installing Claude Code so the app can use your Claude login...
    call npm install -g @anthropic-ai/claude-code
    echo A browser window will open to sign in to Claude.
    call claude auth login
  )
)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
echo Case Practice Buddy is running at http://localhost:3000 - keep this window open while you practise.
call npm start
