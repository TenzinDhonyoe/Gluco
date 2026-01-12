---
description: How to run the app locally on iOS simulator
---

# Running Gluco on iOS Simulator

The `npx expo run:ios` command requires local code signing certificates which may not be set up. Use this workflow instead:

## Option 1: Build with Xcode directly (Recommended)

// turbo
1. Build for simulator:
```bash
cd ios && xcodebuild -workspace gluco.xcworkspace -scheme Gluco -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -configuration Debug build 2>&1 | tail -5
```

// turbo
2. Install and launch the app:
```bash
xcrun simctl install booted ~/Library/Developer/Xcode/DerivedData/Gluco-agswggegtqeoqmdjrvgnjxcwjjix/Build/Products/Debug-iphonesimulator/Gluco.app && xcrun simctl launch booted ca.gluco.solutions.gluco
```

// turbo
3. Start the dev server for hot reload:
```bash
npx expo start --dev-client
```

## Option 2: EAS Development Build

If you need a fresh development build:

```bash
eas build --profile development --platform ios
```

Then install the resulting .ipa on your simulator/device.

## Why `npx expo run:ios` Fails

The error "No code signing certificates are available" occurs because:
- Local builds require an Apple Developer certificate installed in Keychain
- Expo tries to sign the app even for simulator builds
- Your Mac may not have the development certificates configured

The Xcode build method (Option 1) works because it uses the existing Expo prebuilt iOS project and doesn't require the same signing setup.
