# GlucoFigma - Optimization Analysis & Recommendations

## Executive Summary

After reviewing the codebase, I've identified several optimization opportunities across database queries, React performance, code organization, and network efficiency. This document outlines specific issues and actionable recommendations.

---

## 🔴 Critical Optimizations

### 1. Database Query Batching & N+1 Problems

**Issue**: Multiple sequential database queries in Today screen (`app/(tabs)/index.tsx`)

**Current State**:
- `GlucoseTrendsCard` fetches 180 days of glucose logs
- `DaysInRangeCard` fetches glucose logs again for same range
- `ActivityStatCard` fetches activity logs separately
- `FibreStatCard` fetches meals, then meal_items (2 queries)
- `HighExposureCard` fetches glucose logs again
- Each stat card refetches on range change

**Impact**: 5-7 separate database queries per screen load, multiplied by number of stat cards

**Recommendation**:
```typescript
// Create a unified data fetching hook
function useTodayScreenData(range: RangeKey) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  
  useEffect(() => {
    if (!user) return;
    
    // Single batch query or parallel Promise.all
    Promise.all([
      getGlucoseLogsByDateRange(user.id, startDate, endDate),
      getActivityLogsByDateRange(user.id, startDate, endDate),
      getMealsWithItemsByDateRange(user.id, startDate, endDate), // New combined query
      getUserProfile(user.id)
    ]).then(([glucose, activities, meals, profile]) => {
      setData({ glucose, activities, meals, profile });
    });
  }, [user, range]);
  
  return data;
}
```

**Files to Modify**:
- `app/(tabs)/index.tsx` - Create `useTodayScreenData` hook
- `lib/supabase.ts` - Add `getMealsWithItemsByDateRange` function

---

### 2. Fibre Intake Query Optimization

**Issue**: `getFibreIntakeSummary` performs 2 sequential queries (meals, then meal_items)

**Current Code** (`lib/supabase.ts:493-581`):
```typescript
// Query 1: Get meals
const { data: meals } = await supabase
  .from('meals')
  .select('id')
  .eq('user_id', userId)
  .gte('logged_at', startDate.toISOString())
  .lte('logged_at', endDate.toISOString());

// Query 2: Get meal items
const { data: mealItems } = await supabase
  .from('meal_items')
  .select('quantity, nutrients')
  .in('meal_id', mealIds);
```

**Recommendation**: Use a JOIN query or database function
```sql
-- Create a database function for better performance
CREATE OR REPLACE FUNCTION get_fibre_intake_summary(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_fibre NUMERIC,
  avg_per_day NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(mi.quantity * (mi.nutrients->>'fibre_g')::NUMERIC), 0) as total_fibre,
    COALESCE(SUM(mi.quantity * (mi.nutrients->>'fibre_g')::NUMERIC), 0) / 
      GREATEST(EXTRACT(DAY FROM (p_end_date - p_start_date))::INTEGER, 1) as avg_per_day
  FROM meal_items mi
  INNER JOIN meals m ON mi.meal_id = m.id
  WHERE m.user_id = p_user_id
    AND m.logged_at >= p_start_date
    AND m.logged_at <= p_end_date;
END;
$$ LANGUAGE plpgsql;
```

**Files to Modify**:
- `lib/supabase.ts` - Replace `getFibreIntakeSummary` with RPC call
- Create migration: `supabase/migrations/20241224_fibre_intake_function.sql`

---

### 3. Profile Fetching Optimization

**Issue**: `getUserProfile` called multiple times across components

**Current State**:
- `GlucoseTrendsCard` fetches profile for target range
- `DaysInRangeCard` fetches profile for target range
- `AuthContext` already has profile in state

**Recommendation**: Use profile from `AuthContext` instead of refetching
```typescript
// In GlucoseTrendsCard
const { user, profile } = useAuth(); // Use profile from context
const targetMin = profile?.target_min ?? TARGET_MIN_MMOL;
const targetMax = profile?.target_max ?? TARGET_MAX_MMOL;
```

**Files to Modify**:
- `app/(tabs)/index.tsx` - Remove `getUserProfile` calls, use `profile` from context

---

## 🟡 Performance Optimizations

### 4. React Component Memoization

**Issue**: Large components re-render unnecessarily

**Current State**:
- `GlucoseTrendsCard`, `DaysInRangeCard`, `ActivityStatCard`, `FibreStatCard` are not memoized
- Chart transformations recalculate on every render
- Stat cards re-render when other cards update

**Recommendation**:
```typescript
// Memoize stat cards
const DaysInRangeCard = React.memo(({ range }: { range: RangeKey }) => {
  // ... component code
}, (prev, next) => prev.range === next.range);

// Memoize expensive computations
const chartData = React.useMemo(() => {
  return transformLogsToChartData(filteredLogs, range);
}, [allLogs, range]);
```

**Files to Modify**:
- `app/(tabs)/index.tsx` - Add `React.memo` to stat card components
- Wrap expensive computations in `useMemo`

---

### 5. Chart Data Transformation Optimization

**Issue**: `transformLogsToChartData` recalculates on every render

**Current Code** (`app/(tabs)/index.tsx:109-172`):
- Processes all logs, groups by day, calculates rolling averages
- Runs even when logs haven't changed

**Recommendation**: Memoize with proper dependencies
```typescript
const chartData = React.useMemo(() => {
  const { startDate, endDate } = getDateRange(range);
  const filteredLogs = allLogs.filter(log => {
    const logDate = new Date(log.logged_at);
    return logDate >= startDate && logDate <= endDate;
  });
  return transformLogsToChartData(filteredLogs, range);
}, [allLogs, range]); // Only recalculate when logs or range change
```

**Files to Modify**:
- `app/(tabs)/index.tsx` - Already partially memoized, but verify dependencies

---

### 6. Multiple useFocusEffect Calls

**Issue**: Each stat card has its own `useFocusEffect` hook, causing multiple refetches

**Current State**:
- `GlucoseTrendsCard` has `useFocusEffect`
- `DaysInRangeCard` has `useFocusEffect`
- `ActivityStatCard` has `useFocusEffect`
- `FibreStatCard` has `useFocusEffect`
- `HighExposureCard` has `useFocusEffect`

**Recommendation**: Single `useFocusEffect` at parent level
```typescript
// In TodayScreen component
useFocusEffect(
  useCallback(() => {
    // Fetch all data once
    fetchAllData();
  }, [range])
);
```

**Files to Modify**:
- `app/(tabs)/index.tsx` - Consolidate data fetching

---

## 🟢 Code Organization Optimizations

### 7. Extract Large Components

**Issue**: `app/(tabs)/index.tsx` is 2000+ lines

**Recommendation**: Split into separate files
```
app/(tabs)/
  index.tsx (main screen, ~200 lines)
  components/
    GlucoseTrendsCard.tsx
    DaysInRangeCard.tsx
    ActivityStatCard.tsx
    FibreStatCard.tsx
    HighExposureCard.tsx
    MealCard.tsx
    TipCard.tsx
    SpikeRiskInputSheet.tsx
```

**Files to Create**:
- `app/(tabs)/components/` directory with extracted components

---

### 8. Environment Variables for Supabase Keys

**Issue**: Supabase URL and anon key hardcoded in `lib/supabase.ts`

**Current Code**:
```typescript
const supabaseUrl = 'https://ipodxujhoqbdrgxfphou.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

**Recommendation**: Use environment variables
```typescript
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
```

**Files to Modify**:
- `lib/supabase.ts` - Use environment variables
- `app.json` - Add `extra` config (for Expo)
- `.env` - Add variables (if using dotenv)

---

### 9. Duplicate Date Range Calculations

**Issue**: `getDateRange` function duplicated or similar logic in multiple places

**Recommendation**: Centralize in utility file
```typescript
// lib/utils/dateRanges.ts
export function getDateRange(range: RangeKey): { startDate: Date; endDate: Date } {
  // ... implementation
}

export function getRangeDays(range: RangeKey): number {
  // ... implementation
}
```

**Files to Create**:
- `lib/utils/dateRanges.ts`
- Update imports in `app/(tabs)/index.tsx`

---

## 🔵 Network & Caching Optimizations

### 10. Query Result Caching

**Issue**: No client-side caching of database query results

**Recommendation**: Implement simple cache with TTL
```typescript
// lib/cache/queryCache.ts
const queryCache = new Map<string, { data: any; expires: number }>();

export function getCachedQuery<T>(key: string, ttl: number = 60000): T | null {
  const cached = queryCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data as T;
  }
  queryCache.delete(key);
  return null;
}

export function setCachedQuery<T>(key: string, data: T, ttl: number = 60000): void {
  queryCache.set(key, { data, expires: Date.now() + ttl });
}
```

**Files to Create**:
- `lib/cache/queryCache.ts`
- Update `lib/supabase.ts` functions to use cache

---

### 11. Batch API Calls

**Issue**: Multiple Edge Function calls could be batched

**Recommendation**: Create batch endpoint or use Promise.all
```typescript
// Batch multiple food searches
const results = await Promise.all([
  searchFoods('chicken'),
  searchFoods('rice'),
  searchFoods('vegetables')
]);
```

**Note**: Food search already has good caching, but batching could help for initial loads

---

## 📊 Database Index Optimizations

### 12. Missing Database Indexes

**Recommendation**: Add indexes for common query patterns

```sql
-- For glucose logs date range queries
CREATE INDEX IF NOT EXISTS glucose_logs_user_logged_at_idx 
ON glucose_logs(user_id, logged_at DESC);

-- For activity logs date range queries  
CREATE INDEX IF NOT EXISTS activity_logs_user_logged_at_idx
ON activity_logs(user_id, logged_at DESC);

-- For meals date range queries
CREATE INDEX IF NOT EXISTS meals_user_logged_at_idx
ON meals(user_id, logged_at DESC);

-- For meal_items join queries
CREATE INDEX IF NOT EXISTS meal_items_meal_id_idx
ON meal_items(meal_id);

-- Composite index for fibre calculation
CREATE INDEX IF NOT EXISTS meals_user_logged_at_composite_idx
ON meals(user_id, logged_at DESC) 
INCLUDE (id);
```

**Files to Create**:
- `supabase/migrations/20241224_add_performance_indexes.sql`

---

## 🎯 Implementation Priority

### High Priority (Immediate Impact)
1. ✅ **Database Query Batching** (#1) - Reduces 5-7 queries to 1-2
2. ✅ **Profile Fetching** (#3) - Eliminates redundant queries
3. ✅ **Fibre Intake Query** (#2) - Reduces 2 queries to 1

### Medium Priority (Performance Gains)
4. ✅ **React Memoization** (#4) - Reduces unnecessary re-renders
5. ✅ **Chart Data Memoization** (#5) - Prevents expensive recalculations
6. ✅ **Consolidate useFocusEffect** (#6) - Reduces duplicate fetches

### Low Priority (Code Quality)
7. ✅ **Extract Components** (#7) - Improves maintainability
8. ✅ **Environment Variables** (#8) - Security best practice
9. ✅ **Date Range Utilities** (#9) - Reduces duplication

### Nice to Have
10. ✅ **Query Result Caching** (#10) - Additional performance boost
11. ✅ **Database Indexes** (#12) - Long-term performance

---

## 📈 Expected Performance Improvements

| Optimization | Expected Improvement |
|-------------|---------------------|
| Query Batching | 60-80% reduction in database round trips |
| Profile Caching | Eliminates 2-3 redundant queries per screen |
| Fibre Query JOIN | 50% faster fibre calculations |
| React Memoization | 30-50% reduction in re-renders |
| Chart Memoization | Eliminates expensive recalculations |
| **Total Estimated** | **40-60% faster screen load times** |

---

## 🛠️ Next Steps

1. **Start with High Priority items** - These will have the biggest impact
2. **Test after each change** - Ensure no regressions
3. **Monitor performance** - Use React DevTools Profiler and network tab
4. **Iterate** - Continue optimizing based on real-world usage patterns

---

**Last Updated**: December 23, 2024
**Review Status**: Ready for Implementation

