# ICP-changes Branch — CEO Review Action Items

## Immediate Fixes (do now, before merge)

- [x] ~~Fix 3x `invokeWithRetry()` violations~~ — Already handled: supabase.ts wrappers use `invokeWithRetry` internally
- [x] Add `sanitizeForPrompt()` shared helper + apply to AI edge functions
- [x] Wrap `getMealItems()` in try/catch in `lib/mealScoreTrigger.ts`
- [x] Add chat send debounce (isSending guard + 3s cooldown in useChat)
- [x] ~~Add daily checkin double-submit guard~~ — Already handled: `saveDailyCheckin` uses upsert with onConflict
- [x] Add `meal_scores` `updated_at` trigger migration

## Cold-Start Fixes (Eng Review 2026-03-17)

### Fix 1: First-Meal Prompt After Onboarding
- [x] Add bottom sheet modal in `app/onboarding-personalize.tsx` (teaser phase, before navigate())
- [x] "Take a photo" → router.push('/meal-scanner'), then navigate() on return
- [x] "Skip for now" → navigate() directly
- [x] Guard: only show if user has 0 meals (skip for re-onboarding users)

### Fix 2: Chat CTA on Home During Cold Start
- [x] Add `ChatCTACard` component inside `PersonalInsightsCarousel.tsx`
- [x] Render below `InsightProgressCard` when `insightReadiness.ready === false && !primaryInsight`
- [x] Routes to `/(tabs)/chat` on tap

### Fix 3: Progress Countdowns (Not Empty States)
- [x] `MetabolicScoreRing.tsx`: Add `daysLogged?` + `daysTarget?` props → show "Day X/7" + progress ring fill when score=null
- [x] `WellnessScoreRing.tsx`: Add `daysLogged?` + `daysTarget?` props → show "Day X/3" + progress ring fill when score=null
- [x] `index.tsx` MetabolicScoreCard empty state: "Unlocks in X days — keep logging!" + 7-segment progress bar
- [x] `index.tsx` BehaviorMetabolicHeroCard: "Unlocks in X days" + ring progress fill when locked
- [x] `index.tsx` Stat cards: Replace "No data" with specific CTAs per card type (Steps→"Connect Apple Health", Fiber→"Log a meal to track", Activity→"Log activity or connect Health", Sleep→"Connect Apple Health")
- [x] Derive `daysLogged` from existing `useDailyContext` hook data (`daysWithData` already computed, zero new queries)

### Verification
- [x] Run `npm run typecheck` — no type errors
- [x] Run `npm run lint` — no errors, no warnings
- [ ] Manual test: fresh signup → onboarding → first-meal modal → paywall → home with progress indicators
- [ ] Manual test: home with existing data → all scores/cards render normally (regression)

## Post-Merge TODOs

### P1 — High Priority
- [ ] **Split `app/(tabs)/index.tsx`** (3,896 lines) into ~6 modular files: cards/, behavior-cards/, sheets/, business-logic, styles, main screen. Every future Home change is high-risk until done. Effort: M.

### P2 — Medium Priority
- [ ] **Custom paywall screen** replacing RevenueCatUI.Paywall with branded feature highlights. Current paywall is generic RevenueCat UI — doesn't communicate why Gluco is worth paying for. Should showcase meal photo AI, meal scores, wellness score, AI chat with screenshots/previews. Depends on: cold-start fixes. Effort: M-L.
- [ ] **Server-side rate limiting** for AI edge functions (chat-wellness especially). Monitor Gemini costs first; implement if costs spike. Strategy TBD (Redis counter vs Supabase row vs Deno KV). Effort: M.
- [ ] **Glucose bounds validation** in `calibration-update` edge function. Reject values outside 20-600 mg/dL before EMA computation. Prevents calibration corruption. Effort: S.
- [ ] **Split `lib/supabase.ts`** (~5,700 lines) into domain modules (supabase/meals.ts, supabase/chat.ts, etc.). Blocked by: Home screen split. Effort: L.

### P3 — Low Priority
- [ ] **Deduplicate streak gap logic** between `hooks/useStreak.ts` and `lib/streaks.ts`. Both implement same 0/1/2/else calculation. Effort: S.
- [ ] **Score spoofing fix** in `score-explanation` — verify score server-side instead of trusting client. Effort: S. Self-harm only (user's own data).
- [ ] **DOWN migrations** for all 14 new migrations. Effort: M. Pre-existing gap.

## Review Summary

### Eng Plan Review — 2026-03-17 (Cold-Start Fixes)
Based on CEO Review finding: "Gluco's best features are invisible for the first 3-7 days."
- Mode: BIG CHANGE (section-by-section review)
- 3 fixes planned: first-meal prompt, chat CTA, progress countdowns
- 5 files touched, 0 new files, 0 new services
- 7 decisions resolved via interactive review
- 1 new TODO added (custom paywall, P2)
- 0 critical failure mode gaps
- Verification: typecheck + manual simulator testing (10 items)

### CEO Plan Review — 2026-03-14
Mode: HOLD SCOPE.
- 2 architecture concerns (god component, supabase size) — invokeWithRetry was already correct
- 4 error handling gaps found, 2 fixed (prompt injection, getMealItems), 2 deferred (score spoofing, glucose bounds)
- 1 security fix applied (prompt input sanitization across edge functions)
- 2 interaction edge cases fixed (chat double-send + cooldown), 1 already handled (checkin upsert), 1 deferred (streak race)
- 1 DB fix applied (meal_scores updated_at trigger migration)
- 5 post-merge TODOs tracked
