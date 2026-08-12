@echo off
setlocal EnableDelayedExpansion

if "%~1"=="" (
    set "TARGET=."
) else (
    set "TARGET=%~1"
)

set "OUTFILE=%CD%\tree.Conv.txt"

for %%F in ("%TARGET%") do set "ROOTNAME=%%~nxF"

echo %ROOTNAME% > "%OUTFILE%"

"%SystemRoot%\System32\tree.com" "%TARGET%" /F /A > "%TEMP%\tree_tmp.txt"

for /f "skip=1 delims=" %%L in (%TEMP%\tree_tmp.txt) do (
    set "LINE=%%L"

    set "LINE=!LINE:+---=|_!"
    set "LINE=!LINE:\---=|_!"

    >> "%OUTFILE%" echo(!LINE!
)

del "%TEMP%\tree_tmp.txt"

echo 出力完了: %OUTFILE%