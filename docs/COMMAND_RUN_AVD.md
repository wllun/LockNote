# Run LockNote on an Android Virtual Device

## 1. Debug with a development build

Start an Android Virtual Device from **Android Studio > Device Manager**, then run:

```powershell
adb devices
Set-Location "C:\LNBuild"
npx.cmd expo run:android
```

For later sessions, start Metro without rebuilding:

```powershell
Set-Location "C:\LNBuild"
npx.cmd expo start --dev-client
```

Open the LockNote development build in the emulator. Press `j` in the Metro terminal to open React Native DevTools.

## 2. Install the release APK

Most Android Virtual Devices use `x86_64`, so build an emulator-compatible APK first:

```powershell
Set-Location "C:\LNBuild\android"
.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=x86_64 "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m"
adb -e install -r "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
```

If installation fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, remove the existing emulator installation and install again:

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

Press `a` in the Metro terminal. Expo installs or opens Expo Go in the running emulator and launches LockNote.
