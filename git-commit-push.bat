@echo off
echo Committing and pushing CI/CD setup...

cd /d "E:\RepRush"

if exist ".git\index.lock" del ".git\index.lock"

git add .github\ scripts\ AGENTS.md DEPLOYMENT.md
git commit -m "chore: add CI/CD pipeline, Pi deployment scripts, and docs"
git push origin main

echo.
echo Done! Check output above for any errors.
pause
