# Run LockNote on a Physical Android Device

Prerequisites: Node.js ≥20.19.4, JDK 17, Android SDK/platform-tools and the current `C:\LNBuild` copy. Prepare it with [the short-directory workflow](1_MY_DEV_NOTE.md); building an old copy does not include new source.

## 1. Debug with a development build

Enable **Developer options** and **USB debugging** on the phone, connect it by USB, unlock it, and accept the debugging prompt.

```powershell
adb devices
Set-Location "C:\LNBuild"
npx.cmd expo run:android --device
```

Select the physical device when prompted. For later sessions, start Metro without rebuilding:

```powershell
Set-Location "C:\LNBuild"
npx.cmd expo start --dev-client
```

Open the LockNote development build on the phone. Press `j` in the Metro terminal to open React Native DevTools.

## 2. Install the release APK

Build the latest standalone bundle first. Most current phones use `arm64-v8a`; choose the target's actual ABI.

```powershell
Set-Location "C:\LNBuild"
npx.cmd expo prebuild --platform android --no-install
Set-Location "C:\LNBuild\android"
.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m"
Test-Path "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
```

Continue only after `BUILD SUCCESSFUL`. The installed release bundle needs neither Expo Go nor Metro. Use `adb -d` for a single phone, or `adb -s SERIAL` for multiple phones.

```powershell
adb devices
adb -d install -r "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
```

If installation fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, the installed app uses a different signing key. Uninstalling it deletes all locally stored LockNote data:

```powershell
adb -d uninstall com.locknote.app
adb -d install "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
```

Prefer the original signing certificate to preserve data. Export Backup is hidden in Settings; confirm a usable sync/restore copy before uninstalling. An install failure is not permission to erase data. Store builds need production signing, not just a release filename.

## 3. Run through Expo Go

Install an **SDK 54-compatible Expo Go** from [Expo Go downloads](https://expo.dev/go); the newest Play Store build may target another SDK. Connect phone/computer to the same network, then run:

```powershell
Set-Location "C:\Users\behwl\OneDrive\Documents\ReactNative\LockNote"
npx.cmd expo start --go
```

Scan the displayed QR code with Expo Go. If the phone cannot connect over the local network:

```powershell
npx.cmd expo start --go --tunnel
```

Native billing and OS background synchronization require a rebuilt native app. Expo Go uses foreground automatic-sync fallback. See [Background Sync](BACKGROUND_SYNC.md).
