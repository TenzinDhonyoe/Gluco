# App Store Compliance Checklist

Last audited: 2026-04-09

## Subscription Requirements (Guideline 3.1.2(c))

All 5 items must be visible in the app's own UI before purchase (not just on Apple's payment sheet):

| # | Requirement | Where shown | File |
|---|-------------|-------------|------|
| 1 | Subscription title | `pkg.product.title` on pricing card | `app/paywall.tsx` |
| 2 | Subscription length | "Annual"/"Monthly" label + "/year"/"/month" | `app/paywall.tsx` |
| 3 | Subscription price | `pkg.product.priceString` on pricing card | `app/paywall.tsx` |
| 4 | Privacy Policy link | Tappable text in paywall legal footer | `app/paywall.tsx` |
| 5 | Terms of Use (EULA) link | Tappable text in paywall legal footer | `app/paywall.tsx` |

Legal disclaimer near CTA button includes: charge timing, auto-renewal notice, cancellation policy, and link to manage in Settings.

URLs configured in `constants/legal.ts`:
- Privacy Policy: Notion-hosted page
- Terms & Conditions: Notion-hosted page
- Apple EULA: `https://www.apple.com/legal/internet-services/itunes/dev/stdfla/`

## Account Deletion (Guideline 5.1.1(v))

- Full account deletion flow in `app/account-privacy.tsx`
- Two-step confirmation: warning alert, then type "DELETE" to confirm
- Calls `deleteUserData(user.id)`, clears local storage, signs out

## Privacy Policy & Terms Links

Accessible from 5 locations:
1. Settings screen (`app/settings.tsx`) — Legal section
2. Sign-up screen (`app/signup.tsx`) — Inline links in terms checkbox
3. Privacy intro screen (`app/privacy-intro.tsx`) — Footer links
4. Account/Privacy screen (`app/account-privacy.tsx`) — Privacy Policy link
5. Paywall screen (`app/paywall.tsx`) — EULA and Privacy links

## Authentication (Guideline 4.8)

- Apple Sign-In: implemented on 3 screens (signin, signup, privacy-intro)
- Only social login offered (no Google/Facebook), so Apple Sign-In satisfies the requirement
- If a third-party login (Google, Facebook) is ever added, Apple Sign-In must remain
- Configured: `usesAppleSignIn: true` in `app.json`, entitlement in `Gluco.entitlements`

## In-App Purchases

- Restore Purchases button on paywall screen
- RevenueCat with StoreKit 2 (`lib/revenuecat.ts`)
- Subscription management link in Settings (`app/settings.tsx`)

## Permission Descriptions (Info.plist)

| Permission | Description | Used by |
|------------|-------------|---------|
| `NSCameraUsageDescription` | "Gluco needs camera access to scan food labels and log meals." | Meal scanner |
| `NSPhotoLibraryUsageDescription` | "Gluco needs photo library access to select meal photos." | Meal photo picker |
| `NSHealthShareUsageDescription` | "Gluco needs access to your health data to help track how sleep, steps, and activity affect your wellness." | HealthKit reads |
| `NSHealthUpdateUsageDescription` | "Gluco needs access to record health data." | HealthKit writes |

**Not declared (confirmed unused):**
- Microphone — no audio/voice features in app
- Location — no location code in app
- Tracking (ATT) — no IDFA or tracking SDKs

Rule: never add a permission description unless the app actually uses the feature. Apple rejects apps that request unused permissions.

## Privacy Manifest (PrivacyInfo.xcprivacy)

Located at `ios/Gluco/PrivacyInfo.xcprivacy`. Declares:
- `NSPrivacyTracking: false`
- `NSPrivacyCollectedDataTypes: []` (data collection declared in App Store Connect instead)
- Required Reasons APIs: File Timestamp, User Defaults, Disk Space, System Boot Time

## Export Compliance

`ITSAppUsesNonExemptEncryption: false` in both `app.json` and Info.plist. App uses standard HTTPS only — no custom encryption. This skips the export compliance dialog on each TestFlight upload.

## App Transport Security

`NSAllowsArbitraryLoads: false` — all connections use HTTPS. `NSAllowsLocalNetworking: true` for dev only.

## Push Notifications

- Permission request flow in `app/notification-settings.tsx`
- Graceful handling when OS denies permission (shows alert with link to Settings)
- `aps-environment: development` in entitlements — overridden to `production` by provisioning profile during App Store builds

## HealthKit

- Entitlements: `com.apple.developer.healthkit: true`, `background-delivery: true`
- iOS-only, guarded with `Platform.OS === 'ios'`
- Requires native build (`npx expo run:ios`), not Expo Go

## App Icons & Splash Screen

- Single 1024x1024 universal icon in `Images.xcassets/AppIcon.appiconset/` — Xcode 14+ auto-generates all required sizes
- Splash screen: `SplashScreen.storyboard` with logo and background color, dark mode support

## Content & Age Rating

- Wellness app, NOT a medical device — no medical claims
- No user-generated content or social features
- Safe language rules enforced (`docs/reference/health-domain.md`)
- Appropriate for ages 12+ (Health & Fitness category)

## Other Compliance

- IPv6 compatible (no hardcoded IPv4 addresses)
- Minimum deployment target: iOS 15.1
- Device capabilities: `arm64` only
- No dynamic code execution in edge functions
- No remote feature flagging that circumvents App Review
