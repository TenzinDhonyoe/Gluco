# Health Domain Reference

## Regulatory Position

Gluco is a **wellness app**, NOT a medical device. This distinction is critical for all language, UI, and AI output.

### What Gluco Is
- A food & wellness journal that helps users notice patterns
- A behavior change support tool based on CDC DPP principles
- An observation tool that reflects user data back without diagnosis

### What Gluco Is NOT
- A glucose monitor, CGM, or medical device
- A diagnostic or treatment tool
- A replacement for medical advice

## CDC Diabetes Prevention Program (DPP) Evidence Base

The DPP is a structured lifestyle intervention proven to reduce type 2 diabetes risk by 58%. Gluco draws on DPP principles:

- **Self-monitoring** — logging meals, activity, sleep, weight
- **Goal setting** — small, achievable behavior targets
- **Problem solving** — identifying barriers and finding workarounds
- **Social support** — encouraging language, celebrating consistency
- **Stimulus control** — pre-meal checks, post-meal reflections

## Behaviour Change Techniques (BCTs)

Used in insights, actions, and care pathways:

| BCT | Implementation |
|-----|---------------|
| Self-monitoring | Meal logging, glucose logging, HealthKit sync |
| Goal setting | Primary habit, if-then plans |
| Feedback on behavior | Personal insights, weekly summaries |
| Action planning | Care pathways (7-day plans) |
| Graded tasks | Micro-steps in insights |
| Social reward | Streak tracking, completion celebrations |

## COM-B Model

Capability, Opportunity, Motivation — Behaviour. Used in behavior_v1 onboarding:

- **Capability** — "I don't know what to eat" → education-focused actions
- **Opportunity** — "I don't have time" → time-saving strategies
- **Motivation** — "I know what to do but can't stick to it" → habit formation
- **Unsure** — Mixed approach

Stored in `profiles.com_b_barrier` (`COMBBarrier` type).

## Readiness Levels

`profiles.readiness_level`: `'low'` | `'medium'` | `'high'`

Affects insight complexity and action ambition:
- **Low** — Simple observations, tiny micro-steps
- **Medium** — Pattern-based insights, moderate actions
- **High** — Data-driven insights, structured experiments

## Safe Language Rules

### BANNED_TERMS (never appear in user-facing text)

Defined in both `lib/insights.ts` and `supabase/functions/_shared/safety.ts`:

```
spike, risk, treat, prevent, diagnose, insulin sensitivity,
insulin resistance, clinical, medical, disease, condition,
therapy, treatment, 7.8, 11.1, prediabetes, diabetes,
hypoglycemia, hyperglycemia, blood sugar spike, glucose spike,
detect, medical device, therapeutic, prescription, reverse
```

### SAFE_VERBS (preferred in insights)
```
noticed, pattern, logged, tended to, check-in, experiment,
try, averaged, tracked, added, completed
```

### Language Principles
- Say "you noticed" not "your glucose spiked"
- Say "pattern" not "risk factor"
- Say "experiment with" not "treat with"
- Say "check in with your healthcare provider" not "consult your doctor about this condition"
- Never reference specific clinical thresholds (7.8, 11.1 mmol/L)
- Functions: `containsBannedTerms()`, `sanitizeInsight()`, `sanitizeText()`

## Glucose Ranges (Internal Reference Only)

Used for color-coding only, never surfaced as clinical thresholds:

| Status | mmol/L | mg/dL | Color |
|--------|--------|-------|-------|
| In range | 3.9–7.8 | 70–140 | Green (`#4CAF50`) |
| Elevated | 7.8–10.0 | 140–180 | Orange (`#FF9800`) |
| High | >10.0 | >180 | Red (`#F44336`) |
| Low | <3.9 | <70 | Red (`#F44336`) |

User-configurable targets: `profiles.target_min`, `profiles.target_max` (stored in mmol/L).
Unit preference: `profiles.glucose_unit` (`'mmol/L'` | `'mg/dL'`).
Conversion utilities in `lib/utils/glucoseUnits.ts`.

## Metabolic Score

**Deterministic math, NOT ML or AI.** Calculated from HealthKit data:

| Component | Weight | Source |
|-----------|--------|--------|
| Resting Heart Rate | 35% | HealthKit |
| Steps | 30% | HealthKit |
| Sleep | 15% | HealthKit |
| HRV | 10% | HealthKit |
| Context bonuses | 10% | Logging consistency |

Edge function: `metabolic-score`. Detailed algorithm in `docs/features/metabolic-score-calculations.md`.

## AI Consent

- `profiles.ai_enabled` — boolean, must be true before any AI features
- `profiles.ai_consent_at` — timestamp of consent
- Gate check required before calling any AI edge functions
- Users can revoke at any time via settings

## HIPAA Notes

- No PHI stored in analytics or crash reporting
- All health data tied to Supabase user IDs (UUID)
- RLS enforces user-only data access
- `delete-account` edge function handles GDPR data deletion
- No data shared with third parties except for AI analysis (Vertex AI)
