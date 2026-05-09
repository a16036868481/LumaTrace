# Windows Preview Release

This document describes the one-click Windows preview release flow. It publishes an unsigned GitHub prerelease for early QA and user testing. It is not a production release.

## Command

```powershell
pnpm release:windows-preview -- --tag v0.1.0-preview.2 --publish
```

Use `--dry-run` instead of `--publish` to build, verify, and stage assets without creating a git tag or GitHub release.

The command runs the Windows preview release checks sequentially. Do not run the packaging steps in parallel because the Tauri build and sidecar packaging scripts rewrite the same `src-tauri/binaries` and release target folders.

## What It Does

- Verifies the repo is ready for a release tag when `--publish` is used.
- Runs the existing test, smoke, Android Beta, PC Beta, Tauri, sidecar, packaging diagnostics, and Windows installer draft checks.
- Builds the self-contained sidecar draft and unsigned Windows NSIS installer draft.
- Runs installer install/uninstall smoke and installed sidecar health smoke.
- Stages release assets under the Tauri release target directory.
- Renames the setup executable to include the release tag.
- Writes bilingual release notes with English as the primary language and a Chinese summary.
- Uses `gh release create --prerelease` only when `--publish` is explicitly passed.

## Required Tools

- Git
- GitHub CLI authenticated with `gh auth login`
- Node and pnpm
- Rust/Cargo/rustc
- Tauri CLI
- Microsoft C++ Build Tools and WebView2 Runtime on Windows

The script does not auto-install Rust, Tauri, or GitHub CLI.

## Safety Rules

- The release is unsigned and remains a prerelease.
- `productionReady` remains `false`.
- Code signing is not complete.
- No updater is configured.
- Store distribution is not configured.
- The local auth token is not written to release notes, logs, reports, diagnostics, URLs, or `VITE_` variables.
- Missing metrics stay N/A and are not filled with 0.

## 中文说明

这个流程用于一键生成并上传 Windows 预览版安装包到 GitHub Releases。它不是正式生产发布。

- 安装包未签名，Windows 可能提示 SmartScreen。
- 当前没有自动更新、商店发布或正式代码签名。
- `productionReady=false` 必须保持不变。
- 发布说明包含英文主说明和中文摘要。
