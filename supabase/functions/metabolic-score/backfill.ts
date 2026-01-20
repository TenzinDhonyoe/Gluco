// supabase/functions/metabolic-score/backfill.ts
// One-time backfill for user_metabolic_weekly_scores.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   deno run --allow-net --allow-env supabase/functions/metabolic-score/backfill.ts
//
// Optional env vars:
//   USER_ID=<uuid>                  // backfill a single user
//   BACKFILL_WEEKS=4                // number of weekly windows to backfill
//   BACKFILL_LOOKBACK_DAYS=120      // how far back to fetch daily_context

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type { MetabolicScoreInput } from './score.ts';
import { calculateMetabolicScore } from './score.ts';

interface DailyContext {
    date: string;
    sleep_hours: number | null;
    steps: number | null;
    resting_hr: number | null;
    hrv_ms: number | null;
}

interface UserProfile {
    birth_date: string | null;
    height_cm: number | null;
    weight_kg: number | null;
}

function addDays(dateStr: string, days: number): string {
    const date = new Date(`${dateStr}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
}

function filterByDateRange(
    dailyContext: DailyContext[],
    startDateStr: string,
    endDateStr: string
): DailyContext[] {
    return dailyContext.filter(entry => entry.date >= startDateStr && entry.date <= endDateStr);
}

function getLatestDate(dailyContext: DailyContext[]): string | null {
    if (dailyContext.length === 0) return null;
    return dailyContext.reduce((latest, entry) => entry.date > latest ? entry.date : latest, dailyContext[0].date);
}

function computeAge(birthDateStr: string | null): number | undefined {
    if (!birthDateStr) return undefined;
    const birthDate = new Date(birthDateStr);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

function buildMetabolicScoreInput(
    dailyContext: DailyContext[],
    profile: UserProfile | null
): MetabolicScoreInput {
    return {
        sleepRHR: dailyContext.map(d => d.resting_hr),
        dailySteps: dailyContext.map(d => d.steps),
        sleepHours: dailyContext.map(d => d.sleep_hours),
        sleepHRV: dailyContext.map(d => d.hrv_ms),
        age: computeAge(profile?.birth_date ?? null),
        heightCm: profile?.height_cm ?? undefined,
        weightKg: profile?.weight_kg ?? undefined,
    };
}

function buildBaselineInput(dailyContext: DailyContext[]): MetabolicScoreInput {
    return {
        sleepRHR: dailyContext.map(d => d.resting_hr),
        dailySteps: dailyContext.map(d => d.steps),
        sleepHours: dailyContext.map(d => d.sleep_hours),
        sleepHRV: dailyContext.map(d => d.hrv_ms),
    };
}

async function fetchUserIds(supabase: ReturnType<typeof createClient>): Promise<string[]> {
    const ids: string[] = [];
    const pageSize = 1000;
    let offset = 0;

    while (true) {
        const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .range(offset, offset + pageSize - 1);

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {
            break;
        }

        ids.push(...data.map(row => row.id));
        offset += pageSize;
    }

    return ids;
}

async function backfillUser(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    weeks: number,
    lookbackDays: number
): Promise<number> {
    const { data: latestData, error: latestError } = await supabase
        .from('daily_context')
        .select('date')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1);

    if (latestError || !latestData || latestData.length === 0) {
        return 0;
    }

    const latestDate = latestData[0].date;
    const startDate = addDays(latestDate, -(lookbackDays - 1));

    const { data: dailyContextData, error: dcError } = await supabase
        .from('daily_context')
        .select('date, sleep_hours, steps, resting_hr, hrv_ms')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', latestDate)
        .order('date', { ascending: true });

    if (dcError || !dailyContextData || dailyContextData.length === 0) {
        return 0;
    }

    const dailyContext = dailyContextData as DailyContext[];
    const anchorDate = getLatestDate(dailyContext);
    if (!anchorDate) return 0;

    const { data: profileData } = await supabase
        .from('profiles')
        .select('birth_date, height_cm, weight_kg')
        .eq('id', userId)
        .single();

    const profile: UserProfile | null = profileData || null;
    let upserted = 0;

    for (let weekIndex = 0; weekIndex < weeks; weekIndex++) {
        const weekEnd = addDays(anchorDate, -7 * weekIndex);
        const weekStart = addDays(weekEnd, -6);

        const weekContext = filterByDateRange(dailyContext, weekStart, weekEnd);
        const baseline28Start = addDays(weekStart, -28);
        const baseline28End = addDays(weekStart, -1);
        const baseline56Start = addDays(weekStart, -56);
        const baseline56End = baseline28End;

        const baseline28Context = filterByDateRange(dailyContext, baseline28Start, baseline28End);
        const baseline56Context = filterByDateRange(dailyContext, baseline56Start, baseline56End);

        const input = buildMetabolicScoreInput(weekContext, profile);
        const baselinePrimary = buildBaselineInput(baseline28Context);
        const baselineFallback = buildBaselineInput(baseline56Context);
        const result = calculateMetabolicScore(input, baselinePrimary, baselineFallback);

        if (result.score7d === null) {
            continue;
        }

        const { error: upsertError } = await supabase
            .from('user_metabolic_weekly_scores')
            .upsert({
                user_id: userId,
                week_start: weekStart,
                score7d: result.score7d,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,week_start' });

        if (!upsertError) {
            upserted++;
        }
    }

    return upserted;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    Deno.exit(1);
}

const weeks = parseInt(Deno.env.get('BACKFILL_WEEKS') ?? '4', 10);
const lookbackDays = parseInt(
    Deno.env.get('BACKFILL_LOOKBACK_DAYS') ?? String(weeks * 7 + 56),
    10
);
const userIdFilter = Deno.env.get('USER_ID') ?? null;

const supabase = createClient(supabaseUrl, supabaseKey);

const userIds = userIdFilter ? [userIdFilter] : await fetchUserIds(supabase);
let totalUpserts = 0;

for (const userId of userIds) {
    const count = await backfillUser(supabase, userId, weeks, lookbackDays);
    totalUpserts += count;
}

console.log(`Backfill complete. Weekly scores upserted: ${totalUpserts}`);
