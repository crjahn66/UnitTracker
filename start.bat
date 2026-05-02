@echo off
set PATH=C:\nvm4w\nodejs;C:\Users\kiraz\AppData\Local\nvm\v20.19.1;%PATH%
cd /d "C:\OD\OneDrive - Red Group\Tools\UnitTracker"
echo Node version:
node --version
echo.
echo Starting UnitTracker - scan the QR code with Expo Go on your phone...
echo.
node node_modules\@expo\cli\build\bin\cli start
