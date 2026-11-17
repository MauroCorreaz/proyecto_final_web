@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instala Node.js LTS y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo No se encontro npm. Reinstala Node.js LTS con npm incluido.
  pause
  exit /b 1
)

if not exist "node_modules\mysql2\promise.js" (
  echo Preparando el conector de MySQL por primera vez...
  call npm install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

call npm start
pause
