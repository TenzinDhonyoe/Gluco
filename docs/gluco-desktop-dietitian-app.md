# Gluco Desktop App for Dietitians

## 1. Context: What Gluco Is Today

### The Consumer App (iOS)

Gluco is a React Native iOS wellness app that helps users track meals, glucose, activity, and sleep — then surfaces personalized insights to support healthier habits. It is positioned as a **wellness app, not a medical device**.

**Core features:**

- **Meal logging** — Camera-first capture (AI photo analysis via Gemini), nutrition label OCR, food search (cache > edge function > Gemini fallback), manual entry. All paths go through a review screen before saving.
- **Glucose logging** — Manual glucose readings with optional CGM pairing context. Uses safe ranges (wellness framing, no diagnostic thresholds).
- **Activity & sleep tracking** — Apple HealthKit integration (steps, active minutes, resting HR, HRV, sleep duration). Data syncs to `daily_context` table.
- **Metabolic Score** — A deterministic 0-100 wellness score computed from 7-day rolling HealthKit data (sleep RHR, steps, sleep hours, optional HRV). Not ML-based.
- **Personal Insights** — Rules-based + AI-generated observations about user patterns. Uses safe language (banned medical terms, safe verbs only). Includes micro-steps (small actionable suggestions).
- **Actions & Care Pathways** — Short-term interventions (24-72 hour actions like "fiber boost" or "post-meal walk") and structured 7-day wellness plans. Auto-detection of completion via logged data.
- **Experiments** — A/B framework for testing UI variants and behavior change approaches. Currently supports `legacy` vs `behavior_v1` experience variants.
- **AI Chat** — Conversational wellness companion (Gemini-powered). Explicitly not medical advice. Redirects clinical questions to healthcare providers.
- **Behavior Change Model** — Based on CDC Diabetes Prevention Program (DPP) principles, COM-B model (Capability/Opportunity/Motivation), and evidence-based Behaviour Change Techniques (BCTs).

**Tech stack:**
- React Native 0.81.5 + React 19.1 + Expo SDK 54
- TypeScript (strict mode)
- Supabase (PostgreSQL, Auth, Storage, 24 Deno Edge Functions)
- Google Gemini for AI features
- Apple HealthKit via `react-native-health`
- RevenueCat for subscriptions

**Data model highlights:**
- `profiles` — User demographics, tracking mode, COM-B barrier, readiness level, onboarding state, AI preferences
- `meal_logs` — Logged meals with nutrition data, photos, AI analysis results
- `glucose_readings` — Manual glucose entries
- `daily_context` — Per-day wearable summaries (steps, sleep, HR, HRV) from HealthKit
- `actions` — Active behavior change actions with completion tracking
- `care_pathways` — 7-day structured plans
- `insights` — Generated personal insights
- `check_ins` — Post-meal self-reports (energy, fullness, cravings)
- `experiments` — A/B experiment assignments and results

---

## 2. The Desktop App Vision

### Problem Statement

Dietitians and nutrition professionals currently have no visibility into their clients' day-to-day wellness data. Clients use Gluco to log meals, track glucose, and build healthier habits — but all of this data stays siloed in the consumer app. Dietitians rely on self-reported summaries during appointments, which are incomplete, biased by recall, and lack the granularity needed for effective coaching.

### Solution

A desktop web application that gives dietitians a real-time, read-only dashboard into their clients' Gluco data — enabling better-informed consultations, proactive outreach, and evidence-based care plan adjustments.

### Core Positioning

- **Wellness tool for professionals** — same regulatory position as the consumer app. Not a clinical system, not an EHR, not a medical device.
- **Read-first** — dietitians observe and review; they don't modify client data.
- **Complement, not replace** — works alongside existing practice management tools. Gluco Desktop is not trying to be an EHR or scheduling system.

---

## 3. Target Users

| Persona | Description |
|---------|-------------|
| **Private practice dietitian** | Solo or small practice, 20-80 active clients, needs quick daily overview |
| **Clinic-based nutritionist** | Part of a larger care team, may need to share observations with MDs |
| **Wellness coach** | Non-clinical, focused on behavior change and habit formation |
| **Corporate wellness program lead** | Manages group programs, needs aggregate views |

---

## 4. Feature Specification

### 4.1 Client Management

**Client list & search**
- Paginated client list with search/filter
- Sort by: last active, name, date added, flagged
- Quick filters: active, inactive, flagged, new (< 7 days)
- Client cards showing: name, last active, current streak, metabolic score trend arrow

**Client linking**
- Dietitian sends invite code or link to client
- Client enters code in Gluco app (new settings screen) to link their account
- Client can revoke access at any time from the app
- Data sharing is opt-in and granular (client chooses what to share)

**Data sharing permissions (client-controlled):**
- Meal logs (with/without photos)
- Glucose readings
- Activity & sleep data
- Insights and actions
- Check-in responses
- Metabolic score

### 4.2 Client Dashboard (per-client view)

**Overview panel**
- Current metabolic score (7-day) with trend sparkline
- Days active this week / streak
- Tracking mode (meals + wearables, meals only, etc.)
- COM-B barrier and readiness level
- Last meal logged (timestamp + quick preview)

**Meal log timeline**
- Chronological feed of logged meals
- Each entry shows: timestamp, meal photo (if shared), food items, macros (calories, carbs, protein, fat, fiber)
- Expandable detail: AI analysis results, nutrition label scans
- Filter by date range, meal type, flagged items
- Dietitian can flag meals for discussion (flag is dietitian-side only, not visible to client)

**Nutrition summary**
- Daily/weekly/monthly macro averages (bar charts)
- Calorie trend line
- Fiber intake tracking
- Meal timing distribution (when does the client typically eat?)
- Nutrient gap analysis (based on logged data vs recommended intakes)

**Glucose view**
- Timeline of manual glucose readings
- Overlay with meal times to show meal-glucose relationships
- Trend line with 7/14/30-day averages
- Safe wellness framing (same language rules as consumer app — no diagnostic thresholds)

**Activity & sleep**
- Daily steps with 7-day average
- Active minutes
- Sleep duration and consistency
- Resting HR trend
- HRV trend (if available)
- All sourced from `daily_context` (HealthKit-synced data)

**Insights & actions**
- View client's generated insights (read-only)
- See active and completed actions
- Care pathway progress (7-day plan timeline)
- Check-in responses (energy, fullness, cravings after meals)

**Behavior patterns**
- Logging consistency heatmap (GitHub-style contribution grid)
- Common food items (most frequently logged)
- Meal composition patterns (high-carb vs balanced vs high-protein distribution)
- Time-of-day patterns

### 4.3 Dietitian Notes & Annotations

- Per-client private notes (only visible to the dietitian)
- Pin notes to specific dates or meals
- Pre-appointment review checklist: auto-generated summary of changes since last note
- Note templates (initial assessment, follow-up, progress review)

### 4.4 Alerts & Notifications

- Configurable alerts per client:
  - Client hasn't logged in X days
  - Metabolic score dropped below threshold
  - Unusual meal patterns detected
  - Client completed/abandoned a care pathway
- Notification center in the app (no push notifications to start — just in-app)
- Daily digest email (optional): summary of flagged clients

### 4.5 Multi-Client Overview

- Dashboard showing all clients at a glance
- Sortable table: name, metabolic score, last active, streak, flags
- Quick visual indicators: green (on track), yellow (needs attention), red (inactive/declining)
- Aggregate stats: average metabolic score across practice, client engagement rate

### 4.6 Reports & Export

- Generate PDF summary for a client (date range)
- Contents: macro averages, glucose trends, activity summary, insights, dietitian notes
- Export raw data as CSV for further analysis
- Useful for: insurance documentation, referral letters, client handoffs

---

## 5. Suggested Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Next.js 15 (App Router) + TypeScript | React ecosystem (shared knowledge with mobile app), SSR for performance, file-based routing |
| **Styling** | Tailwind CSS + shadcn/ui | Rapid development, consistent design system, accessible components |
| **Charts** | Recharts or Tremor | React-native charting patterns translate well |
| **State** | React Server Components + TanStack Query | Server-first data loading, client cache for interactivity |
| **Auth** | Supabase Auth (same instance as consumer app) | Single auth system, new `dietitian` role |
| **Database** | Same Supabase PostgreSQL instance | Direct access to client data via RLS policies |
| **API** | Supabase Edge Functions (shared + new) | Reuse existing functions, add dietitian-specific endpoints |
| **Realtime** | Supabase Realtime | Live updates when clients log new data |
| **Deployment** | Vercel | Next.js-native hosting, edge functions, preview deploys |
| **PDF export** | `@react-pdf/renderer` or Puppeteer | Client-side or server-side PDF generation |

---

## 6. Data Architecture

### New Database Tables

```sql
-- Dietitian profiles (extends existing auth)
create table dietitian_profiles (
  id uuid primary key references auth.users(id),
  display_name text not null,
  practice_name text,
  credentials text,           -- e.g., "RD, LDN"
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Client-dietitian relationships
create table client_links (
  id uuid primary key default gen_random_uuid(),
  dietitian_id uuid references dietitian_profiles(id) not null,
  client_id uuid references profiles(id) not null,
  status text check (status in ('pending', 'active', 'revoked')) default 'pending',
  invite_code text unique,
  permissions jsonb default '{"meals": true, "glucose": true, "activity": true, "insights": true, "checkins": true, "metabolic_score": true, "photos": false}'::jsonb,
  linked_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now(),
  unique(dietitian_id, client_id)
);

-- Dietitian-side notes (never visible to clients)
create table dietitian_notes (
  id uuid primary key default gen_random_uuid(),
  dietitian_id uuid references dietitian_profiles(id) not null,
  client_id uuid references profiles(id) not null,
  content text not null,
  pinned_to_date date,
  pinned_to_meal_id uuid references meal_logs(id),
  template_type text,         -- 'initial', 'follow_up', 'progress'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Dietitian alert configurations
create table dietitian_alerts (
  id uuid primary key default gen_random_uuid(),
  dietitian_id uuid references dietitian_profiles(id) not null,
  client_id uuid references profiles(id) not null,
  alert_type text not null,   -- 'inactive', 'score_drop', 'pattern', 'pathway'
  threshold jsonb,            -- e.g., {"days": 3} or {"score_below": 40}
  enabled boolean default true,
  created_at timestamptz default now()
);

-- Meal flags (dietitian-side, invisible to client)
create table meal_flags (
  id uuid primary key default gen_random_uuid(),
  dietitian_id uuid references dietitian_profiles(id) not null,
  meal_id uuid references meal_logs(id) not null,
  note text,
  created_at timestamptz default now()
);
```

### RLS Policies

```sql
-- Dietitians can only see clients who have actively linked and not revoked
create policy "dietitian_read_client_meals"
  on meal_logs for select
  using (
    auth.uid() = user_id
    OR exists (
      select 1 from client_links
      where client_links.dietitian_id = auth.uid()
        and client_links.client_id = meal_logs.user_id
        and client_links.status = 'active'
        and (client_links.permissions->>'meals')::boolean = true
    )
  );

-- Similar policies for glucose_readings, daily_context, insights, etc.
-- Each checks the corresponding permission flag in client_links.permissions
```

### Edge Functions (new)

| Function | Purpose |
|----------|---------|
| `dietitian-invite` | Generate invite code, validate, link/unlink clients |
| `dietitian-client-summary` | Aggregate client data for dashboard (macro averages, trends) |
| `dietitian-alerts-check` | Cron-triggered: evaluate alert conditions, queue notifications |
| `dietitian-export` | Generate PDF/CSV exports for a client |

---

## 7. Client-Side Changes (Consumer App)

Minimal changes to the existing iOS app:

1. **New settings screen**: "Linked Professionals" — shows connected dietitians, manage permissions, revoke access
2. **Invite code entry**: Simple text input to enter a dietitian's invite code
3. **Permission toggles**: Granular control over what data is shared (meals, glucose, activity, photos, etc.)
4. **Visual indicator**: Small icon on shared data indicating it's visible to their dietitian (transparency)

---

## 8. Privacy & Compliance

- **Client consent is paramount**: All data sharing is opt-in. Client must actively link and can revoke at any time.
- **Granular permissions**: Client controls exactly which data categories are shared.
- **No write access**: Dietitians cannot modify client data. Read-only + their own notes.
- **Data residency**: Same Supabase instance, same region. No additional data transfers.
- **Audit trail**: Log all dietitian data access for compliance.
- **HIPAA considerations**: If targeting US healthcare market, evaluate HIPAA BAA with Supabase. Supabase offers HIPAA-eligible plans. May need to encrypt PHI at rest beyond default.
- **Safe language**: Desktop app follows the same banned terms and safe language rules as the consumer app. No diagnostic framing.

---

## 9. Monetization

| Model | Description |
|-------|-------------|
| **Per-seat SaaS** | $29-79/mo per dietitian seat depending on client count tier |
| **Client-count tiers** | Free: up to 5 clients. Pro: up to 50. Enterprise: unlimited |
| **Client-side free** | Linking to a dietitian is free for consumers (drives consumer app retention) |
| **Premium features** | PDF exports, custom alerts, aggregate analytics in higher tiers |

---

## 10. Phased Rollout

### Phase 1: MVP (read-only dashboard)
- Dietitian auth & profile
- Client linking via invite code
- Single-client dashboard: meal timeline, macro summary, glucose view
- Basic activity/sleep view from HealthKit data
- Dietitian notes (free-text, per-client)

### Phase 2: Insights & Alerts
- View client insights and actions
- Configurable alerts (inactivity, score drops)
- Multi-client overview table
- Daily digest email

### Phase 3: Reporting & Scale
- PDF report generation
- CSV export
- Aggregate practice analytics
- Care pathway visibility and progress tracking
- Note templates

### Phase 4: Collaboration (future)
- Multi-dietitian practice support (shared client pools)
- Dietitian-to-client messaging (in-app, async)
- Suggested actions (dietitian recommends an action, client sees it in their app)
- Integration with practice management / EHR systems via API

---

## 11. Key Design Principles

1. **Read-first, lightweight** — Don't try to be an EHR. Be the best window into client wellness data.
2. **Client trust** — Every design decision should reinforce that the client is in control of their data.
3. **Same voice** — Use the same safe, encouraging, non-clinical language as the consumer app.
4. **Speed** — Dietitians check between appointments. Dashboard must load fast and surface the most important info immediately.
5. **Mobile-aware** — While primarily desktop, should be responsive enough for tablet use during in-person appointments.

---

## 12. Open Questions

- Should dietitians be able to suggest specific actions/care pathways to clients? (Phase 4 territory, but architectural implications)
- How to handle dietitians who are also Gluco users themselves? Separate accounts or role switching?
- Should there be a "client view" that shows exactly what the dietitian sees, so clients feel informed?
- Group programs: should dietitians be able to create cohorts and view aggregate data across a group?
- Integration priority: which practice management tools (Jane, SimplePractice, Healthie) matter most?
