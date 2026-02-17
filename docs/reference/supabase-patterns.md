# Supabase Patterns Reference

## Client Setup (`lib/supabase.ts`)

```typescript
// Config from env vars (priority) or app.json extra
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || Constants.expoConfig?.extra?.supabaseAnonKey;

// Auth storage: SecureStore (iOS/Android) → AsyncStorage fallback (web + errors)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: { getItem, setItem, removeItem }, // Custom adapter
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
```

## Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User data | id, email, tracking_mode, ai_enabled, experience_variant, com_b_barrier |
| `meals` | Meal records | id, user_id, meal_type, meal_time, photo_url, notes |
| `meal_items` | Food items in meal | id, meal_id, display_name, nutrients (calories, carbs, protein, fat, fibre) |
| `meal_checkins` | Post-meal check-ins | meal_id, energy, fullness, cravings |
| `glucose_logs` | Glucose readings | id, user_id, value_mmol, context (fasting, pre_meal, post_meal) |
| `activity_logs` | Exercise records | id, user_id, activity_type, duration_minutes, intensity |
| `weight_logs` | Weight entries | id, user_id, weight_kg, source (manual, apple_health) |
| `daily_context` | HealthKit aggregates | user_id, date, steps, active_minutes, sleep_hours, resting_hr, hrv |
| `user_actions` | Behavior actions | id, user_id, status (active/completed/expired/cancelled) |
| `care_pathways` | 7-day plans | id, user_id, template_id, started_at |
| `user_experiments` | A/B experiments | id, user_id, status, hypothesis |
| `metabolic_weekly_scores` | Weekly scores | user_id, week_start, score, components |
| `foods_cache` | Cached food lookups | query, results, fetched_at |
| `photo_analysis_cache` | Cached AI analysis | meal_id, analysis_result |

## UserProfile Type

```typescript
export interface UserProfile {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    region: string | null;
    birth_date: string | null;
    biological_sex: string | null;
    goals: string[] | null;
    onboarding_completed: boolean;
    target_min: number | null;      // Glucose target min (mmol/L)
    target_max: number | null;      // Glucose target max (mmol/L)
    glucose_unit: GlucoseUnit;      // 'mmol/L' | 'mg/dL'
    tracking_mode: TrackingMode;
    manual_glucose_enabled: boolean;
    height_cm: number | null;
    weight_kg: number | null;
    coaching_style: CoachingStyle | null; // 'light' | 'balanced' | 'structured'
    notifications_enabled: boolean;
    ai_enabled: boolean;
    ai_consent_at: string | null;
    experience_variant: ExperienceVariant; // 'legacy' | 'behavior_v1'
    framework_reset_completed_at: string | null;
    com_b_barrier: COMBBarrier | null;    // 'capability' | 'opportunity' | 'motivation' | 'unsure'
    readiness_level: ReadinessLevel | null; // 'low' | 'medium' | 'high'
    primary_habit: string | null;
    if_then_plan: string | null;
    prompt_window: PromptWindow | null;    // 'morning' | 'midday' | 'evening'
    show_glucose_advanced: boolean;
    notification_preferences: NotificationPreferences | null;
    created_at: string;
    updated_at: string;
}
```

## CRUD Pattern

All CRUD functions follow this pattern in `lib/supabase.ts`:

```typescript
// CREATE
export async function createGlucoseLog(log: Omit<GlucoseLog, 'id' | 'created_at'>): Promise<GlucoseLog | null> {
    const { data, error } = await supabase.from('glucose_logs').insert(log).select().single();
    if (error) { console.error('Error:', error); return null; }
    return data;
}

// READ (by date range — most common pattern)
export async function getGlucoseLogsByDateRange(userId: string, startDate: string, endDate: string) {
    const { data, error } = await supabase.from('glucose_logs')
        .select('*').eq('user_id', userId)
        .gte('logged_at', startDate).lte('logged_at', endDate)
        .order('logged_at', { ascending: false });
    // ...
}

// UPDATE
export async function updateGlucoseLog(logId: string, updates: Partial<GlucoseLog>) {
    const { data, error } = await supabase.from('glucose_logs')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', logId).select().single();
    // ...
}

// DELETE
export async function deleteGlucoseLog(logId: string): Promise<boolean> {
    const { error } = await supabase.from('glucose_logs').delete().eq('id', logId);
    // ...
}
```

## Edge Function Invocation

### `invokeWithRetry<T>()`

```typescript
export async function invokeWithRetry<T>(
    functionName: string,
    body: any,
    maxRetries: number = 3
): Promise<T | null>
```

- Retries on `FunctionsFetchError`, "Failed to send", 5xx errors
- Does NOT retry 4xx client errors
- Exponential backoff: 500ms, 1000ms, 2000ms
- Returns `null` on failure (not throwing)

### Schema Fallback Pattern

When a table/column doesn't exist yet (schema evolution):

```typescript
function isMissingTableError(error, tableName?): boolean  // internal helper
function warnSchemaFallbackOnce(key, message, error?): void
```

Uses error codes: `PGRST205`, `42P01` or message matching ("could not find the table", "relation does not exist").
Warns once per key, returns safe defaults.

## Edge Function Auth Pattern (`_shared/auth.ts`)

```typescript
// In edge function handler:
const { user, errorResponse } = await requireUser(req, supabase, corsHeaders);
if (errorResponse) return errorResponse;

// Optional: verify user_id from request body matches auth
const mismatchResponse = requireMatchingUserId(body.user_id, user.id, corsHeaders);
if (mismatchResponse) return mismatchResponse;
```

## Migration Naming Convention

Format: `YYYYMMDDHHMMSS_description.sql`

```
supabase/migrations/20260221130000_behavior_v1_framework.sql
supabase/migrations/20260220120000_action_loops_pathways_feature_store.sql
```

All migrations use `IF NOT EXISTS` for idempotency. Base table definitions also exist as standalone `.sql` files in `supabase/`.

## RLS (Row-Level Security)

Enabled on all user-owned tables. Pattern:
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own data" ON table_name
    FOR ALL USING (auth.uid() = user_id);
```

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL        — Supabase project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY   — Supabase anon key (public)
```

Set in `.env` file (not committed). Example in `.env.example`.
