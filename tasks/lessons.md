# Lessons Learned

Patterns and corrections captured during development. Review at session start.

## Format

Each lesson follows this structure:
- **Pattern**: What went wrong or what was corrected
- **Rule**: The rule to prevent it from happening again
- **Context**: Where in the codebase this applies

---

<!-- Add lessons below this line -->

### FAB ↔ Pill spacing (current values for 4 tabs + Liquid Glass)
- **Pattern**: Previously had `fabPillOverlap = 10` / `TAB_BAR_RIGHT_INSET = 56` (3-tab, pre-Liquid Glass layout). After adding a 4th tab and Liquid Glass, values were re-tuned.
- **Rule**: `fabPillOverlap` = **36** (in `TabBarInsetsModule.swift`), `TAB_BAR_RIGHT_INSET` = **54** (in `_layout.tsx` + `AddMenuFAB.tsx`). Never change these without rebuilding and visually verifying on simulator.
- **Context**: `modules/tab-bar-insets/ios/TabBarInsetsModule.swift`, `app/(tabs)/_layout.tsx`, `components/overlays/AddMenuFAB.tsx`

### Nuclear clean rebuild for local Expo module changes
- **Pattern**: Changed a Swift constant in `TabBarInsetsModule.swift` but the native build used a stale cached `.o` file. Cleaning DerivedData alone was not enough — CocoaPods cached the compiled artifact because the podspec version didn't change.
- **Rule**: When changing **any** Swift/ObjC code in `modules/` (local Expo modules), always do a nuclear clean rebuild: `rm -rf ios/ && npx expo prebuild --platform ios && npx expo run:ios`. Just cleaning DerivedData is NOT sufficient.
- **Context**: All files under `modules/tab-bar-insets/ios/`, any future local Expo modules

### React 19 useRef() requires initial value
- **Pattern**: `useRef<View>()` without an initial value causes a TypeScript error in React 19 because the type no longer automatically includes `undefined`.
- **Rule**: Always pass `null` as the initial value: `useRef<View>(null)`. Alternatively, include `undefined` in the type: `useRef<View | undefined>()`. The `null` form is preferred.
- **Context**: All `useRef` calls across `app/`, `components/`, `hooks/`. Triggered by SDK 54 upgrade (React 18.3 → React 19.1).

### Reanimated v4 required for RN 0.81 (v3 incompatible)
- **Pattern**: After upgrading to RN 0.81.5, reanimated v3 failed to compile due to Folly C++ header changes in the new RN version.
- **Rule**: Must use `react-native-reanimated` v4.1.x with RN 0.81+. v3 cannot be patched — it's a fundamental incompatibility. New Architecture must also be enabled (`newArchEnabled: true`).
- **Context**: `package.json`, `app.json` (`newArchEnabled`). Triggered by SDK 54 upgrade.

### expo-av deprecated in SDK 54
- **Pattern**: `expo-av` is deprecated starting in Expo SDK 54. It still works but will be removed in a future SDK.
- **Rule**: Use `expo-audio` for audio and `expo-video` for video in new code. Existing `expo-av` usage in `app/index.tsx` can remain until migrated, but do not add new `expo-av` imports.
- **Context**: `app/index.tsx` (existing usage), any new audio/video features.

### AnimatedScreen removed from tab screens (NativeTabs)
- **Pattern**: Tab screens previously used an `AnimatedScreen` wrapper for transitions. After switching to NativeTabs (`expo-router/unstable-native-tabs`), this wrapper caused double-animation artifacts.
- **Rule**: Do NOT wrap tab screens in `AnimatedScreen`. NativeTabs handles transitions natively via UITabBarController. `AnimatedScreen` is still used for non-tab screens like experiment screens.
- **Context**: `app/(tabs)/*.tsx` (no AnimatedScreen), `app/experiment-*.tsx` (still uses AnimatedScreen).
