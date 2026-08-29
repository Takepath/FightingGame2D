@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM 入力したキャラクターIDからアセット用フォルダを作成する
REM このバッチはPNG画像を作成せず既存画像も上書きしない
set "CHARACTER_ID=%~1"
if not "%~1"=="" goto :validateId
set /p "CHARACTER_ID=Enter character ID: "

:validateId
REM IDはcharacters.csvと同じ文字種と長さに制限する
if "!CHARACTER_ID!"=="" goto :invalidId
echo(!CHARACTER_ID!| %SystemRoot%\System32\findstr.exe /r /x "[A-Za-z0-9_-][A-Za-z0-9_-]*" >nul
if errorlevel 1 goto :invalidId

set "ID_REMAIN=!CHARACTER_ID!"
set /a ID_LENGTH=0
:countIdLength
if "!ID_REMAIN!"=="" goto :checkedIdLength
set "ID_REMAIN=!ID_REMAIN:~1!"
set /a ID_LENGTH+=1
goto :countIdLength

:checkedIdLength
if !ID_LENGTH! GTR 64 goto :invalidId

set "CHARACTER_ROOT=%~dp0characters\!CHARACTER_ID!"
if exist "!CHARACTER_ROOT!\" goto :createStateFolders
mkdir "!CHARACTER_ROOT!"
if errorlevel 1 goto :createFailed

:createStateFolders
REM ゲームで対応している全状態のフォルダを作成する
for %%S in (idle walk jump light heavy special hit block crouchBlock cinematic down ko) do call :createStateFolder "%%S"
if errorlevel 1 goto :createFailed

echo.
echo Character folder structure is ready:
echo   !CHARACTER_ROOT!
echo.
echo Put the selection icon here:
echo   !CHARACTER_ROOT!\icon.png
echo Put the JSON fallback image here:
echo   !CHARACTER_ROOT!\fallback.png
echo Put 60FPS frames in each state folder as 000.png, 001.png, and so on.
exit /b 0

:createStateFolder
if exist "!CHARACTER_ROOT!\%~1\" exit /b 0
mkdir "!CHARACTER_ROOT!\%~1"
if errorlevel 1 exit /b 1
exit /b 0

:invalidId
echo [ERROR] Enter 1-64 characters using only A-Z, a-z, 0-9, underscore, or hyphen.
exit /b 1

:createFailed
echo [ERROR] Could not create the requested character folder structure.
exit /b 1
