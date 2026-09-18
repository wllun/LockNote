# Short-directory Android build workflow

Updated: 2026-09-19. This avoids long Windows/OneDrive native-build paths. Run from the latest checkout with Node.js ≥20.19.4, JDK 17 and Android SDK/platform-tools installed.

## 1. Copy current source

```powershell
$ProjectRoot = (Get-Location).Path
robocopy "$ProjectRoot" "C:\LNBuild" /E /XD .git node_modules android ios .expo dist web-build
```

Confirm the source is LockNote before copying. Robocopy codes 0–7 are nonfatal; 8+ indicates failure. `/E` does not remove obsolete destination files, so review renamed/deleted source files when reusing the copy. Do not blindly use `/MIR` or delete signing files. Ensure copied `.env` values target the intended environment and contain no server secrets.

## 2. Install exact dependencies and regenerate native configuration

```powershell
Set-Location "C:\LNBuild"
npm.cmd ci
npx.cmd expo prebuild --platform android --no-install
```

Prebuild is needed after native dependency/plugin/config changes, including background sync. Avoid `--clean` without safeguarding native/signing changes. Generated `android/` and `ios/` remain ignored in the current workflow.

## 3. Build and install

Follow [physical-device commands](COMMAND_RUN_APK.md) or [AVD commands](COMMAND_RUN_AVD.md) for target ABI, Gradle and ADB commands. Wait for `BUILD SUCCESSFUL`, verify the APK path and preserve the signing certificate. Release APKs embed current JS/assets/configuration and run without Metro or Expo Go.

OS background sync needs the rebuilt binary, verified Plus/Pro access and Profile opt-in; see [Background Sync](BACKGROUND_SYNC.md). Keep APKs, local environment values and credentials out of Git; see [cleanup TODO](../TODO.md#7-parked-clean-up-files-included-in-git-commits).
