# Insights and Home

## Purpose
Provide the Today dashboard and Insights views that summarize recent meals, glucose, activity, and sleep, plus personalized suggestions.

## Entry Points
- `app/(tabs)/index.tsx` (Today)
- `app/(tabs)/insights.tsx` (Insights)

## Flow Summary
- **Today**
  - Uses `useTodayScreenData` to batch-fetch glucose logs, activity logs, fibre summary, and recent meals with check-ins.
  - The hook fetches an extended glucose window to support comparisons and trend charts.
  - UI mixes trend cards, quick actions, check-in cards, and AI/insight components.
- **Insights**
  - Displays longer-form summaries based on a selected date range.
  - Uses the same data sources plus insight generation.

## Insight Generation
- `usePersonalInsights` provides a cached insight list with a 12-hour TTL.
- The hook currently uses rules-based insights (`generateInsights` in `lib/insights.ts`) and caches the output. LLM output is intentionally bypassed due to schema differences (see hook comments).
- `lib/insights.ts` applies safe-language filtering and confidence scoring based on data completeness.

## Data Sources
- `useTodayScreenData` (batched Supabase reads)
- `usePersonalInsights` (cached rules-based insights)
- `lib/insights.ts` (rules engine, banned-terms filter, confidence scoring)

## Key UI Components
- `components/animations/animated-screen.tsx`
- `components/carousels/PersonalInsightsCarousel.tsx`
- `components/cards/MealCheckinCard.tsx`
- `components/charts/glucose-trend-chart.tsx`

## Key Files
- `app/(tabs)/index.tsx`
- `app/(tabs)/insights.tsx`
- `hooks/useTodayScreenData.ts`
- `hooks/usePersonalInsights.ts`
- `lib/insights.ts`
