# Quick Wins - Immediate Optimizations

## 🚀 Top 3 Quick Wins (Can implement in < 30 minutes each)

### 1. Remove Redundant Profile Fetches ⚡

**Current Issue**: `getUserProfile` called twice in `index.tsx` when profile is already in `AuthContext`

**Files**: `app/(tabs)/index.tsx` lines 223 and 480

**Fix**:
```typescript
// BEFORE (line 223 in GlucoseTrendsCard)
const profile = await getUserProfile(user.id);
if (profile) {
  setTargetMin(profile.target_min ?? TARGET_MIN_MMOL);
  setTargetMax(profile.target_max ?? TARGET_MAX_MMOL);
}

// AFTER
const { profile } = useAuth(); // Already available!
const targetMin = profile?.target_min ?? TARGET_MIN_MMOL;
const targetMax = profile?.target_max ?? TARGET_MAX_MMOL;
```

**Impact**: Eliminates 2 database queries per screen load

---

### 2. Consolidate useFocusEffect Hooks ⚡

**Current Issue**: 7 separate `useFocusEffect` hooks causing multiple refetches

**Files**: `app/(tabs)/index.tsx` - multiple components

**Fix**: Move to parent component
```typescript
// In TodayScreen component, replace individual hooks with:
useFocusEffect(
  useCallback(() => {
    // Single fetch for all data
    if (user?.id) {
      Promise.all([
        fetchGlucoseData(),
        fetchActivityData(),
        fetchFibreData(),
        fetchReviews()
      ]);
    }
  }, [user?.id, range])
);
```

**Impact**: Reduces from 7 refetches to 1 on screen focus

---

### 3. Memoize Stat Cards ⚡

**Current Issue**: Stat cards re-render when parent updates

**Fix**: Wrap components in `React.memo`
```typescript
const DaysInRangeCard = React.memo(({ range }: { range: RangeKey }) => {
  // ... existing code
}, (prev, next) => prev.range === next.range);

const ActivityStatCard = React.memo(({ range }: { range: RangeKey }) => {
  // ... existing code  
}, (prev, next) => prev.range === next.range);
```

**Impact**: Prevents unnecessary re-renders when other cards update

---

## 📊 Summary

| Quick Win | Time | Impact | Difficulty |
|-----------|------|--------|------------|
| Remove Profile Fetches | 5 min | High | Easy |
| Consolidate useFocusEffect | 15 min | High | Medium |
| Memoize Components | 10 min | Medium | Easy |
| **Total** | **30 min** | **High** | **Easy-Medium** |

---

## 🎯 Next Steps After Quick Wins

1. Implement database query batching (see OPTIMIZATION_ANALYSIS.md #1)
2. Optimize fibre intake query with JOIN (see OPTIMIZATION_ANALYSIS.md #2)
3. Add database indexes (see OPTIMIZATION_ANALYSIS.md #12)

