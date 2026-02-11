# Launch Readiness Checklist (iOS First)

## 1) Security and Secrets
- [ ] `app.json` does not contain hardcoded API keys.
- [ ] `.env` is configured from `.env.example` for local/dev.
- [ ] EAS environment variables are set for production:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
  - `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
  - `EXPO_PUBLIC_APP_SCHEME`
- [ ] Supabase service-role/API provider keys are only in Supabase function secrets.
- [ ] Rotated any credentials previously committed to git history.

## 2) Auth and Deep Links
- [ ] Password reset redirect uses `gluco://reset-password` (or configured app scheme).
- [ ] Supabase Auth redirect URLs include the production scheme URL.
- [ ] Signup confirmation flow opens app and resumes onboarding.
- [ ] Sign in / sign out / token refresh / app foreground session checks are verified on device.

## 3) Edge Function Hardening
- [ ] `food-search`, `food-barcode`, and `food-details` require authenticated users.
- [ ] CORS origin is configured (`ALLOWED_ORIGIN`) and not wildcard in production.
- [ ] Input validation is enforced (query length, page size bounds, barcode format).
- [ ] Function secrets are configured in Supabase project:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `FDC_API_KEY`
  - `GEMINI_API_KEY`
  - `OPENAI_API_KEY` (if still used)
  - `FATSECRET_CLIENT_ID`, `FATSECRET_CLIENT_SECRET`

## 4) Database and RLS
- [ ] Run `supabase/launch_audit.sql` in staging and production.
- [ ] Confirm no user-data table is missing RLS.
- [ ] Confirm grants for `anon` are intentional and minimal.
- [ ] Confirm `profiles` creation trigger on `auth.users` exists.
- [ ] Confirm storage policies for `meal-photos` bucket are scoped to `auth.uid()`.

## 5) Core App Flows (Manual QA)
- [ ] Welcome -> privacy intro -> email signup -> email confirmation -> onboarding -> tabs.
- [ ] Sign in + forgot password + reset + re-login.
- [ ] Meal logging paths:
  - [ ] Manual food search/add
  - [ ] Barcode scan
  - [ ] Meal photo estimate and save
- [ ] Edit and delete meal/glucose/activity logs.
- [ ] Notifications list/deep links route to the expected screens.
- [ ] Account & Privacy actions:
  - [ ] Export data
  - [ ] Reset learning
  - [ ] Delete account

## 6) Build and Release
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes with no errors.
- [ ] iOS production build succeeds in EAS.
- [ ] Crash reporting/monitoring is enabled and validated.
- [ ] Rollback plan documented (EAS update/channel strategy).

