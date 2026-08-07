1. Copy the latest code to the short build folder
    `robocopy "C:\Users\behwl\OneDrive\Documents\ReactNative\LockNote" "C:\LNBuild" /E /XD .git node_modules android ios .expo dist web-build`
    [Company Laptop Cmd] : `robocopy "C:\Users\User\Desktop\React App\LockNote" "C:\LNBuild" /E /XD .git node_modules android ios .expo dist web-build`

2. Update the generated project
    cd C:\LNBuild
    npm.cmd install
    npx.cmd expo prebuild --platform android --no-install

3. Build the physical-device APK
    cd C:\LNBuild\android
    .\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m"

4. Wait until `BUILD SUCCESSFUL`

5. Connect and update the app
    adb devices
    adb install -r "C:\LNBuild\android\app\build\outputs\apk\release\app-release.apk"
