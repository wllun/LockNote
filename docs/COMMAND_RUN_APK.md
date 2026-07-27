# Run LockNote on a Physical Android Device

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

```powershell
adb devices
adb install -r "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
```

If installation fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, the installed app uses a different signing key. Uninstalling it deletes all locally stored LockNote data:

```powershell
adb uninstall com.locknote.app
adb install "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
```

## 3. Run through Expo Go

Install **Expo Go** from Google Play. Connect the phone and computer to the same network, then run:

```powershell
Set-Location "C:\Users\behwl\OneDrive\Documents\ReactNative\LockNote"
npx.cmd expo start --go
```

Scan the displayed QR code with Expo Go. If the phone cannot connect over the local network:

```powershell
npx.cmd expo start --go --tunnel
```
