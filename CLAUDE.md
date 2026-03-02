# CLAUDE.md — Gluco

**IMPORTANT: Before starting any task, read the relevant reference docs and skill files listed below.**

## Project Identity

Gluco is a React Native health & wellness tracking app — meal logging, glucose tracking, activity monitoring, and personalized insights. It is a **wellness app**, NOT a medical device. All user-facing text must follow safe language rules (see `docs/reference/health-domain.md`).

## Tech Stack

- React Native 0.81.5 + React 19.1
- Expo SDK 54 with typed routes (New Architecture enabled)
- TypeScript (strict mode, `@/` path alias to project root)
- Supabase (PostgreSQL, Auth, Storage, Deno Edge Functions)
- Google Gen AI / Gemini (meal photo analysis, label OCR, insights)
- Apple HealthKit via `react-native-health` (iOS-only, requires native build)
- RevenueCat for subscriptions
- Styling: `StyleSheet.create()` + `constants/Colors.ts` + `DESIGN.md` (Liquid Glass design system)
- Fonts: Outfit family (`hooks/useFonts.ts`)
- Animations: `react-native-reanimated` v4
- Tab bar: NativeTabs (`expo-router/unstable-native-tabs`) — native UITabBarController with Liquid Glass on iOS 26

## Commands

```bash
npm start                # Expo dev server (no HealthKit)
npx expo run:ios         # Native build (required for HealthKit)
npm run lint             # ESLint
npm run typecheck        # TypeScript check (tsc --noEmit)
eas build --platform ios --profile development   # Dev client
eas build --platform ios --profile preview       # Preview build
eas build --platform ios --profile production    # App Store
```

## Directory Map

```
app/                     # Screens & navigation (Expo Router, file-based)
  (tabs)/                #   Tab screens: index (Home), log, insights
  components/scanner/    #   Meal scanner sub-components
components/              # Reusable UI (animations, charts, cards, controls, ui)
hooks/                   # Custom React hooks (data fetching, caching)
lib/                     # Business logic & integrations
  supabase.ts            #   ALL typed API helpers + types (~3,500 lines)
  healthkit.ts           #   HealthKit integration (iOS-only)
  insights.ts            #   Rules-based insight generation + safe language
  foodSearch/            #   Multi-stage food search pipeline
  photoAnalysis/         #   AI photo analysis pipeline
  experience.ts          #   Experience variant management (legacy vs behavior_v1)
context/                 # React Context providers (Auth, Subscription, TabTransition)
constants/               # Colors.ts, theme, Images, legal
supabase/functions/      # Deno edge functions (20+)
  _shared/               #   Shared: auth.ts, safety.ts, genai.ts, nutrition-*.ts
docs/                    # Documentation
  features/              #   15 feature docs (what features do)
  reference/             #   8 reference docs (how to work in the codebase)
.claude/skills/          # 5 skill workflows for common tasks
```

## Reference Docs (`docs/reference/`)

Read these for deep knowledge about specific areas:

| Doc | When to read |
|-----|-------------|
| [architecture.md](docs/reference/architecture.md) | Navigation, state management, data flow, pipelines |
| [health-domain.md](docs/reference/health-domain.md) | Safe language, banned terms, DPP, BCTs, COM-B, glucose ranges |
| [supabase-patterns.md](docs/reference/supabase-patterns.md) | CRUD pattern, types, RLS, edge function auth, migrations |
| [ai-integration.md](docs/reference/ai-integration.md) | Gemini config, photo pipeline, food search, safety checklist |
| [react-native-patterns.md](docs/reference/react-native-patterns.md) | StyleSheet, fonts, animations, component organization |
| [component-and-ux.md](docs/reference/component-and-ux.md) | Color system, gradients, charts, cards, bottom sheets |
| [gotchas.md](docs/reference/gotchas.md) | HealthKit native build, SecureStore limits, schema evolution, Deno |
| [codebase-navigation.md](docs/reference/codebase-navigation.md) | Search strategies, subagent templates, tracing data flow |
| [DESIGN.md](DESIGN.md) | Liquid Glass design system, color roles, card/button styling rules |

## Skills (`.claude/skills/`)

Follow these step-by-step workflows for common tasks:

| Skill | When to use |
|-------|------------|
| [create-feature](/.claude/skills/create-feature/SKILL.md) | New screen + hook + supabase helpers + navigation |
| [add-health-metric](/.claude/skills/add-health-metric/SKILL.md) | New HealthKit data type integration |
| [create-edge-function](/.claude/skills/create-edge-function/SKILL.md) | New Deno edge function with auth + AI |
| [database-migration](/.claude/skills/database-migration/SKILL.md) | New tables, columns, indexes, RLS |
| [fix-issue](/.claude/skills/fix-issue/SKILL.md) | Debugging and issue resolution |

## Feature Docs (`docs/features/`)

Detailed feature documentation (15 files):
- `auth-and-onboarding.md` — Auth flow, 6-step onboarding
- `meal-logging.md`, `meal-scanner.md`, `meal-photo-analyzer.md` — Meal capture
- `glucose-logging.md`, `activity-logging.md` — Manual logging
- `insights-and-home.md` — Today dashboard, Insights tab
- `actions-and-care-pathways.md` — Behavior change actions, 7-day plans
- `ai-and-ml.md` — AI safety, metabolic scoring (deterministic, not ML)
- `metabolic-score-calculations.md` — Score algorithm details
- `experiments.md` — A/B experiment framework
- `data-sources-healthkit.md` — HealthKit integration
- `notifications.md` — Local notifications
- `backend-and-data.md` — Supabase architecture
- `settings-and-privacy.md` — User settings

## Key Conventions

- **State:** React Context + custom hooks (no external state library)
- **Styling:** `StyleSheet.create()`, colors from `Colors`, fonts from `fonts`
- **Screens:** `backgroundColor: 'transparent'` (ForestGlassBackground renders in root layout)
- **AI safety:** Always check `profile.ai_enabled`, sanitize output with `containsBannedTerms()`
- **Edge functions:** Always use `invokeWithRetry()`, never raw `supabase.functions.invoke()`
- **HealthKit:** iOS-only, guard with `Platform.OS === 'ios'`, requires `npx expo run:ios`
- **No tests:** Verify changes manually on iOS simulator
- **Schema evolution:** Use `isMissingTableError()` fallbacks for new tables
- **FAB positioning:** The FAB (+) is a pure React Native component (`components/overlays/AddMenuFAB.tsx`) positioned absolutely at `right: 20`, above the tab bar. Bottom offset = `insets.bottom + 49 + 16`. No native module dependency. The tab bar is full-width and naturally centered by NativeTabs.

## Domain Vocabulary

| Term | Meaning |
|------|---------|
| Tracking Mode | How user logs data (meals_wearables, meals_only, manual_glucose_optional, etc.) |
| Experience Variant | UI variant (legacy vs behavior_v1) |
| COM-B Barrier | Capability/Opportunity/Motivation — behavior change model |
| Care Pathway | 7-day structured wellness plan |
| Metabolic Score | Deterministic wellness score (0-100) from HealthKit data |
| Insight | Personalized observation about user's data (rules-based or AI) |
| Micro-step | Small, achievable action suggested in an insight |
| Check-in | Post-meal self-report (energy, fullness, cravings) |

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Workflow

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately — don't keep pushing broken approaches.
- Use plan mode for verification steps, not just building.
- Write detailed specs upfront. Ambiguity in Gluco is expensive — we have `lib/supabase.ts` (~3,500 lines), 20+ edge functions, and complex pipelines (photo analysis, food search, insights). Spell out what you're changing and why.

### 2. Subagent Strategy

- Use subagents to keep the main context window clean. One task per subagent.
- See [`docs/reference/codebase-navigation.md`](docs/reference/codebase-navigation.md) for search strategies, subagent prompt templates, and the canonical data flow path (`Screen → Hook → lib/supabase.ts → Edge Function → DB`).
- Key rule: never start by reading all of `lib/supabase.ts` (~3,500 lines). Use Grep to find the specific function, then Read the surrounding context.

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern.
- Write rules for yourself that prevent the same mistake — be specific to this codebase (file paths, function names, conventions).
- Ruthlessly iterate on these lessons until the mistake rate drops.
- Review `tasks/lessons.md` at session start for relevant patterns.

### 4. Verification Before Done

- Never mark a task complete without proving it works.
- Run `npm run typecheck` to catch type errors. Run `npm run lint` for style issues.
- For UI changes: describe what changed and where to verify on simulator (`npx expo run:ios`).
- For edge functions: verify the request/response shape matches what `lib/supabase.ts` expects.
- For schema changes: confirm `isMissingTableError()` fallbacks are in place.
- Diff behavior between `main` and your changes when relevant.
- Ask yourself: "Would a staff engineer approve this?"

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."
- Skip this for simple, obvious fixes — don't over-engineer. Three similar lines > premature abstraction.

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing checks — then resolve them.
- Zero context switching required from the user.
- If `npm run typecheck` or `npm run lint` fails after your changes, go fix it without being told.

## Task Management

All task tracking lives in `tasks/`.

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items.
2. **Verify Plan**: Check in before starting implementation.
3. **Track Progress**: Mark items complete as you go.
4. **Explain Changes**: High-level summary at each step.
5. **Document Results**: Add review section to `tasks/todo.md`.
6. **Capture Lessons**: Update `tasks/lessons.md` after any correction.
