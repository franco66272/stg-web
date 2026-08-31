@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python Launcher no encontrado.
  pause
  exit /b 1
)
py -3.14 -m pip install -r requirements.txt
if errorlevel 1 exit /b 1
set /p TIENDA=Escribi la key de la tienda (ej. fenixcell_com_ar): 
py -3.14 scraper\probar_tienda.py "%TIENDA%"
pause
