@echo off
setlocal
set "TCVN3_VSIX=%~dp0TCVN3-Editor-0.2.0.vsix"
if not exist "%TCVN3_VSIX%" set "TCVN3_VSIX=%~dp0dist\tcvn3-editor-0.2.0.vsix"
if not exist "%TCVN3_VSIX%" (
  echo Missing package: "%TCVN3_VSIX%"
  exit /b 1
)
set "TCVN3_FOUND=0"
set "TCVN3_FAILED=0"
if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" (
  call "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" --install-extension "%TCVN3_VSIX%" --force
  if errorlevel 1 set "TCVN3_FAILED=1"
  set "TCVN3_FOUND=1"
) else if exist "%LocalAppData%\Programs\Microsoft VS Code\bin\code.cmd" (
  call "%LocalAppData%\Programs\Microsoft VS Code\bin\code.cmd" --install-extension "%TCVN3_VSIX%" --force
  if errorlevel 1 set "TCVN3_FAILED=1"
  set "TCVN3_FOUND=1"
)
if exist "%LocalAppData%\Programs\Qoder IDE\bin\code.cmd" (
  call "%LocalAppData%\Programs\Qoder IDE\bin\code.cmd" --install-extension "%TCVN3_VSIX%" --force
  if errorlevel 1 set "TCVN3_FAILED=1"
  set "TCVN3_FOUND=1"
)
if "%TCVN3_FOUND%"=="0" (
  echo VS Code or Qoder IDE was not found. Use Install from VSIX in your editor.
  exit /b 1
)
if "%TCVN3_FAILED%"=="1" exit /b 1
echo TCVN3 Editor installed. Reopen the file or reload the editor window.
