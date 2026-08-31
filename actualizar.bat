@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo ReparaRadar - actualizacion de catalogos
echo ================================================

where py >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python Launcher no encontrado.
  pause
  exit /b 1
)

py -3.14 -m pip install -r requirements.txt
if errorlevel 1 (
  echo ERROR instalando dependencias.
  pause
  exit /b 1
)

echo.
echo Ejecutando todos los extractores...
py -3.14 scraper\runner.py
if errorlevel 1 (
  echo.
  echo ERROR: no se genero un catalogo utilizable.
  pause
  exit /b 1
)

echo.
echo ================================================
echo CATALOGO ACTUALIZADO
if exist catalogo.json (
  for %%A in (catalogo.json) do echo Archivo: %%~zA bytes
)
echo ================================================
echo.
echo Para iniciar la web:
echo   iniciar.bat
pause
