@echo off
node --import "%~dp0..\..\..\local-server\scripts\register-esm-loader.mjs" "%~dp0..\..\..\local-server\dist\src\index.js" %*
