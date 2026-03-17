# React Native Patterns Reference

## StyleSheet Conventions

All styling uses React Native `StyleSheet.create()`. No NativeWind or styled-components.

```typescript
import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import { fonts } from '@/hooks/useFonts';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: Colors.textPrimary,
    },
});
```

### Import Alias
`@/` maps to project root (configured in `tsconfig.json`):
```typescript
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
```

## Font System

**Font family:** Outfit (Google Font) — loaded in `hooks/useFonts.ts`

```typescript
import { fonts } from '@/hooks/useFonts';

// Available weights:
fonts.thin        // Outfit-Thin (100)
fonts.extraLight  // Outfit-ExtraLight (200)
fonts.light       // Outfit-Light (300)
fonts.regular     // Outfit-Regular (400)
fonts.medium      // Outfit-Medium (500)
fonts.semiBold    // Outfit-SemiBold (600)
fonts.bold        // Outfit-Bold (700)
fonts.extraBold   // Outfit-ExtraBold (800)
fonts.black       // Outfit-Black (900)
```

Always use `fontFamily: fonts.xxx` — never hardcode font names.

## Animation Patterns (react-native-reanimated v3)

### Shared Values + Animated Styles
```typescript
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

const scale = useSharedValue(1);
const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
}));

// Trigger:
scale.value = withSpring(1.1, { damping: 15, stiffness: 400 });
```

### Common Spring Configs
```typescript
// Quick bounce (tab icons):
{ damping: 16, stiffness: 600 }

// Smooth settle (indicators):
{ damping: 18, stiffness: 180, mass: 0.8 }

// Press feedback:
{ damping: 15, stiffness: 400 }  // press in
{ damping: 12, stiffness: 300 }  // press out
```

### Liquid Bounce Sequence (tab bar pattern)
```typescript
scale.value = withSequence(
    withSpring(1.12, { damping: 16, stiffness: 600 }),
    withSpring(0.96, { damping: 18, stiffness: 500 }),
    withSpring(1, { damping: 20, stiffness: 400 })
);
```

### Screen Transitions (`components/animations/animated-screen.tsx`)
Wrap screens for fade/slide entrance animations.

### Animated FAB (`components/animations/animated-fab.tsx`)
Floating action button with expand/collapse animation.

### Animated Numbers (`components/animations/animated-number.tsx`)
Smooth number transitions for metrics display.

## Component Organization

### Directory Structure
```
components/
├── animations/    — Reusable animation wrappers
├── backgrounds/   — Full-screen backgrounds
├── cards/         — Card components (MealCheckinCard)
├── carousels/     — Horizontal scrollable lists
├── charts/        — Data visualization
├── controls/      — Input controls (segmented-control)
├── experiments/   — Experiment widgets
├── progress/      — Progress indicators
├── ui/            — Base UI primitives
└── effects/       — Visual effects
```

### Screen-Specific Components (`app/components/`)
```
app/components/scanner/
├── AnalysisResultsView.tsx
├── FollowupQuestionView.tsx
├── FoodSearchResultsView.tsx
├── LabelScanResultsView.tsx
├── ManualAddView.tsx
└── ScanningOverlay.tsx
```

## UI Component Inventory

### Base UI (`components/ui/`)
| Component | Purpose |
|-----------|---------|
| `button.tsx` | Standard button with variants |
| `input.tsx` | Text input with styling |
| `sheet.tsx` | Bottom sheet modal |
| `sheet-item.tsx` | Item within bottom sheet |
| `dropdown-menu.tsx` | Dropdown selection |
| `collapsible.tsx` | Expandable/collapsible section |
| `AnimatedPressable.tsx` | Pressable with scale animation |
| `LiquidGlassButton.tsx` | Glass morphism button |
| `Disclaimer.tsx` | AI/health disclaimer text |
| `SyncBanner.tsx` | Data sync status indicator |
| `icon-symbol.tsx` | Cross-platform icon wrapper |
| `icon-symbol.ios.tsx` | iOS SF Symbols variant |

### Charts (`components/charts/`)
| Component | Purpose |
|-----------|---------|
| `glucose-trend-chart.tsx` | Glucose over time |
| `GlucoseTrendIndicator.tsx` | Trend direction arrow |
| `MetabolicScoreRing.tsx` | Circular score display |
| `MiniLineChart.tsx` | Compact sparkline |
| `WeeklyTrendChart.tsx` | 7-day trend bar chart |

## Icon Library

**Feather icons** via `@expo/vector-icons`:
```typescript
import { Feather } from '@expo/vector-icons';
<Feather name="home" size={24} color={Colors.textPrimary} />
```

Also available: `Ionicons` (used in insights for category icons).

## Platform Guards

```typescript
import { Platform } from 'react-native';

// HealthKit (iOS only)
if (Platform.OS === 'ios') {
    const hkModule = require('react-native-health');
}

// Haptics (iOS only)
if (Platform.OS === 'ios') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

// Bottom spacing
bottom: Platform.OS === 'ios' ? 20 : 16
```

## Background Component

`ForestGlassBackground` renders behind all screens:
```typescript
import { ForestGlassBackground } from '@/components/backgrounds/forest-glass-background';

// In root layout:
<View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <ForestGlassBackground blurIntensity={24} />
    <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
        {/* screens */}
    </Stack>
</View>
```

Uses: `ImageBackground` (forest sprout photo) + `BlurView` (expo-blur) + dark overlay.

## Haptics

```typescript
import * as Haptics from 'expo-haptics';

// Tab press, button press:
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

// Success feedback:
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
```
