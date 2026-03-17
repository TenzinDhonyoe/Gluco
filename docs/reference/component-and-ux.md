# Component & UX Reference

> **Design system:** For the overarching design philosophy (Liquid Glass, color roles, button rules, layout principles), see [`DESIGN.md`](../../DESIGN.md). This doc covers the implementation-level component APIs and color tokens.

## Color System

Dark-only theme. All colors defined in `constants/Colors.ts`.

### Core Colors
| Token | Value | Usage |
|-------|-------|-------|
| `background` | `#111111` | App background |
| `backgroundSecondary` | `#161616` | Secondary background |
| `backgroundCard` | `#1A1B1C` | Card backgrounds |
| `backgroundElevated` | `#1E1E1E` | Elevated surfaces |
| `textPrimary` | `#FFFFFF` | Primary text |
| `textSecondary` | `#A0A0A0` | Secondary text |
| `textTertiary` | `#878787` | Tertiary/hint text |
| `textMuted` | `#6B6B6B` | Muted/disabled text |
| `primary` | `#3494D9` | Blue — main action color |
| `success` | `#4CAF50` | Green — in range, positive |
| `warning` | `#FF9800` | Orange — caution |
| `error` | `#F44336` | Red — high, error |

### Category Colors
| Category | Color | Hex |
|----------|-------|-----|
| Glucose | Red | `#FF375F` |
| Activity | Cyan | `#22EFEF` |
| Sleep | Blue | `#3494D9` |
| Meals | Golden | `#EBA914` |
| Fiber | Green | `#4CAF50` |
| Steps | Blue | `#3494D9` |
| Heart Rate | Red | `#FF375F` |

### Opacity Variants
Each semantic color has light/medium/dark variants:
```typescript
primaryLight: 'rgba(52, 148, 217, 0.15)'
primaryMedium: 'rgba(52, 148, 217, 0.3)'
primaryDark: 'rgba(52, 148, 217, 0.5)'
```

### Border Colors
```typescript
border: 'rgba(255, 255, 255, 0.05)'       // Subtle
borderLight: 'rgba(255, 255, 255, 0.08)'   // Light
borderMedium: 'rgba(255, 255, 255, 0.1)'   // Medium
borderStrong: 'rgba(255, 255, 255, 0.15)'  // Strong
borderCard: '#3F4243'                       // Card borders
```

## Gradient Patterns

Defined in `constants/Colors.ts` under `Gradients`:

```typescript
import { Gradients } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';

// Background gradient
<LinearGradient colors={Gradients.backgroundGradient} />
// ['#1a1f24', '#181c20', '#111111']

// Card gradient
<LinearGradient colors={Gradients.cardGradient} />
// ['rgba(40, 44, 48, 0.95)', 'rgba(30, 33, 36, 0.98)', 'rgba(35, 38, 41, 0.95)']

// Tab bar glass effect
colors={['rgba(40, 44, 48, 0.95)', 'rgba(30, 33, 36, 0.98)', 'rgba(35, 38, 41, 0.95)']}
```

### Insight Category Gradients
```typescript
meals:    ['#2E7D32', '#1B5E20']   // Green
activity: ['#E65100', '#BF360C']   // Orange
sleep:    ['#1565C0', '#0D47A1']   // Blue
glucose:  ['#7B1FA2', '#4A148C']   // Purple
weight:   ['#37474F', '#263238']   // Slate
```

## Chart Components

| Component | Location | Usage |
|-----------|----------|-------|
| `glucose-trend-chart.tsx` | `components/charts/` | Time series line chart for glucose |
| `GlucoseTrendIndicator.tsx` | `components/charts/` | Up/down/stable arrow with color |
| `MetabolicScoreRing.tsx` | `components/charts/` | Circular progress ring (0-100) |
| `MiniLineChart.tsx` | `components/charts/` | Compact sparkline for cards |
| `WeeklyTrendChart.tsx` | `components/charts/` | 7-day bar chart |

Charts use `react-native-svg` for rendering. Chart colors from `Colors`:
```typescript
chartGreen: '#4CAF50'
chartYellow: '#FDCB6E'
chartRed: '#F06B6B'
chartBlue: '#3494D9'
chartAreaGreen: 'rgba(56, 118, 58, 0.40)'
chartAreaRed: 'rgba(183, 68, 68, 0.35)'
```

## Card Components

### MealCheckinCard (`components/cards/`)
Post-meal check-in card with energy, fullness, cravings sliders.

### DataCoverageCard (`components/progress/`)
Shows data completeness for a metric category.

### MetricCard (`components/progress/`)
Displays a single metric with value, trend, and label.

## Controls

### SegmentedControl (`components/controls/segmented-control.tsx`)
Horizontal segmented picker with animated indicator.

### AnimatedPressable (`components/ui/AnimatedPressable.tsx`)
Pressable wrapper with scale-down animation on press.

### LiquidGlassButton (`components/ui/LiquidGlassButton.tsx`)
Glass morphism button with gradient and border effects.

## Bottom Sheets

`components/ui/sheet.tsx` — Modal bottom sheet pattern:
```typescript
import { Sheet } from '@/components/ui/sheet';
import { SheetItem } from '@/components/ui/sheet-item';

<Sheet visible={isOpen} onClose={() => setIsOpen(false)} title="Options">
    <SheetItem label="Edit" icon="edit-2" onPress={handleEdit} />
    <SheetItem label="Delete" icon="trash-2" onPress={handleDelete} destructive />
</Sheet>
```

## Haptic Feedback

Used for:
- Tab presses (`ImpactFeedbackStyle.Light`)
- Button presses
- Success/error states (`NotificationFeedbackType.Success`)
- Swipe actions

iOS only — guarded by `Platform.OS === 'ios'`.

## Onboarding Flow

6-step onboarding with semantic route names:

| Step | Route | Collects |
|------|-------|----------|
| 1 | `onboarding-profile` | first_name, last_name, birth_date, biological_sex, region |
| 2 | `onboarding-goals` | goals[] (max 3), readiness_level |
| 3 | `onboarding-body` | height_cm, weight_kg, dietary_preferences[], cultural_food_context (all optional) |
| 4 | `onboarding-tracking` | tracking_mode, prompt_window + HealthKit permission |
| 5 | `onboarding-coaching` | coaching_style, com_b_barrier, if_then_plan |
| 6 | `onboarding-ai` | ai_enabled, ai_consent_at; sets onboarding_completed=true |

### Shared Components
- **`OnboardingHeader`** (`components/onboarding/OnboardingHeader.tsx`): Back button + 6 progress bars
- **`useOnboardingDraft`** (`hooks/useOnboardingDraft.ts`): Centralized draft management with single AsyncStorage key, in-memory state, debounced saves

### Picker Animations
All picker modals use `react-native-reanimated` shared values (`useSharedValue` + `withSpring`/`withTiming`) instead of RN `Animated.Value` to prevent animation conflicts.

Sets `profiles.onboarding_completed = true` on completion.

Behavior v1 users may also see `framework-reset.tsx` for COM-B barrier selection, readiness level, and primary habit setup.

## Navigation Patterns

### Push to Screen
```typescript
import { router } from 'expo-router';

router.push('/meal-scanner');
router.push({ pathname: '/log-detail', params: { logId: '123', logType: 'meal' } });
```

### Replace (no back)
```typescript
router.replace('/(tabs)');
```

### Screen Animations
Default: `animation: 'fade'` with `animationDuration: 150`
Meal scanner uses: `animation: 'slide_from_bottom'`
