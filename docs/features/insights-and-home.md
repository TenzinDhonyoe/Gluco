# Insights and Home

## Purpose
Provide the Today dashboard and Insights views that summarize recent meals, glucose, activity, and sleep, plus personalized suggestions, action tracking, and experiments.

## Entry Points
- `app/(tabs)/index.tsx` (Today/Home tab)
- `app/(tabs)/insights.tsx` (Insights tab with 3 sub-tabs)

---

## Today Tab (`app/(tabs)/index.tsx`)

The home screen is the primary dashboard showing daily health metrics and quick actions.

### Layout Structure

```
┌─────────────────────────────────────┐
│  Animated Header (collapses)        │
│  - User avatar (initials)           │
│  - "GLUCO" title                    │
│  - Notifications icon               │
├─────────────────────────────────────┤
│  Time Range Picker (sticky blur)    │
│  [7d] [14d] [30d] [90d]             │
├─────────────────────────────────────┤
│  Glucose Trend Indicator            │
│  (Horseshoe gauge with mascot)      │
├─────────────────────────────────────┤
│  Active Experiment Widget           │
│  (if experiment is running)         │
├─────────────────────────────────────┤
│  Metabolic Score Card               │
│  (7-day score with trend)           │
├─────────────────────────────────────┤
│  Stats Grid (2 columns)             │
│  (varies by tracking mode)          │
├─────────────────────────────────────┤
│  HealthKit Connect CTA              │
│  (if available but not authorized)  │
├─────────────────────────────────────┤
│  Personal Insights Carousel         │
│  (AI-powered tips)                  │
├─────────────────────────────────────┤
│  Meal Check-ins Section             │
│  (meals ready for review)           │
└─────────────────────────────────────┘
        [FAB Menu Button]
```

### Key Sections

#### 1. Animated Header
- Collapses on scroll
- User avatar showing initials
- App title "GLUCO"
- Notifications icon → `/notifications-list`

#### 2. Time Range Picker
- Segmented control: 7d, 14d, 30d, 90d
- Sticky positioning with blur effect (requires `expo-blur` native build)
- Dark tint at 80% intensity

#### 3. Glucose Trend Indicator
Mascot-based gauge showing current glucose status:
- **Horseshoe gauge** with color gradient (red → yellow → green → yellow → red)
- **Animated tick** showing current position (uses `react-native-reanimated`, 300ms quad easing)
- **Mascot** inside gauge:
  - Crying mascot for low/high/no_data states
  - Default mascot for in-range
- **Status label** with dynamic subtitle text
- Memoized for performance

#### 4. Metabolic Score Card
- 7-day rolling score (0-100, higher = better wellness)
- Velocity indicator (pts/week trend)
- Trend direction icon (up/down/neutral)
- Visual ring gauge
- Tap navigates to Insights > Progress tab

#### 5. Stats Grid
2-column grid that adapts based on `tracking_mode`:

**meals_wearables mode:**
- Time-in-range (%)
- Fibre intake
- Steps (daily average)
- Sleep (hours/night)

**wearables_only mode:**
- Steps
- Activity (active minutes)
- Sleep
- Meals (placeholder)

**meals_only mode:**
- Time-in-range (%)
- Fibre intake
- Activity (manual)
- Sleep

#### 6. Personal Insights Carousel
- AI-powered personalized tips (cached 6-hour TTL)
- Actionable recommendations with CTAs
- Button actions route to:
  - Meal Response Check (`/meal-response-check`)
  - Exercise Impact Check (`/check-exercise-impact`)

#### 7. Meal Check-ins Section
- Horizontal scroll of meals ready for review
- Shows meals 2+ hours old without check-ins
- Tap routes to `/meal-checkin`

#### 8. Floating Action Button (FAB)
Expandable menu with options:
- Log Meal → `/meal-scanner`
- Log Activity → `/log-activity`
- Log Glucose → `/log-glucose`

### Bottom Sheets
Modal inputs triggered from insights:
- Meal Response Check input
- Exercise Impact Check input

---

## Insights Tab (`app/(tabs)/insights.tsx`)

The Insights tab contains **3 sub-tabs** for different views of user progress and actions.

### Sub-Tab Navigation

```
┌─────────────────────────────────────┐
│    [Actions] [Progress] [Experiments]│
└─────────────────────────────────────┘
```

### A. Actions Tab

Displays targeted interventions and care pathways.

**Sections:**
1. **Action Loop** - 24-72 hour targeted actions
   - Active actions with countdown timer
   - Baseline and outcome metrics
   - Auto-completion detection
   - Start Action button

2. **Recommended Next Steps** - AI-suggested actions

3. **Recent Outcomes** - Completed/expired actions with results

4. **Care Pathway** - 7-day structured wellness plans
   - Step-by-step guidance
   - Progress tracking

**Card Display:**
- Baseline metric value
- Outcome metric value
- Delta (improvement amount)
- Time remaining countdown

### B. Progress Tab

Long-term trend analysis and habit tracking.

**Sections:**
1. **Trend Velocity**
   - 7-day rolling metabolic score
   - Range toggles: 30d, 90d, 180d
   - Points per week trend
   - Trend direction indicator

2. **Compounding Habits**
   - Days logged meals
   - Meal check-ins count
   - Post-meal walks count

3. **Data Coverage**
   - Sleep days tracked
   - Steps days tracked
   - Glucose days tracked
   - Meal days tracked

### C. Experiments Tab

A/B-style experiment tracking for testing behaviors.

**Sections:**
1. **Browse Experiments** button → `/experiments-list`
2. **Active Experiments** list with status
3. **Suggested Next Tests** - AI-recommended experiments
4. **Start Experiment** button with loading state

---

## Glucose Trend Indicator Component

Located at `components/charts/GlucoseTrendIndicator.tsx`:

```typescript
// Status states
type GlucoseStatus = 'low' | 'in_range' | 'high' | 'no_data';

// Color gradient (left to right)
// Red (low) → Yellow → Green (optimal) → Yellow → Red (high)
```

**Animation:**
- Uses `react-native-reanimated` for smooth transitions
- 300ms duration with quadratic easing
- Memoized component for performance

---

## Insight Generation

- `usePersonalInsights` provides cached insight list (12-hour TTL for performance, 6-hour for display)
- Currently uses rules-based insights (`generateInsights` in `lib/insights.ts`)
- LLM output intentionally bypassed due to schema differences
- `lib/insights.ts` applies:
  - Safe-language filtering
  - Banned-term removal
  - Confidence scoring based on data completeness

---

## Data Sources

| Hook | Purpose |
|------|---------|
| `useTodayScreenData` | Batch-fetch glucose, activity, fibre, meals |
| `usePersonalInsights` | Cached rules-based insights |
| `useWeeklyMetabolicScores` | Metabolic score history |
| `useDailyContext` | HealthKit sync and daily context |

---

## Key UI Components

- `components/animations/animated-screen.tsx` - Scroll-based animations
- `components/carousels/PersonalInsightsCarousel.tsx` - Horizontal insight cards
- `components/cards/MealCheckinCard.tsx` - Meal check-in prompt
- `components/charts/GlucoseTrendIndicator.tsx` - Mascot gauge
- `components/charts/glucose-trend-chart.tsx` - Legacy line chart

---

## Key Files

- `app/(tabs)/index.tsx` - Today/Home tab
- `app/(tabs)/insights.tsx` - Insights tab (3 sub-tabs)
- `hooks/useTodayScreenData.ts` - Batch data fetching
- `hooks/usePersonalInsights.ts` - Insight caching
- `hooks/useWeeklyMetabolicScores.ts` - Metabolic score data
- `lib/insights.ts` - Rules engine + safety filtering

