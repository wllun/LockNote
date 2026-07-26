# Build and Install LockNote on Android

LockNote can be installed directly on an Android phone without Expo Go. Use either a local build or an EAS cloud build.

## Option 1: Build and install locally

This option does not use the EAS monthly build quota.

### Requirements

- Node.js 20.19.4 or newer
- Android Studio with the Android SDK installed
- A compatible Java Development Kit
- An Android phone with Developer options and USB debugging enabled, or an Android emulator

Connect the phone by USB and accept its USB debugging prompt. Confirm that the computer can see it:

```powershell
adb devices
```

From the LockNote project directory, compile a release build and install it directly on the selected device:

```powershell
npx.cmd expo run:android --variant release --device
```

Expo will generate the native `android` directory when needed, compile the application, ask which connected device to use, and install LockNote on it. The release build contains the JavaScript bundle, so the installed app runs without Expo Go or a Metro development server.

The generated APK is normally located at:

```text
android\app\build\outputs\apk\release\app-release.apk
```

To install that APK manually on another connected Android device:

```powershell
adb install -r "android\app\build\outputs\apk\release\app-release.apk"
```

This locally generated release APK is suitable for device testing. It is not configured as a signed Google Play production artifact.

## Option 2: Build an APK with EAS

The `preview` profile in `eas.json` is configured to produce an installable APK.

Sign in:

```powershell
npx.cmd eas-cli@latest login
```

Start the cloud build:

```powershell
npx.cmd eas-cli@latest build --platform android --profile preview
```

When the build finishes, open the provided APK link on the Android device and install it. This method uses the Expo account's EAS build allowance and may be unavailable after the monthly quota is exhausted.

## Android installation permission

When installing an APK outside Google Play, Android may ask for permission to install unknown apps. Allow it only for the browser or file manager used to open this trusted APK, then disable the permission again afterward if desired.
