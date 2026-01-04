# GlucoFigma - Project Documentation

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [Authentication System](#authentication-system)
6. [Navigation Architecture](#navigation-architecture)
7. [Components Library](#components-library)
8. [Animation System](#animation-system)
9. [Design System](#design-system)
10. [Key Features](#key-features)
11. [Backend Integration](#backend-integration)
12. [Apple HealthKit Integration](#apple-healthkit-integration)
13. [Performance Optimizations](#performance-optimizations)
14. [Current State](#current-state)
15. [How to Continue Building](#how-to-continue-building)

---

## 🎯 Project Overview

**GlucoFigma** is a React Native mobile application built with Expo for managing glucose levels, meals, and activities. The app helps users track their glucose readings, log meals with photos, and record physical activities with personalized insights.

### Key Characteristics:
- **Platform**: React Native with Expo Router (file-based routing)
- **Backend**: Supabase (PostgreSQL database + authentication)
- **Style**: Dark theme (#111111 background) with modern UI
- **Font**: Outfit (Variable font family with multiple weights)
- **Design Source**: Figma designs provided by the client

---

## 🛠 Tech Stack

### Core Technologies
- **React Native**: 0.81.5
- **React**: 19.1.0
- **Expo SDK**: ~54.0.30
- **Expo Router**: ~6.0.21 (file-based routing)
- **TypeScript**: 5.9.2

### Key Libraries
- **React Native Reanimated**: 4.1.1 (animations)
- **React Navigation**: 7.1.8 (underlying navigation)
- **Supabase JS**: 2.86.2 (backend & auth)
- **Expo Image Picker**: 17.0.10 (camera/photo selection)
- **React Native Safe Area Context**: 5.6.0 (safe area handling)
- **Expo Linear Gradient**: 15.0.8 (gradient effects)
- **Ionicons**: 15.0.3 (icon library)
- **React Native Health**: Latest (Apple HealthKit integration for iOS)
- **Expo Dev Client**: Required for native modules like HealthKit

### Development Tools
- ESLint with Expo config
- TypeScript for type safety

---

## 📁 Project Structure

```
GlucoFigma/
├── app/                          # Expo Router screens (file-based routing)
│   ├── _layout.tsx              # Root layout with Stack navigator
│   ├── index.tsx                # Welcome/landing screen
│   ├── signin.tsx               # Sign in screen
│   ├── signup.tsx               # Sign up screen
│   ├── confirm-email.tsx        # Email confirmation screen
│   ├── onboarding-1.tsx to onboarding-5.tsx  # Onboarding flow
│   ├── log-meal.tsx             # Meal logging screen
│   ├── log-meal-items.tsx       # Meal items search (placeholder)
│   ├── log-glucose.tsx          # Glucose logging screen
│   ├── log-activity.tsx         # Activity logging screen
│   ├── check-spike-risk.tsx     # Pre-meal glucose spike risk analysis
│   ├── check-exercise-impact.tsx # Exercise impact analysis
│   └── (tabs)/                  # Tab navigator group
│       ├── _layout.tsx          # Tab navigator configuration
│       ├── index.tsx            # Today/Home tab
│       ├── log.tsx              # Log history tab
│       └── insights.tsx         # Insights/Analytics tab
│
├── components/                   # Reusable UI components
│   ├── animated-fab.tsx         # Floating Action Button with animations
│   ├── animated-screen.tsx      # Screen wrapper for slide animations
│   ├── glucose-trend-chart.tsx  # Glucose chart component
│   ├── segmented-control.tsx    # Custom segmented control
│   └── ui/                      # UI primitives
│       ├── dropdown-menu.tsx    # Custom dropdown component
│       ├── sheet.tsx            # Bottom sheet modal
│       ├── input.tsx            # Text input component
│       └── button.tsx           # Button component
│
├── context/                      # React Context providers
│   ├── AuthContext.tsx          # Authentication state management
│   └── TabTransitionContext.tsx # Tab navigation direction tracking
│
├── constants/
│   ├── Colors.ts                # Color palette constants
│   └── theme.ts                 # Theme configuration
│
├── hooks/
│   ├── useFonts.ts              # Font loading hook
│   ├── use-color-scheme.ts      # Color scheme detection
│   ├── use-theme-color.ts       # Theme color utilities
│   ├── useTodayScreenData.ts    # Unified data fetching for Today screen
│   └── useSleepData.ts          # HealthKit sleep data hook
│
├── lib/
│   ├── supabase.ts              # Supabase client & database helpers
│   ├── healthkit.ts             # Apple HealthKit integration
│   └── utils/
│       └── dateRanges.ts        # Centralized date range utilities
│
├── supabase/                     # Database migration files
│   ├── setup.sql                # User profiles table
│   ├── glucose_logs.sql         # Glucose logs table
│   ├── activity_logs.sql       # Activity logs table
│   ├── migrations/
│   │   ├── 20241224_fibre_intake_function.sql  # Fibre calculation function
│   │   └── 20241224_add_performance_indexes.sql  # Performance indexes
│   └── functions/               # Supabase Edge Functions
│       ├── premeal-analyze/     # Pre-meal glucose spike prediction
│       ├── exercise-analyze/    # Exercise impact analysis
│       ├── personalized-tips/   # AI-powered health tips
│       ├── experiments-suggest/ # Experiment recommendations
│       ├── experiments-evaluate/ # Experiment results analysis
│       └── ...                  # Other Edge Functions
│
├── assets/
│   └── images/                  # App images and icons
│       ├── gluco-logo.png
│       ├── welcome.jpg
│       └── ...
│
└── font/
    └── Outfit/                  # Outfit font family files
```

---

## 💾 Database Schema

### Supabase Connection
- **URL**: `https://ipodxujhoqbdrgxfphou.supabase.co`
- **Anon Key**: Stored in `lib/supabase.ts`
- **Storage**: AsyncStorage for session persistence

### Tables

#### 1. `profiles`
User profile information collected during onboarding.

```sql
- id (UUID, PRIMARY KEY, REFERENCES auth.users)
- email (TEXT, NOT NULL)
- first_name (TEXT, nullable)
- last_name (TEXT, nullable)
- region (TEXT, nullable)
- birth_date (DATE, nullable)
- biological_sex (TEXT, nullable)
- cgm_device (TEXT, nullable)
- goals (TEXT[], nullable)
- onboarding_completed (BOOLEAN, DEFAULT FALSE)
- created_at (TIMESTAMP WITH TIME ZONE)
- updated_at (TIMESTAMP WITH TIME ZONE)
```

**RLS Policies**: Users can only view/update their own profile.
**Trigger**: `handle_new_user()` automatically creates a profile when a user signs up.

#### 2. `glucose_logs`
Glucose level readings logged by users.

```sql
- id (UUID, PRIMARY KEY)
- user_id (UUID, REFERENCES auth.users, NOT NULL)
- glucose_level (NUMERIC, NOT NULL)
- unit (TEXT, DEFAULT 'mmol/L')
- logged_at (TIMESTAMP WITH TIME ZONE, NOT NULL)
- context (TEXT, CHECK: 'pre_meal'|'post_meal'|'random'|'fasting'|'bedtime', nullable)
- notes (TEXT, nullable)
- created_at (TIMESTAMP WITH TIME ZONE)
- updated_at (TIMESTAMP WITH TIME ZONE)
```

**RLS Policies**: Users can only view/insert/update/delete their own logs.
**Indexes**: `user_id`, `logged_at DESC` for performance.

#### 3. `activity_logs`
Physical activities logged by users.

```sql
- id (UUID, PRIMARY KEY)
- user_id (UUID, REFERENCES auth.users, NOT NULL)
- activity_name (TEXT, NOT NULL)
- logged_at (TIMESTAMP WITH TIME ZONE, NOT NULL)
- duration_minutes (INTEGER, NOT NULL)
- intensity (TEXT, CHECK: 'light'|'moderate'|'intense', NOT NULL)
- notes (TEXT, nullable)
- created_at (TIMESTAMP WITH TIME ZONE)
- updated_at (TIMESTAMP WITH TIME ZONE)
```

**RLS Policies**: Users can only view/insert/update/delete their own logs.
**Indexes**: `user_id`, `logged_at DESC` for performance.

#### 4. `favorite_foods`
User's favorited food items for quick access.

```sql
- id (UUID, PRIMARY KEY)
- user_id (UUID, REFERENCES auth.users, NOT NULL)
- provider (TEXT, CHECK: 'fdc'|'off', NOT NULL) -- Food data source
- external_id (TEXT, NOT NULL) -- ID from food database
- display_name (TEXT, NOT NULL)
- brand (TEXT, nullable)
- nutrients (JSONB, nullable) -- Snapshot of nutrition info
- created_at (TIMESTAMP WITH TIME ZONE)
- UNIQUE(user_id, provider, external_id)
```

**RLS Policies**: Users can only view/insert/delete their own favorites.

#### 5. `recent_foods`
Recently used food items with timestamp for "quick add" functionality.

```sql
- id (UUID, PRIMARY KEY)
- user_id (UUID, REFERENCES auth.users, NOT NULL)
- provider (TEXT, CHECK: 'fdc'|'off', NOT NULL)
- external_id (TEXT, NOT NULL)
- display_name (TEXT, NOT NULL)
- brand (TEXT, nullable)
- nutrients (JSONB, nullable)
- used_at (TIMESTAMP WITH TIME ZONE, NOT NULL) -- Updates on each use
- created_at (TIMESTAMP WITH TIME ZONE)
- UNIQUE(user_id, provider, external_id)
```

**RLS Policies**: Users can only view/insert/update/delete their own recents.

### Database Functions (in `lib/supabase.ts`)

#### User Profile
- `getUserProfile(userId: string)`: Fetch user profile
- `updateUserProfile(userId, updates)`: Update profile fields
- `createUserProfile(userId, email)`: Create profile (usually handled by trigger)

#### Glucose Logs
- `createGlucoseLog(userId, input)`: Insert new glucose log
- `getGlucoseLogs(userId, limit?)`: Fetch user's glucose logs (ordered by date DESC)

#### Activity Logs
- `createActivityLog(userId, input)`: Insert new activity log
- `getActivityLogs(userId, limit?)`: Fetch user's activity logs (ordered by date DESC)

#### Favorite Foods
- `addFavoriteFood(userId, food)`: Add food to favorites
- `removeFavoriteFood(userId, provider, externalId)`: Remove from favorites
- `getFavoriteFoods(userId)`: Fetch all favorites
- `isFoodFavorited(userId, provider, externalId)`: Check if food is favorited

#### Recent Foods
- `addRecentFood(userId, food)`: Add/update food in recents (upserts with new timestamp)
- `getRecentFoods(userId, limit?)`: Fetch recents (ordered by used_at DESC)

#### Meals
- `createMeal(userId, input)`: Create new meal entry with name, type, time, photo, notes
- `getMeals(userId, limit?)`: Fetch user's meals (ordered by logged_at DESC)
- `getMealsByDateRange(userId, startDate, endDate)`: Fetch meals within date range
- `addMealItems(userId, mealId, items)`: Add food items to a meal with full nutrients snapshot
- `getMealItems(mealId)`: Fetch all items for a meal

#### Fibre Intake
- `getFibreIntakeSummary(userId, range)`: Calculate fibre intake for today/week/month
  - Uses optimized database function `calculate_fibre_intake_summary()` (see Performance Optimizations)
  - Queries meals + meal_items within date range via efficient JOIN
  - Returns `{ totalFibre, avgPerDay, startDate, endDate }`

---

## 🔐 Authentication System

### Flow

1. **Welcome Screen** (`app/index.tsx`): Landing page with sign in/sign up options
2. **Sign Up** (`app/signup.tsx`): Email + password registration
   - Creates Supabase auth user
   - Database trigger automatically creates profile
   - User must confirm email
3. **Sign In** (`app/signin.tsx`): Email + password login
4. **Email Confirmation** (`app/confirm-email.tsx`): Shows after signup
5. **Onboarding** (`app/onboarding-1.tsx` through `onboarding-5.tsx`): Collects user profile data
   - Updates profile via `updateUserProfile()`
   - Sets `onboarding_completed = true` on final step
6. **Main App** (`app/(tabs)/`): Tab navigator (requires authenticated user)

### AuthContext (`context/AuthContext.tsx`)

**Provider**: Wraps entire app in `app/_layout.tsx`

**State**:
- `user`: Current Supabase User object
- `session`: Current auth session
- `profile`: User's profile data from `profiles` table
- `loading`: Auth state loading flag

**Methods**:
- `signUp(email, password)`: Register new user
- `signIn(email, password)`: Authenticate user
- `signOut()`: Log out user
- `refreshProfile()`: Reload profile data

**Hook**: `useAuth()` - Access auth state in any component

### Protected Routes

The app checks `profile?.onboarding_completed` in the root layout to determine if the user should see onboarding or the main app.

---

## 🧭 Navigation Architecture

### Expo Router File-Based Routing

**Root Stack** (`app/_layout.tsx`):
- File-based routes automatically registered
- `(tabs)` is a route group (folder name in parentheses = route group)
- Stack navigator with `slide_from_right` animation

### Tab Navigator (`app/(tabs)/_layout.tsx`)

**Tabs** (in order):
1. **Today** (`index.tsx`) - Home screen with glucose chart and meal cards
2. **Log** (`log.tsx`) - Log history with tips section
3. **Insights** (`insights.tsx`) - Placeholder for insights/analytics
4. **Coach** (`coach.tsx`) - Placeholder for coaching features

**Tab Bar Features**:
- Custom animated icons (bounce on selection)
- Moving white indicator line at top (slides between tabs)
- Dark theme (#111111 background)
- Positioned at bottom with safe area handling

### Tab Transition System (`context/TabTransitionContext.tsx`)

Tracks tab navigation direction for screen slide animations:
- `left`: Moving to a tab on the right (content slides left)
- `right`: Moving to a tab on the left (content slides right)
- `none`: Initial app load (no animation)

**Tab Index Map**:
```typescript
{
  'index': 0,      // Today tab
  'log': 1,        // Log tab
  'insights': 2,   // Insights tab
  'coach': 3       // Coach tab
}
```

### Modal Screens (Stack Routes)

Accessed via `router.push()`:
- `/log-meal` - Meal logging
- `/log-glucose` - Glucose logging
- `/log-activity` - Activity logging
- `/log-meal-items` - Meal items search (placeholder)

---

## 🧩 Components Library

### Core Components

#### `AnimatedScreen` (`components/animated-screen.tsx`)
**Purpose**: Wraps tab screens for slide-in animations when switching tabs.

**Behavior**:
- Slides in from left/right based on tab transition direction
- Uses `react-native-reanimated` with spring animation
- Skips animation on initial app load (first tab)
- Uses `useIsFocused` from React Navigation to trigger on focus

**Usage**: Wrap tab screen content with `<AnimatedScreen>{children}</AnimatedScreen>`

#### `AnimatedFAB` (`components/animated-fab.tsx`)
**Purpose**: Floating Action Button with expandable menu.

**Features**:
- Tap to expand/collapse
- Three action buttons:
  - "Log your Meal" → `/log-meal`
  - "Log your Glucose Level" → `/log-glucose`
  - "Add an activity" → `/log-activity`
- Animations: Scale, rotation, fade
- Positioned bottom-right on Today tab

**Props**:
- `onLogMeal()`, `onLogGlucose()`, `onLogActivity()`: Callbacks for navigation

#### `GlucoseTrendChart` (`components/glucose-trend-chart.tsx`)
**Purpose**: Displays glucose level trends over time.

**Features**:
- Line chart visualization
- Shows glucose levels with color coding (good/warning/high)
- Used on Today tab

#### `SegmentedControl` (`components/segmented-control.tsx`)
**Purpose**: Custom segmented control for filtering/selection.

**Features**:
- Dark theme styling
- Multiple segments with press handlers
- Active state indication

### UI Components (`components/ui/`)

#### `DropdownMenu` (`components/ui/dropdown-menu.tsx`)
**Purpose**: Custom dropdown menu with smooth animations.

**Features**:
- Positioned below trigger element using `measureInWindow`
- Slide-down + fade-in animation (`withTiming`, not spring)
- Customizable width
- Closes on outside press or item selection

**Usage**:
```tsx
<DropdownMenu
  open={isOpen}
  onOpenChange={setIsOpen}
  trigger={<Pressable>...</Pressable>}
>
  <DropdownMenuItem onSelect={...}>...</DropdownMenuItem>
</DropdownMenu>
```

#### `Sheet` (`components/ui/sheet.tsx`)
**Purpose**: Bottom sheet modal for time pickers and other content.

**Features**:
- Slides up from bottom
- Backdrop overlay
- Customizable content
- `SheetContent` for inner content styling

**Usage**:
```tsx
<Sheet open={isOpen} onOpenChange={setIsOpen}>
  <SheetContent>...</SheetContent>
</Sheet>
```

#### `Input` (`components/ui/input.tsx`)
**Purpose**: Styled text input component.

**Features**:
- Dark theme (#1b1b1c background, #313135 border)
- Consistent padding and font styling
- Placeholder text color (#878787)

---

## 🎨 Animation System

### Tab Transitions

**Screen Slide Animation**:
- Direction: Based on tab index comparison (left/right)
- Effect: Horizontal slide with subtle bounce (spring config)
- Offset: 15% of screen width
- Spring: `{ damping: 20, stiffness: 200, mass: 0.8 }`
- Trigger: On screen focus (`useIsFocused`)

**Tab Icon Animation**:
- Effect: Scale + translateY bounce on selection
- Scale: 1 → 1.08 → 1 (sequence)
- TranslateY: 0 → -2px → 0 (sequence)
- Spring: `{ damping: 14, stiffness: 320 }` then `{ damping: 16, stiffness: 220 }`
- Skip: First mount (no initial bounce)

**Tab Indicator Line**:
- Effect: Smooth horizontal slide
- Position: Calculated based on tab index and screen width
- Spring: `{ damping: 22, stiffness: 220, mass: 0.9 }`

### FAB Animation

- Expand/collapse: Scale + rotation
- Menu items: Fade in/out with stagger
- Smooth transitions using `react-native-reanimated`

### Dropdown Animation

- Direction: Slide down from trigger
- Effect: `translateY` + `opacity` using `withTiming` (not spring)
- Duration: ~200ms
- Smooth, non-bouncy feel

---

## 🎨 Design System

### Colors (`constants/Colors.ts`)

**Background**:
- Primary: `#111111` (main app background)
- Secondary: `#161616`
- Card: `rgba(63,66,67,0.25)` or `#1b1b1c`

**Text**:
- Primary: `#FFFFFF`
- Secondary: `#A0A0A0`
- Muted: `#666666`, `#878787`

**Buttons**:
- Primary: `#285E2A` (green, for save buttons)
- Border: `#448D47` (darker green)

**Input**:
- Background: `#1b1b1c`
- Border: `#313135`
- Placeholder: `#878787`

**Status**:
- Success: `#4CAF50`
- Warning: `#FF9800`
- Error: `#F44336`
- Glucose Good: `#4CAF50`
- Glucose Warning: `#FF9800`
- Glucose High: `#F44336`

### Typography (`hooks/useFonts.ts`)

**Font Family**: Outfit (variable font)

**Weights Available**:
- `thin`, `extraLight`, `light`, `regular`, `medium`, `semiBold`, `bold`, `extraBold`, `black`

**Usage**:
```typescript
import { fonts } from '@/hooks/useFonts';
// fonts.regular, fonts.bold, fonts.medium, etc.
```

### Spacing

- **Screen Padding**: 16px horizontal
- **Card Padding**: 16-20px
- **Input Padding**: 16px horizontal, 14px vertical
- **Bottom Nav Bar**: 40px (iOS), 20px (Android) from bottom
- **Scroll Padding**: 170px bottom (iOS), 150px (Android) to account for nav bar

### Safe Area Handling

- Uses `react-native-safe-area-context`
- `SafeAreaView` with `edges={['top']}` on tab screens (prevents bottom padding)
- Bottom spacing handled manually with padding

---

## ✨ Key Features

### 1. Today Tab (`app/(tabs)/index.tsx`)
- **Glucose Trend Chart**: Visualizes glucose levels over time
- **Meal Cards**: Displays recent meals with peak glucose values
- **FAB**: Floating action button to log meals/glucose/activities
- **Time Period Filter**: Segmented control for filtering data (7d, 14d, 30d, 90d)
- **Stats Cards**: Four key metrics displayed:
  - **Time in Range**: Percentage of glucose readings within target range
  - **Average Glucose**: Mean glucose level for the selected period
  - **Sleep**: Average hours per night from Apple HealthKit (iOS only)
  - **Fibre Intake**: Average daily fibre consumption
- **Optimized Data Fetching**: Uses `useTodayScreenData` hook to batch all queries
- **Swipeable Tip Cards**: Interactive card component with two tips:
  - **Planning your next lunch?** → Opens `SpikeRiskInputSheet` for pre-meal glucose spike prediction
  - **Planning your next exercise?** → Opens `ExerciseInputSheet` for exercise impact analysis
  - Features horizontal swipe gestures with `PanResponder`
  - Animated card shuffle effect with dots indicator
- **SpikeRiskInputSheet**: Bottom sheet modal for entering meal text
  - Includes `KeyboardAvoidingView` for proper keyboard handling
  - Navigates to `/check-spike-risk` with user input
- **ExerciseInputSheet**: Bottom sheet modal for entering exercise text
  - Same design pattern as SpikeRiskInputSheet
  - Navigates to `/check-exercise-impact` with user input

### 2. Log Tab (`app/(tabs)/log.tsx`)
- **Personalized Tips**: Section at top with tips for glucose, exercise, sleep, meals
- **Log History**: Scrollable list of user's logs (meals, glucose, activities)
- **Grouped by Date**: Logs organized chronologically

### 3. Insights Tab (`app/(tabs)/insights.tsx`)

The Insights screen provides a comprehensive analytics dashboard with three main sections accessible via a tabbed interface.

#### Tabbed Interface
- **SegmentedControl** component with animated slider
- Three tabs: **Weekly Report**, **Trends**, **Experiments**
- White underline indicator slides between tabs

#### Weekly Report Tab (Fully Implemented)

**a. Time of Day Comparison Chart (`TimeOfDayChart` component)**
- Visual representation of glucose patterns across 5 time periods
- **Y-axis labels**: Spike, Mild Elevation, Steady (horizontal text)
- **X-axis labels**: Combined time and period (07:00 AM, 12:00 PM, 04:00 PM, 07:00 PM, 10:00 PM)
- **Zone Bands**: Colored horizontal background bands:
  - Spike zone: `#5C3D3D` (dark red)
  - Mild Elevation zone: `#5A4637` (brown)
  - Steady zone: `#3D4B37` (dark green)
- **Average Glucose Bars**: Blue bars (`#3494D9`) showing average glucose level per time period
- Data fetched from `glucose_logs` table and calculated per time period

**b. Weekday vs Weekend Comparison (`WeekdayWeekendComparison` component)**
- Progressive meter showing dominant glucose response level
- Grid layout with column headers (Steady, Mild Elevation, Spike)
- Row labels: Weekdays, Weekend
- **Logic**: Uses weighted average calculation (Steady=1, Mild=2, Spike=3) to determine dominant level
- **Visual**: Blue boxes fill progressively based on level

**c. Behavioral Impacts Section**
- Color-coded impact bars showing effects of behaviors on glucose:
  - Meals (green gradient)
  - Physical Activity (blue gradient)
  - Sleep Quality (orange gradient)
- Percentage display for each impact factor

**d. Best/Worst Meal Comparison (`MealComparisonCard` component)**
- Tabbed display (Best Meal / Worst Meal)
- Shows meal name, date, time, and peak glucose value
- Peak value color coded (green for best, red for worst)

#### Trends Tab (Fully Implemented)

**a. Meal Impacts Card**
- **Dynamic PieChart Component**: SVG-based pie chart that responds to data
- **Legend**: Steady Levels (green), Mild Elevations (orange), Spikes (red)
- **Colors**: `#4CAF50`, `#FF9800`, `#C62828`
- Shows percentage breakdown of meal outcomes

**b. Peak Comparison Card**
- **Predicted Peak vs Actual Peak**: Horizontal bar comparison
- Blue bars with mmol/L values
- Insight text explaining difference (e.g., "18% gentler than expected")

**c. Gluco Suggestion Impact Card**
- Compares glucose response when following suggestions vs not:
  - With More Fiber vs With Same Fiber
  - With Walk vs No Walk
  - Half Portion vs Full Portion
- Blue bars for "followed suggestion", grey bars for "didn't follow"
- "See more habits you tried" expandable link

**d. Date Filter Row**
- "Today" label with filter icon
- Prepared for future date range filtering

#### Experiments Tab (Fully Implemented)

**Purpose**: Personalized A/B testing system for users to discover what works best for their glucose management through structured experiments.

**Features**:

**a. Header Section**
- Title: "Find What Works For Your Glucose" with sparkle icon (✨)
- Description: "Small tests you can try for a few meals. We'll compare them and show your pattern — no rules, just real learning."
- Styled with consistent dark theme and typography

**b. Active Experiments Section**
- Displays user's currently active experiments
- Shows experiment icon, title, status badge ("IN PROGRESS" or "DRAFT")
- Progress indicator: "X / Y exposures logged" with visual progress bar
- "View Progress >" button navigates to experiment detail screen
- Empty state when no active experiments

**c. Suggested For You Section**
- AI-powered personalized experiment suggestions
- Fetched via `experiments-suggest` Edge Function
- Each suggestion shows:
  - Template icon and title
  - "HIGH IMPACT" badge (if predicted_impact === 'high')
  - Subtitle and description
  - AI-generated reason (e.g., "Fiber can slow glucose absorption")
  - "Start Experiment" button
- Loading state with ActivityIndicator
- Empty state when no suggestions available

**d. Integration Points**:
- `fetchExperimentsData()`: Fetches suggested experiments and active experiments on mount
- `handleStartExperiment()`: Creates new user experiment and navigates to detail screen
- "View All Experiments" link navigates to `/experiments-list` screen
- Auto-refreshes on screen focus

**Data Flow**:
1. On mount: Calls `getSuggestedExperiments(userId)` → Edge Function
2. Fetches active experiments: `getUserExperiments(userId, ['active', 'draft'])`
3. User taps "Start Experiment" → `startUserExperiment()` → Navigate to `/experiment-detail`
4. User taps "View Progress" → Navigate to `/experiment-detail?id={experimentId}`

#### Key Components Created

**`PieChart` Component** (`app/(tabs)/insights.tsx`):
```typescript
function PieChart({ data, size = 120 }: { 
    data: { value: number; color: string; label: string }[]; 
    size?: number;
})
```
- Dynamic SVG pie chart that calculates segments from data
- Uses `describeArc()` helper for arc path generation
- Fully responsive to data changes

**Helper Functions**:
- `polarToCartesian(centerX, centerY, radius, angle)`: Converts polar to cartesian coordinates
- `describeArc(x, y, radius, startAngle, endAngle)`: Creates SVG arc path string
- `getWeekRange()`: Returns date range for last 7 days

#### Data Fetching
- Uses `getGlucoseLogsByDateRange(userId, startDate, endDate)` from `lib/supabase.ts`
- Categorizes glucose readings:
  - Steady: < 6.5 mmol/L
  - Mild: 6.5 - 8.5 mmol/L
  - Spike: > 8.5 mmol/L
- Calculates averages per time period (morning, noon, afternoon, evening, night)

### 3. Meal Logging (`app/log-meal.tsx`)
- **Fields**:
  - Meal name (text input)
  - Meal image (camera/photo library via `expo-image-picker`)
  - Meal type dropdown (Breakfast, Lunch, Dinner, Snack)
  - Meal time (wheel-style picker in bottom sheet)
  - Meal items (placeholder for future search)
- **Backend**: Saves to database (not yet implemented in backend)

### 4. Glucose Logging (`app/log-glucose.tsx`)
- **Fields**:
  - Glucose level (number input)
  - Context dropdown (Pre Meal, Post Meal, Random, Fasting, Bedtime)
  - Time (wheel-style picker)
- **Backend**: Fully integrated - saves to `glucose_logs` table

### 5. Activity Logging (`app/log-activity.tsx`)
- **Fields**:
  - Activity name (text input)
  - Duration (number input with "mins" label)
  - Intensity dropdown (Light, Moderate, Intense)
  - Activity time (wheel-style picker)
- **Backend**: Fully integrated - saves to `activity_logs` table

### Time Picker Component

**Shared Logic** (used in meal, glucose, and activity logging):
- Wheel-style picker with three columns: Hour (1-12), Minute (0-59), Period (AM/PM)
- Implemented with `FlatList` and snap-to-interval scrolling
- `onMomentumScrollEnd` updates selected values
- Shows in bottom sheet modal
- Helper functions:
  - `toParts(date)`: Converts Date to { hour12, minute, period }
  - `fromParts(parts)`: Converts parts back to Date
  - `formatTime(date)`: Formats Date as "H:MM AM/PM"

---

## 🔌 Backend Integration

### Supabase Client Setup (`lib/supabase.ts`)

**Configuration**:
- Uses AsyncStorage for session persistence
- Auto-refreshes tokens
- Detects session on app start

### Database Helpers

All database operations are async functions that return data or null on error.

**Type Safety**: TypeScript interfaces defined for all data types:
- `UserProfile`
- `GlucoseLog`, `CreateGlucoseLogInput`
- `ActivityLog`, `CreateActivityLogInput`

### Error Handling

- Console errors logged on failure
- Functions return `null` on error (safe to handle in UI)
- User-facing alerts shown via `Alert.alert()`

### Edge Functions (`supabase/functions/`)

#### 1. `premeal-analyze` - Pre Meal Check AI Analysis

**Location**: `supabase/functions/premeal-analyze/index.ts`

**Purpose**: Analyzes meal data to predict glucose spike risk and provide personalized recommendations.

**API**:
```typescript
// Request
POST /functions/v1/premeal-analyze
{
  user_id: string,
  meal_draft: {
    name: string,
    logged_at: string,
    items: MealItem[]
  }
}

// Response
{
  spike_risk_pct: number,          // 0-100 risk percentage
  predicted_curve: CurvePoint[],   // Glucose prediction curve
  drivers: Driver[],               // AI-generated risk explanations
  adjustment_tips: AdjustmentTip[], // Selectable suggestions
  personalized: boolean            // Whether user-specific data was used
}
```

**Features**:
- Calculates user-specific glucose profile from 14-day history
- Parameters: carb sensitivity, peak time, baseline glucose
- Falls back to population averages for new users
- Generates personalized glucose prediction curve
- AI-powered drivers and adjustment tips via Gemini (fallback: OpenAI)

**AI Integration**:
- Primary: Gemini 1.5 Flash (`GEMINI_API_KEY` required)
- Fallback: OpenAI GPT-4o-mini (`OPENAI_API_KEY`)
- Final fallback: Rule-based heuristics if both fail

---

#### 2. `personalized-tips` - AI-Powered Log Screen Tips

**Location**: `supabase/functions/personalized-tips/index.ts`

**Purpose**: Generates personalized health tips based on user's glucose, meal, and activity data.

**API**:
```typescript
// Request
POST /functions/v1/personalized-tips
{ user_id: string }

// Response
{
  tips: PersonalizedTip[],
  stats: UserStats
}

// PersonalizedTip
{
  id: string,
  category: 'glucose' | 'meal' | 'activity',
  title: string,
  description: string,  // Personalized insight
  articleUrl: string,   // Relevant health article
  metric?: string       // e.g., "7.2 mmol/L avg"
}
```

**Features**:
- Fetches last 7 days of user data
- Calculates: avg glucose, % in range, high readings, fibre intake, activity minutes
- Uses Gemini AI to generate personalized tips with relevant article URLs
- Fallback tips if Gemini fails or no data available

**Data Sources**:
- `glucose_logs`: Average reading, % in range, high readings count
- `meals` + `meal_items`: Average fibre intake per day
- `activity_logs`: Total minutes, session count, active days

---

#### 3. `experiments-suggest` - Personalized Experiment Recommendations

**Location**: `supabase/functions/experiments-suggest/index.ts`

**Purpose**: Analyzes user's glucose patterns, meal history, and behaviors to suggest relevant experiments.

**API**:
```typescript
// Request
POST /functions/v1/experiments-suggest
{
  user_id: string
}

// Response
{
  suggestions: SuggestedExperiment[]
}

// SuggestedExperiment
{
  template: ExperimentTemplate,
  variants: ExperimentVariant[],
  score: number,                    // Relevance score (0-100)
  reasons: string[],                // AI-generated reasons
  recommended_parameters: {},       // Customized protocol params
  predicted_impact: 'high' | 'moderate' | 'low'
}
```

**Features**:
- Analyzes user's glucose patterns (spikes, time of day, contexts)
- Examines meal history (frequency, types, outcomes)
- Reviews activity patterns (post-meal walks, exercise timing)
- Scores experiment templates based on relevance
- Generates AI-powered reasons via Gemini
- Returns top 3-5 personalized suggestions
- Considers eligibility rules (CGM requirement, meal logging, etc.)

**Scoring Algorithm**:
- Pattern matching: Higher score if user's patterns match experiment's target
- Spike frequency: Prioritizes experiments addressing frequent spike contexts
- Meal diversity: Suggests experiments for meal types user eats often
- Behavioral gaps: Recommends experiments for untested behaviors
- Data availability: Only suggests experiments user has enough data for

**AI Integration**:
- Uses Gemini to generate personalized reasons for each suggestion
- Explains why the experiment is relevant to the user
- Provides context-aware explanations

---

#### 4. `experiments-evaluate` - Experiment Results Analysis

**Location**: `supabase/functions/experiments-evaluate/index.ts`

**Purpose**: Evaluates experiment results by comparing variants and generating AI summaries.

**API**:
```typescript
// Request
POST /functions/v1/experiments-evaluate
{
  user_experiment_id: string
}

// Response
{
  metrics: Record<string, VariantMetrics>,
  comparison: ComparisonResult,
  summary: string | null,          // AI-generated summary
  suggestions: string[],           // Actionable insights
  is_final: boolean
}

// VariantMetrics
{
  n_exposures: number,
  n_with_glucose_data: number,
  peak_deltas: number[],
  times_to_peak: number[],
  median_peak_delta: number | null,
  mean_peak_delta: number | null,
  median_time_to_peak: number | null,
  checkin_scores: {
    energy: number[],
    hunger: number[],
    cravings: number[],
    difficulty: number[]
  },
  avg_energy: number | null,
  avg_hunger: number | null,
  avg_cravings: number | null
}

// ComparisonResult
{
  winner: string | null,           // Variant key (e.g., 'A', 'B')
  delta: number | null,             // Difference in peak_delta
  confidence: 'high' | 'moderate' | 'low' | 'insufficient',
  direction: 'better' | 'worse' | 'similar' | 'unknown'
}
```

**Features**:
- Fetches all experiment events (exposures, check-ins)
- Links exposures to post-meal reviews for glucose data
- Calculates metrics per variant:
  - Peak glucose delta (median, mean)
  - Time to peak (median)
  - Subjective check-in scores (energy, hunger, cravings)
- Statistical comparison between variants
- Confidence assessment based on sample size
- AI-generated summary explaining results
- Actionable suggestions based on findings

**Comparison Logic**:
- Requires minimum exposures per variant (default: 3)
- Uses median for robustness (less sensitive to outliers)
- Confidence levels:
  - High: ≥6 exposures per variant, clear difference
  - Moderate: ≥4 exposures, noticeable difference
  - Low: ≥3 exposures, small difference
  - Insufficient: <3 exposures per variant

**AI Integration**:
- Uses Gemini to generate natural language summaries
- Explains which variant performed better and why
- Provides context-aware insights
- Suggests next steps based on results

---

#### 5. `exercise-analyze` - Personalized Exercise Impact Analysis

**Location**: `supabase/functions/exercise-analyze/index.ts`

**Purpose**: Analyzes exercise input to estimate calories burned and glucose impact using personalized data from the user's glucose history and calibration.

**API**:
```typescript
// Request
POST /functions/v1/exercise-analyze
{
  user_id: string,
  exercise_text: string  // e.g., "30 min walk after lunch"
}

// Response
{
  exercise: {
    name: string,             // Parsed exercise name
    duration_min: number,     // Parsed duration
    intensity: 'light' | 'moderate' | 'vigorous',
    met_value: number,        // Metabolic equivalent
    category: string          // e.g., 'Walking', 'Running'
  },
  calories_burned: number,
  glucose_impact: {
    reduction_pct: number,    // Expected glucose reduction %
    timing_benefit: string,   // Contextual timing advice
    optimal_timing: string,   // Best time to exercise
    personalized: boolean,    // Whether user data was used
    based_on_history: boolean // Whether using calibration data
  },
  tips: ExerciseTip[],
  user_stats: {
    weight_kg: number,
    age: number,
    bmi: number | null
  },
  personalization: {
    data_quality: 'none' | 'low' | 'medium' | 'high',
    glucose_observations: number,
    activity_observations: number,
    baseline_glucose: number,
    exercise_effect: number   // Learned modifier from history
  }
}
```

**Data Sources Fetched**:
1. **User Profile** (`profiles` table): `birth_date`, `biological_sex`
2. **User Calibration** (`user_calibration` table): Personalized glucose response parameters
3. **Glucose Logs** (`glucose_logs` table): Last 7 days for average calculation
4. **Activity Logs** (`activity_log` table): Count of past activities

### Calorie Calculation Formula

Uses **MET (Metabolic Equivalent of Task)** values:

```
Calories Burned = MET × Weight (kg) × Duration (hours)
```

**MET Database** (built-in values for common exercises):

| Exercise | Light | Moderate | Vigorous |
|----------|-------|----------|----------|
| Walking  | 2.5   | 3.5      | 5.0      |
| Running  | 7.0   | 10.0     | 12.5     |
| Cycling  | 4.0   | 8.0      | 12.0     |
| Swimming | 4.0   | 6.0      | 10.0     |
| Weights  | 3.5   | 5.0      | 6.0      |
| HIIT     | 6.0   | 8.0      | 12.0     |
| Yoga     | 2.5   | 3.5      | 5.0      |

**Weight Estimation** (when not in profile):
- Female: 65 kg default
- Male: 80 kg default
- Unknown: 70 kg default

### Glucose Impact Calculation

**Step 1: Base Reduction by Intensity**
```javascript
switch (intensity) {
  case 'light':
    baseReduction = 5 + (duration_min / 60) * 5;    // 5-10%
    break;
  case 'moderate':
    baseReduction = 10 + (duration_min / 60) * 10;  // 10-20%
    break;
  case 'vigorous':
    baseReduction = 15 + (duration_min / 60) * 15;  // 15-30%
    break;
}
```

**Step 2: Personalization Modifier (if calibration data exists)**
```javascript
// From user_calibration.exercise_effect (learned from past data)
if (calibration.exercise_effect !== 0) {
  baseReduction *= (1 + calibration.exercise_effect);
}
```

**Step 3: Baseline Glucose Adjustment**
```javascript
// Users with higher baseline see larger reductions
if (avgGlucose > 7.0 mmol/L) {
  baseReduction *= 1.2;  // +20% impact
} else if (avgGlucose < 5.0 mmol/L) {
  baseReduction *= 0.8;  // -20% impact (already low)
}
```

**Step 4: Timing Context Modifier**
```javascript
// Post-meal exercise detection from text
if (/after|post|following/.test(exercise_text)) {
  baseReduction *= 1.3;  // +30% more effective post-meal
}
```

**Step 5: Cap at Reasonable Bounds**
```javascript
baseReduction = Math.min(baseReduction, 40);  // Max 40%
baseReduction = Math.max(baseReduction, 3);   // Min 3%
```

### Data Quality Levels

Calculated based on available data:

| Level | Criteria |
|-------|----------|
| `high` | ≥20 calibration observations AND ≥50 glucose readings |
| `medium` | ≥5 calibration observations AND ≥10 glucose readings |
| `low` | Any glucose readings OR calibration data |
| `none` | No user-specific data available |

**Frontend Integration**:
- Called from `invokeExerciseAnalyze()` in `lib/supabase.ts`
- Results displayed in `app/check-exercise-impact.tsx`
- Shows "Personalized" badge when data is personalized
- Displays data quality indicator

---

### Required Environment Variables

Set in Supabase Dashboard → Edge Functions → Secrets:

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key (primary AI) |
| `OPENAI_API_KEY` | OpenAI API key (fallback) |
| `SUPABASE_URL` | Auto-set by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-set by Supabase |

### Deploying Edge Functions

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy premeal-analyze
supabase functions deploy exercise-analyze
supabase functions deploy personalized-tips
supabase functions deploy experiments-suggest
supabase functions deploy experiments-evaluate

# Set secrets
supabase secrets set GEMINI_API_KEY=your_key_here
```

### Data Fetching Pattern

```typescript
const { user } = useAuth(); // Get current user
const logs = await getGlucoseLogs(user.id, 50); // Fetch with limit
```

### Data Creation Pattern

```typescript
const result = await createGlucoseLog(user.id, {
  glucose_level: 120,
  logged_at: new Date().toISOString(),
  context: 'pre_meal',
});
if (result) {
  // Success - show alert, navigate back
} else {
  // Error - show error alert
}
```

---

## 🏥 Apple HealthKit Integration

### Overview

The app integrates with Apple HealthKit to fetch sleep data, recognizing that sleep quality is a critical factor in prediabetes reversal. This integration provides users with personalized sleep insights directly from their Apple Health data.

### Setup Requirements

**Native Build Required**: HealthKit requires native modules, so the app must be built with `expo-dev-client` instead of Expo Go.

**Configuration** (`app.json`):
- HealthKit permissions in `infoPlist`:
  - `NSHealthShareUsageDescription`: "We need access to your sleep data to provide personalized health insights."
  - `NSHealthUpdateUsageDescription`: "We need access to update your health data."
- HealthKit entitlements:
  - `com.apple.developer.healthkit`
  - `com.apple.developer.healthkit.background-delivery`
- `react-native-health` plugin configuration

**Environment Variables** (`app.json`):
```json
{
  "extra": {
    "supabaseUrl": "your-supabase-url",
    "supabaseAnonKey": "your-anon-key"
  }
}
```

### Implementation

#### `lib/healthkit.ts`

Core HealthKit integration module with lazy loading to prevent crashes on non-iOS platforms:

**Functions**:
- `initHealthKit()`: Initializes HealthKit and requests sleep analysis permissions
- `getSleepData(startDate, endDate)`: Fetches sleep samples and calculates:
  - Total sleep minutes
  - Number of nights tracked
  - Average minutes per night
- `isHealthKitAvailable()`: Checks if HealthKit is available on the device
- `requestHealthKitAuthorization()`: Shows iOS permission dialog

**Error Handling**:
- Gracefully handles module loading failures
- Returns safe defaults when HealthKit is unavailable
- Platform-specific checks (iOS only)

**Sleep Sample Processing**:
- Filters for actual sleep samples (`ASLEEP`, `CORE`, `DEEP`, `REM`)
- Excludes `INBED` and `AWAKE` states
- Groups samples by night (adjusts for late-night sleep)
- Calculates accurate averages

#### `hooks/useSleepData.ts`

React hook for accessing sleep data in components:

**Features**:
- Fetches sleep data for a given date range
- Provides authorization status
- Handles loading and error states
- Auto-refetches on screen focus
- Delayed initialization to prevent blocking render

**Return Value**:
```typescript
{
  data: {
    avgHoursPerNight: number,
    totalNights: number,
    totalHours: number,
    isAuthorized: boolean,
    isAvailable: boolean
  },
  isLoading: boolean,
  error: Error | null,
  refetch: () => Promise<void>
}
```

**Usage**:
```typescript
const { data, isLoading } = useSleepData('7d');
const avgHours = data?.avgHoursPerNight ?? 0;
```

### Today Screen Integration

The sleep stat replaces the previous "Above 7.8" metric on the Today screen:

- **SleepStatCard**: Displays average hours per night
- **Icon**: Moon icon (Ionicons) for visual consistency
- **Styling**: Matches other stat cards (green title, consistent font sizes)
- **Fallback**: Shows 0h when HealthKit unavailable or unauthorized

### Platform Support

- **iOS**: Full HealthKit integration
- **Android**: Not supported (shows 0h, `isAvailable: false`)

### Building with HealthKit

```bash
# Clean and rebuild native code
npx expo prebuild --clean --platform ios

# Build and run
npx expo run:ios
```

---

## ⚡ Performance Optimizations

### Overview

Several optimizations have been implemented to improve app performance, reduce database round trips, and ensure smooth data loading.

### 1. Unified Data Fetching Hook

**File**: `hooks/useTodayScreenData.ts`

**Purpose**: Consolidates all Today screen data fetching into a single batched operation.

**Benefits**:
- Reduces multiple sequential database calls to a single parallel batch
- Ensures data consistency across all stats
- Prevents race conditions
- Improves initial load time

**Implementation**:
```typescript
const { glucoseLogs, activityLogs, fibreSummary, mealReviews, isLoading } = 
  useTodayScreenData(range);
```

**Data Fetched**:
- Glucose logs (extended range for chart comparisons)
- Activity logs (for selected range)
- Fibre intake summary
- Pending meal reviews

**Features**:
- Waits for authentication before fetching
- Refetches on screen focus
- Handles loading and error states

### 2. Centralized Date Range Utilities

**File**: `lib/utils/dateRanges.ts`

**Purpose**: Eliminates code duplication and ensures consistent date calculations.

**Functions**:
- `getDateRange(range)`: Returns start/end dates for a range key
- `getExtendedDateRange(range, multiplier)`: Extended range for historical comparisons
- `getRangeDays(range)`: Number of days in a range
- `getRangeLabel(range)`: Human-readable label
- `getRangeShortLabel(range)`: Short label for UI

**Type**: `RangeKey = '24h' | '7d' | '14d' | '30d' | '90d'`

### 3. Database Function for Fibre Intake

**File**: `supabase/migrations/20241224_fibre_intake_function.sql`

**Purpose**: Moves fibre calculation to the database for better performance.

**Function**: `calculate_fibre_intake_summary(user_id, range)`

**Benefits**:
- Single database query instead of multiple round trips
- Efficient JOIN operations
- Reduced client-side processing
- Consistent calculations

**Returns**:
```sql
{
  total_fibre_g: numeric,
  avg_per_day: numeric,
  start_date: date,
  end_date: date
}
```

### 4. Performance Indexes

**File**: `supabase/migrations/20241224_add_performance_indexes.sql`

**Purpose**: Adds indexes to frequently queried columns.

**Indexes Added**:
- `glucose_logs(user_id, logged_at DESC)`
- `activity_logs(user_id, logged_at DESC)`
- `meals(user_id, logged_at DESC)`
- `meal_items(meal_id)` for JOIN performance
- Composite indexes for common query patterns

### 5. React.memo Optimization

**Location**: `app/(tabs)/index.tsx`

**Fix**: Updated comparison functions for all stat cards to include data props, not just `range`.

**Before**:
```typescript
React.memo(StatCard, (prev, next) => prev.range === next.range)
```

**After**:
```typescript
React.memo(StatCard, (prev, next) => 
  prev.range === next.range && 
  prev.glucoseLogs === next.glucoseLogs
)
```

**Impact**: Stats now update correctly on initial load when data arrives.

### 6. Environment Variables

**File**: `lib/supabase.ts`

**Change**: Replaced hardcoded Supabase keys with environment variables from `app.json`.

**Benefits**:
- Better security practices
- Easier configuration for different environments
- No hardcoded secrets in source code

**Configuration**:
```typescript
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey;
```

### Performance Metrics

**Before Optimizations**:
- Multiple sequential database calls (4-5 round trips)
- Duplicate date range calculations
- Client-side fibre aggregation
- Stats showing 0% on initial load

**After Optimizations**:
- Single batched database call (parallel queries)
- Centralized date utilities
- Database-side fibre calculation
- Stats update correctly on initial load
- Faster initial render time

---

## 📊 Current State

### ✅ Completed Features

1. **Authentication Flow**
   - Sign up, sign in, email confirmation
   - Onboarding flow (5 screens)
   - Profile creation and management

2. **Navigation**
   - Tab navigator with 4 tabs
   - Stack navigator for modal screens
   - Animated tab transitions
   - Tab indicator line animation

3. **Today Tab**
   - Glucose trend chart
   - Meal cards display
   - FAB with three actions
   - Time period filtering (7d, 14d, 30d, 90d)
   - Four stat cards: Time in Range, Average Glucose, Sleep (HealthKit), Fibre Intake
   - Optimized data fetching with batched queries

4. **Log Tab**
   - Tips section
   - Log history display

5. **Logging Screens**
   - Meal logging (UI complete, backend pending)
   - Glucose logging (fully integrated)
   - Activity logging (fully integrated)
   - Time picker component (wheel-style)

6. **Database**
   - Profiles table with RLS
   - Glucose logs table with RLS
   - Activity logs table with RLS
   - All helper functions implemented

7. **UI Components**
   - Custom dropdown menu
   - Bottom sheet modal
   - Animated FAB
   - Input components
   - Time picker

8. **Insights Tab (Weekly Report, Trends & Experiments)**
   - Tabbed interface with animated segmented control
   - **Weekly Report Tab**:
     - Time of Day comparison chart with zone bands
     - Weekday vs Weekend comparison meter
     - Behavioral impacts section
     - Best/Worst meal comparison cards with AI-generated drivers
   - **Trends Tab**:
     - Dynamic PieChart SVG component
     - Peak Comparison bars
     - Gluco Suggestion Impact comparison
   - **Experiments Tab** (Fully Implemented):
     - Personalized experiment suggestions via AI
     - Active experiments with progress tracking
     - "Start Experiment" functionality
     - Navigation to experiment detail and list screens

9. **Food Search with Favorites & Recents** (`app/log-meal-items.tsx`)
   - Tabbed interface: ALL, RECENTS, FAVORITES
   - Heart button to toggle favorites
   - Auto-adds foods to recents when selected
   - Favorite foods stored in `favorite_foods` table
   - Recent foods stored in `recent_foods` table with timestamp

   **Search Orchestration Layer** (`lib/foodSearch/`):
   - **orchestrator.ts**: Main `searchWithOrchestration()` function
     - Normalizes query, fixes common typos (80+ food typos mapped)
     - Checks AsyncStorage cache (24h provider, 7d Gemini results)
     - Calls Edge Function for dual-provider search
     - Triggers Gemini fallback if results < 5 or best score < 60
     - Ranks, dedupes, and returns merged results
   - **normalize.ts**: Query preparation
     - `normalizeQuery()`: lowercase, remove diacritics, collapse whitespace
     - `fixCommonTypos()`: kebaba→kebab, chikcen→chicken, yougurt→yogurt
     - `singularize()`: berries→berry, potatoes→potato
     - `levenshteinDistance()`: fuzzy matching
   - **rank.ts**: Deterministic scoring algorithm
     - Exact match: +100, Contains query: +70
     - Token overlap: +20 per matched token (strongest signal)
     - Prefix match: +30, Token prefix: +8
     - Brand token match: +12, Category match: +8
     - Nutrient availability: +8-36 (complete macros bonus)
     - Short name bonus: +12 (<25 chars)
     - Supplement penalty: -40 (vitamins, capsules, tablets)
     - Ingredient list penalty: -20
   - **cache.ts**: AsyncStorage with TTL
   - **geminiRewrite.ts**: AI query correction fallback

   **Dual-Provider Edge Function** (`supabase/functions/food-search/`):
   - Searches USDA FDC + Open Food Facts in parallel
   - FDC: Foundation, SR Legacy, Branded data types
   - OFF: Product name, brand, categories, nutriments
   - Returns merged NormalizedFood[] with provider breakdown

   **"Did You Mean" UI**:
   - Shows correction banner when query is auto-corrected
   - Tap to apply corrected query
   - Inline loading indicator while searching

10. **Pre Meal Check Screen** (`app/pre-meal-check.tsx`)
    - **AI-Powered Analysis**: Edge Function (`supabase/functions/premeal-analyze/index.ts`) calculates spike risk
    - Displays meal name, time, and optional photo
    - Macro nutrients bar (Carbs, Protein, Fiber, Fat) with color coding
    - Meal items list with quantities
    - **Spike Risk Gauge**: Circular SVG gauge with color-coded risk (green < 50%, orange 50-75%, red > 75%)
    - **Dynamic Glucose Chart**: Renders personalized predicted curve from API
      - Shows actual glucose values (mmol/L) with peak marker
      - Dynamic time labels based on meal time
    - **Personalized Glucose Prediction**:
      - Calculates user-specific glucose profile from 14-day history
      - Parameters: carb sensitivity, peak time, baseline glucose
      - Falls back to population averages for new users
    - **Drivers Section**: AI-generated bullet points explaining prediction
    - **Adjustment Tips**: Selectable suggestion cards with risk reduction percentages
      - Selecting tips dynamically recalculates spike risk
    - **Meal Logging**:
      - "Log this meal" button saves to `meals` and `meal_items` tables
      - Records adjusted spike risk and all nutritional data
      - Green button matches app design (#26A861)

11. **Fibre Intake Metric** (Today Tab - `FibreStatCard`)
    - Dynamic card showing average fibre intake per day
    - **Thresholds** (Canada DV 25g/day target):
      - Low: < 12.5 g/day (< 50%) - Red (#F44336)
      - Moderate: 12.5 – 24.9 g/day (50-99%) - Orange (#FF9800)
      - High: ≥ 25 g/day (100%+) - Green (#4CAF50)
    - Updates when time range changes (7d/14d/30d/90d)
    - Fetches data via optimized database function `calculate_fibre_intake_summary()`
    - Title stays green (#4A9B16), status pill shows threshold color

12. **Apple HealthKit Sleep Integration** (Today Tab - `SleepStatCard`)
    - Replaces previous "Above 7.8" stat with sleep data
    - Fetches sleep data from Apple HealthKit (iOS only)
    - Displays average hours per night for selected date range
    - Shows authorization status and handles unavailable states gracefully
    - Uses `react-native-health` with lazy loading for safe module initialization
    - Requires Expo Dev Client (native build) instead of Expo Go

13. **Performance Optimizations**
    - Unified data fetching hook (`useTodayScreenData`) batches all Today screen queries
    - Centralized date range utilities (`lib/utils/dateRanges.ts`)
    - Database function for fibre intake calculation (reduces round trips)
    - Performance indexes on frequently queried columns
    - Fixed React.memo comparison functions for proper stat updates
    - Environment variables for Supabase configuration

12. **Log History** (`app/(tabs)/log.tsx`)
    - Unified log display combining glucose, activity, and meal entries
    - Auto-refreshes on screen focus
    - Meals now appear in recent logs list
    - Sorted by logged_at timestamp (most recent first)

13. **Personalized Tips Carousel** (`app/(tabs)/log.tsx`)
    - AI-powered tips carousel at top of Log screen
    - **Data Source**: Gemini AI via Edge Function (`supabase/functions/personalized-tips/`)
    - Fetches user's last 7 days of glucose, meals, and activity data
    - Generates personalized insights:
      - 🩸 **Glucose Tip**: Average reading, % in range, improvement suggestions
      - 🍽️ **Meal Tip**: Fibre intake, meal patterns, dietary recommendations
      - 🏃 **Activity Tip**: Total minutes, session count, exercise benefits
    - Each tip includes:
      - Personalized description with actual user metrics
      - Relevant article URL from health sources (Healthline, Diabetes.org, etc.)
      - "Tap to read more" link that opens in browser
    - **Fallback**: Shows generic tips if Gemini fails or no data available
    - Loading state with "Loading your personalized insights..." placeholder

14. **Sticky Range Picker** (Today Tab - `app/(tabs)/index.tsx`)
    - Time range picker (7d/14d/30d/90d) becomes sticky on scroll
    - Uses `stickyHeaderIndices={[0]}` on ScrollView
    - Positioned at top below nav bar when scrolling
    - Transparent background blends with app gradient
    - Width aligned with other components (16px horizontal margin)

15. **AI Gradient Button** (Pre Meal Check - `app/log-meal.tsx`)
    - Pre Meal Check button uses AI-style gradient
    - Colors: `#27AFDD` → `#79C581` (blue to green, horizontal)
    - Sparkles icon (✨) for AI appearance
    - `LinearGradient` wrapper with `overflow: 'hidden'`
    - Disabled state with 50% opacity when no meal items

16. **Experiments System** (A/B Testing for Glucose Management)
    - **Database Schema**: 5 tables (`experiment_templates`, `experiment_variants`, `user_experiments`, `user_experiment_events`, `user_experiment_analysis`)
    - **Edge Functions**:
      - `experiments-suggest`: AI-powered personalized experiment recommendations
      - `experiments-evaluate`: Statistical analysis and AI summaries of results
    - **Screens**:
      - Experiments tab in Insights (`app/(tabs)/insights.tsx`): Suggestions and active experiments
      - Experiment Detail (`app/experiment-detail.tsx`): Progress tracking, exposure logging, check-ins, results
      - Experiments List (`app/experiments-list.tsx`): Overview of all experiments (active, completed, archived)
    - **Features**:
      - Personalized suggestions based on user's glucose patterns
      - Structured A/B testing (meal, habit, timing, portion experiments)
      - Hybrid results capture (objective glucose + subjective check-ins)
      - AI-generated summaries and actionable insights
      - Progress tracking with visual indicators
      - Link exposures to post-meal reviews for glucose data
    - **Seeded Templates**: 6 initial experiments (Oatmeal vs Eggs, Rice Portion Swap, Post-Meal Walk, Fiber Preload, Meal Timing, Breakfast Skip)
    - **UI Improvements**: Fixed text wrapping in Experiments tab description for better readability

### 🚧 Pending/Incomplete

1. **Coach Tab**
   - Placeholder screen only
   - No coaching features

### 📝 Notes

- **Figma Designs**: All UI implementations follow Figma designs provided by the client
- **Database Migrations**: SQL files in `supabase/` folder need to be run manually in Supabase dashboard
- **Font Loading**: App waits for Outfit fonts to load before rendering (loading screen shown)

---

## 🚀 How to Continue Building

### Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Development Server**:
   ```bash
   npx expo start
   ```
   Or clear cache if needed:
   ```bash
   npx expo start -c
   ```

3. **Run Database Migrations**:
   - Go to Supabase Dashboard → SQL Editor
   - Run `supabase/setup.sql` (if not already done)
   - Run `supabase/glucose_logs.sql` (if not already done)
   - Run `supabase/activity_logs.sql` (if not already done)
   - Run `supabase/migrations/20241224_fibre_intake_function.sql` (for fibre optimization)
   - Run `supabase/migrations/20241224_add_performance_indexes.sql` (for query performance)
   - Run `supabase/migrations/20241226_experiments.sql` (for Experiments feature)

4. **Build for HealthKit (iOS Only)**:
   ```bash
   # Clean and regenerate native code
   npx expo prebuild --clean --platform ios
   
   # Build and run
   npx expo run:ios
   ```
   **Note**: HealthKit requires a native build. Cannot use Expo Go.

### Adding New Features

#### 1. Creating a New Logging Screen

**Pattern** (based on `log-glucose.tsx` and `log-activity.tsx`):

```typescript
// 1. Create screen file: app/log-[type].tsx
// 2. Add route to app/_layout.tsx: <Stack.Screen name="log-[type]" />
// 3. Create database table SQL: supabase/[type]_logs.sql
// 4. Add types and functions to lib/supabase.ts:
//    - Create[Type]LogInput interface
//    - [Type]Log interface
//    - create[Type]Log() function
//    - get[Type]Logs() function
// 5. Navigate from FAB or other screen: router.push({ pathname: '/log-[type]' })
```

#### 2. Adding a New Database Table

1. Create SQL file: `supabase/[table_name].sql`
2. Include:
   - `CREATE TABLE` with all fields
   - `ENABLE ROW LEVEL SECURITY`
   - Policies for SELECT, INSERT, UPDATE, DELETE
   - Indexes for performance
   - `GRANT` permissions
3. Add TypeScript types to `lib/supabase.ts`
4. Add helper functions (create, get, update, delete)
5. Run SQL in Supabase dashboard

#### 3. Adding a New Tab

1. Create screen: `app/(tabs)/[tab-name].tsx`
2. Wrap with `AnimatedScreen` and `SafeAreaView`
3. Add to `TAB_INDEX_MAP` in `context/TabTransitionContext.tsx`
4. Add `<Tabs.Screen>` in `app/(tabs)/_layout.tsx` with icon and label

#### 4. Creating a New UI Component

1. Create file in `components/ui/` or `components/`
2. Follow existing patterns:
   - Use `Colors` from `@/constants/Colors`
   - Use `fonts` from `@/hooks/useFonts`
   - Dark theme styling (#111111 background)
   - TypeScript interfaces for props
3. Export and use in screens

#### 5. Adding Animations

**For Screen Animations**:
- Wrap screen with `AnimatedScreen` component
- Tab transitions automatically handled by `TabTransitionContext`

**For Component Animations**:
- Use `react-native-reanimated`
- `useSharedValue` for animated values
- `useAnimatedStyle` for animated styles
- `withSpring()` for bouncy animations
- `withTiming()` for smooth, linear animations
- `withSequence()` for chained animations

#### 6. Using Data Fetching Hooks

**Today Screen Data** (`useTodayScreenData`):
```typescript
import { useTodayScreenData } from '@/hooks/useTodayScreenData';

function MyComponent() {
  const { glucoseLogs, activityLogs, fibreSummary, mealReviews, isLoading } = 
    useTodayScreenData('7d');
  
  // All data is batched and fetched in parallel
  // Automatically refetches on screen focus
}
```

**Sleep Data** (`useSleepData`):
```typescript
import { useSleepData } from '@/hooks/useSleepData';

function SleepComponent() {
  const { data, isLoading } = useSleepData('7d');
  
  if (!data?.isAvailable) {
    // HealthKit not available (Android or not properly configured)
    return <Text>Sleep data unavailable</Text>;
  }
  
  if (!data?.isAuthorized) {
    // User hasn't granted HealthKit permissions
    return <Text>Please enable HealthKit permissions</Text>;
  }
  
  return <Text>Avg Sleep: {data.avgHoursPerNight.toFixed(1)}h/night</Text>;
}
```

**Date Range Utilities**:
```typescript
import { getDateRange, getRangeLabel, RangeKey } from '@/lib/utils/dateRanges';

const range: RangeKey = '7d';
const { startDate, endDate } = getDateRange(range);
const label = getRangeLabel(range); // "7 day average"
```

#### 7. Integrating HealthKit

**Setup**:
1. Add HealthKit permissions to `app.json` (see HealthKit Integration section)
2. Install `react-native-health` and `expo-dev-client`
3. Run `npx expo prebuild --clean --platform ios`
4. Build with `npx expo run:ios`

**Usage**:
```typescript
import { initHealthKit, getSleepData, isHealthKitAvailable } from '@/lib/healthkit';

// Check availability
if (isHealthKitAvailable()) {
  // Initialize and request permissions
  const authorized = await initHealthKit();
  
  if (authorized) {
    // Fetch sleep data
    const sleepStats = await getSleepData(startDate, endDate);
    console.log(`Avg sleep: ${sleepStats.avgMinutesPerNight / 60}h`);
  }
}
```

**Error Handling**:
- Always check `isHealthKitAvailable()` before calling HealthKit functions
- Handle authorization failures gracefully
- Provide fallback UI for non-iOS platforms

### Design Guidelines

- **Background Color**: Always use `#111111` for main screens
- **Card Background**: `rgba(63,66,67,0.25)` or `#1b1b1c`
- **Input Background**: `#1b1b1c` with `#313135` border
- **Text**: White (`#FFFFFF`) for primary, gray (`#878787`) for placeholders
- **Buttons**: Green (`#285E2A`) for primary actions
- **Padding**: 16px horizontal on screens, 16-20px in cards
- **Font**: Use Outfit family via `fonts` object from `useFonts`
- **Icons**: Ionicons from `@expo/vector-icons`

### Common Patterns

#### Safe Area Handling
```typescript
import { SafeAreaView } from 'react-native-safe-area-context';

<SafeAreaView edges={['top']} style={styles.safeArea}>
  {/* Content */}
</SafeAreaView>
```

#### Form Input
```typescript
<View style={styles.inputShell}>
  <TextInput
    value={value}
    onChangeText={setValue}
    placeholder="Enter text"
    placeholderTextColor="#878787"
    style={styles.textInput}
  />
</View>
```

#### Dropdown Selection
```typescript
<DropdownMenu
  open={isOpen}
  onOpenChange={setIsOpen}
  trigger={<Pressable onPress={() => setIsOpen(true)}>...</Pressable>}
>
  {options.map(option => (
    <DropdownMenuItem key={option.value} onSelect={() => {...}}>
      <Text>{option.label}</Text>
    </DropdownMenuItem>
  ))}
</DropdownMenu>
```

#### Time Picker
- Reuse the wheel picker pattern from `log-glucose.tsx`
- Use `toParts()` and `fromParts()` helpers
- Display in `Sheet` component

#### Saving Data
```typescript
const handleSave = async () => {
  if (!user) {
    Alert.alert('Error', 'You must be logged in');
    return;
  }
  // Validate inputs...
  setIsSaving(true);
  try {
    const result = await createLog(user.id, data);
    if (result) {
      Alert.alert('Success', 'Saved!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } else {
      Alert.alert('Error', 'Failed to save');
    }
  } catch (error) {
    Alert.alert('Error', 'An error occurred');
  } finally {
    setIsSaving(false);
  }
};
```

### Next Steps Recommendations

1. **Complete Meal Logging Backend**:
   - Create `meals` table
   - Add `createMealLog()` function
   - Integrate with `log-meal.tsx` screen

2. **Implement Log History**:
   - Fetch and display actual logs from database
   - Group by date
   - Show different types (meals, glucose, activities)

3. **Build Insights Tab**:
   - Fetch aggregated data
   - Create charts/visualizations
   - Show trends and patterns

4. **Add Meal Items Search**:
   - Integrate with food database API (e.g., USDA, Nutritionix)
   - Implement search functionality
   - Allow users to select items and calculate macros

5. **Enhance Tips Section**:
   - Make tips dynamic based on user data
   - Personalize recommendations
   - Update based on glucose trends

6. **Coach Tab Features**:
   - Personalized coaching messages
   - Goal tracking
   - Achievement system

### Testing

- Test on both iOS and Android (Expo handles platform differences)
- Test authentication flow (sign up, sign in, onboarding)
- Test data persistence (app restart should maintain session)
- Test navigation (tab switching, modal navigation)
- Test form validations
- Test error handling (network errors, invalid inputs)

### Deployment

1. **Build for Production**:
   ```bash
   npx expo build:ios
   npx expo build:android
   ```
   Or use EAS Build (recommended):
   ```bash
   eas build --platform ios
   eas build --platform android
   ```

2. **Environment Variables**:
   - Supabase keys are currently hardcoded (consider using environment variables in production)

3. **Database Security**:
   - Verify all RLS policies are correct
   - Test that users can only access their own data

---

## 🚀 New Features (December 2025)

### Check Spike Risk Screen (`app/check-spike-risk.tsx`)

**Purpose**: Allows users to type what they plan to eat and get AI-powered spike risk analysis before eating.

**User Flow**:
1. User taps "Planning your next lunch? Tap to check spike risk" card on Home screen
2. Bottom sheet slides up with text input (fade overlay + spring slide animation)
3. User types meal description (e.g., "butter chicken with naan and rice")
4. Tap "Analyze" button → navigates to full check-spike-risk screen
5. Screen shows:
   - Loading animation with mascot
   - Spike risk gauge (percentage + Low/Moderate/High label)
   - Macro summary (carbs, protein, fibre, fat)
   - Drivers affecting spike risk
   - Personalized adjustment tips

**Data Flow**:
1. `parseInputToItems(text)` - Splits input on "and", "with", commas
2. `searchWithOrchestration(item)` - Searches food databases
3. `estimateMatchConfidence()` - Auto-select if ≥80%, else show disambiguation modal
4. `invokePremealAnalyze(userId, mealDraft)` - Calls Edge Function
5. Renders results from API response

**Key Components**:
- `SpikeRiskInputSheet` - Bottom sheet modal in `index.tsx`
- `SpikeRiskGauge` - Circular progress gauge
- `AILoadingScreen` - Loading state with animated dots
- `FoodDisambiguationModal` - Pick correct food when low confidence

---

### Food Search Orchestration (`lib/foodSearch/`)

**Purpose**: Unified food search with caching, normalization, Gemini fallback, and ranking.

**Files**:
- `orchestrator.ts` - Main `searchWithOrchestration()` function
- `normalize.ts` - Query normalization and typo fixes
- `rank.ts` - Result ranking and deduplication
- `cache.ts` - AsyncStorage-based caching with TTL
- `geminiRewrite.ts` - Gemini API for query rewrites

**Flow**:
```
User Query → Normalize → Check Cache → Search FDC/OFF
                                           ↓
                              Results < threshold?
                                    ↓ Yes
                              Gemini Rewrite
                                    ↓
                              Search Alternatives
                                    ↓
                              Rank & Dedupe → Cache → Return
```

**Configuration** (`orchestrator.ts`):
- `MIN_QUERY_LENGTH`: 2
- `MIN_RESULTS_FOR_GOOD_SEARCH`: 8
- `MIN_SCORE_THRESHOLD`: 50
- `MAX_RESULTS`: 50

**Cache TTLs**:
- Search results: 1 hour
- Provider results: 24 hours
- Gemini rewrites: 7 days

---

### Pre-Meal Check (`app/pre-meal-check.tsx`)

**Purpose**: Shows spike risk analysis and personalized tips for a meal before logging.

**Components**:
- `SpikeRiskGauge` - Circular gauge showing risk percentage
- `DynamicGlucoseChart` - SVG-based predicted glucose curve
- `AILoadingScreen` - Loading state with mascot + animated dots

**API Integration**:
- Calls `invokePremealAnalyze()` with meal draft
- Receives: `spike_risk_pct`, `predicted_curve`, `drivers`, `adjustment_tips`

**Tip Selection**:
- Tips are selectable checkboxes
- Shows estimated risk reduction percentage
- Calculates new projected risk when tips are selected

---

### Post-Meal Review (`app/post-meal-review.tsx`)

**Purpose**: Review screen 2 hours after eating to compare predicted vs actual glucose response.

**Features**:
- Side-by-side chart: Predicted (blue) vs Actual (orange) curves
- Peak value comparison
- Status tag: "Steady", "Mild Elevation", "Spike"
- Mood selection: 😊 😐 😔
- Contributor analysis

**Navigation**:
- Triggered by local notification 2 hours post-meal
- Accessed from meal cards in Today section carousel

**Mock Data Support**:
- Mock reviews shown when no real data exists
- Mock IDs (e.g., "mock-1") pass full review data via params to bypass Supabase fetch

---

### Label Scanning (`lib/labelScan.ts`)

**Purpose**: Scan nutrition labels with camera to add custom foods.

**Flow**:
1. User takes photo of nutrition label
2. Image sent to `label-parse` Edge Function
3. Vision AI extracts nutrition data
4. Creates `NormalizedFood` from parsed label

**Functions**:
- `parseLabelFromImage(base64)` - Calls Edge Function
- `mapParsedLabelToFood(parsed)` - Converts to NormalizedFood
- `isValidParsedLabel(parsed)` - Validates minimum data

---

### Meal Logging (`app/log-meal.tsx`, `app/log-meal-items.tsx`)

**Purpose**: Complete meal logging flow with food search, item management, and analysis.

**Features**:
- Food search with debouncing
- Recent foods and favorites tabs
- Add custom items via label scan
- Quantity adjustment per item
- Total macro calculation
- Navigation to pre-meal check

**State Management**:
- `MealItem[]` - Selected items with quantities
- Total macros computed client-side
- Meal draft built for API submission

---

### Today Screen Enhancements (`app/(tabs)/index.tsx`)

**New Components**:

1. **TipCard** - "Planning your next lunch?" CTA
   - Opens `SpikeRiskInputSheet` bottom sheet on tap

2. **SpikeRiskInputSheet** - Bottom sheet modal
   - Fade overlay + spring slide animation
   - Text input with placeholder
   - Green "Analyze" button (#26A861)
   - Navigates to `/check-spike-risk` with `initialText` param

3. **MealCard** - Past meal review cards in carousel
   - Mini SVG chart with predicted/actual curves
   - Peak markers and status badges
   - Tap to open full post-meal review

4. **Past Meals Carousel**
   - Horizontal ScrollView with meal cards
   - Shows mock data when no real reviews exist
   - Paginated indicator dots

---

## 📡 Supabase Edge Functions

### `premeal-analyze`
**Purpose**: AI-powered spike risk prediction

**Input**:
```typescript
{
  user_id: string,
  meal_draft: {
    name: string,
    logged_at: string,
    items: PremealMealItem[]
  }
}
```

**Output**:
```typescript
{
  spike_risk_pct: number,
  predicted_curve: { time: number, value: number }[],
  drivers: { text: string, reason_code: string }[],
  adjustment_tips: {
    title: string,
    detail: string,
    risk_reduction_pct: number,
    action_type: string
  }[]
}
```

### `label-parse`
**Purpose**: Extract nutrition data from label photos

**Input**: `{ image_base64: string, locale?: string, units?: 'metric'|'us' }`

**Output**: `ParsedLabel` with nutrients, serving info, confidence score

---

## 🗄️ Database Tables (Updated)

### New Tables

#### `post_meal_reviews`
Stores meal review data and glucose response comparisons.

```sql
- id (UUID, PRIMARY KEY)
- user_id (UUID, REFERENCES auth.users)
- meal_id (UUID, REFERENCES meals)
- scheduled_for (TIMESTAMP) -- When review notification fires
- status (TEXT) -- 'pending', 'opened', 'completed'
- meal_name (TEXT)
- meal_time (TIMESTAMP)
- predicted_curve (JSONB)
- actual_curve (JSONB)
- predicted_peak (NUMERIC)
- actual_peak (NUMERIC)
- status_tag (TEXT) -- 'steady', 'mild_elevation', 'spike'
- summary (TEXT)
- contributors (JSONB)
- mood (TEXT) -- 'great', 'okay', 'not_great'
```

#### `foods_cache`
Caches food search results from external providers.

```sql
- id (UUID, PRIMARY KEY)
- provider (TEXT) -- 'fdc', 'off'
- external_id (TEXT)
- display_name (TEXT)
- brand (TEXT, nullable)
- nutrients (JSONB)
- serving_info (JSONB)
- cached_at (TIMESTAMP)
- expires_at (TIMESTAMP)
```

#### `premeal_checks`
Stores pre-meal analysis results.

```sql
- id (UUID, PRIMARY KEY)
- user_id (UUID)
- meal_draft (JSONB)
- spike_risk_pct (NUMERIC)
- predicted_curve (JSONB)
- drivers (JSONB)
- tips (JSONB)
- created_at (TIMESTAMP)
```

---

## � Food Search Orchestration

### Overview

The food search system uses a multi-layered orchestrator pattern to provide fast, accurate results while handling typos, synonyms, and edge cases.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Input                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Orchestrator (orchestrator.ts)                  │
│  - Normalize query, fix typos                               │
│  - Check cache (4hr TTL)                                    │
│  - Run parallel searches                                    │
│  - Rank and dedupe results                                  │
└─────────────────────────────────────────────────────────────┘
                              │
           ┌─────────────────┼─────────────────┐
           ▼                  ▼                  ▼
    ┌───────────┐     ┌───────────┐     ┌───────────────┐
    │Main Query │     │ Variants  │     │Gemini Fallback│
    │  (50 max) │     │ (15 each) │     │ (if <5 results)│
    └───────────┘     └───────────┘     └───────────────┘
           │                  │                  │
           └─────────────────┼─────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│           food-search Edge Function (Supabase)               │
│  - Searches FoodData Central (USDA) + Open Food Facts       │
│  - Returns NormalizedFood[] with unified schema             │
└─────────────────────────────────────────────────────────────┘
```

### Files

| File | Purpose |
|------|---------|
| `lib/foodSearch/orchestrator.ts` | Main search coordination |
| `lib/foodSearch/normalize.ts` | Query normalization, typo fixing |
| `lib/foodSearch/cache.ts` | AsyncStorage caching with TTL |
| `lib/foodSearch/rank.ts` | Result ranking and deduplication |
| `lib/foodSearch/geminiRewrite.ts` | Gemini AI query enhancement |
| `supabase/functions/food-search/` | Edge function for API calls |

### Configuration

```typescript
const CONFIG = {
    MIN_QUERY_LENGTH: 2,           // Minimum chars to trigger search
    MIN_RESULTS_FOR_GOOD_SEARCH: 5, // Threshold before Gemini fallback
    MIN_SCORE_THRESHOLD: 50,        // Minimum relevance score
    MAX_RESULTS: 50,                // Maximum results returned
    DEBOUNCE_MS: 250,               // Input debounce delay
};
```

### Performance Optimizations

1. **Parallel Searches**: Main query + variants run with `Promise.allSettled`
2. **250ms Debounce**: Fast response while avoiding excessive API calls
3. **4-Hour Cache**: Repeat searches return instantly from AsyncStorage
4. **Smart Gemini Trigger**: Only calls AI when initial results < 5 items

### Cache TTLs

| Cache Type | TTL |
|------------|-----|
| Search Results | 4 hours |
| Provider Results | 24 hours |
| Gemini Rewrites | 7 days |

### Data Flow

1. User types query → 250ms debounce
2. Check AsyncStorage cache → return if hit
3. Normalize query, fix typos
4. Generate variants (singular/plural, alternative spellings)
5. Run parallel searches via Edge Function
6. If results < 5, call Gemini for query rewrite
7. Rank, dedupe, and cache final results

---

## 📱 Manual Glucose Logging for Reviews

### Overview

Non-CGM users can manually log glucose readings from the Post Meal Review screen. The logged value is compared with the prediction and stored for insights.

### Flow

```
Post Meal Review (no CGM) 
    │
    ├─ "Log Glucose Level Manually" button
    │
    ▼
Log Glucose Screen
    │ (context auto-set to "Post Meal")
    │ (reviewId passed via params)
    │
    ├─ User enters glucose value → Save
    │
    ▼
updatePostMealReviewWithManualGlucose()
    │
    ├─ Fetch predicted_peak from review
    ├─ Call generateReviewInsights(predicted, actual)
    ├─ Update review with:
    │   - actual_peak
    │   - actual_curve (single point)
    │   - summary, status_tag, contributors
    │
    ▼
Navigate back to Post Meal Review
    (with refresh=true param)
    │
    ▼
Reloads and displays comparison
```

### Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `handleLogGlucoseManually()` | `post-meal-review.tsx` | Navigate with params |
| `updatePostMealReviewWithManualGlucose()` | `lib/supabase.ts` | Update review record |
| `generateReviewInsights()` | `lib/supabase.ts` | Create summary/status |

### Status Tag Logic

| Elevation Above Baseline | Status Tag |
|-------------------------|------------|
| < 2.0 mmol/L | `steady` |
| 2.0 - 3.5 mmol/L | `mild_elevation` |
| > 3.5 mmol/L | `spike` |

### Comparison Summary Examples

- "Peaked at 7.2 mmol/L – steady response – as expected"
- "Peaked at 9.5 mmol/L – mild elevation – higher than expected"
- "Peaked at 6.8 mmol/L – steady response – better than expected"

---

## 🎨 UI Consistency Standards

### Header Pattern

All log/review screens follow consistent header styling:

```typescript
header: {
    height: 72,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
}

headerIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 33,
    backgroundColor: 'rgba(63, 66, 67, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
}

headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 1,
}
```

### Title Capitalization

All screen titles use ALL CAPS:
- `LOG ACTIVITY`
- `LOG GLUCOSE`
- `PRE MEAL CHECK`
- `POST MEAL REVIEW`
- `NOTIFICATIONS`

### Background Gradient

All screens use consistent gradient:

```typescript
<LinearGradient
    colors={['#1a1f24', '#181c20', '#111111']}
    locations={[0, 0.3, 1]}
    style={styles.topGlow}
/>

topGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 280,
}
```

### Screens Updated for Consistency

| Screen | File |
|--------|------|
| Pre-Meal Check | `app/pre-meal-check.tsx` |
| Post-Meal Review | `app/post-meal-review.tsx` |
| Notifications | `app/notifications-list.tsx` |
| Log Activity | `app/log-activity.tsx` |
| Log Glucose | `app/log-glucose.tsx` |

---

## �📚 Key Files Reference

### Critical Files to Understand

1. **`app/_layout.tsx`**: Root navigation structure
2. **`context/AuthContext.tsx`**: Authentication state management
3. **`lib/supabase.ts`**: All database operations
4. **`app/(tabs)/_layout.tsx`**: Tab navigator and animations
5. **`context/TabTransitionContext.tsx`**: Tab transition logic
6. **`components/animated-screen.tsx`**: Screen animation wrapper

### New Feature Files

- **`app/check-spike-risk.tsx`**: Check spike risk before eating
- **`app/pre-meal-check.tsx`**: Pre-meal analysis screen
- **`app/post-meal-review.tsx`**: Post-meal review screen
- **`app/experiment-detail.tsx`**: Detailed experiment view with progress tracking and results
- **`app/experiments-list.tsx`**: Overview of all user experiments (active, completed, archived)
- **`lib/foodSearch/orchestrator.ts`**: Unified food search
- **`lib/labelScan.ts`**: Nutrition label scanning

### Component Files

- `components/animated-fab.tsx`: FAB implementation
- `components/ui/dropdown-menu.tsx`: Dropdown component
- `components/ui/sheet.tsx`: Bottom sheet modal
- `app/log-glucose.tsx`: Reference implementation for logging screens
- `app/log-activity.tsx`: Another reference implementation

---

## 🐛 Known Issues / Considerations

1. ~~**Meal Logging Backend**: Not yet implemented (UI only)~~ ✅ Implemented
2. ~~**Hardcoded Tips**: Tips section uses static data~~ ✅ Dynamic tips from API
3. **Supabase Keys**: Currently in source code (should use env vars in production)
4. **Error Handling**: Basic error handling, could be more robust
5. **Loading States**: Some screens may need loading indicators when fetching data
6. **Offline Support**: No offline data caching implemented
7. **CGM Integration**: Dexcom connection UI exists but data fetching not fully implemented

---

## 📞 Support & Resources

- **Expo Docs**: https://docs.expo.dev
- **Expo Router Docs**: https://docs.expo.dev/router/introduction/
- **React Native Reanimated**: https://docs.swmansion.com/react-native-reanimated/
- **Supabase Docs**: https://supabase.com/docs
---

## 🧠 User Calibration System (Online Learning)

### Overview

The calibration system maintains per-user glycaemic parameters that update incrementally after each completed post-meal review. This creates personalized predictions that improve over time.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Prediction Flow                               │
├─────────────────────────────────────────────────────────────────┤
│  Population Defaults → user_calibration → 14-day drift          │
│                            ↓                                     │
│                     similar_meals → context signals              │
│                            ↓                                     │
│                    Final Prediction                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Learning Flow                                 │
├─────────────────────────────────────────────────────────────────┤
│  Post-meal review completed → calibration-update Edge Function   │
│                            ↓                                     │
│  Extract metrics (peak, time, baseline) → Fetch context          │
│                            ↓                                     │
│  EMA update → clamp → store in user_calibration                 │
└─────────────────────────────────────────────────────────────────┘
```

### Calibration Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `baseline_glucose` | [4.0, 9.0] | 5.5 | Typical pre-meal glucose (mmol/L) |
| `carb_sensitivity` | [0.1, 1.2] | 0.4 | mmol/L rise per 10g net carbs |
| `avg_peak_time_min` | [25, 120] | 45 | Minutes to glucose peak |
| `exercise_effect` | [0.0, 0.35] | 0.0 | Peak reduction per activity_score unit |
| `sleep_penalty` | [0.0, 0.45] | 0.0 | Peak increase per sleep_deficit unit |
| `n_observations` | 0+ | 0 | Total completed reviews |
| `n_quality_observations` | 0+ | 0 | High-quality reviews (≥4 data points) |
| `confidence` | [0, 1] | 0 | `1 - exp(-n_quality / 20)` |

### EMA Update Math

**Confidence Formula**:
```
confidence = 1 - exp(-n_quality_observations / 20)
```
- ~0.63 at 20 observations
- ~0.86 at 40 observations
- Approaches 1.0 asymptotically

**Adaptive Learning Rate**:
```
α_base = 0.12 (high quality) or 0.06 (low quality)
α = clamp(α_base × (1 - 0.7 × confidence), 0.02, 0.12)
```
- Starts ~12%, drops to ~3.6% as confidence grows
- Allows fast initial learning, slow drift correction later

**Parameter Updates**:
```typescript
baseline_new = (1 - α) × baseline_old + α × baseline_obs
sensitivity_new = (1 - α) × sensitivity_old + α × sensitivity_obs
exercise_new = (1 - α_half) × exercise_old + α_half × implied_reduction
sleep_new = (1 - α_half) × sleep_old + α_half × implied_increase
```

### Context Scores

**activity_score** (0–1.5):
- Based on weighted activity minutes in [-2h, +2h] around meal
- `activity_score = clamp(weighted_minutes / 30, 0, 1.5)`
- Weights: light=1, moderate=2, intense=3

**sleep_deficit** (0–1.5):
- Based on previous night's sleep hours
- `sleep_deficit = clamp((7 - hours) / 3, 0, 1.5)`
- 7h+ = 0, 4h = 1.0, <4h = 1.5

### Prediction Modifiers

In `premeal-analyze`:
```typescript
predicted_peak_delta = carbs10 × carb_sensitivity × time_multiplier
peak_with_sleep = predicted_peak_delta × (1 + sleep_penalty × sleep_deficit)
peak_with_exercise = peak_with_sleep × max(0.5, 1 - exercise_effect × activity_score)
```

---

## 🧪 Experiments System (A/B Testing for Glucose Management)

### Overview

The Experiments system enables users to run structured A/B tests to discover what works best for their glucose management. Users can test different meal options, habits, timing, and portion sizes, with the system automatically comparing outcomes and providing personalized insights.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Experiment Flow                               │
├─────────────────────────────────────────────────────────────────┤
│  1. User views suggestions → experiments-suggest Edge Function  │
│  2. User starts experiment → Creates user_experiments entry      │
│  3. User logs exposures → user_experiment_events table           │
│  4. User logs check-ins → Subjective feedback                    │
│  5. System links to post-meal reviews → Glucose data            │
│  6. User views results → experiments-evaluate Edge Function     │
│  7. AI generates summary → Personalized insights                 │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema

#### `experiment_templates` Table

Admin-seeded catalog of available experiments.

```sql
CREATE TABLE experiment_templates (
    id UUID PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,           -- e.g., 'oatmeal-vs-eggs'
    title TEXT NOT NULL,                 -- e.g., 'Oatmeal vs Eggs'
    subtitle TEXT,                       -- e.g., 'Breakfast Spike Test'
    description TEXT,
    category TEXT NOT NULL,              -- 'meal', 'habit', 'timing', 'portion'
    protocol JSONB NOT NULL,            -- Duration, exposures, check-in questions
    eligibility_rules JSONB,            -- Optional constraints
    icon TEXT DEFAULT '🧪',             -- Emoji for UI
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

**Protocol Structure**:
```json
{
  "duration_days": 14,
  "exposures_per_variant": 6,
  "alternating": true,
  "meal_type": "breakfast",
  "checkin_questions": ["How was your energy?", "How hungry were you?"]
}
```

**Eligibility Rules**:
```json
{
  "requires_cgm": false,
  "requires_meal_logging": true,
  "min_meals_logged": 10
}
```

#### `experiment_variants` Table

Defines the A/B arms for each experiment template.

```sql
CREATE TABLE experiment_variants (
    id UUID PRIMARY KEY,
    template_id UUID REFERENCES experiment_templates(id),
    key TEXT NOT NULL,                   -- 'A', 'B', 'control', 'treatment'
    name TEXT NOT NULL,                  -- e.g., 'Oatmeal', 'Eggs'
    description TEXT,
    parameters JSONB NOT NULL,          -- Variant-specific config
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ,
    UNIQUE(template_id, key)
);
```

**Parameters Example**:
```json
{
  "food": "oatmeal",
  "portion_pct": 100,
  "fiber_preload": false
}
```

#### `user_experiments` Table

Tracks a user's run of an experiment.

```sql
CREATE TABLE user_experiments (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    template_id UUID REFERENCES experiment_templates(id),
    status TEXT NOT NULL,                -- 'draft', 'active', 'completed', 'archived'
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,                  -- Planned end date
    completed_at TIMESTAMPTZ,            -- Actual completion
    plan JSONB DEFAULT '{}',             -- User customizations
    primary_metric TEXT DEFAULT 'peak_delta',
    metric_config JSONB DEFAULT '{}',
    personalization JSONB DEFAULT '{}',  -- Why recommended, predicted impact
    exposures_logged INTEGER DEFAULT 0,
    checkins_logged INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

#### `user_experiment_events` Table

Logs all events during an experiment (exposures, check-ins, notes).

```sql
CREATE TABLE user_experiment_events (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    user_experiment_id UUID REFERENCES user_experiments(id),
    occurred_at TIMESTAMPTZ NOT NULL,
    type TEXT NOT NULL,                  -- 'exposure', 'checkin', 'note', 'link_meal', 'link_activity'
    payload JSONB NOT NULL,              -- Variant-specific data
    created_at TIMESTAMPTZ
);
```

**Event Payload Examples**:

**Exposure**:
```json
{
  "variant_id": "uuid",
  "variant_key": "A",
  "meal_id": "uuid",                    // Optional: link to meal
  "notes": "Ate oatmeal at 8am"
}
```

**Check-in**:
```json
{
  "variant_id": "uuid",
  "variant_key": "A",
  "energy": 4,                          // 1-5 scale
  "hunger": 2,                          // 1-5 scale
  "cravings": 3,                        // 1-5 scale
  "notes": "Felt satisfied"
}
```

#### `user_experiment_analysis` Table

Stores computed analysis results for experiments.

```sql
CREATE TABLE user_experiment_analysis (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    user_experiment_id UUID REFERENCES user_experiments(id),
    computed_at TIMESTAMPTZ DEFAULT now(),
    metrics JSONB NOT NULL,              -- Per-variant metrics
    comparison JSONB NOT NULL,           -- Winner, delta, confidence
    summary TEXT,                        -- AI-generated explanation
    suggestions TEXT[],                   -- Actionable insights
    created_at TIMESTAMPTZ
);
```

### Experiment Types

#### 1. Meal Experiments
Compare different food options (e.g., oatmeal vs eggs, white rice vs brown rice).

**Example**: "Oatmeal vs Eggs"
- Variant A: Oatmeal breakfast
- Variant B: Eggs breakfast
- Protocol: 6 exposures per variant, alternating days

#### 2. Habit Experiments
Test behavioral changes (e.g., post-meal walk, fiber preload).

**Example**: "Post-Meal Walk (15-min)"
- Variant A: Walk 15 mins after meal
- Variant B: No walk after meal
- Protocol: 4 exposures per variant

#### 3. Timing Experiments
Compare meal timing (e.g., early vs late dinner).

**Example**: "Meal Timing (Early vs Late Dinner)"
- Variant A: Eat dinner before 7 PM
- Variant B: Eat dinner after 8 PM
- Protocol: 6 exposures per variant

#### 4. Portion Experiments
Test portion size effects (e.g., half vs full plate).

**Example**: "Rice Portion Swap (Half vs Full Plate)"
- Variant A: Half portion of rice
- Variant B: Full portion of rice
- Protocol: 5 exposures per variant

### User Flow

#### Starting an Experiment

1. **View Suggestions** (`app/(tabs)/insights.tsx` - Experiments tab):
   - User sees personalized suggestions from `experiments-suggest` Edge Function
   - Each suggestion shows title, description, predicted impact, and AI-generated reasons

2. **Start Experiment**:
   - User taps "Start Experiment" button
   - Calls `startUserExperiment(userId, templateId, planOverrides)`
   - Creates `user_experiments` entry with status 'active'
   - Navigates to `/experiment-detail?id={experimentId}`

#### Logging Exposures

1. **Log Exposure** (`app/experiment-detail.tsx`):
   - User selects variant (A or B)
   - Optionally links to a meal via `meal_id`
   - Adds notes
   - Calls `logExperimentEvent()` with type 'exposure'
   - Updates `exposures_logged` counter

2. **Link to Post-Meal Review**:
   - If exposure linked to meal, system can fetch glucose data from `post_meal_reviews`
   - Links actual glucose outcomes to experiment variant

#### Logging Check-ins

1. **Check-in Form** (`app/experiment-detail.tsx`):
   - User rates subjective metrics:
     - Energy (1-5 scale)
     - Hunger (1-5 scale)
     - Cravings (1-5 scale)
   - Adds optional notes
   - Calls `logExperimentEvent()` with type 'checkin'
   - Updates `checkins_logged` counter

#### Viewing Results

1. **Analysis** (`app/experiment-detail.tsx`):
   - User taps "View Results" or system auto-analyzes when enough exposures logged
   - Calls `experiments-evaluate` Edge Function
   - Displays:
     - Per-variant metrics (peak delta, time to peak, check-in scores)
     - Comparison (winner, delta, confidence)
     - AI-generated summary
     - Actionable suggestions

2. **Progress Tracking**:
   - Visual progress bar showing exposures logged vs required
   - Variant exposure counts
   - Recent activity feed

### Screens

#### 1. Experiments Tab (`app/(tabs)/insights.tsx`)

**Sections**:
- Header: "Find What Works For Your Glucose" with description
- Active Experiments: Cards showing progress
- Suggested For You: Personalized experiment suggestions

**Key Functions**:
- `fetchExperimentsData()`: Fetches suggested and active experiments
- `handleStartExperiment()`: Creates new experiment and navigates

#### 2. Experiment Detail Screen (`app/experiment-detail.tsx`)

**Features**:
- Experiment header (title, status, progress)
- Variant exposure counts with progress bars
- "Log Exposure" button (opens modal to select variant)
- "Check-in" button (opens form for subjective feedback)
- Results section (when available):
  - Per-variant metrics table
  - Comparison summary
  - AI-generated insights
- Recent activity feed

**Modals**:
- Exposure logging modal: Select variant, link meal, add notes
- Check-in modal: Rate energy/hunger/cravings, add notes

#### 3. Experiments List Screen (`app/experiments-list.tsx`)

**Features**:
- Tabbed filtering: Active, Completed, All
- Experiment cards with:
  - Status badge (IN PROGRESS, COMPLETED)
  - Progress percentage
  - Last updated date
- "Explore" section: Available templates user hasn't tried
- Tap card to navigate to detail screen

### API Functions (`lib/supabase.ts`)

#### Template Functions

```typescript
// Get all active experiment templates
getExperimentTemplates(): Promise<ExperimentTemplate[]>

// Get variants for a template
getExperimentVariants(templateId: string): Promise<ExperimentVariant[]>
```

#### User Experiment Functions

```typescript
// Get personalized suggestions
getSuggestedExperiments(userId: string): Promise<SuggestedExperiment[]>

// Start a new experiment
startUserExperiment(
  userId: string,
  templateId: string,
  planOverrides?: Record<string, any>
): Promise<UserExperiment | null>

// Update experiment status
updateUserExperimentStatus(
  experimentId: string,
  status: ExperimentStatus
): Promise<boolean>

// Get user's experiments
getUserExperiments(
  userId: string,
  status?: ExperimentStatus | ExperimentStatus[]
): Promise<UserExperiment[]>

// Get single experiment
getUserExperiment(experimentId: string): Promise<UserExperiment | null>
```

#### Event Functions

```typescript
// Log an experiment event
logExperimentEvent(
  userId: string,
  userExperimentId: string,
  type: ExperimentEventType,
  payload: Record<string, any>
): Promise<UserExperimentEvent | null>

// Get events for an experiment
getExperimentEvents(
  userExperimentId: string,
  type?: ExperimentEventType
): Promise<UserExperimentEvent[]>
```

#### Analysis Functions

```typescript
// Get experiment analysis (calls Edge Function)
getExperimentAnalysis(
  userExperimentId: string
): Promise<{
  metrics: Record<string, VariantMetrics>,
  comparison: ComparisonResult,
  summary: string | null,
  suggestions: string[]
} | null>

// Get latest analysis snapshot
getLatestExperimentAnalysis(
  userExperimentId: string
): Promise<UserExperimentAnalysis | null>
```

### Seeded Templates

The migration includes 6 initial experiment templates:

1. **Oatmeal vs Eggs** (meal) - Compare carb-heavy vs protein-heavy breakfast
2. **Rice Portion Swap** (portion) - Test half vs full portion
3. **Post-Meal Walk** (habit) - 15-minute walk after meals
4. **Fiber Preload** (habit) - Vegetables first before main meal
5. **Meal Timing** (timing) - Early vs late dinner
6. **Breakfast Skip** (habit) - Intermittent fasting test

### Personalization Features

1. **Smart Suggestions**:
   - Analyzes user's glucose patterns
   - Identifies frequent spike contexts
   - Recommends experiments addressing user's specific needs

2. **Customizable Plans**:
   - Users can adjust protocol parameters (exposures, duration)
   - System adapts to user's schedule and preferences

3. **Hybrid Results**:
   - Combines objective glucose data (from post-meal reviews)
   - With subjective check-ins (energy, hunger, cravings)
   - Provides comprehensive insights

4. **AI Summaries**:
   - Gemini generates personalized explanations
   - Explains which variant worked better and why
   - Provides actionable next steps

### RLS Policies

All experiment tables have Row Level Security enabled:
- Users can only view/update their own experiments
- Templates are publicly readable (admin-seeded)
- Events are user-scoped
- Analysis is user-scoped

---

## 🔌 All Supabase Edge Functions

### Complete Function List

| Function | Purpose |
|----------|---------|
| `premeal-analyze` | AI spike risk prediction with personalization |
| `calibration-update` | EMA parameter updates after review completion |
| `personalized-tips` | Generate AI tips for Log screen |
| `experiments-suggest` | Personalized experiment recommendations based on user patterns |
| `experiments-evaluate` | Evaluate experiment results and generate AI summaries |
| `weekly-meal-comparison` | Generate AI drivers for meal comparison insights |
| `food-search` | Dual-provider food database search (USDA + OFF) |
| `food-details` | Get detailed nutrition for a specific food |
| `food-barcode` | Lookup food by UPC/EAN barcode |
| `food-query-rewrite` | Gemini AI query correction |
| `label-parse` | Extract nutrition from label photos |
| `dexcom-exchange-code` | Exchange OAuth code for tokens |
| `dexcom-refresh-token` | Refresh expired Dexcom tokens |
| `dexcom-sync-egvs` | Sync glucose readings from Dexcom |
| `dexcom-status` | Check Dexcom connection status |
| `dexcom-disconnect` | Revoke Dexcom connection |

### `calibration-update` (NEW)

**Purpose**: Updates user calibration after post-meal review completion.

**Input**:
```typescript
{ user_id: string, review_id: string }
```

**Output**:
```typescript
{
  success: boolean,
  metrics: {
    baseline_glucose: number,
    peak_delta: number,
    time_to_peak_min: number | null,
    auc_0_180: number | null,
    is_quality: boolean
  },
  calibration: UserCalibration,
  context: {
    activity_score: number,
    sleep_deficit: number,
    sleep_hours: number | null
  }
}
```

**Functions**:
- `extractMetricsFromCurve()` - Calculate baseline, peak, delta, AUC
- `fetchContextFeatures()` - Get activity and sleep context
- `updateCalibration()` - Apply EMA updates with clamping

### `premeal-analyze` (Enhanced)

**New Features**:
- Fetches `user_calibration` for persistent parameters
- Blends with 14-day rolling profile using drift weight
- Applies `exercise_effect` and `sleep_penalty` modifiers
- Returns calibration info in debug output

**Enhanced Output**:
```typescript
{
  spike_risk_pct: number,
  predicted_curve: CurvePoint[],
  drivers: Driver[],
  adjustment_tips: AdjustmentTip[],
  debug: {
    // ... existing fields ...
    calibration: {
      confidence: number,
      n_observations: number,
      carb_sensitivity: number,
      exercise_effect: number,
      sleep_penalty: number,
      driftWeight: number
    },
    similar_meals: { k, avg_peak_delta, spike_rate } | null,
    context: { activity_minutes, recent_avg_glucose },
    risk_breakdown: {
      base_risk: number,
      similar_meal_adjustment: number,
      context_adjustment: number,
      final_risk: number
    }
  }
}
```

### Dexcom Integration Functions

**OAuth Flow**:
1. User taps "Connect Dexcom" → Opens OAuth URL in browser
2. Dexcom redirects back with auth code
3. `dexcom-exchange-code` exchanges code for access/refresh tokens
4. Tokens stored in `dexcom_connections` table

**Data Sync**:
- `dexcom-sync-egvs` fetches EGV (Estimated Glucose Value) data
- Stores in `glucose_logs` with `source: 'dexcom'`
- Called periodically or on app foreground

---

## 🗄️ Database Tables (Complete)

### Core Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profile and onboarding data |
| `glucose_logs` | Glucose readings (manual + CGM) |
| `activity_logs` | Exercise/physical activity logs |
| `meals` | Meal entries with photo and macros |
| `meal_items` | Individual food items in meals |
| `post_meal_reviews` | Prediction vs actual comparisons |
| `premeal_checks` | Cached pre-meal analysis results |

### Personalization Tables

| Table | Purpose |
|-------|---------|
| `user_calibration` | Persistent EMA-updated parameters |
| `daily_context` | Daily sleep/wellness data |
| `favorite_foods` | User's favorited foods |
| `recent_foods` | Recently used foods |

### Experiments Tables

| Table | Purpose |
|-------|---------|
| `experiment_templates` | Admin-seeded catalog of available experiments |
| `experiment_variants` | A/B arms for each experiment template |
| `user_experiments` | User's experiment runs with status and progress |
| `user_experiment_events` | Logged exposures, check-ins, and notes |
| `user_experiment_analysis` | Computed analysis results and AI summaries |

### `user_calibration` (Schema)

```sql
CREATE TABLE user_calibration (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  baseline_glucose NUMERIC DEFAULT 5.5,
  carb_sensitivity NUMERIC DEFAULT 0.4,
  avg_peak_time_min INTEGER DEFAULT 45,
  exercise_effect NUMERIC DEFAULT 0.0,
  sleep_penalty NUMERIC DEFAULT 0.0,
  n_observations INTEGER DEFAULT 0,
  n_quality_observations INTEGER DEFAULT 0,
  confidence NUMERIC DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### `daily_context` (Schema)

```sql
CREATE TABLE daily_context (
  user_id UUID REFERENCES auth.users(id),
  date DATE NOT NULL,
  sleep_hours NUMERIC,
  sleep_quality TEXT, -- 'poor'|'fair'|'good'|'excellent'
  steps INTEGER,
  active_minutes INTEGER,
  resting_hr NUMERIC,
  hrv_ms NUMERIC,
  stress_level INTEGER, -- 1-5
  PRIMARY KEY (user_id, date)
);
```

### `post_meal_reviews` (Enhanced)

```sql
-- New columns for calibration
baseline_glucose NUMERIC,
peak_delta NUMERIC,
time_to_peak_min INTEGER,
net_carbs_g NUMERIC,
auc_0_180 NUMERIC,
meal_tokens TEXT[]  -- For similar meal matching
```

---

## 🍽️ Similar Meal Memory

### Overview

The system learns from similar past meals by matching meal tokens and blending historical outcomes into predictions.

### Tokenization

```typescript
function buildMealTokens(mealName: string, items: string[]): string[] {
  // Normalize, remove stopwords, dedupe
  // "Butter Chicken with Naan" → ["butter", "chicken", "naan"]
}
```

### Similarity Matching

**Jaccard Similarity**:
```
similarity = |A ∩ B| / |A ∪ B|
```

**Scoring**:
```
score = jaccard_similarity × (1 + 0.3 × log(token_count))
```

### Blending

When similar meals found (k ≥ 1):
```typescript
similar_weight = clamp(k × 0.15, 0, 0.5)  // Max 50% weight
blended_risk = (1 - w) × baseline + w × similar_avg
blended_peak = (1 - w) × predicted + w × similar_peak
```

---

## 📡 Required Environment Secrets

Set in Supabase Dashboard → Edge Functions → Secrets:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API (primary AI) |
| `OPENAI_API_KEY` | Fallback | OpenAI API (fallback AI) |
| `SUPABASE_URL` | Auto | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Service role key |
| `DEXCOM_CLIENT_ID` | For CGM | Dexcom API client ID |
| `DEXCOM_CLIENT_SECRET` | For CGM | Dexcom API client secret |
| `FDC_API_KEY` | For food | USDA FoodData Central API key |

---

## 🚀 Deployment Commands

```bash
# Deploy all Edge Functions
supabase functions deploy

# Deploy specific function
supabase functions deploy premeal-analyze
supabase functions deploy calibration-update
supabase functions deploy experiments-suggest
supabase functions deploy experiments-evaluate

# Push database migrations
supabase db push

# Set secrets
supabase secrets set GEMINI_API_KEY=your_key_here

# View function logs
supabase functions logs premeal-analyze --follow
```

---

## 📝 Integration Checklist

### Calling `calibration-update` After Review

Add to `lib/supabase.ts`:
```typescript
export async function triggerCalibrationUpdate(
  userId: string, 
  reviewId: string
): Promise<boolean> {
  const { error } = await supabase.functions.invoke('calibration-update', {
    body: { user_id: userId, review_id: reviewId },
  });
  return !error;
}
```

Call after `updatePostMealReviewWithManualGlucose()` completes:
```typescript
triggerCalibrationUpdate(user.id, reviewId).catch(console.warn);
```

---

**Last Updated**: December 24, 2024
**Version**: 1.4.0 (Added HealthKit Integration & Performance Optimizations)

