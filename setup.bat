@echo off
echo ==============================================
echo  RepRush Setup Script
echo ==============================================
echo.

echo [1/6] Copying logo...
if exist "E:\RepRush-Kotlin\app_icon.png" (
    if not exist "E:\RepRush\frontend\public\icons" mkdir "E:\RepRush\frontend\public\icons"
    copy "E:\RepRush-Kotlin\app_icon.png" "E:\RepRush\frontend\public\icons\icon-192.png" /Y
    copy "E:\RepRush-Kotlin\app_icon.png" "E:\RepRush\frontend\public\icons\icon-512.png" /Y
    copy "E:\RepRush-Kotlin\app_icon.png" "E:\RepRush\frontend\public\icon.png" /Y
    echo Logo copied successfully!
) else (
    echo WARNING: Logo not found at E:\RepRush-Kotlin\app_icon.png
    echo You can copy it manually later to frontend\public\icons\
)

echo.
echo [2/6] Installing backend dependencies (this takes 1-2 minutes)...
cd /d "E:\RepRush\backend"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Backend npm install failed!
    pause
    exit /b 1
)
echo Backend installed!

echo.
echo [3/6] Installing frontend dependencies (this takes 1-2 minutes)...
cd /d "E:\RepRush\frontend"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Frontend npm install failed!
    pause
    exit /b 1
)
echo Frontend installed!

echo.
echo [4/6] Setting up git repository...
cd /d "E:\RepRush"

REM Remove corrupt .git if it exists and reinitialize cleanly
if exist ".git" (
    echo Removing old/corrupt .git directory...
    rmdir /s /q ".git"
)

git init -b main
git config user.email "frezwoan@gmail.com"
git config user.name "Rezwoan"
echo Git initialized!

echo.
echo [5/6] Creating initial commit...
git add .
git commit -m "feat: initial RepRush PWA — full app scaffold

Backend (NestJS + SQLite3):
- JWT auth with httpOnly cookies + invite system
- User profiles, onboarding progress tracking
- Workout session logging with sets/reps/weights
- Progressive overload algorithm (Epley + baseline)
- 3-tab leaderboard: RSS, Wilks Score, Progress Rate
- Achievements: BW-based strength goals
- Creatine tracker (multiple doses per day)
- Admin panel: invite users, manage plans, compare charts
- Email invitations via Resend (rezwon.me domain)

Frontend (Next.js 14 PWA):
- Dark theme, Tailwind CSS, mobile-first
- GitHub-style gym attendance heatmap
- Active workout session UI with rest timer
- Onboarding flow with % completion banner
- Leaderboard with 3 scoring tabs
- Achievements with progress bars

Co: Claude (Anthropic)"

echo.
echo [6/6] Adding GitHub remote...
git remote add origin https://github.com/Rezwoan/RepRush.git
echo Remote added!

echo.
echo ==============================================
echo  SETUP COMPLETE!
echo.
echo  Push to GitHub:
echo    git push -u origin main
echo.
echo  Start developing:
echo    Backend:  cd backend ^&^& npm run start:dev
echo    Frontend: cd frontend ^&^& npm run dev
echo.
echo  Admin login:
echo    Email:    frezwoan+reprush@gmail.com
echo    Password: RepRush@Admin2025
echo ==============================================
pause
