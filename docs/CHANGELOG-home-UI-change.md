# UI Changes - home-UI-change Branch

## Summary
This branch contains UI/UX improvements focused on the home screen, log screen, and performance optimizations.

---

## Changes

### 1. Glucose Trend Indicator (New Component)
**File:** `components/charts/GlucoseTrendIndicator.tsx`

Replaced the old glucose trend chart with a mascot-based gauge indicator:
- **Horseshoe gauge** with gradient (Red → Yellow → Green → Yellow → Red)
- **Animated tick indicator** showing current trend position
- **Mascot display** inside the gauge (crying mascot for low/high/no_data, default mascot for in-range)
- **Dynamic subtitle** ("Not enough data for trends" when no data)
- **Smooth animation** using `react-native-reanimated` (300ms timing with quad easing)
- **Memoized** for performance

### 2. Sticky Header Blur Effect
**File:** `app/(tabs)/index.tsx`

Added frosted glass effect to the sticky time range picker:
- Uses `expo-blur` BlurView (requires native rebuild)
- Dark tint with 80% intensity
- Content scrolling behind the header is blurred

### 3. Quick Action Buttons on Log Screen
**File:** `app/(tabs)/log.tsx`

Added three quick action buttons above "Recent Logs":
- **Log Meal** → navigates to `/meal-scanner` (camera)
- **Log Glucose** → navigates to `/log-glucose`
- **Log Activity** → navigates to `/log-activity`

Styled with:
- Colored icons with tinted backgrounds
- Dark card style matching app design
- Responsive flex layout

### 4. Performance Optimizations

#### Supabase Request Throttling
**File:** `hooks/useDailyContext.ts`
- Fixed infinite fetching loop caused by unstable Date object references
- Dependencies now use stringified dates (`YYYY-MM-DD`) instead of Date objects

#### Error Handling
**File:** `lib/supabase.ts`
- Added graceful handling for Cloudflare 500/HTML errors
- Prevents console spam when Supabase service is temporarily unavailable

---

## New Dependencies
- `expo-blur` - For frosted glass header effect (requires `npx expo run:ios`)

---

## Files Modified
- `app/(tabs)/index.tsx` - BlurView header, GlucoseTrendIndicator integration
- `app/(tabs)/log.tsx` - Quick action buttons, router import
- `hooks/useDailyContext.ts` - Date string dependencies fix
- `lib/supabase.ts` - HTML error handling

## Files Added
- `components/charts/GlucoseTrendIndicator.tsx` - New gauge component
- `assets/images/mascots/gluco_app_mascott/gluco_mascott_cry.png` - Crying mascot asset
