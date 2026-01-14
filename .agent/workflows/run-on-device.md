---
description: How to run the native app on a physical iPhone (with HealthKit)
---

# Run on Physical iPhone (Local Dev)

This workflow builds the native app with all capabilities (HealthKit, etc.) and installs it directly on your phone via USB. This bypasses TestFlight but keeps all native features active.

## Prerequisites
1. Connect iPhone via USB to Mac.
2. Enable **Developer Mode** on iPhone: `Settings > Privacy & Security > Developer Mode`.
3. Ensure iPhone and Mac are on the **same Wi-Fi**.

## Step 1: Clean & Prebuild
Ensure your native config is fresh.

```bash
npx expo prebuild --clean --platform ios
```

## Step 2: Build & Install
This command compiles the native app and pushes it to your phone. 
- You will be asked to select your device.
- You might be asked to select a Development Team (use your personal Apple ID).

```bash
npx expo run:ios --device
```

> **If it fails with "Untrusted Developer":**
> On iPhone: Go to **Settings > General > VPN & Device Management**. Tap your Apple ID and select **Trust**.

## Step 3: Start Dev Server
Once the app is installed, you need the Metro server to provide the JavaScript bundle.

```bash
npx expo start --dev-client
```

> **Important:** Ensure the terminal says **"Using development build"**. If it says "Using Expo Go", press `s` to switch.

## Step 4: Launch
1. Open the **Gluco** app on your iPhone.
2. It should auto-connect to your Metro server.
3. If not, shake device -> Configure Bundler -> enter computer IP + port 8081.
