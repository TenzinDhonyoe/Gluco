---
description: How to clean prebuild and deploy to TestFlight using Xcode
---

1. **Clean Prebuild**:
    - Run the following command to completely regenerate your iOS native project:
    ```bash
    npx expo prebuild --platform ios --clean
    ```
    - *Note*: This ensures all your JS dependencies and config in `app.json` are correctly linked.

2. **Open Xcode Workspace**:
    - Open the project in Xcode:
    ```bash
    xed ios
    ```
    - *Important*: Always open the `.xcworkspace` file, not the `.xcodeproj`.

3. **Prepare for Archive**:
    - In Xcode, look at the top toolbar (scheme selector).
    - Select your app target (usually named "Gluco").
    - Select the destination device as **Any iOS Device (arm64)**. You cannot archive for a simulator.

4. **Archive**:
    - Go to the menu bar: **Product** -> **Archive**.
    - Wait for the build to complete. This can take several minutes.

5. **Upload to TestFlight**:
    - Once finished, the **Organizer** window will pop up showing your new archive.
    - Click **Distribute App** (blue button on the right).
    - Select **TestFlight & App Store**.
    - Click **Distribute**.
    - Xcode will process, validate, and upload your build.

6. **Finish**:
    - Once uploaded, it will take a few minutes to process on App Store Connect before it's ready for testing.
