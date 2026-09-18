# Run LockNote on an Android Virtual Device

Prerequisites: Node.js ≥20.19.4, JDK 17, Android Studio/SDK, dependencies and the current copy prepared with [the short-directory workflow](1_MY_DEV_NOTE.md). AVD checks do not replace physical-device verification.

## 1. Debug with a development build

Start an Android Virtual Device from **Android Studio > Device Manager**, then run:

```powershell
adb devices
Set-Location "C:\LNBuild"
npx.cmd expo run:android --device
```

Select the emulator, not a connected phone. ADB `-e` targets one emulator; use `-s SERIAL` for multiple emulators.

For later sessions, start Metro without rebuilding:

```powershell
Set-Location "C:\LNBuild"
npx.cmd expo start --dev-client
```

Open the LockNote development build in the emulator. Press `j` in the Metro terminal to open React Native DevTools.

## 2. Install the release APK

Most Android Virtual Devices use `x86_64`, so build an emulator-compatible APK first:

```powershell
Set-Location "C:\LNBuild"
npx.cmd expo prebuild --platform android --no-install
Set-Location "C:\LNBuild\android"
.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=x86_64 "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m"
Test-Path "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
adb -e install -r "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
```

Use the AVD's actual ABI if it differs. Continue only after `BUILD SUCCESSFUL`; an older APK at the same path is not a new build. Release bundles run without Metro/Expo Go.

For `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, prefer the original signing key, or uninstall only a disposable emulator installation after preserving needed data. Uninstall deletes local app data:

```powershell
adb -e uninstall com.locknote.app
adb -e install "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
```

## 3. Run through Expo Go

Start the Android Virtual Device, then run:

```powershell
Set-Location "C:\Users\behwl\OneDrive\Documents\ReactNative\LockNote"
npx.cmd expo start --go
```

Use [SDK 54-compatible Android Expo Go](https://expo.dev/go). Press `a` to open the app in the emulator and select the intended target. Native billing and OS background sync need a rebuilt native app, not Expo Go.
