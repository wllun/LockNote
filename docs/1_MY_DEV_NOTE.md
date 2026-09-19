## MY OWN STYLE ##
## Short-path standalone release build

1. Copy the latest code to the short build folder
Personal Laptop:
robocopy "C:\Users\behwl\OneDrive\Documents\ReactNative\LockNote" "C:\LNBuild" /E /XD .git node_modules android ios .expo dist web-build

Company Laptop:
robocopy "C:\Users\behwl\OneDrive\Documents\ReactNative\LockNote" "C:\LNBuild" /E /XD .git node_modules android ios .expo dist web-build

2. Update the generated project
cd C:\LNBuild
npm.cmd ci
npx.cmd expo prebuild --platform android --no-install

3. Build the physical-device APK
cd C:\LNBuild\android
.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m"

4. Wait until `BUILD SUCCESSFUL`

5. Connect and update the app
adb devices
adb -d install -r "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"




## ################################################################ ##




# Short-directory Android build workflow

Updated: 2026-09-19. This avoids long Windows/OneDrive native-build paths. Run from the latest checkout with Node.js ≥20.19.4, JDK 17 and Android SDK/platform-tools installed.

## 1. Copy the latest code to the short build folder

Run the command for your laptop.

Personal laptop:

```powershell
robocopy "C:\Users\behwl\OneDrive\Documents\ReactNative\LockNote" "C:\LNBuild" /E /XD .git node_modules android ios .expo dist web-build
```

Company Laptop Cmd:

```powershell
robocopy "C:\Users\User\Desktop\React App\LockNote" "C:\LNBuild" /E /XD .git node_modules android ios .expo dist web-build
```

Confirm the source is LockNote before copying. Robocopy codes 0–7 are nonfatal; 8+ indicates failure. `/E` does not remove obsolete destination files, so review renamed/deleted source files when reusing the copy. Do not blindly use `/MIR` or delete signing files. Ensure copied `.env` values target the intended environment and contain no server secrets.

## 2. Update the generated project

```powershell
Set-Location "C:\LNBuild"
npm.cmd ci
npx.cmd expo prebuild --platform android --no-install
```

Prebuild is needed after native dependency/plugin/config changes, including background sync. Avoid `--clean` without safeguarding native/signing changes. Generated `android/` and `ios/` remain ignored in the current workflow.

## 3. Build the physical-device APK

```powershell
Set-Location "C:\LNBuild\android"
.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m"
```

This targets an ARM64 physical device. For a different device architecture, see [physical-device commands](COMMAND_RUN_APK.md).

## 4. Wait until `BUILD SUCCESSFUL`

Confirm the APK exists before installing:

```powershell
Test-Path "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
```

The result must be `True`, and the build must have succeeded.

## 5. Connect and update the app

Connect your phone with USB debugging enabled, then run:

```powershell
adb devices
adb -d install -r "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
```

Use the same signing certificate as the installed app. If installation reports a signature mismatch, stop before uninstalling: uninstalling deletes the app's local data. Release APKs run without Metro or Expo Go.

OS background sync needs the rebuilt binary, verified Plus/Pro access and Profile opt-in; see [Background Sync](BACKGROUND_SYNC.md). Keep APKs, local environment values and credentials out of Git; see [cleanup TODO](../TODO.md#7-parked-clean-up-files-included-in-git-commits).
