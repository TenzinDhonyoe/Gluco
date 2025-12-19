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
12. [Current State](#current-state)
13. [How to Continue Building](#how-to-continue-building)

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
│   └── (tabs)/                  # Tab navigator group
│       ├── _layout.tsx          # Tab navigator configuration
│       ├── index.tsx            # Today/Home tab
│       ├── log.tsx              # Log history tab
│       ├── insights.tsx         # Insights tab (placeholder)
│       └── coach.tsx            # Coach tab (placeholder)
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
│   └── use-theme-color.ts       # Theme color utilities
│
├── lib/
│   └── supabase.ts              # Supabase client & database helpers
│
├── supabase/                     # Database migration files
│   ├── setup.sql                # User profiles table
│   ├── glucose_logs.sql         # Glucose logs table
│   └── activity_logs.sql        # Activity logs table
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
  - Queries meals + meal_items within date range
  - Sums `fibre_g × quantity` for all items
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
- **Time Period Filter**: Segmented control for filtering data (Today, Week, Month)

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

#### Experiments Tab
- Placeholder for future A/B testing insights

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
supabase functions deploy personalized-tips

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
   - Time period filtering

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

8. **Insights Tab (Weekly Report & Trends)**
   - Tabbed interface with animated segmented control
   - Time of Day comparison chart with zone bands
   - Weekday vs Weekend comparison meter
   - Behavioral impacts section
   - Best/Worst meal comparison cards
   - Dynamic PieChart SVG component
   - Peak Comparison bars
   - Gluco Suggestion Impact comparison

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
    - Updates when time range changes (24h/7d/30d)
    - Fetches data via `getFibreIntakeSummary()` from meal_items
    - Title stays green (#4A9B16), status pill shows threshold color

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

### 🚧 Pending/Incomplete

1. **Insights Tab - Data Integration**
   - Currently uses placeholder data for Trends and some Weekly Report sections
   - Peak comparison needs real prediction model
   - Suggestion impact needs actual user habit tracking

2. **Coach Tab**
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

## 📚 Key Files Reference

### Critical Files to Understand

1. **`app/_layout.tsx`**: Root navigation structure
2. **`context/AuthContext.tsx`**: Authentication state management
3. **`lib/supabase.ts`**: All database operations
4. **`app/(tabs)/_layout.tsx`**: Tab navigator and animations
5. **`context/TabTransitionContext.tsx`**: Tab transition logic
6. **`components/animated-screen.tsx`**: Screen animation wrapper

### Component Files

- `components/animated-fab.tsx`: FAB implementation
- `components/ui/dropdown-menu.tsx`: Dropdown component
- `components/ui/sheet.tsx`: Bottom sheet modal
- `app/log-glucose.tsx`: Reference implementation for logging screens
- `app/log-activity.tsx`: Another reference implementation

---

## 🐛 Known Issues / Considerations

1. **Meal Logging Backend**: Not yet implemented (UI only)
2. **Hardcoded Tips**: Tips section uses static data
3. **Supabase Keys**: Currently in source code (should use env vars in production)
4. **Error Handling**: Basic error handling, could be more robust
5. **Loading States**: Some screens may need loading indicators when fetching data
6. **Offline Support**: No offline data caching implemented

---

## 📞 Support & Resources

- **Expo Docs**: https://docs.expo.dev
- **Expo Router Docs**: https://docs.expo.dev/router/introduction/
- **React Native Reanimated**: https://docs.swmansion.com/react-native-reanimated/
- **Supabase Docs**: https://supabase.com/docs
- **Figma Design**: https://www.figma.com/design/sgwuK9QGOKALtfLRujPsfL/GlucoApp

---

**Last Updated**: December 2025
**Version**: 1.0.0
