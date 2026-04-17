@echo off
echo ===================================================
echo   Distrialma - Instalacion de impresion automatica
echo ===================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js no esta instalado.
    echo Descargalo de https://nodejs.org/ e instala la version LTS.
    echo Despues ejecuta este archivo de nuevo.
    pause
    exit /b 1
)

echo Node.js encontrado:
node --version
echo.

:: Create startup shortcut
echo Creando acceso directo en Inicio...
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SCRIPT_DIR=%~dp0

:: Create VBS script to make a shortcut (Windows doesn't have a native way)
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\createshortcut.vbs"
echo sLinkFile = "%STARTUP%\DistrialmaImprimir.lnk" >> "%TEMP%\createshortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\createshortcut.vbs"
echo oLink.TargetPath = "node" >> "%TEMP%\createshortcut.vbs"
echo oLink.Arguments = """%SCRIPT_DIR%print-client.js""" >> "%TEMP%\createshortcut.vbs"
echo oLink.WorkingDirectory = "%SCRIPT_DIR%" >> "%TEMP%\createshortcut.vbs"
echo oLink.WindowStyle = 7 >> "%TEMP%\createshortcut.vbs"
echo oLink.Description = "Distrialma Impresion Automatica" >> "%TEMP%\createshortcut.vbs"
echo oLink.Save >> "%TEMP%\createshortcut.vbs"
cscript //nologo "%TEMP%\createshortcut.vbs"
del "%TEMP%\createshortcut.vbs"

echo.
echo Instalacion completa!
echo - El programa se inicia automaticamente con Windows
echo - Imprime los cierres de caja en la impresora predeterminada
echo - Para probarlo ahora, ejecuta "iniciar.bat"
echo.
pause
