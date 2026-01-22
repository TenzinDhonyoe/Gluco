# Actions and Care Pathways

## Purpose
Provide targeted 24-72 hour interventions (Actions) and structured 7-day wellness plans (Care Pathways) to help users improve specific health metrics through actionable, time-bound goals.

## Entry Point
- `app/(tabs)/insights.tsx` → Actions tab

---

## Actions (Action Loop)

Actions are short-term, targeted interventions designed to create measurable improvements in specific health metrics.

### Action Types

| Action Type | Description | Auto-Detection |
|-------------|-------------|----------------|
| `log_meal` | Log a meal during the action window | Meal logged in window |
| `meal_checkin` | Complete a post-meal check-in | Check-in created in window |
| `meal_pairing` | Pair foods strategically | Meal logged in window |
| `fiber_boost` | Increase fiber intake | Meal logged in window |
| `meal_timing` | Optimize meal timing | Meal logged in window |
| `log_activity` | Log physical activity | Activity logged in window |
| `post_meal_walk` | Walk after a meal | Activity logged in window |
| `steps_boost` | Increase daily steps | Activity logged in window |
| `light_activity` | Add light movement | Activity logged in window |
| `log_glucose` | Log glucose reading | Glucose logged in window |
| `sleep_logging` | Log sleep data | Sleep hours recorded |
| `sleep_window` | Maintain sleep schedule | Sleep hours recorded |
| `sleep_consistency` | Improve sleep regularity | Sleep hours recorded |

### Action Lifecycle

```
┌─────────────────┐
│    Template     │
│   (suggested)   │
└────────┬────────┘
         │ Start Action
         ▼
┌─────────────────┐
│     Active      │──── Window: 24-72 hours
│   (tracking)    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌─────────┐
│Completed│ │ Expired │
│(success)│ │(timeout)│
└─────────┘ └─────────┘
```

### Auto-Completion Detection

Actions are automatically marked complete when the system detects the user has performed the required action:

```typescript
// Example: Log meal action
if (action.action_type === 'log_meal') {
    return meals.some(meal =>
        isWithinWindow(meal.logged_at, windowStart, windowEnd)
    );
}
```

The `detectActionCompletion` function checks each action type against the relevant data source (meals, activity logs, glucose logs, daily context).

### Metric Tracking

Actions track baseline and outcome metrics to measure improvement:

**Metrics Tracked:**
- `meal_count` - Number of meals logged
- `checkin_count` - Number of meal check-ins
- `time_in_range` - Glucose time in target range (%)
- `glucose_avg` - Average glucose level
- `glucose_logs_count` - Number of glucose readings
- `steps` - Average daily steps
- `sleep_hours` - Average sleep hours

**Baseline Window:** 7 days before action start
**Outcome Window:** Action window (24-72 hours)

### Action Card Display

Each action card shows:
- **Title** and description
- **Time remaining** countdown
- **Baseline metric** value (7-day average)
- **Outcome metric** value (during action window)
- **Delta** showing improvement (green/red based on direction)
- **Completion source** (auto/manual)

### Data Model

```typescript
interface UserAction {
    id: string;
    user_id: string;
    action_type: string;
    title: string;
    description: string;
    window_start: string;  // ISO timestamp
    window_end: string;    // ISO timestamp
    status: 'active' | 'completed' | 'expired';
    completed_at?: string;
    completion_source?: 'auto' | 'manual';
    baseline_metric?: {
        key: string;
        value: number;
    };
    outcome_metric?: {
        key: string;
        value: number;
    };
    action_params?: {
        metricKey?: string;
        [key: string]: any;
    };
}
```

---

## Care Pathways

Care Pathways are structured 7-day wellness programs with step-by-step guidance.

### Structure

```
┌─────────────────────────────────────┐
│         Pathway Template            │
│  (e.g., "Glucose Balance Week")     │
├─────────────────────────────────────┤
│ Day 1: Focus on meal logging        │
│ Day 2: Add post-meal walks          │
│ Day 3: Practice portion awareness   │
│ Day 4: Track glucose patterns       │
│ Day 5: Experiment with fiber        │
│ Day 6: Review and adjust            │
│ Day 7: Celebrate progress           │
└─────────────────────────────────────┘
```

### Pathway Flow

1. **Browse Templates** - User selects from available pathways
2. **Start Pathway** - Creates `UserCarePathway` record
3. **Daily Progress** - Track completion of daily goals
4. **Step Updates** - Mark steps complete as user progresses
5. **Completion** - Pathway ends after 7 days

### Data Model

```typescript
interface CarePathwayTemplate {
    id: string;
    name: string;
    description: string;
    duration_days: number;
    steps: PathwayStep[];
}

interface UserCarePathway {
    id: string;
    user_id: string;
    template_id: string;
    started_at: string;
    current_step: number;
    status: 'active' | 'completed' | 'abandoned';
    completed_steps: number[];
}
```

---

## UI Components

### Actions Tab Layout

```
┌─────────────────────────────────────┐
│         ACTION LOOP                 │
│  Short-term actions for quick wins  │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐│
│  │ Active Action Card              ││
│  │ - Title + countdown             ││
│  │ - Baseline: X → Outcome: Y      ││
│  │ - Delta indicator               ││
│  └─────────────────────────────────┘│
├─────────────────────────────────────┤
│      RECOMMENDED NEXT STEPS         │
│  AI-suggested actions based on data │
├─────────────────────────────────────┤
│        RECENT OUTCOMES              │
│  Completed/expired actions + results│
├─────────────────────────────────────┤
│        CARE PATHWAY                 │
│  7-day structured program progress  │
└─────────────────────────────────────┘
```

### Expandable Cards

Action cards can be expanded to show additional details:
- Full description
- Metric comparison chart
- Completion history
- Related actions

---

## API Functions

| Function | Purpose |
|----------|---------|
| `createUserAction()` | Start a new action |
| `updateUserAction()` | Update action status/metrics |
| `getUserActionsByStatus()` | Fetch actions by status |
| `startCarePathway()` | Begin a care pathway |
| `updateCarePathway()` | Update pathway progress |
| `getActiveCarePathway()` | Get user's active pathway |
| `getCarePathwayTemplates()` | List available templates |

---

## Background Sync

The Actions tab performs automatic synchronization on focus:

1. **Fetch Actions** - Load active, completed, and expired actions
2. **Detect Completion** - Check if active actions should auto-complete
3. **Compute Metrics** - Calculate baseline/outcome for each action
4. **Update Status** - Mark expired actions, update metrics
5. **Refresh UI** - Display updated action cards

### Sync Guard

To prevent duplicate syncs:
```typescript
const syncingActionsRef = useRef(false);

const syncActionOutcomes = useCallback(async () => {
    if (syncingActionsRef.current || actionsLoading) return;
    syncingActionsRef.current = true;
    // ... sync logic
    syncingActionsRef.current = false;
}, [...]);
```

---

## Key Files

- `app/(tabs)/insights.tsx` - Actions tab UI and logic
- `lib/supabase.ts` - API functions for actions and pathways
- `lib/insights.ts` - Insight generation that may suggest actions

---

## Related Features

- **Experiments** - Longer A/B-style tests (see `experiments.md`)
- **Insights** - AI-generated suggestions that may trigger actions
- **Metabolic Score** - Actions can target specific metabolic components
