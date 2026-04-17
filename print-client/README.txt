DISTRIALMA - IMPRESION AUTOMATICA DE CIERRES
=============================================

Este programa imprime automaticamente los cierres de caja
en la impresora predeterminada de Windows, sin dialogo.

REQUISITOS:
- Windows 10 o 11
- Node.js instalado (https://nodejs.org/ → version LTS)
- SumatraPDF.exe en esta carpeta (https://www.sumatrapdfreader.com/)
  O Adobe Reader instalado

INSTALACION:
1. Descargar SumatraPDF portable y copiar SumatraPDF.exe a esta carpeta
2. Ejecutar "instalar.bat" (crea acceso directo en Inicio)
3. Listo — se inicia solo con Windows

PRUEBA:
- Ejecutar "iniciar.bat" para ver la consola
- Hacer un cierre de caja desde la web
- En 30 segundos se imprime automaticamente

DESINSTALAR:
- Borrar el acceso directo de:
  %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DistrialmaImprimir.lnk
