@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python Launcher no encontrado.
  pause
  exit /b 1
)
if not exist catalogo.json (
  echo No existe catalogo.json. Ejecutando actualizacion primero...
  call actualizar.bat
  if errorlevel 1 exit /b 1
)
py -3.14 app.py
