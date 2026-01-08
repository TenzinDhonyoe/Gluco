# Release Red Flags Report
## GlucoFigma Regulatory & Safety Audit
**Generated:** 2026-01-05  
**Scope:** Full codebase audit for medical device / diagnosis / prediction / treatment / prevention language

---

## Executive Summary

The codebase demonstrates **strong awareness** of regulatory requirements with banned terms lists, disclaimers, and wellness-focused language guidelines in `PROJECT_DOCUMENTATION.md`. However, several **high-severity issues** remain that could trigger FDA/regulatory scrutiny if released today.

**Key Findings:**
- ✅ Good: Banned terms enforcement in `metabolic-score` Edge Function
- ✅ Good: Disclaimer component exists and is used in onboarding
- ⚠️ **Critical:** "Spike Risk" terminology implies health outcome prediction
- ⚠️ **Critical:** "insulin sensitivity" language in exercise-analyze function
- ⚠️ **Critical:** URLs linking to diabetes.org and type-2-diabetes articles
- ⚠️ **Medium:** PROJECT_DOCUMENTATION.md contains banned term "prediabetes reversal"
- ⚠️ **Medium:** Hardcoded 7.8 mmol/L threshold without user-defined context

---

## A) High Severity (Must Fix Before Release)

### 1. "Spike Risk" Terminology - Health Outcome Prediction
**Files:**
- `app/pre-meal-check.tsx` (lines 51, 603, 639, 801)
- `app/meal-response-check.tsx` (line 640)
- `lib/supabase.ts` (lines 949, 954, 989, 1261, 1285, 1307)
- `PROJECT_DOCUMENTATION.md` (lines 863, 1700, 1704, 2136, 2307, 3197, etc.)

**What:** Term "Spike Risk" and "spike_risk_pct" used throughout the pre-meal analysis feature.

**Why Risky:** "Spike risk" implies prediction of a health outcome (glucose spike = adverse event). This could be interpreted as disease detection/prediction under FDA guidelines.

**Minimal Safe Fix:**
```diff
- spike_risk_pct
+ meal_response_score

- Spike Risk: 65%
+ Expected Response: Moderate

- "Check spike risk"
+ "Check meal response"

- SpikeRiskInputSheet
+ MealResponseInputSheet

- SpikeRiskGauge
+ MealResponseGauge
```

**Note:** API field names can be aliased in responses but internal naming should also be cleaned.

---

### 2. "Insulin Sensitivity" Language in Exercise Function
**File:** `supabase/functions/exercise-analyze/index.ts` (line 281)

**What:**
```typescript
timing_benefit = 'Fasted exercise improves insulin sensitivity';
```

**Why Risky:** "Insulin sensitivity" is clinical terminology directly associated with diabetes diagnosis and treatment. This implies a therapeutic benefit.

**Minimal Safe Fix:**
```diff
- timing_benefit = 'Fasted exercise improves insulin sensitivity';
+ timing_benefit = 'Fasted morning activity may support your energy and metabolism';
```

---

### 3. Diabetes-Related Article URLs in personalized-tips
**File:** `supabase/functions/personalized-tips/index.ts` (lines 201, 221)

**What:**
```typescript
articleUrl: 'https://www.healthline.com/health/type-2-diabetes/blood-glucose-monitoring'
articleUrl: 'https://www.healthline.com/health/type-2-diabetes/walking-after-meal'
```

**Why Risky:** Linking to type-2-diabetes URLs positions the app as diabetes-related, which implies disease management.

**Minimal Safe Fix:**
```diff
- articleUrl: 'https://www.healthline.com/health/type-2-diabetes/blood-glucose-monitoring'
+ articleUrl: 'https://www.healthline.com/nutrition/blood-sugar-after-eating'

- articleUrl: 'https://www.healthline.com/health/type-2-diabetes/walking-after-meal'
+ articleUrl: 'https://www.healthline.com/nutrition/walking-after-eating'
```

---

### 4. "Prediabetes Reversal" in PROJECT_DOCUMENTATION.md
**File:** `PROJECT_DOCUMENTATION.md` (line 1342)

**What:**
```markdown
The app integrates with Apple HealthKit to fetch sleep data, recognizing that sleep quality 
is a critical factor in prediabetes reversal.
```

**Why Risky:** Even in documentation, "prediabetes reversal" implies the app is designed to reverse a disease condition. If this documentation is shipped or indexed, it creates regulatory exposure.

**Minimal Safe Fix:**
```diff
- is a critical factor in prediabetes reversal.
+ can support overall metabolic wellness.
```

---

### 5. Hardcoded 7.8 mmol/L Clinical Threshold
**Files:**
- `supabase/functions/premeal-analyze/index.ts` (line 727)
- `app/post-meal-review.tsx` (line 376, 378)

**What:**
```typescript
log => log.context === 'post_meal' && log.glucose_level > 7.8
y1={scaleY(7.8)}
```

**Why Risky:** 7.8 mmol/L (140 mg/dL) is the clinical threshold for impaired glucose tolerance. Using this as a hardcoded boundary implies clinical diagnosis criteria.

**Minimal Safe Fix:**
```diff
// In premeal-analyze/index.ts
- log => log.context === 'post_meal' && log.glucose_level > 7.8
+ log => log.context === 'post_meal' && log.glucose_level > userProfile.baseline_glucose + 2.0

// In post-meal-review.tsx - Make threshold user-defined or remove the line
- y1={scaleY(7.8)}
+ y1={scaleY(targetMax ?? 10.0)}  // Use user's target range
```

---

### 6. "Glucose Impact" and "glucose_impact" in exercise-analyze
**File:** `supabase/functions/exercise-analyze/index.ts` (lines 39-45, 219-292)

**What:** The entire `glucose_impact` object with `reduction_pct` implies the app predicts how exercise will affect a health biomarker.

**Why Risky:** Predicting glucose reduction percentages = predicting health outcomes.

**Minimal Safe Fix:**
```diff
- glucose_impact: {
-     reduction_pct: number;
+ activity_benefit: {
+     estimated_effect: 'high' | 'moderate' | 'low';

// Change all messaging to behavioral:
- "Post-meal exercise is 30% more effective for glucose control"
+ "Post-meal movement often helps with how you feel after eating"
```

---

## B) Medium Severity (Should Fix Soon)

### 1. Missing Disclaimer on Pre-Meal Check Results
**File:** `app/pre-meal-check.tsx`

**What:** The pre-meal analysis results screen shows "Spike Risk: 65%" without a disclaimer.

**Why Risky:** Prominent risk percentage without context could be interpreted as health prediction.

**Minimal Safe Fix:** Add `<Disclaimer variant="short" />` below the gauge component.

---

### 2. "Time in Range" Clinical Terminology
**File:** `app/(tabs)/index.tsx` (line 326), `PROJECT_DOCUMENTATION.md` (lines 639, 1614, 3567)

**What:** "Time in Range" is standard diabetes management terminology from clinical CGM usage.

**Why Risky:** Implies clinical monitoring for disease management.

**Minimal Safe Fix:**
```diff
- Time in Range
+ Days In Range
OR
+ % In Your Zone
```

---

### 3. "predicted_impact" Field in API Responses
**Files:**
- `supabase/functions/experiments-suggest/index.ts` (line 39)
- `PROJECT_DOCUMENTATION.md` (lines 750, 1031, 2982)

**What:** `predicted_impact: 'high' | 'moderate' | 'low'`

**Why Risky:** "Predicted impact" sounds like health outcome prediction.

**Minimal Safe Fix:**
```diff
- predicted_impact: 'high' | 'moderate' | 'low'
+ estimated_relevance: 'high' | 'moderate' | 'low'
```

---

### 4. "Fasting Insulin" Data Collection Without Context
**Files:**
- `app/labs-health-info.tsx` (lines 44, 188-189, 504-506)
- `supabase/migrations/20250104_lab_snapshots.sql` (lines 14-16)

**What:** The app collects "Fasting Insulin" values which are used for clinical HOMA-IR calculations.

**Why Risky:** Collecting fasting insulin + fasting glucose enables insulin resistance calculation even if not displayed.

**Minimal Safe Fix:** 
- Add explicit disclaimer on labs input screen: "These values are for wellness tracking only and are not used for diagnosis."
- Ensure NO HOMA-IR calculation is ever performed.

---

### 5. Wearables-Only Mode - Incomplete Gating
**Files:**
- `app/(tabs)/index.tsx` (line 1231, 1385, 1391)

**What:** The `isWearablesOnly` check exists but `<GlucoseTrendsCard>` is still rendered on line 1385 for all users.

**Why Risky:** Wearables-only users should never see glucose-related UI elements.

**Minimal Safe Fix:**
```tsx
// Wrap GlucoseTrendsCard in conditional
{!isWearablesOnly && (
    <GlucoseTrendsCard range={range} allLogs={glucoseLogs} isLoading={isLoading} glucoseUnit={glucoseUnit} />
)}
```

---

### 6. "Metabolic Response Score" Name Could Be Stronger
**File:** `supabase/functions/metabolic-score/index.ts`

**What:** "Metabolic Response Score" is better than alternatives but still uses "metabolic" which has clinical connotations.

**Why Risky:** Moderate - "metabolic" is borderline acceptable but could be interpreted as metabolic health assessment.

**Minimal Safe Fix (Optional):**
```diff
- metabolic_response_score
+ wellness_balance_score
OR
+ daily_energy_score
```

---

## C) Low Severity (Nice to Fix)

### 1. Diabetes.org Reference in PROJECT_DOCUMENTATION.md
**File:** `PROJECT_DOCUMENTATION.md` (line 1762)

**What:** Documentation mentions sourcing articles from "Diabetes.org"

**Minimal Safe Fix:** Replace with general health sources only: "Healthline, Harvard Health, Mayo Clinic"

---

### 2. "Glucose Control" Phrasing
**Files:** Multiple in exercise-analyze, premeal-analyze

**What:** Phrases like "glucose control benefits"

**Minimal Safe Fix:**
```diff
- glucose control benefits
+ steadier energy patterns
```

---

### 3. "Risk Reduction" Percentages in Tips
**File:** `supabase/functions/premeal-analyze/index.ts` (lines 55, 802-803)

**What:** `risk_reduction_pct: 8` in adjustment tips

**Minimal Safe Fix:** Rebrand as "estimated benefit" rather than "risk reduction"

---

## D) Repo-Wide Risky Term Inventory

| Term | Occurrences | Locations |
|------|-------------|-----------|
| `spike risk` | 21+ | pre-meal-check.tsx, meal-response-check.tsx, supabase.ts, premeal-analyze/ |
| `predict`/`prediction` | 190+ | premeal-analyze/, documentation, components |
| `insulin` | 28 | labs-health-info.tsx, exercise-analyze/, migrations |
| `prediabetes` | 6 | PROJECT_DOCUMENTATION.md (banned terms lists only ✓), metabolic-score/ |
| `diabetes` | 9 | PROJECT_DOCUMENTATION.md, personalized-tips/ URLs |
| `7.8` (clinical threshold) | 5 | premeal-analyze/, post-meal-review.tsx, test_data.sql |
| `Time in Range` | 3 | index.tsx, PROJECT_DOCUMENTATION.md |
| `clinical` | 8 | PROJECT_DOCUMENTATION.md, function prompts (in "avoid clinical" ✓) |
| `diagnos-` | 15 | Disclaimer.tsx ✓, prompts ✓, documentation |
| `detect` | 26 | Most are package-lock.json, banned terms, or code detection logic |
| `treat`/`treatment` | 10 | Disclaimer.tsx ✓, documentation, experiments schema |
| `prevent` | 29 | Most are code logic (prevent re-renders), disclaimer ✓ |
| `risk` | 180+ | spike_risk_pct throughout codebase |
| `glucose_impact` | 8 | exercise-analyze/ |

---

## E) Quick Patch Plan (1-2 Hours)

### Priority Order for Maximum Impact Reduction:

**Hour 1: Critical String Replacements**
1. ✏️ `supabase/functions/exercise-analyze/index.ts` line 281
   - Change "improves insulin sensitivity" → "may support your energy and metabolism"
   
2. ✏️ `supabase/functions/personalized-tips/index.ts` lines 201, 221
   - Update diabetes-related URLs to general nutrition URLs

3. ✏️ `PROJECT_DOCUMENTATION.md` line 1342
   - Remove "prediabetes reversal" phrase

4. ✏️ Search & replace in UI-facing strings:
   - "Spike Risk" → "Meal Response" (or "Expected Response")
   - "spike risk" → "meal response" (lowercase)

**Hour 2: Structural Fixes**
5. ✏️ `app/(tabs)/index.tsx` 
   - Gate `GlucoseTrendsCard` with `!isWearablesOnly` check
   - Add missing glucose term guards for wearables users

6. ✏️ `app/pre-meal-check.tsx`
   - Add `<Disclaimer variant="short" />` component after results

7. ✏️ `supabase/functions/premeal-analyze/index.ts` line 727
   - Replace hardcoded 7.8 with user-relative threshold

8. ✏️ Component renames (can be aliases initially):
   - `SpikeRiskGauge` → `MealResponseGauge`
   - `SpikeRiskInputSheet` → `MealResponseInputSheet`

---

## Verification Checklist

After implementing fixes, verify:
- [ ] No occurrences of "insulin sensitivity" in user-facing output
- [ ] No URLs containing "diabetes" in article links
- [ ] "Spike Risk" replaced with "Meal Response" in UI
- [ ] Wearables-only mode shows no glucose terminology
- [ ] All LLM prompts contain disclaimer instruction: "Do NOT imply diagnosis, detection, or prediction of any disease"
- [ ] Pre-meal and post-meal result screens include disclaimer component
- [ ] No hardcoded clinical thresholds (7.8, 11.1, etc.) without user context

---

## Good Practices Already in Place ✓

1. **Banned terms enforcement** in `metabolic-score/index.ts` with runtime filtering
2. **Disclaimer component** exists and is used in onboarding
3. **Wellness-focused prompts** with explicit "avoid clinical terminology" instructions
4. **Documentation awareness** with regulatory positioning section
5. **`tracking_mode` gating** infrastructure exists for wearables-only users

---

*Report generated by codebase audit on 2026-01-05*
