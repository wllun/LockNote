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

### Windows and OneDrive path-length workaround

The project's OneDrive path is too long for React Native's native CMake build on Windows. Build from a disposable short-path copy instead. The original Git repository remains unchanged.

Open PowerShell and create the build copy:

```powershell
New-Item -ItemType Directory -Path "C:\LNBuild" -Force
robocopy "C:\Users\behwl\OneDrive\Documents\ReactNative\LockNote" "C:\LNBuild" /E /XD .git node_modules android ios .expo dist web-build
```

Robocopy exit code `1` means files were copied successfully.

Install dependencies and generate the native Android project:

```powershell
Set-Location "C:\LNBuild"
npm.cmd install
npx.cmd expo prebuild --platform android
```

Build the release APK with enough Gradle memory. The architecture below matches most current physical Android phones and uses substantially less memory than compiling emulator architectures too:

```powershell
Set-Location android
.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m"
```

Do not run the `adb install` command until Gradle reports `BUILD SUCCESSFUL`.

The generated APK is located at:

```text
C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk
```

Reconnect the phone, unlock it, accept the USB debugging prompt, and confirm that it appears:

```powershell
adb devices
```

The device must have `device` beside its serial number. Then install the APK:

```powershell
adb install -r "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
```

The `-r` option replaces an existing LockNote installation while preserving its application data. After installation, LockNote runs without Expo Go or a Metro development server.

If the project is moved permanently to a short location such as `C:\dev\LockNote`, Expo can compile and install the release build in one command:

```powershell
npx.cmd expo run:android --variant release --device
```

This locally generated release APK is suitable for device testing. It is not configured as a signed Google Play production artifact.

### If building from another location runs out of Metaspace

In `android\gradle.properties`, increase the Gradle JVM limits:

```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m
```

These values are suitable for a computer with approximately 16 GB of RAM.

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
